// src/modules/eligibility/eligibility-state.service.ts
// B-09 — transaction-aware state refresh (Section 6.1).
//
// The specification claims "all state updates occur within the same
// transaction as the trigger event". The reviewed baseline used `this.prisma`
// inside refreshState, so the update committed on its own connection and the
// claim was false. Callers that mutate contracts/credentials/positions now
// pass their transaction client so the two commits are atomic.

import { Injectable, Logger } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { EligibilityEngine } from './eligibility.engine';

/** Either the root client or a transaction client — both expose the same delegates. */
export type PrismaLike = PrismaClient | Prisma.TransactionClient;

@Injectable()
export class EligibilityStateService {
  private readonly logger = new Logger(EligibilityStateService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly engine: EligibilityEngine,
  ) {}

  /**
   * Recalculate and persist one employee's eligibility state.
   *
   * @param tx pass the caller's transaction client when the call happens
   *           inside a business transaction (contract approval, credential
   *           verification, position schedulability change, waiver creation).
   *           Omit it for scheduled/background work.
   */
  async refreshState(
    employeeId: number,
    eventSource: string,
    tx: PrismaLike = this.prisma,
  ): Promise<void> {
    const result = await this.engine.calculate(employeeId, new Date(), tx);

    await tx.employeeEligibilityState.upsert({
      where: { employeeId },
      update: {
        status: result.eligibilityType,
        reasons: result.reasons as Prisma.InputJsonValue,
        lastCalculatedAt: new Date(),
        updatedByEvent: eventSource,
      },
      create: {
        employeeId,
        status: result.eligibilityType,
        reasons: result.reasons as Prisma.InputJsonValue,
        updatedByEvent: eventSource,
      },
    });
  }

  /**
   * Refresh many employees inside one transaction — used by the nightly
   * transition and by bulk rule changes.
   */
  async refreshStates(
    employeeIds: number[],
    eventSource: string,
    tx: PrismaLike = this.prisma,
  ): Promise<void> {
    for (const id of employeeIds) {
      await this.refreshState(id, eventSource, tx);
    }
  }

  /** Daily midnight transition (Asia/Riyadh) — runs after commit by design. */
  async refreshAllStates(): Promise<void> {
    const employees = await this.prisma.employee.findMany({
      where: { deletedAt: null },
      select: { id: true },
    });

    for (const emp of employees) {
      try {
        await this.refreshState(emp.id, 'DAILY_TRANSITION');
      } catch (err) {
        // Never let one record abort the sweep; the consistency auditor
        // (Section 10.8) will catch and correct anything missed.
        this.logger.warn(`Daily transition failed for employee ${emp.id}: ${err}`);
      }
    }
  }
}
