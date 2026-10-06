/**
 * Small, pure helpers shared by the portfolio and property views. They only read engine results
 * (and call engine functions for rates); no new financial logic lives here.
 */
import { getTaxTable } from "@/data/tax";
import { applyRate } from "@/engine/money";
import type {
  Cents,
  Household,
  LoanSchedule,
  LoanType,
  PropertyTimeline,
  PropertyYearRow,
  Rate,
  TimelineEvent,
  Year,
} from "@/engine/types";

/** Ceiling rate on unrecaptured Section 1250 gain for the household's tax table (25%). */
export function recaptureCeilingRate(household: Household): Rate {
  return getTaxTable(household.market.taxTableYear).unrecaptured1250MaxRate;
}

/** Estimated tax on a recapture amount at the ceiling rate. */
export function recaptureTaxAtCeiling(household: Household, recapture: Cents): Cents {
  return applyRate(Math.max(0, recapture), recaptureCeilingRate(household));
}

export function rowForYear(p: PropertyTimeline, year: Year): PropertyYearRow | undefined {
  return p.rows.find((r) => r.year === year);
}

/** Loan-to-value ratio of a property row (0 when there is no value). */
export function loanToValue(row: PropertyYearRow): Rate {
  return row.marketValue > 0 ? row.loanBalance / row.marketValue : 0;
}

export const LOAN_TYPE_LABEL: Record<LoanType, string> = {
  fixed: "Fixed",
  interestOnly: "Interest-only",
  arm: "ARM",
  heloc: "HELOC",
};

export interface LoanTypeCount {
  type: LoanType;
  label: string;
  count: number;
}

/** Loans grouped by type, in a stable order (Fixed, Interest-only, ARM, HELOC). */
export function loanTypeCounts(schedules: readonly LoanSchedule[]): LoanTypeCount[] {
  const order: LoanType[] = ["fixed", "interestOnly", "arm", "heloc"];
  return order
    .map((type) => ({
      type,
      label: LOAN_TYPE_LABEL[type],
      count: schedules.filter((s) => s.type === type).length,
    }))
    .filter((c) => c.count > 0);
}

export interface Badge {
  key: string;
  label: string;
  tone: "amber" | "neutral" | "accent";
}

const shortYear = (y: Year) => String(y);

/** Risk and event badges for a property: amber for upcoming or past loan events, neutral for "Paid off". */
export function propertyBadges(
  p: PropertyTimeline,
  events: readonly TimelineEvent[],
  row: PropertyYearRow,
  year: Year,
): Badge[] {
  const badges: Badge[] = [];
  const mine = events.filter((e) => e.propertyId === p.id);
  for (const e of mine.filter((e) => e.kind === "ioEnds")) {
    badges.push({
      key: `io-${e.year}`,
      label: `IO ${e.year <= year ? "ended" : "ends"} ${shortYear(e.year)}`,
      tone: "amber",
    });
  }
  for (const e of mine.filter((e) => e.kind === "armReset")) {
    badges.push({
      key: `arm-${e.year}`,
      label: `ARM ${e.year <= year ? "reset" : "resets"} ${shortYear(e.year)}`,
      tone: "amber",
    });
  }
  const capYears = p.loanSchedules
    .flatMap((s) => s.rows.filter((r) => r.capHit !== "none").map((r) => r.year))
    .sort((a, b) => a - b);
  const firstCap = capYears[0];
  if (firstCap !== undefined) {
    badges.push({ key: "cap", label: `Rate cap hit ${shortYear(firstCap)}`, tone: "amber" });
  }
  const draws = [...new Set(mine.filter((e) => e.kind === "helocDraw").map((e) => e.year))].sort(
    (a, b) => a - b,
  );
  if (draws.length > 0) {
    const first = draws[0] as number;
    const last = draws[draws.length - 1] as number;
    badges.push({
      key: "heloc",
      label:
        first === last ? `HELOC draw ${first}` : `HELOC draws ${first}–${String(last).slice(2)}`,
      tone: "amber",
    });
  }
  if (p.loanSchedules.length > 0 && row.loanBalance === 0) {
    badges.push({ key: "paid", label: "Paid off", tone: "neutral" });
  }
  return badges;
}

/** Sum a numeric field across rows of the same year. */
export function sumRows(
  rows: readonly (PropertyYearRow | undefined)[],
  pick: (r: PropertyYearRow) => Cents,
): Cents {
  let total = 0;
  for (const r of rows) if (r) total += pick(r);
  return total;
}

/** Truncate a label so it fits a given pixel width at roughly `charWidth` px per glyph. */
export function fitText(text: string, width: number, charWidth = 6.1): string {
  const max = Math.floor(width / charWidth);
  if (max <= 1) return "";
  if (text.length <= max) return text;
  if (max <= 3) return "";
  return `${text.slice(0, max - 1).trimEnd()}…`;
}

/** SVG path for a vertical bar whose top corners are rounded (the data end of the bar). */
export function roundedTopBar(
  x: number,
  y: number,
  w: number,
  h: number,
  radius = 4,
  roundTop = true,
): string {
  if (h <= 0 || w <= 0) return "";
  const r = roundTop ? Math.min(radius, h, w / 2) : 0;
  return `M${x},${y + h}V${y + r}${r ? `Q${x},${y} ${x + r},${y}` : `V${y}`}H${x + w - r}${r ? `Q${x + w},${y} ${x + w},${y + r}` : `H${x + w}`}V${y + h}Z`;
}
