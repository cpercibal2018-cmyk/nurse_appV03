// Gregorian → Hijri (Umm al-Qura) conversion.
//
// The Umm al-Qura calendar is the official civil calendar of Saudi Arabia, so
// it is the correct basis for contract dates. `Intl` with the
// `islamic-umalqura` calendar extension is used rather than an arithmetic
// approximation: the Umm al-Qura month lengths are observation-based and the
// ICU tables shipped with the runtime are authoritative.
//
// Both helpers accept a `Date`, an ISO date string, or dayjs value (anything
// with a `toDate()` method) so callers can pass form values straight through.

type DateLike = Date | string | null | undefined | { toDate: () => Date };

function toDate(value: DateLike): Date | null {
  if (!value) return null;
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
  if (typeof (value as any).toDate === 'function') {
    const d = (value as any).toDate();
    return d instanceof Date && !isNaN(d.getTime()) ? d : null;
  }
  const d = new Date(value as string);
  return isNaN(d.getTime()) ? null : d;
}

const AR_FMT = new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

const PARTS_FMT = new Intl.DateTimeFormat('en-SA-u-ca-islamic-umalqura', {
  day: 'numeric',
  month: 'numeric',
  year: 'numeric',
});

/** Numeric Hijri parts. Built from `formatToParts` so the field order is ours
 *  (DD/MM/YYYY — Saudi convention) rather than whatever the locale defaults to. */
function hijriParts(d: Date): { day: string; month: string; year: string } | null {
  try {
    const parts = PARTS_FMT.formatToParts(d);
    const get = (t: string) => parts.find(p => p.type === t)?.value || '';
    const day = get('day');
    const month = get('month');
    const year = get('year');
    if (!day || !month || !year) return null;
    return { day: day.padStart(2, '0'), month: month.padStart(2, '0'), year: year.padStart(4, '0') };
  } catch {
    return null;
  }
}

/** Full form: `25 رجب 1447 هـ — 25/07/1447`. Used on the onboarding form. */
export function toHijri(value: DateLike): string {
  const d = toDate(value);
  if (!d) return '-';
  try {
    const parts = AR_FMT.formatToParts(d);
    const day = parts.find(p => p.type === 'day')?.value || '';
    const month = parts.find(p => p.type === 'month')?.value || '';
    const year = parts.find(p => p.type === 'year')?.value || '';
    const numeric = hijriParts(d);
    return numeric
      ? `${day} ${month} ${year} هـ — ${numeric.day}/${numeric.month}/${numeric.year}`
      : `${day} ${month} ${year} هـ`;
  } catch {
    return '-';
  }
}

/** Short numeric form: `25/07/1447`. Used in table cells. */
export function toHijriShort(value: DateLike): string {
  const d = toDate(value);
  if (!d) return '';
  const p = hijriParts(d);
  return p ? `${p.day}/${p.month}/${p.year}` : '';
}

/**
 * Canonical stored form: `1447-07-25` (Hijri year-month-day, zero padded).
 * This is what gets persisted alongside the Gregorian date so the recorded
 * Hijri value does not drift if the runtime's ICU tables are ever updated.
 */
export function toHijriIso(value: DateLike): string {
  const d = toDate(value);
  if (!d) return '';
  try {
    const parts = PARTS_FMT.formatToParts(d);
    const get = (t: string) => parts.find(p => p.type === t)?.value || '';
    const year = get('year').padStart(4, '0');
    const month = get('month').padStart(2, '0');
    const day = get('day').padStart(2, '0');
    if (!year || !month || !day) return '';
    return `${year}-${month}-${day}`;
  } catch {
    return '';
  }
}
