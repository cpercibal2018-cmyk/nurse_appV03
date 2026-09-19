// src/modules/observability/consistency-auditor.worker.ts
// B-13 — null-safe consistency auditor, migrated to V49 leases.
//
// BEFORE: dereferenced `actual.status` with no null check. Any employee
//         without a state row (new hire, row added between the population
//         migration and the first refresh) threw a TypeError and killed the
//         1%-sample audit run — the anti-drift control became the silent
//         failure it was built to detect.
// AFTER:  a missing state row is itself a drift condition. It is logged,
//         refreshed, and the loop continues.

import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { subDays } from 'date-fns';
import { PrismaService } from '../../prisma/prisma.service';
import { WorkerLeaseService } from '../../common/worker-lease/worker-lease.service';
import { EligibilityEngine } from '../eligibility/eligibility.engine';
import { EligibilityStateService } from '../eligibility/eligibility-state.service';

const SAMPLE_RATE = 0.01; // 1% of the workforce per day

@Injectable()
export class ConsistencyAuditorWorker {
  private readonly logger = new Logger(ConsistencyAuditorWorker.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly leases: WorkerLeaseService,
    private readonly eligibilityEngine: EligibilityEngine,
    private readonly eligibilityStateService: EligibilityStateService,
  ) {}

  @Cron('0 3 * * *') // 03:00 UTC = 06:00 Asia/Riyadh
  async auditEligibilityState(): Promise<void> {
    await this.leases.withLease('observability.consistency_audit', 1800, async () => {
      const employees = await this.prisma.employee.findMany({
        where: { deletedAt: null },
        select: { id: true },
      });

      const sample = employees.filter(() => Math.random() < SAMPLE_RATE);
      let drift = 0;
      let missing = 0;

      for (const emp of sample) {
        try {
          const actual = await this.prisma.employeeEligibilityState.findUnique({
            where: { employeeId: emp.id },
          });
          const expected = await this.eligibilityEngine.calculate(emp.id, new Date());

          // ── Missing state row is drift, not a crash ─────────────────────
          if (!actual) {
            missing += 1;
            await this.prisma.consistencyAuditLog.create({
              data: {
                employeeId: emp.id,
                expectedStatus: expected.eligibilityType,
                actualStatus: null,
                driftDetected: true,
              },
            });
            await this.eligibilityStateService.refreshState(
              emp.id,
              'CONSISTENCY_AUDIT_MISSING_STATE',
            );
            continue;
          }

          if (actual.status !== expected.eligibilityType) {
            drift += 1;
            await this.prisma.consistencyAuditLog.create({
              data: {
                employeeId: emp.id,
                expectedStatus: expected.eligibilityType,
                actualStatus: actual.status,
                driftDetected: true,
              },
            });
            await this.eligibilityStateService.refreshState(emp.id, 'CONSISTENCY_AUDIT');
          }
        } catch (err) {
          // One bad record must never abort the run.
          this.logger.warn(`Consistency audit failed for employee ${emp.id}: ${err}`);
        }
      }

      await this.updateDriftMetric(sample.length, drift + missing);

      this.logger.log(
        `Consistency audit complete — sampled ${sample.length}, ` +
          `drift ${drift}, missing-state ${missing}`,
      );
    });
  }

  private async updateDriftMetric(sampled: number, drifted: number): Promise<void> {
    const rate = sampled === 0 ? 0 : (drifted / sampled) * 100;
    const status = rate === 0 ? 'HEALTHY' : rate < 1 ? 'WARNING' : 'CRITICAL';

    await this.prisma.systemHealthMetric.upsert({
      where: { metricName: 'eligibility_drift_rate' },
      update: {
        currentValue: `${rate.toFixed(2)}%`,
        status,
        lastUpdated: new Date(),
      },
      create: {
        metricName: 'eligibility_drift_rate',
        currentValue: `${rate.toFixed(2)}%`,
        status,
        lastUpdated: new Date(),
      },
    });
  }

  /** Weekly drift summary for the business-health endpoint (Section 10.8). */
  async weeklyDriftCount(): Promise<number> {
    return this.prisma.consistencyAuditLog.count({
      where: { driftDetected: true, createdAt: { gte: subDays(new Date(), 7) } },
    });
  }
}
