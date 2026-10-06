/**
 * Residential rental depreciation: straight-line over 27.5 years, mid-month convention.
 *
 * Time is measured in HALF-MONTHS so the convention is exact integer arithmetic. The mid-month of
 * calendar month m of year y sits at half-month index 24*y + 2*(m-1) + 1; the end of year y sits at
 * 24*(y+1). A tranche accrues one half-month of depreciation per half-month it is "in service",
 * capped at its recovery period (27.5 years = 660 half-months).
 *
 * Example: placed in service in January -> 23 half-months in year one (11.5 months, the familiar
 * 3.485% first-year rate); placed in service in December -> 1 half-month (0.5 month).
 */

import { toCents } from "./money";
import type { Cents } from "./money";
import type { DepreciationTranche, Month, Property, Year } from "./types";

export const RESIDENTIAL_RECOVERY_YEARS = 27.5;
export const RESIDENTIAL_LIFE_HALF_MONTHS = 660;

/** Half-month index of the middle of a calendar month. */
export function midMonthIndex(year: Year, month: Month): number {
  return 24 * year + 2 * (month - 1) + 1;
}

/** Half-month index of the instant a calendar year ends (Dec 31). */
export function yearEndIndex(year: Year): number {
  return 24 * (year + 1);
}

/** Half-months of depreciation a tranche has accrued as of half-month index `at`. */
export function accruedHalfMonths(tranche: DepreciationTranche, at: number): number {
  const start = midMonthIndex(tranche.placedInServiceYear, tranche.placedInServiceMonth);
  return Math.min(tranche.lifeHalfMonths, Math.max(0, at - start));
}

/** Accumulated depreciation of a tranche as of half-month index `at`, in whole cents. */
export function accumulatedDepreciationAt(tranche: DepreciationTranche, at: number): Cents {
  if (tranche.lifeHalfMonths <= 0) return tranche.basis;
  return toCents((tranche.basis * accruedHalfMonths(tranche, at)) / tranche.lifeHalfMonths);
}

/** Accumulated depreciation across tranches at the end of `year`. */
export function accumulatedDepreciationAtYearEnd(
  tranches: readonly DepreciationTranche[],
  year: Year,
): Cents {
  const at = yearEndIndex(year);
  let total = 0;
  for (const t of tranches) total += accumulatedDepreciationAt(t, at);
  return total;
}

/**
 * Accumulated depreciation across tranches at the moment of a disposition in `month` of `year`.
 * The mid-month convention gives half a month of depreciation in the month of sale.
 */
export function accumulatedDepreciationAtDisposition(
  tranches: readonly DepreciationTranche[],
  year: Year,
  month: Month,
): Cents {
  const at = midMonthIndex(year, month);
  let total = 0;
  for (const t of tranches) total += accumulatedDepreciationAt(t, at);
  return total;
}

/** Depreciation deducted during a single calendar year (full-year ownership). */
export function annualDepreciation(tranches: readonly DepreciationTranche[], year: Year): Cents {
  return (
    accumulatedDepreciationAtYearEnd(tranches, year) -
    accumulatedDepreciationAtYearEnd(tranches, year - 1)
  );
}

/** Total depreciable basis across tranches. */
export function totalDepreciableBasis(tranches: readonly DepreciationTranche[]): Cents {
  let total = 0;
  for (const t of tranches) total += t.basis;
  return total;
}

/**
 * Split purchase price plus capitalised closing costs into land and building. Closing costs are
 * allocated pro rata, so the land share applies to the whole capitalised amount. The building gets
 * the rounded share and land receives the exact remainder, so the two always sum to the total.
 */
export function allocatePurchaseBasis(
  property: Pick<Property, "purchasePrice" | "closingCosts" | "landValuePct">,
): {
  land: Cents;
  building: Cents;
  total: Cents;
} {
  const total = property.purchasePrice + property.closingCosts;
  const building = toCents(total * (1 - property.landValuePct));
  return { land: total - building, building, total };
}

/** Build the depreciation tranches (building + each improvement) for an original property. */
export function buildTranchesForProperty(property: Property): DepreciationTranche[] {
  const { building } = allocatePurchaseBasis(property);
  const tranches: DepreciationTranche[] = [
    {
      id: `${property.id}:building`,
      label: "Building (purchase price + closing costs, land excluded)",
      kind: "building",
      basis: building,
      placedInServiceYear: property.purchaseYear,
      placedInServiceMonth: property.purchaseMonth,
      lifeHalfMonths: RESIDENTIAL_LIFE_HALF_MONTHS,
    },
  ];
  for (const imp of property.improvements) {
    tranches.push(trancheForImprovement(property.id, imp));
  }
  return tranches;
}

export function trancheForImprovement(
  propertyId: string,
  imp: { id: string; description: string; year: Year; month: Month; amount: Cents },
): DepreciationTranche {
  return {
    id: `${propertyId}:${imp.id}`,
    label: `Improvement: ${imp.description}`,
    kind: "improvement",
    basis: imp.amount,
    placedInServiceYear: imp.year,
    placedInServiceMonth: imp.month,
    lifeHalfMonths: RESIDENTIAL_LIFE_HALF_MONTHS,
  };
}

export interface DepreciationScheduleRow {
  year: Year;
  /** Depreciation per tranche id. */
  byTranche: Record<string, Cents>;
  depreciation: Cents;
  accumulated: Cents;
  /** Depreciable basis not yet depreciated. */
  remainingDepreciableBasis: Cents;
}

/**
 * Year-by-year depreciation schedule for a set of tranches over [firstYear, lastYear]. Tranches
 * not yet placed in service contribute zero until their start. Accumulated figures telescope
 * exactly: the final accumulated amount equals the sum of annual amounts.
 */
export function buildDepreciationSchedule(
  tranches: readonly DepreciationTranche[],
  firstYear: Year,
  lastYear: Year,
): DepreciationScheduleRow[] {
  const rows: DepreciationScheduleRow[] = [];
  const prior: Record<string, Cents> = {};
  for (const t of tranches) prior[t.id] = accumulatedDepreciationAt(t, yearEndIndex(firstYear - 1));
  for (let y = firstYear; y <= lastYear; y++) {
    const byTranche: Record<string, Cents> = {};
    let depreciation = 0;
    let accumulated = 0;
    let basis = 0;
    for (const t of tranches) {
      const acc = accumulatedDepreciationAt(t, yearEndIndex(y));
      const d = acc - (prior[t.id] ?? 0);
      byTranche[t.id] = d;
      prior[t.id] = acc;
      depreciation += d;
      accumulated += acc;
      // Only count basis that has been placed in service by this year end.
      if (midMonthIndex(t.placedInServiceYear, t.placedInServiceMonth) <= yearEndIndex(y)) {
        basis += t.basis;
      }
    }
    rows.push({
      year: y,
      byTranche,
      depreciation,
      accumulated,
      remainingDepreciableBasis: basis - accumulated,
    });
  }
  return rows;
}
