import { describe, expect, it } from "vitest";
import { usd } from "../money";
import { buildStrategies, simulateScenario, simulateStrategy } from "../simulate";
import type { Household, Property } from "../types";
import { PRESETS } from "@/data/presets";
import { fixedLoan, simpleHousehold, simpleProperty, simpleScenario } from "./fixtures";

function run(h: Household, sellYear = 2030, ids = ["p1"]) {
  return simulateScenario(h, buildStrategies(simpleScenario({ sellYear, sellPropertyIds: ids })));
}

describe("hold simulation basics", () => {
  const h = simpleHousehold();
  const hold = simulateStrategy(h, { kind: "hold" });

  it("produces an opening row plus one row per horizon year", () => {
    expect(hold.years).toHaveLength(11);
    expect(hold.years[0]?.year).toBe(2026);
    expect(hold.years[10]?.year).toBe(2036);
  });

  it("computes first-year NOI by hand: 36,000 rent, 5% vacancy, 30% opex, tax and insurance", () => {
    // EGI 34,200 - opex 10,260 - tax 4,500 - insurance 1,800 = 17,640
    expect(hold.years[1]?.noi).toBe(usd(17_640));
    expect(hold.years[1]?.effectiveGrossIncome).toBe(usd(34_200));
  });

  it("grows value at the appreciation rate and rent at the growth rate", () => {
    expect(hold.years[1]?.propertyValue).toBe(usd(450_000 * 1.03));
    // Year-2 rent = 36,000 x 1.03
    expect(hold.years[2]?.effectiveGrossIncome).toBe(usd(36_000 * 1.03 * 0.95));
  });

  it("depreciates in line with the schedule and reduces taxable rental income", () => {
    const y = hold.years[1];
    expect(y?.depreciation).toBeGreaterThan(usd(8_800));
    expect(y?.taxableRentalIncome).toBe(
      (y?.noi ?? 0) - (y?.interestPaid ?? 0) - (y?.depreciation ?? 0),
    );
  });

  it("is a pure function: the same inputs give byte-identical outputs", () => {
    const again = simulateStrategy(simpleHousehold(), { kind: "hold" });
    expect(JSON.stringify(again)).toBe(JSON.stringify(hold));
  });
});

describe("cash account and net worth accounting", () => {
  it("reconciles the cash account every year in every strategy", () => {
    for (const preset of PRESETS) {
      const results = simulateScenario(preset.household, buildStrategies(preset.scenario));
      for (const r of [results.hold, results.sell, results.exchange]) {
        for (const y of r.years.slice(1)) {
          const expected =
            y.cashOpening +
            y.investmentReturn +
            y.cashFlowBeforeTax -
            y.capex +
            y.helocDraws -
            y.taxesPaid +
            y.saleNetProceeds +
            y.exchangeCashFlow;
          expect(y.cashClosing).toBe(expected);
          expect(y.cashBalance).toBe(y.cashClosing);
          expect(y.netWorthAfterTax).toBe(y.equity + y.cashBalance + y.intermediaryFunds);
          expect(y.netWorthLiquidated).toBe(
            y.netWorthAfterTax - y.liquidationSellingCosts - y.deferredTaxLiability,
          );
        }
      }
    }
  });

  it("earns the reinvestment rate on the cash balance", () => {
    const hold = simulateStrategy(simpleHousehold(), { kind: "hold" });
    const y2 = hold.years[2];
    expect(y2?.investmentReturn).toBe(Math.round((hold.years[1]?.cashBalance ?? 0) * 0.04));
  });
});

