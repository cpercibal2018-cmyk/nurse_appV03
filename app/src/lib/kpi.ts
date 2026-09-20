// Nursing Workforce KPIs — MoH Ada'a (أداء) Quality Failure Regime
//
// Two indicators from the Ada'a Health Dashboard, both Workforce Management,
// owned by the Deputyship for Therapeutic Services, reported monthly:
//
//   A. Nurse to Bed Ratio (Critical Areas) — ICU / ER / OR scored separately,
//      each coded 1..4, then averaged into a final band.
//   B. Hospital's Nurse to Bed Ratio (Hospital-Wide), code QFR-55 — one ratio.
//
// The engine is pure so the numbers can be unit-tested and reused by the page,
// the dashboard gauges, and (later) a monthly snapshot job.

export type Band = 'Standard' | 'Distress' | 'Failing' | 'Failed';

export const BAND_COLORS: Record<Band, string> = {
  Standard: '#16a34a', // green
  Distress: '#eab308', // yellow
  Failing: '#f97316',  // orange
  Failed: '#dc2626',   // red
};

export const BAND_ORDER: Band[] = ['Standard', 'Distress', 'Failing', 'Failed'];

export type CriticalArea = 'ICU' | 'ER' | 'OR';

// ── Unit → critical-area classification ─────────────────────────────────────
// Derived from the Hospital Master Unit Directory (seed) by unit code, so the
// KPI counts the right beds. OR needs *more* nurses per bed than it has beds;
// ICU/ER are graded as beds-per-nurse. Codes not listed here are non-critical
// and only contribute to the hospital-wide KPI.
export const CRITICAL_AREA_BY_UNIT_CODE: Record<string, CriticalArea> = {
  // ICU — true intensive-care beds
  ICU_MAIN: 'ICU', ICU_EXT: 'ICU', NICU: 'ICU', PICU: 'ICU', CCU: 'ICU', BURN_ICU: 'ICU',
  // ER — emergency treatment beds
  ER_MAIN: 'ER', ER_MC: 'ER', UCC: 'ER', CDU: 'ER',
  // OR — surgical suites
  OR: 'OR',
};

export function classifyUnit(unitCode: string): CriticalArea | null {
  return CRITICAL_AREA_BY_UNIT_CODE[unitCode] ?? null;
}

// ── KPI A — critical-area coding (1..4) ─────────────────────────────────────
// ICU/ER measure beds-per-nurse N = beds / nurses (lower is better).
// OR measures nurses-per-bed M = nurses / beds (higher is better) — inverted.
//
// Thresholds come straight from the Ada'a card, converted to midpoint cut-lines
// so a value lands cleanly on the 1-1.5 / 1.5-2.5 / 2.5-3.5 / 3.5-4 code scale.

export interface AreaResult {
  area: CriticalArea;
  nurses: number;
  beds: number;
  /** Displayed ratio, always normalised to "1 : N beds-per-nurse" for the label. */
  bedsPerNurse: number;
  /** For OR, the meaningful figure is nurses-per-bed. */
  nursesPerBed: number;
  code: 1 | 2 | 3 | 4;
  band: Band;
  /** Human ratio label, e.g. "1:2" (ICU/ER) or "2:1" (OR). */
  ratioLabel: string;
}

function codeToBand(code: number): Band {
  if (code <= 1.5) return 'Standard';
  if (code <= 2.5) return 'Distress';
  if (code <= 3.5) return 'Failing';
  return 'Failed';
}

function codeIcu(bedsPerNurse: number): 1 | 2 | 3 | 4 {
  if (bedsPerNurse <= 1.5) return 1; // 1:1 Standard
  if (bedsPerNurse <= 2.5) return 2; // 1:2 Distress
  if (bedsPerNurse <= 3.5) return 3; // 1:3 Failing
  return 4;                          // 1:>4 Failed
}

function codeEr(bedsPerNurse: number): 1 | 2 | 3 | 4 {
  if (bedsPerNurse <= 2.5) return 1; // 1:2 Standard
  if (bedsPerNurse <= 3.5) return 2; // 1:3 Distress
  if (bedsPerNurse <= 4.5) return 3; // 1:4 Failing
  return 4;                          // 1:>5 Failed
}

function codeOr(nursesPerBed: number): 1 | 2 | 3 | 4 {
  if (nursesPerBed >= 1.5) return 1;  // 2:1 Standard
  if (nursesPerBed >= 0.75) return 2; // 1:1 Distress
  if (nursesPerBed >= 0.417) return 3; // 1:2 Failing
  return 4;                            // 1:>3 Failed
}

