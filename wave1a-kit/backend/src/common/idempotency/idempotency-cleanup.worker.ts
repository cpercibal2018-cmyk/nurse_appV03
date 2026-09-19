// src/common/idempotency/idempotency-cleanup.worker.ts
// B-08 — expiry cleanup + lease reaping, migrated to V49 worker leases.
//
// The reaper matters: a PROCESSING row whose lease lapsed and whose request
// never returned would otherwise sit in the table making the key unusable.
// Reaping it after an hour is safe because a lapsed lease already lets the
// client retake the key; this only stops the table growing unbounded.

import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import {
  LEASE_KEYS,
  WorkerLeaseService,
} from '../worker-lease/worker-lease.service';

@Injectable()
export class IdempotencyCleanupWorker {
  private readonly logger = new Logger(IdempotencyCleanupWorker.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly leases: WorkerLeaseService,
  ) {}

  /** Daily at 04:00 Asia/Riyadh (01:00 UTC). */
  @Cron('0 1 * * *')
  async cleanup(): Promise<void> {
    await this.leases.withLease(LEASE_KEYS.idempotencyCleanup, 300, async () => {
      const removed = await this.prisma.$executeRaw`
        DELETE FROM idempotency_keys
         WHERE expires_at < now()
            OR (
                 status = 'PROCESSING'
                 AND processing_lease_expires_at IS NOT NULL
                 AND processing_lease_expires_at < now() - interval '1 hour'
               )
      `;
      this.logger.log(`Idempotency cleanup removed ${removed} row(s)`);
    });
  }
}