describe("selling", () => {
  it("settles net proceeds = price - selling costs - loan payoff - taxes", () => {
    const h = simpleHousehold([
      simpleProperty({ loans: [fixedLoan({ startYear: 2024, principal: usd(250_000) })] }),
    ]);
    const r = run(h).sell;
    const sale = r.sale;
    expect(sale).not.toBeNull();
    if (!sale) return;
    expect(sale.netProceedsBeforeTax).toBe(
      sale.totalSalePrice - sale.totalSellingCosts - sale.totalLoanPayoff,
    );
    expect(sale.netProceedsAfterTax).toBe(sale.netProceedsBeforeTax - sale.tax.total);
    // The cash account received exactly the pre-tax proceeds in the sale year.
    const y = r.years.find((row) => row.year === 2030);
    expect(y?.saleNetProceeds).toBe(sale.netProceedsBeforeTax);
    expect(y?.taxOnSale).toBe(sale.tax.total);
  });

  it("stops operating income after the sale and reinvests the proceeds", () => {
    const r = run(simpleHousehold()).sell;
    const after = r.years.find((row) => row.year === 2031);
    expect(after?.noi).toBe(0);
    expect(after?.propertyValue).toBe(0);
    expect(after?.investmentReturn).toBeGreaterThan(0);
  });

  it("reports depreciation recapture first-class in the sale summary", () => {
    const sale = run(simpleHousehold()).sell.sale;
    expect(sale?.classification.unrecaptured1250Gain).toBeGreaterThan(0);
    expect(sale?.tax.depreciationRecaptureTax).toBeGreaterThan(0);
    expect(sale?.tax.depreciationRecaptureTax).toBeLessThanOrEqual(
      Math.round((sale?.classification.unrecaptured1250Gain ?? 0) * 0.25) + 1,
    );
  });

  it("sells at a loss: ordinary 1231 loss lowers tax and nothing is recaptured", () => {
    const h = simpleHousehold([
      simpleProperty({
        purchaseYear: 2024,
        purchasePrice: usd(900_000),
        currentValue: usd(600_000),
        appreciationRate: 0,
        closingCosts: usd(10_000),
      }),
    ]);
    const sale = run(h, 2028).sell.sale;
    expect(sale?.totalGain).toBeLessThan(0);
    expect(sale?.classification.ordinaryLoss1231).toBeGreaterThan(0);
    expect(sale?.tax.depreciationRecaptureTax).toBe(0);
    expect(sale?.tax.total).toBeLessThan(0);
  });

  it("handles a zero-gain sale with no tax on the sale itself", () => {
    // All land (no depreciation), no appreciation, no selling costs: amount realised equals basis.
    const h = simpleHousehold([
      simpleProperty({
        purchasePrice: usd(450_000),
        closingCosts: 0,
        landValuePct: 1,
        currentValue: usd(450_000),
        appreciationRate: 0,
        sellingCostRate: 0,
      }),
    ]);
    const sale = run(h).sell.sale;
    expect(sale?.totalGain).toBe(0);
    expect(sale?.tax.total).toBe(0);
    expect(sale?.classification.ordinaryLoss1231).toBe(0);
  });

  it("handles a capital improvement in the same year as the sale", () => {
    const withImprovement = simpleHousehold([
      simpleProperty({
        improvements: [
          {
            id: "k",
            description: "Kitchen",
            year: 2030,
            month: 6,
            amount: usd(55_000),
            valueAdded: usd(40_000),
          },
        ],
      }),
    ]);
    const r = run(withImprovement).sell;
    const base = run(simpleHousehold()).sell;
    const sale = r.sale?.properties[0];
    const baseSale = base.sale?.properties[0];
    if (!sale || !baseSale) throw new Error("missing sale");
    // Improvement is cash out in the sale year and joins the basis.
    expect(r.years.find((y) => y.year === 2030)?.capex).toBe(usd(55_000));
    expect(sale.adjustedBasis - baseSale.adjustedBasis).toBe(usd(55_000) - 100_000);
    // Value-add raises the price by 40,000.
    expect(sale.salePrice - baseSale.salePrice).toBe(usd(40_000));
  });

  it("clamps an out-of-range sale year and says so", () => {
    const r = simulateStrategy(simpleHousehold(), {
      kind: "sell",
      sellYear: 2100,
      propertyIds: ["p1"],
    });
    expect(r.warnings.some((w) => w.includes("outside the allowed range"))).toBe(true);
    expect(r.sale?.year).toBe(2036);
  });
});

describe("negative cash flow", () => {
  const leveraged: Property = simpleProperty({
    purchaseYear: 2025,
    purchasePrice: usd(450_000),
    currentValue: usd(450_000),
    annualRent: usd(30_000),
    loans: [fixedLoan({ startYear: 2025, principal: usd(405_000), rate: 0.075 })],
  });

  it("carries negative pre-tax cash flow, a negative cash balance, and charges it the opportunity cost", () => {
    const hold = simulateStrategy(simpleHousehold([leveraged]), { kind: "hold" });
    const y1 = hold.years[1];
    expect(y1?.cashFlowBeforeTax).toBeLessThan(0);
    expect(y1?.cashBalance).toBeLessThan(0);
    expect(hold.years[2]?.investmentReturn).toBeLessThan(0);
  });

  it("shows the tax shelter from the rental loss in the after-tax cash flow", () => {
    const y1 = simulateStrategy(simpleHousehold([leveraged]), { kind: "hold" }).years[1];
    expect(y1?.taxableRentalIncome).toBeLessThan(0);
    expect(y1?.taxOnOperations).toBeLessThan(0);
    expect((y1?.cashFlowAfterTax ?? 0) > (y1?.cashFlowBeforeTax ?? 0)).toBe(true);
  });
});

