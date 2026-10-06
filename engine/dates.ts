/**
 * Minimal civil-date arithmetic (proleptic Gregorian, UTC). No clock access: every date is
 * constructed from explicit inputs, so results are deterministic and timezone independent.
 */

export interface CivilDate {
  year: number;
  /** 1-12 */
  month: number;
  /** 1-31 */
  day: number;
}

const MS_PER_DAY = 86_400_000;

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function endOfYear(year: number): CivilDate {
  return { year, month: 12, day: 31 };
}

export function toEpochDay(d: CivilDate): number {
  return Math.round(Date.UTC(d.year, d.month - 1, d.day) / MS_PER_DAY);
}

export function fromEpochDay(epochDay: number): CivilDate {
  const dt = new Date(epochDay * MS_PER_DAY);
  return { year: dt.getUTCFullYear(), month: dt.getUTCMonth() + 1, day: dt.getUTCDate() };
}

export function addDays(d: CivilDate, days: number): CivilDate {
  return fromEpochDay(toEpochDay(d) + days);
}

export function daysBetween(from: CivilDate, to: CivilDate): number {
  return toEpochDay(to) - toEpochDay(from);
}

export function formatIsoDate(d: CivilDate): string {
  const mm = String(d.month).padStart(2, "0");
  const dd = String(d.day).padStart(2, "0");
  return `${d.year}-${mm}-${dd}`;
}

/** Absolute month index: January of year Y is `Y * 12`. */
export function monthIndex(year: number, month: number): number {
  return year * 12 + (month - 1);
}

export function fromMonthIndex(index: number): { year: number; month: number } {
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}