/** Format a ratio the way the Ada'a card does: OR as nurses:bed, others as 1:beds. */
function ratioLabel(area: CriticalArea, nurses: number, beds: number): string {
  if (nurses === 0 || beds === 0) return '—';
  if (area === 'OR') {
    const m = nurses / beds;
    return m >= 1 ? `${round1(m)}:1` : `1:${round1(beds / nurses)}`;
  }
  return `1:${round1(beds / nurses)}`;
}

export function scoreArea(area: CriticalArea, nurses: number, beds: number): AreaResult {
  const bedsPerNurse = nurses > 0 ? beds / nurses : Infinity;
  const nursesPerBed = beds > 0 ? nurses / beds : 0;
  const code =
    area === 'ICU' ? codeIcu(bedsPerNurse)
    : area === 'ER' ? codeEr(bedsPerNurse)
    : codeOr(nursesPerBed);
  return {
    area, nurses, beds, bedsPerNurse, nursesPerBed,
    code, band: codeToBand(code),
    ratioLabel: ratioLabel(area, nurses, beds),
  };
}

export interface KpiAResult {
  areas: AreaResult[];
  averageCode: number;
  band: Band;
}

/** KPI A — average the three area codes into the final band. */
export function computeKpiA(input: Record<CriticalArea, { nurses: number; beds: number }>): KpiAResult {
  const areas = (['ICU', 'ER', 'OR'] as CriticalArea[]).map(a => scoreArea(a, input[a].nurses, input[a].beds));
  const averageCode = areas.reduce((s, a) => s + a.code, 0) / areas.length;
  return { areas, averageCode, band: codeToBand(averageCode) };
}

// ── KPI B — hospital-wide (QFR-55) ──────────────────────────────────────────
// Ratio 1:N beds-per-nurse. Standard 1:<6 · Distress 1:6–<7 · Failing 1:7–9 ·
// Failed 1:>9.

export interface KpiBResult {
  nurses: number;
  beds: number;
  bedsPerNurse: number;
  band: Band;
  ratioLabel: string;
}

export function computeKpiB(nurses: number, beds: number): KpiBResult {
  const bedsPerNurse = nurses > 0 ? beds / nurses : Infinity;
  let band: Band;
  if (bedsPerNurse < 6) band = 'Standard';
  else if (bedsPerNurse < 7) band = 'Distress';
  else if (bedsPerNurse <= 9) band = 'Failing';
  else band = 'Failed';
  return {
    nurses, beds, bedsPerNurse, band,
    ratioLabel: nurses > 0 ? `1:${round1(bedsPerNurse)}` : '—',
  };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

// ── Live counts from the roster (optional data source) ──────────────────────
// "Nurses on duty" = schedulable staff with a Published assignment on the given
// date/shift. Beds = operational bed count from the unit directory.

export interface UnitLike { id: number; code: string; bedCount: number; isActive?: boolean; }
export interface AssignmentLike { employeeId: number; unitId: number; shiftDate: string; shiftName: string; status: string; }

export function rosterCountsByArea(
  units: UnitLike[],
  assignments: AssignmentLike[],
  shiftDate: string,
  shiftName: string,
): Record<CriticalArea, { nurses: number; beds: number }> {
  const out: Record<CriticalArea, { nurses: number; beds: number }> = {
    ICU: { nurses: 0, beds: 0 }, ER: { nurses: 0, beds: 0 }, OR: { nurses: 0, beds: 0 },
  };
  const areaOfUnit = new Map<number, CriticalArea>();
  for (const u of units) {
    const area = classifyUnit(u.code);
    if (area) { areaOfUnit.set(u.id, area); out[area].beds += u.bedCount; }
  }
  for (const a of assignments) {
    if (a.status !== 'Published' || a.shiftDate !== shiftDate || a.shiftName !== shiftName) continue;
    const area = areaOfUnit.get(a.unitId);
    if (area) out[area].nurses += 1;
  }
  return out;
}

export function rosterCountsHospital(
  units: UnitLike[],
  assignments: AssignmentLike[],
  shiftDate: string,
  shiftName: string,
): { nurses: number; beds: number } {
  const beds = units.filter(u => u.isActive !== false).reduce((s, u) => s + u.bedCount, 0);
  const nurses = assignments.filter(a => a.status === 'Published' && a.shiftDate === shiftDate && a.shiftName === shiftName).length;
  return { nurses, beds };
}