describe("step-up in basis at death", () => {
  it("removes deferred taxes but keeps selling costs", () => {
    const hold = simulateStrategy(simpleHousehold(), { kind: "hold" });
    const last = hold.years[hold.years.length - 1];
    expect(last?.deferredTaxLiability).toBeGreaterThan(0);
    expect(last?.netWorthLiquidatedWithStepUp).toBe(
      (last?.netWorthAfterTax ?? 0) - (last?.liquidationSellingCosts ?? 0),
    );
    expect((last?.netWorthLiquidatedWithStepUp ?? 0) > (last?.netWorthLiquidated ?? 0)).toBe(true);
  });
});

describe("1031 exchange simulation", () => {
  const h = simpleHousehold([
    simpleProperty({ loans: [fixedLoan({ startYear: 2024, principal: usd(250_000) })] }),
  ]);

  it("defers the whole sale gain: no tax on the sale in the exchange lane", () => {
    const { sell, exchange } = run(h);
    expect(exchange.exchange?.completed).toBe(true);
    expect(exchange.exchange?.boot.recognizedGain).toBe(0);
    expect(exchange.years.find((y) => y.year === 2030)?.taxOnSale).toBe(0);
    expect(exchange.years.find((y) => y.year === 2031)?.taxOnSale).toBe(0);
    expect(exchange.exchange?.boot.realizedGain).toBe(sell.sale?.totalGain);
  });

  it("parks proceeds with the intermediary during the gap and then buys the replacement", () => {
    const { exchange } = run(h);
    expect(exchange.years.find((y) => y.year === 2030)?.intermediaryFunds).toBeGreaterThan(0);
    expect(exchange.years.find((y) => y.year === 2031)?.intermediaryFunds).toBe(0);
    expect(exchange.properties.find((p) => p.origin === "replacement")).toBeDefined();
  });

  it("keeps the deferred gain on the books: deferred tax liability is not lost during or after the exchange", () => {
    const { exchange } = run(h);
    // At the sale-year end the deferred tax equals the tax that selling would have triggered.
    const gap = exchange.years.find((y) => y.year === 2030);
    expect(gap?.deferredTaxLiability).toBeGreaterThan(0);
    const after = exchange.years.find((y) => y.year === 2031);
    expect(after?.deferredTaxLiability).toBeGreaterThan(0);
  });

  it("falls back to a fully taxable sale when the 180-day window is missed", () => {
    const missed = simulateScenario(h, buildStrategies(simpleScenario({ closingDays: 200 })));
    expect(missed.exchange.exchange?.completed).toBe(false);
    expect(missed.exchange.warnings.join(" ")).toMatch(/window was missed/);
    expect(missed.exchange.years.find((y) => y.year === 2030)?.taxOnSale).toBe(
      missed.sell.years.find((y) => y.year === 2030)?.taxOnSale,
    );
    expect(missed.exchange.horizon.netWorthLiquidated).toBe(missed.sell.horizon.netWorthLiquidated);
  });

  it("recognises boot in the year the replacement closes when cash is taken out", () => {
    const withBoot = simulateScenario(
      h,
      buildStrategies(simpleScenario({ cashOutAtClosing: usd(60_000) })),
    ).exchange;
    expect(withBoot.exchange?.boot.cashBoot).toBe(usd(60_000));
    expect(withBoot.exchange?.boot.recognizedGain).toBe(usd(60_000));
    expect(withBoot.years.find((y) => y.year === 2031)?.taxOnSale).toBeGreaterThan(0);
    expect(withBoot.years.find((y) => y.year === 2030)?.taxOnSale).toBe(0);
  });

  it("carries recapture history so that a later sale of the replacement is still taxed", () => {
    const { exchange } = run(h);
    const replacement = exchange.properties.find((p) => p.origin === "replacement");
    const last = replacement?.rows[replacement.rows.length - 1];
    expect(last?.recaptureExposure).toBeGreaterThan(0);
    expect(exchange.exchange?.carriedDepreciation).toBeGreaterThan(0);
  });
});

