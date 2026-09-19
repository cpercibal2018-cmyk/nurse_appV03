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

// ── Contract copy [PDF] acceptance ──────────────────────────────────────────
//
// One rule shared by the Create Contract screen and the store guard, so the
// picker and the write path cannot drift apart. Note that the `accept`
// attribute on a file input is only a hint: every browser lets the user switch
// the dialog to "All files". The filter that actually decides is this function
// plus the store's byte check.

/** `accept` value for the picker — MIME first, extension as a fallback for pickers that match on suffix. */
export const CONTRACT_COPY_ACCEPT = 'application/pdf,.pdf';

export const MAX_CONTRACT_COPY_BYTES = 10 * 1024 * 1024;

/** A real PDF starts with these five bytes; the declared type alone proves nothing. */
export const PDF_MAGIC = '%PDF-';

export type ContractCopyVerdict =
  | { ok: true }
  | { ok: false; code: 'NOT_A_PDF' | 'CONTENT_TYPE_MISMATCH' | 'EMPTY_FILE' | 'FILE_TOO_LARGE' | 'CONTENT_VERIFICATION_FAILED'; message: string };

export interface ContractCopyCandidate {
  name: string;
  type?: string;
  /** Bytes, when known. Omitted by pickers that only report name/type/size. */
  size?: number;
  /** The first few bytes, when the caller has read them. */
  head?: Uint8Array;
}

/**
 * Decide whether a file may be attached as the contract copy.
 *
 * `head` is optional so the picker can reject on name/type/size instantly and
 * then confirm against the bytes it read; when `head` is present it is
 * authoritative, because a file renamed to `.pdf` still is not a PDF.
 */
export function checkContractCopyCandidate(file: ContractCopyCandidate): ContractCopyVerdict {
  if (!/\.pdf$/i.test(file.name || '')) {
    return { ok: false, code: 'NOT_A_PDF', message: `The contract copy must be a PDF — got "${file.name}"` };
  }
  if (file.type && file.type !== 'application/pdf') {
    return { ok: false, code: 'CONTENT_TYPE_MISMATCH', message: `Declared type ${file.type}, expected application/pdf (§5.3.2)` };
  }
  // `head` may be only a prefix of the file, so prefer the declared size.
  const size = file.size ?? file.head?.length;
  if (size !== undefined) {
    if (size === 0) return { ok: false, code: 'EMPTY_FILE', message: 'The contract copy has no content' };
    if (size > MAX_CONTRACT_COPY_BYTES) {
      return { ok: false, code: 'FILE_TOO_LARGE', message: `${(size / 1048576).toFixed(1)} MB exceeds the ${MAX_CONTRACT_COPY_BYTES / 1048576} MB limit` };
    }
  }
  if (file.head) {
    const magic = String.fromCharCode(...Array.from(file.head.slice(0, PDF_MAGIC.length)));
    if (magic !== PDF_MAGIC) {
      return { ok: false, code: 'CONTENT_VERIFICATION_FAILED', message: 'The bytes do not start with %PDF- — the file is not a PDF whatever it is named (§5.3.2)' };
    }
  }
  return { ok: true };
}
