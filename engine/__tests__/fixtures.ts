import { usd } from "@/engine/money";
import type {
  Household,
  Loan,
  Property,
  ReplacementAssumptions,
  ScenarioConfig,
} from "@/engine/types";
import { defaultReplacement } from "@/data/presets/helpers";

/** A simple, all-cash rental whose numbers can be checked by hand. */
export function simpleProperty(overrides: Partial<Property> = {}): Property {
  return {
    id: "p1",
    name: "Test Duplex",
    location: "Testville",
    purchaseYear: 2016,
    purchaseMonth: 1,
    purchasePrice: usd(300_000),
    landValuePct: 0.2,
    closingCosts: usd(6_000),
    improvements: [],
    currentValue: usd(450_000),
    appreciationRate: 0.03,
    annualRent: usd(36_000),
    rentGrowthRate: 0.03,
    vacancyRate: 0.05,
    operating: { kind: "percentOfRent", rate: 0.3 },
    propertyTax: usd(4_500),
    insurance: usd(1_800),
    expenseGrowthRate: 0.03,
    loans: [],
    sellingCostRate: 0.06,
    ...overrides,
  };
}

export function simpleHousehold(
  properties: Property[] = [simpleProperty()],
  overrides: Partial<Household["investor"]> = {},
): Household {
  return {
    id: "test",
    name: "Test household",
    tagline: "",
    description: "",
    investor: {
      filingStatus: "single",
      otherTaxableIncome: usd(100_000),
      stateTaxRate: 0.05,
      horizonYears: 10,
      discountRate: 0.05,
      reinvestmentReturnRate: 0.04,
      ...overrides,
    },
    market: {
      asOfYear: 2026,
      taxTableYear: 2026,
      inflationRate: 0.025,
      armIndexRate: 0.04,
      armIndexAnnualChange: 0,
    },
    properties,
  };
}

export function simpleReplacement(
  overrides: Partial<ReplacementAssumptions> = {},
): ReplacementAssumptions {
  return defaultReplacement("Replacement Test Property", overrides);
}

export function simpleScenario(overrides: Partial<ScenarioConfig> = {}): ScenarioConfig {
  return {
    sellYear: 2030,
    sellPropertyIds: ["p1"],
    replacement: simpleReplacement(),
    cashOutAtClosing: 0,
    identificationDays: 30,
    closingDays: 120,
    ...overrides,
  };
}

export const fixedLoan = (overrides: Partial<Extract<Loan, { type: "fixed" }>> = {}): Loan => ({
  type: "fixed",
  id: "loan-fixed",
  label: "Fixed",
  startYear: 2016,
  startMonth: 1,
  principal: usd(200_000),
  rate: 0.06,
  termYears: 30,
  ...overrides,
});
