const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAY_MS = 86_400_000;

/** Parse "YYYY-MM-DD" into UTC components; never touches the local time zone. */
function parts(iso: string): { y: number; m: number; d: number } {
  const [y, m, d] = iso.split("-").map(Number);
  return { y: y ?? 1970, m: m ?? 1, d: d ?? 1 };
}

export function utcMs(iso: string): number {
  const { y, m, d } = parts(iso);
  return Date.UTC(y, m - 1, d);
}

/** "Feb 14, 2029" */
export function fmtDate(iso: string): string {
  const { y, m, d } = parts(iso);
  return `${MONTHS[m - 1] ?? ""} ${d}, ${y}`;
}

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  return Math.round((utcMs(to) - utcMs(from)) / DAY_MS);
}

/**
 * Position on a year axis where tick Y marks the END of year Y (the same convention as the
 * year-end rows in the projection): Dec 31 of Y lands exactly on Y, mid-June of Y on Y − 0.5.
 */
export function axisPosition(iso: string): number {
  const { y } = parts(iso);
  const start = Date.UTC(y, 0, 1);
  const length = Date.UTC(y + 1, 0, 1) - start;
  return y - 1 + (utcMs(iso) - start + DAY_MS) / length;
}
