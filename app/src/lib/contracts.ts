// Contract period rules — the single source of truth shared by the store
// guards and the Contracts screen, so the two cannot drift apart.
//
// These mirror the database rules in the specification:
//   * the employee foreign key on contracts.employee_id, and
//   * the exclusion constraint `GiST daterange && WHERE status IN (Approved, Active)`
//     which rejects overlapping coverage periods for the same employee.

/** Minimal shape these helpers need — avoids importing the store (and a cycle). */
export interface ContractPeriod {
  employeeId: number;
  startDate: string;
  endDate: string;
  status: string;
}

/**
 * Statuses that provide coverage and therefore participate in the exclusion
 * constraint. Draft / PendingApproval provide none and may sit on top of an
 * existing period until approved; Expired / Suspended / Terminated / Superseded
 * no longer provide it.
 */
export const COVERAGE_STATUSES = ['Approved', 'Active'] as const;

export function providesCoverage(status: string): boolean {
  return (COVERAGE_STATUSES as readonly string[]).includes(status);
}

/** Periods are inclusive at both ends: they clash unless one ends before the other starts. */
export function periodsOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return !(new Date(aEnd) < new Date(bStart) || new Date(aStart) > new Date(bEnd));
}

/**
 * The contract period HR entered for this employee — the coverage period with
 * the furthest end date, falling back to any contract on record when none is
 * Approved/Active yet (a freshly created Draft, for example).
 */
export function latestContractFor<T extends ContractPeriod>(contracts: T[], employeeId: number): T | undefined {
  const mine = contracts.filter(c => c.employeeId === employeeId);
  const covering = mine.filter(c => providesCoverage(c.status));
  const pool = covering.length ? covering : mine;
  return pool.reduce<T | undefined>(
    (latest, c) => (!latest || new Date(c.endDate) > new Date(latest.endDate) ? c : latest),
    undefined,
  );
}

const MS_PER_DAY = 86400000;

/**
 * The renewal window that follows a previous period: it starts the day after
 * the previous end (spec — "next non-overlapping renewal starts after previous
 * end") and runs for the same number of days.
 *
 * Returns ISO `YYYY-MM-DD` strings, or null if the previous period is unusable.
 */
export function renewalPeriodAfter(prior: ContractPeriod | undefined): { start: string; end: string } | null {
  if (!prior) return null;
  const start = new Date(prior.startDate);
  const end = new Date(prior.endDate);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return null;
  const lengthDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / MS_PER_DAY));
  const nextStart = new Date(end.getTime() + MS_PER_DAY);
  const nextEnd = new Date(nextStart.getTime() + lengthDays * MS_PER_DAY);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { start: iso(nextStart), end: iso(nextEnd) };
}
