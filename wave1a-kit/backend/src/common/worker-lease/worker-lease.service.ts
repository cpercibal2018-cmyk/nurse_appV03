// src/common/worker-lease/worker-lease.service.ts
// V49 (Section 10.3) — single-writer leases for scheduled jobs.
//
// Replaces session-scoped pg_try_advisory_lock, which is unsafe behind a
// connection pool (acquire and release can land on different connections, and
// a crash leaves the lock held on a pooled connection).
//
// Semantics:
//   * Exactly one holder per job_name at a time.
//   * The holder renews by heartbeat at 1/3 of the lease duration.
//   * If the process dies, the lease expires and the next run takes over.
//   * `withLease` returns false when another live worker holds the lease —
//     callers simply skip this cycle (the next scheduled run catches up).

import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';

/** Lease keys in use across the worker process (Section 10.3). */
export const LEASE_KEYS = {
  dailyScan: 'notifications.daily_scan',
  smtpQueue: 'notifications.smtp_queue',
  scfhsSync: 'scfhs.nightly_sync',
  graceExpiry: 'credentials.grace_expiry',
  idempotencyCleanup: 'idempotency.cleanup',
  backupFreshness: 'backup.freshness_check',
  quarantineScan: 'quarantine.scan',
} as const;

export type LeaseKey = (typeof LEASE_KEYS)[keyof typeof LEASE_KEYS];

@Injectable()
export class WorkerLeaseService implements OnModuleDestroy {
  private readonly logger = new Logger(WorkerLeaseService.name);

  /** One identity per worker process, shared by every lease it takes. */
  private readonly holderId: string = randomUUID();

  private readonly timers = new Set<NodeJS.Timeout>();

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Runs `job` only if this instance can take the lease for `jobName`.
   *
   * @returns true if the job ran (or was skipped by the caller), false if
   *          another live worker holds the lease.
   */
  async withLease(
    jobName: LeaseKey | string,
    leaseSeconds: number,
    job: () => Promise<void>,
  ): Promise<boolean> {
    if (!(await this.acquire(jobName, leaseSeconds))) {
      this.logger.debug(`Lease busy, skipping this cycle: ${jobName}`);
      return false;
    }

    const heartbeat = setInterval(() => {
      void this.renew(jobName, leaseSeconds).catch((err) =>
        this.logger.warn(`Lease heartbeat failed for ${jobName}: ${err?.message}`),
      );
    }, Math.max(1_000, Math.floor((leaseSeconds * 1_000) / 3)));

    this.timers.add(heartbeat);

    try {
      await job();
      return true;
    } finally {
      clearInterval(heartbeat);
      this.timers.delete(heartbeat);
      await this.release(jobName).catch((err) =>
        this.logger.warn(
          `Lease release failed for ${jobName} (it will expire naturally): ${err?.message}`,
        ),
      );
    }
  }

  /** Current lease table state — used by the health endpoint and tests. */
  async status() {
    return this.prisma.$queryRaw<
      Array<{
        job_name: string;
        holder_id: string;
        is_expired: boolean;
        seconds_since_heartbeat: number;
      }>
    >`SELECT job_name, holder_id, is_expired, seconds_since_heartbeat FROM worker_lease_status`;
  }

  async onModuleDestroy(): Promise<void> {
    for (const t of this.timers) clearInterval(t);
    this.timers.clear();
  }

  // ── internals ────────────────────────────────────────────────────────────

  /**
   * Take the lease if it is free, expired, or already ours.
   * The conditional upsert makes this race-free at the database level: when
   * two workers call it simultaneously, exactly one row update succeeds.
   */
  private async acquire(jobName: string, leaseSeconds: number): Promise<boolean> {
    const affected = await this.prisma.$executeRaw`
      INSERT INTO worker_leases (job_name, holder_id, expires_at, lease_seconds)
      VALUES (
        ${jobName},
        ${this.holderId}::uuid,
        now() + make_interval(secs => ${leaseSeconds}),
        ${leaseSeconds}
      )
      ON CONFLICT (job_name) DO UPDATE
        SET holder_id    = EXCLUDED.holder_id,
            acquired_at  = now(),
            heartbeat_at = now(),
            expires_at   = EXCLUDED.expires_at,
            lease_seconds = EXCLUDED.lease_seconds
        WHERE worker_leases.holder_id = ${this.holderId}::uuid
           OR worker_leases.expires_at < now()
    `;

    return affected === 1;
  }

  private async renew(jobName: string, leaseSeconds: number): Promise<void> {
    await this.prisma.$executeRaw`
      UPDATE worker_leases
         SET heartbeat_at = now(),
             expires_at   = now() + make_interval(secs => ${leaseSeconds})
       WHERE job_name = ${jobName}
         AND holder_id = ${this.holderId}::uuid
    `;
  }

  private async release(jobName: string): Promise<void> {
    await this.prisma.$executeRaw`
      DELETE FROM worker_leases
       WHERE job_name = ${jobName}
         AND holder_id = ${this.holderId}::uuid
    `;
  }
}
