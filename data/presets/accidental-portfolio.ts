import type { Household } from "@/engine/types";
import { defaultReplacement, property, scenarioFor, usd } from "./helpers";
import type { PresetMeta } from "./helpers";

export const ACCIDENTAL_PORTFOLIO_META: PresetMeta = {
  id: "accidental-portfolio",
  name: "The Accidental Portfolio",
  tagline: "A former home, a condo and a duplex. Nobody planned this.",
  situation:
    "A dual-income couple kept their first house as a rental, bought a condo, then a duplex at peak rates. One ARM is about to reset, and cash flow is thin.",
  highlights: [
    "ARM reset that hits its adjustment cap",
    "HELOC draws funding a kitchen remodel",
    "Negative cash flow in early years",
    "Sale in the same year as a capital improvement",
  ],
};

export const ACCIDENTAL_PORTFOLIO: Household = {
  id: "accidental-portfolio",
  name: "The Accidental Portfolio",
  tagline: ACCIDENTAL_PORTFOLIO_META.tagline,
  description: ACCIDENTAL_PORTFOLIO_META.situation,
  investor: {
    filingStatus: "mfj",
    otherTaxableIncome: usd(98_000),
    stateTaxRate: 0.0575,
    horizonYears: 10,
    discountRate: 0.06,
    reinvestmentReturnRate: 0.05,
  },
  market: {
    asOfYear: 2026,
    taxTableYear: 2026,
    inflationRate: 0.025,
    armIndexRate: 0.041,
    armIndexAnnualChange: 0.0025,
  },
  properties: [
    property({
      id: "elm-avenue",
      name: "Elm Avenue House",
      location: "Raleigh, NC",
      purchaseYear: 2015,
      purchaseMonth: 6,
      purchasePrice: usd(340_000),
      landValuePct: 0.22,
      closingCosts: usd(6_800),
      improvements: [
        // Kitchen remodel funded by HELOC draws; the improvement lands in the same year a sale can occur.
        {
          id: "kitchen",
          description: "Kitchen and bath remodel",
          year: 2029,
          month: 4,
          amount: usd(64_000),
          valueAdded: usd(48_000),
        },
      ],
      currentValue: usd(545_000),
      appreciationRate: 0.035,
      annualRent: usd(36_600),
      rentGrowthRate: 0.03,
      vacancyRate: 0.05,
      operating: { kind: "percentOfRent", rate: 0.2 },
      propertyTax: usd(3_900),
      insurance: usd(2_150),
      loans: [
        {
          type: "fixed",
          id: "elm-1",
          label: "30-year fixed",
          startYear: 2015,
          startMonth: 6,
          principal: usd(272_000),
          rate: 0.041,
          termYears: 30,
        },
        {
          type: "heloc",
          id: "elm-heloc",
          label: "HELOC for remodel",
          startYear: 2025,
          startMonth: 3,
          creditLimit: usd(120_000),
          rate: 0.0825,
          drawPeriodYears: 10,
          repaymentYears: 15,
          initialDraw: usd(10_000),
          draws: [
            { year: 2028, month: 11, amount: usd(30_000) },
            { year: 2029, month: 3, amount: usd(34_000) },
          ],
        },
      ],
    }),
    property({
      id: "cedar-condo",
      name: "Cedar Park Condo",
      location: "Durham, NC",
      purchaseYear: 2020,
      purchaseMonth: 9,
      purchasePrice: usd(255_000),
      landValuePct: 0.1,
      closingCosts: usd(5_100),
      currentValue: usd(318_000),
      appreciationRate: 0.03,
      annualRent: usd(23_400),
      rentGrowthRate: 0.03,
      vacancyRate: 0.06,
      operating: { kind: "fixed", annual: usd(7_900) },
      propertyTax: usd(2_300),
      insurance: usd(1_050),
      // 7/1 ARM: fixed at 3.5% until 2027, then resets. Index plus margin exceeds the 2% cap.
      loans: [
        {
          type: "arm",
          id: "cedar-1",
          label: "7/1 ARM",
          startYear: 2020,
          startMonth: 9,
          principal: usd(204_000),
          initialRate: 0.035,
          fixedYears: 7,
          termYears: 30,
          adjustmentCap: 0.02,
          lifetimeCap: 0.05,
          margin: 0.0275,
        },
      ],
    }),
    property({
      id: "birch-duplex",
      name: "Birch Lane Duplex",
      location: "Greensboro, NC",
      purchaseYear: 2022,
      purchaseMonth: 10,
      purchasePrice: usd(480_000),
      landValuePct: 0.18,
      closingCosts: usd(11_500),
      currentValue: usd(505_000),
      appreciationRate: 0.03,
      annualRent: usd(39_600),
      rentGrowthRate: 0.035,
      vacancyRate: 0.07,
      operating: { kind: "percentOfRent", rate: 0.3 },
      propertyTax: usd(5_200),
      insurance: usd(2_900),
      // High rate and thin rent: debt service exceeds NOI for the first few years.
      loans: [
        {
          type: "fixed",
          id: "birch-1",
          label: "30-year fixed",
          startYear: 2022,
          startMonth: 10,
          principal: usd(384_000),
          rate: 0.069,
          termYears: 30,
        },
      ],
    }),
  ],
};

export const ACCIDENTAL_PORTFOLIO_SCENARIO = scenarioFor(
  2029,
  ["elm-avenue"],
  defaultReplacement("Brightwater Fourplex", {
    priceMultiple: 1.2,
    grossRentYield: 0.081,
    loanRate: 0.0615,
  }),
);
