import { describe, expect, it } from "vitest";
import { getTaxTable } from "@/data/tax";
import { usd } from "../money";
import {
  bracketTax,
  computeFederalTax,
  computeNetInvestmentIncomeTax,
  computePortfolioTax,
  createTaxContext,
  incrementalTaxOfGains,
  indexTaxTable,
  marginalRate,
  taxOnSegment,
} from "../tax";
import { simpleHousehold } from "./fixtures";

const table = getTaxTable(2026);
const single = table.ordinaryBrackets.single;

describe("ordinary brackets", () => {
  it("taxes $100,000 of single taxable income progressively ($16,712)", () => {
    expect(bracketTax(single, usd(100_000))).toBe(usd(16_712));
  });

  it("charges nothing on zero income and reports the marginal rate", () => {
    expect(bracketTax(single, 0)).toBe(0);
    expect(marginalRate(single, usd(60_000))).toBe(0.22);
    expect(marginalRate(single, usd(700_000))).toBe(0.37);
  });

  it("caps each bracket at 25% for unrecaptured Section 1250 gain", () => {
    // 1,240 + 4,560 + 12,166 + 23,058 + 25% of (1,000,000 - 201,775)
    expect(taxOnSegment(single, 0, usd(1_000_000), 0.25)).toBe(usd(240_580.25));
  });

  it("uses lower ordinary rates for recapture that sits in lower brackets", () => {
    expect(taxOnSegment(single, 0, usd(40_000), 0.25)).toBe(bracketTax(single, usd(40_000)));
  });
});

describe("federal tax with gains", () => {
  it("applies the standard deduction to ordinary income first", () => {
    const r = computeFederalTax(table, "single", {
      ordinaryIncome: usd(16_100),
      unrecaptured1250Gain: 0,
      longTermCapitalGain: 0,
    });
    expect(r.taxableOrdinary).toBe(0);
    expect(r.total).toBe(0);
  });

  it("stacks long-term gain on top of ordinary income across the 0/15/20 thresholds", () => {
    // Taxable ordinary 40,000 (income 56,100); 9,450 of gain at 0% then 90,550 at 15% = 13,582.50
    const r = computeFederalTax(table, "single", {
      ordinaryIncome: usd(56_100),
      unrecaptured1250Gain: 0,
      longTermCapitalGain: usd(100_000),
    });
    expect(r.taxOnLongTermGain).toBe(usd(13_582.5));
  });

  it("taxes gain above the 15% breakpoint at 20%", () => {
    const r = computeFederalTax(table, "single", {
      ordinaryIncome: usd(600_000),
      unrecaptured1250Gain: 0,
      longTermCapitalGain: usd(100_000),
    });
    expect(r.taxOnLongTermGain).toBe(usd(20_000));
  });

  it("stacks unrecaptured 1250 gain beneath long-term gain", () => {
    const r = computeFederalTax(table, "single", {
      ordinaryIncome: usd(116_100), // 100,000 taxable
      unrecaptured1250Gain: usd(50_000),
      longTermCapitalGain: usd(50_000),
    });
    // Recapture slice 100,000-150,000: 22% to 105,700, 24% to 150,000 -> 1,254 + 10,632 = 11,886... capped at 25% (not binding)
    expect(r.taxOnUnrecaptured1250).toBe(usd(11_886));
    // LTCG begins at 150,000 taxable income, which is above the 0% breakpoint, so 15%.
    expect(r.taxOnLongTermGain).toBe(usd(7_500));
  });

  it("lets a standard-deduction shortfall shelter recapture before long-term gain", () => {
    const r = computeFederalTax(table, "single", {
      ordinaryIncome: 0,
      unrecaptured1250Gain: usd(10_000),
      longTermCapitalGain: usd(20_000),
    });
    // 16,100 deduction wipes the 10,000 of recapture and 6,100 of the long-term gain.
    expect(r.unrecaptured1250).toBe(0);
    expect(r.longTermGain).toBe(usd(13_900));
  });
});

describe("net investment income tax", () => {
  it("is 3.8% of the lesser of NII and MAGI above the threshold", () => {
    expect(computeNetInvestmentIncomeTax(table, "single", usd(300_000), usd(400_000))).toBe(
      usd(7_600),
    );
    expect(computeNetInvestmentIncomeTax(table, "single", usd(50_000), usd(400_000))).toBe(
      usd(1_900),
    );
    expect(computeNetInvestmentIncomeTax(table, "single", usd(300_000), usd(150_000))).toBe(0);
  });

  it("uses higher thresholds for joint filers and never indexes them", () => {
    expect(computeNetInvestmentIncomeTax(table, "mfj", usd(100_000), usd(300_000))).toBe(
      usd(1_900),
    );
    const future = indexTaxTable(table, 20, 0.03);
    expect(future.niit.magiThreshold.single).toBe(usd(200_000));
    expect(future.ordinaryBrackets.single[0]?.upTo).toBeGreaterThan(
      table.ordinaryBrackets.single[0]?.upTo ?? 0,
    );
  });
});

describe("indexation", () => {
  it("is a no-op for the table year and scales thresholds afterwards", () => {
    expect(indexTaxTable(table, 0, 0.03)).toBe(table);
    const later = indexTaxTable(table, 10, 0.03);
    const ratio = later.standardDeduction.single / table.standardDeduction.single;
    expect(ratio).toBeGreaterThan(1.33);
    expect(ratio).toBeLessThan(1.35);
  });
});

describe("incremental portfolio tax", () => {
  const h = simpleHousehold();
  const ctx = createTaxContext(table, h.investor, h.market, 2030);

  it("layers telescope exactly to the total", () => {
    const r = computePortfolioTax(ctx, {
      netRentalIncome: usd(20_000),
      ordinaryLoss1231: 0,
      unrecaptured1250Gain: usd(150_000),
      longTermCapitalGain: usd(300_000),
    });
    const b = r.breakdown;
    expect(
      b.depreciationRecaptureTax +
        b.capitalGainsTax +
        b.netInvestmentIncomeTax +
        b.stateTax +
        b.ordinaryLossBenefit,
    ).toBe(b.total);
    expect(r.taxOnOperations + r.taxOnSale).toBe(r.total);
    expect(b.total).toBe(r.taxOnSale);
  });

  it("treats a net 1231 loss as an ordinary deduction that lowers tax", () => {
    const r = computePortfolioTax(ctx, {
      netRentalIncome: 0,
      ordinaryLoss1231: usd(40_000),
      unrecaptured1250Gain: 0,
      longTermCapitalGain: 0,
    });
    expect(r.taxOnSale).toBeLessThan(0);
    expect(r.breakdown.ordinaryLossBenefit).toBe(r.taxOnSale);
  });

  it("measures hypothetical gains incrementally on top of existing income", () => {
    const inc = incrementalTaxOfGains(
      ctx,
      { netRentalIncome: 0, ordinaryLoss1231: 0, unrecaptured1250Gain: 0, longTermCapitalGain: 0 },
      {
        ordinaryLoss1231: 0,
        unrecaptured1250Gain: usd(100_000),
        longTermCapitalGain: usd(100_000),
      },
    );
    const direct = computePortfolioTax(ctx, {
      netRentalIncome: 0,
      ordinaryLoss1231: 0,
      unrecaptured1250Gain: usd(100_000),
      longTermCapitalGain: usd(100_000),
    });
    expect(inc.total).toBe(direct.taxOnSale);
  });
});
