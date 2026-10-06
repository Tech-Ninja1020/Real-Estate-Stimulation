import { usd } from "@/engine/money";
import type { Month, Property, ReplacementAssumptions, ScenarioConfig, Year } from "@/engine/types";

/** A preset bundles a household with sensible default Scenario Lab controls. */
export interface PresetMeta {
  id: string;
  name: string;
  tagline: string;
  /** A one-line summary of the situation, shown on the landing page. */
  situation: string;
  /** What the engine's edge cases demonstrate in this household. */
  highlights: string[];
}

export function defaultReplacement(
  name: string,
  overrides: Partial<ReplacementAssumptions> = {},
): ReplacementAssumptions {
  return {
    name,
    priceMultiple: 1.1,
    closingCostRate: 0.015,
    landValuePct: 0.2,
    debt: { kind: "matchRelinquished" },
    loanRate: 0.0625,
    loanTermYears: 30,
    grossRentYield: 0.085,
    rentGrowthRate: 0.03,
    vacancyRate: 0.05,
    opexRateOfRent: 0.36,
    propertyTaxRate: 0.011,
    insuranceRate: 0.0035,
    expenseGrowthRate: 0.03,
    appreciationRate: 0.035,
    sellingCostRate: 0.06,
    ...overrides,
  };
}

export function scenarioFor(
  sellYear: Year,
  sellPropertyIds: string[],
  replacement: ReplacementAssumptions,
  overrides: Partial<ScenarioConfig> = {},
): ScenarioConfig {
  return {
    sellYear,
    sellPropertyIds,
    replacement,
    cashOutAtClosing: 0,
    identificationDays: 30,
    closingDays: 120,
    ...overrides,
  };
}

/** Shorthand for a calendar month. */
export const m = (month: Month): Month => month;

/** Fill defaults that nearly every property shares. */
export function property(
  p: Omit<Property, "improvements" | "expenseGrowthRate" | "sellingCostRate" | "landValuePct"> &
    Partial<
      Pick<Property, "improvements" | "expenseGrowthRate" | "sellingCostRate" | "landValuePct">
    >,
): Property {
  return {
    improvements: [],
    expenseGrowthRate: 0.03,
    sellingCostRate: 0.06,
    landValuePct: 0.2,
    ...p,
  };
}

export { usd };