describe("preset edge cases", () => {
  const retiring = PRESETS[0];
  const accidental = PRESETS[1];
  const builder = PRESETS[2];
  if (!retiring || !accidental || !builder) throw new Error("missing presets");

  it("retiring landlord: a property with four paid-off liens carries no debt service", () => {
    const hold = simulateStrategy(retiring.household, { kind: "hold" });
    const maple = hold.properties.find((p) => p.id === "maple-court");
    expect(maple?.loanSchedules).toHaveLength(4);
    expect(maple?.rows.every((r) => r.loanBalance === 0 && r.debtService === 0)).toBe(true);
  });

  it("retiring landlord: interest-only loan flips to amortising when the IO period ends", () => {
    const hold = simulateStrategy(retiring.household, { kind: "hold" });
    const river = hold.properties.find((p) => p.id === "riverside-triplex");
    const y2026 = river?.rows.find((r) => r.year === 2026);
    const y2027 = river?.rows.find((r) => r.year === 2027);
    const y2028 = river?.rows.find((r) => r.year === 2028);
    expect(y2026?.loanBalance).toBe(usd(400_000));
    expect(y2026?.principalPaid).toBe(0); // still interest-only
    // Started June 2017 with a 10-year IO period: 2027 is the transition year (5 IO months, then amortising).
    expect(y2027?.principalPaid).toBeGreaterThan(0);
    expect(y2028?.principalPaid).toBeGreaterThan(y2027?.principalPaid ?? 0);
    expect((y2028?.loanBalance ?? 0) < (y2027?.loanBalance ?? 0)).toBe(true);
  });

  it("retiring landlord: the condo sells below its purchase price yet still triggers recapture", () => {
    const r = simulateStrategy(retiring.household, {
      kind: "sell",
      sellYear: 2028,
      propertyIds: ["harbor-condo"],
    });
    const condo = r.sale?.properties[0];
    expect(condo?.salePrice).toBeLessThan(usd(390_000));
    expect(condo?.totalGain).toBeGreaterThan(0);
    expect(r.sale?.classification.unrecaptured1250Gain).toBeGreaterThan(0);
  });

  it("accidental portfolio: the ARM hits its periodic cap at the first reset", () => {
    const hold = simulateStrategy(accidental.household, { kind: "hold" });
    const condo = hold.properties.find((p) => p.id === "cedar-condo");
    const schedule = condo?.loanSchedules[0];
    const reset = schedule?.rows.find((r) => r.year === 2027);
    expect(reset?.capHit).toBe("periodic");
    expect(reset?.endRate).toBeCloseTo(0.055, 10);
  });

  it("accidental portfolio: HELOC draws raise debt and are cash inflows", () => {
    const hold = simulateStrategy(accidental.household, { kind: "hold" });
    expect(hold.years.find((y) => y.year === 2028)?.helocDraws).toBe(usd(30_000));
    expect(hold.years.find((y) => y.year === 2029)?.helocDraws).toBe(usd(34_000));
  });

  it("accidental portfolio: runs negative pre-tax cash flow in early years", () => {
    const hold = simulateStrategy(accidental.household, { kind: "hold" });
    expect(hold.years.slice(1, 4).some((y) => y.cashFlowBeforeTax < 0)).toBe(true);
  });

  it("accidental portfolio: the default sale lands in the same year as the remodel", () => {
    expect(accidental.scenario.sellYear).toBe(2029);
    const r = simulateStrategy(accidental.household, {
      kind: "sell",
      sellYear: 2029,
      propertyIds: ["elm-avenue"],
    });
    expect(r.years.find((y) => y.year === 2029)?.capex).toBe(usd(64_000));
    expect(r.sale?.properties[0]?.adjustedBasis).toBeGreaterThan(usd(64_000));
  });

  it("leveraged builder: selling the newest studio realises a loss", () => {
    const r = simulateStrategy(builder.household, {
      kind: "sell",
      sellYear: 2027,
      propertyIds: ["sunset-studios"],
    });
    expect(r.sale?.totalGain).toBeLessThan(0);
    expect(r.sale?.classification.ordinaryLoss1231).toBeGreaterThan(0);
  });

  it("leveraged builder: NIIT applies to a large sale", () => {
    const r = simulateStrategy(
      builder.household,
      builder.scenario.sellPropertyIds.length > 0
        ? {
            kind: "sell",
            sellYear: builder.scenario.sellYear,
            propertyIds: builder.scenario.sellPropertyIds,
          }
        : { kind: "hold" },
    );
    expect(r.sale?.tax.netInvestmentIncomeTax).toBeGreaterThan(0);
  });
});
