// src/modules/notifications/notification.worker.ts
// Migrated to V49 worker leases (Section 10.3).
//
// BEFORE: `pg_try_advisory_lock` acquire/release across pooled connections —
//         a crash could hold the lock indefinitely.
// AFTER:  leases with heartbeat; a crashed worker's lease expires and the next
//         scheduled run takes over automatically.

import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import {
  LEASE_KEYS,
  WorkerLeaseService,
} from '../../common/worker-lease/worker-lease.service';
import { GracePeriodService } from '../credentials/grace-period.service';

@Injectable()
export class NotificationWorker {
  private readonly logger = new Logger(NotificationWorker.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly leases: WorkerLeaseService,
    private readonly gracePeriodService: GracePeriodService,
  ) {}

  /** Daily scan at 06:00 Asia/Riyadh (03:00 UTC). */
  @Cron('0 3 * * *')
  async dailyScan(): Promise<void> {
    await this.leases.withLease(LEASE_KEYS.dailyScan, 900, async () => {
      await this.scanContractExpiries();    // 90-day window
      await this.scanCredentialExpiries();  // 60-day window + already expired
      await this.gracePeriodService.expireGraceWindows();
      this.logger.log('Daily scan complete');
    });
  }

  /** SMTP delivery every 60 seconds. */
  @Cron('* * * * *')
  async processEmailQueue(): Promise<void> {
    await this.leases.withLease(LEASE_KEYS.smtpQueue, 120, async () => {
      await this.deliverPendingEmails();
    });
  }

  // ── job bodies (unchanged business logic) ───────────────────────────────

  private async scanContractExpiries(): Promise<void> {
    // Existing implementation: window query + unique event key dedup (Section 7.1).
    await this.prisma.$queryRaw`SELECT 1`; // placeholder — keep the existing body
  }

  private async scanCredentialExpiries(): Promise<void> {
    await this.prisma.$queryRaw`SELECT 1`; // placeholder — keep the existing body
  }

  private async deliverPendingEmails(): Promise<void> {
    // Existing 10-minute processing lease + at-least-once retry (Section 7.2).
    await this.prisma.$queryRaw`SELECT 1`; // placeholder — keep the existing body
  }
}
