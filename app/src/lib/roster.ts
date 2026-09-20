// Roster & Scheduling — coverage targets and grid helpers.
//
// Coverage is measured per unit × shift (not per department). Required staffing
// is derived from the unit's operational bed count with a per-shift factor, so
// the board has a sensible "required" number without a separate targets table.

export type ShiftKey = 'M' | 'E' | 'N';

export interface ShiftType {
  key: ShiftKey;
  name: 'Morning' | 'Evening' | 'Night';
  label: string;
  start: string;
  end: string;
  color: string;
}

export const SHIFT_TYPES: ShiftType[] = [
  { key: 'M', name: 'Morning', label: 'M · 07:00–15:00', start: '07:00', end: '15:00', color: '#2563eb' },
  { key: 'E', name: 'Evening', label: 'E · 15:00–23:00', start: '15:00', end: '23:00', color: '#7c3aed' },
  { key: 'N', name: 'Night', label: 'N · 23:00–07:00', start: '23:00', end: '07:00', color: '#1e293b' },
];

export const SHIFT_BY_NAME: Record<string, ShiftType> = Object.fromEntries(SHIFT_TYPES.map(s => [s.name, s]));

// Per-shift staffing factor applied to bed count. Days carry the heaviest load,
// nights the lightest. A unit with beds always needs at least one nurse per shift.
const SHIFT_FACTOR: Record<ShiftKey, number> = { M: 0.14, E: 0.11, N: 0.10 };

export function requiredFor(bedCount: number, shift: ShiftKey): number {
  if (bedCount <= 0) return 0;
  return Math.max(1, Math.round(bedCount * SHIFT_FACTOR[shift]));
}

/** Coverage ratio → band color. green ≥100% · amber ≥85% · red below. */
export function coverageColor(assigned: number, required: number): string {
  if (required === 0) return 'var(--text-muted)';
  const pct = assigned / required;
  if (pct >= 1) return '#1a6b4e';
  if (pct >= 0.85) return '#ba7517';
  return '#dc2626';
}

export function coveragePct(assigned: number, required: number): number {
  if (required === 0) return 100;
  return Math.round((assigned / required) * 100);
}

/** Short chip label from a full name: first name + last initial. */
export function chipName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0]}.`;
}

export function initials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + last).toUpperCase();
}

// Units shown on the board: those with beds (the ~18 with real coverage need).
export interface BoardUnit { id: number; code: string; name: string; bedCount: number; departmentId: number; isActive?: boolean; }

export function boardUnits<T extends BoardUnit>(units: T[]): T[] {
  return units.filter(u => u.isActive !== false && u.bedCount > 0).sort((a, b) => b.bedCount - a.bedCount);
}
