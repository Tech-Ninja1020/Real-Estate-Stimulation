import { describe, expect, it } from "vitest";
import { usd } from "../money";
import { allocatePurchaseBasis, buildTranchesForProperty, midMonthIndex } from "../depreciation";
import {
  EXCHANGE_WINDOW_DAYS,
  IDENTIFICATION_WINDOW_DAYS,
  applyBootRules,
  buildExchangeCalendar,
  buildReplacementLot,
} from "../exchange";
import { adjustedBasisAt, computeSaleGain, depreciationTakenAt } from "../sale";
import type { TaxLot } from "../sale";
import { simpleProperty } from "./fixtures";

/** Relinquished property: sold for 1,000,000 with 400,000 of debt, adjusted basis 300,000, 200,000 depreciation. */
function relinquished(overrides: Partial<ReturnType<typeof salePieces>> = {}) {
  return { ...salePieces(), ...overrides };
}
function salePieces() {
  const price = usd(1_000_000);
  const costs = usd(60_000);
  const payoff = usd(400_000);
  const basis = usd(300_000);
  return {
    propertyId: "p1",
    propertyName: "Relinquished",
    salePrice: price,
    sellingCosts: costs,
    amountRealized: price - costs,
    adjustedBasis: basis,
    accumulatedDepreciation: usd(200_000),
    totalGain: price - costs - basis,
    loanPayoff: payoff,
    netProceedsBeforeTax: price - costs - payoff,
  };
}

describe("boot rules", () => {
  it("defers the entire gain when value, equity and debt are all replaced", () => {
    const boot = applyBootRules({
      relinquished: [relinquished()],
      replacementPrice: usd(1_000_000),
      replacementClosingCosts: usd(15_000),
      newDebt: usd(400_000),
      cashOutAtClosing: 0,
    });
    expect(boot.realizedGain).toBe(usd(640_000));
    expect(boot.cashBoot).toBe(0);
    expect(boot.mortgageBoot).toBe(0);
    expect(boot.recognizedGain).toBe(0);
    expect(boot.deferredGain).toBe(usd(640_000));
    expect(boot.additionalCashPaidIn).toBe(usd(75_000)); // price + costs - debt - exchange funds
    expect(boot.replacementBasis).toBe(usd(375_000));
  });

  it("taxes cash left over after buying a cheaper replacement as cash boot", () => {
    const boot = applyBootRules({
      relinquished: [relinquished()],
      replacementPrice: usd(800_000),
      replacementClosingCosts: 0,
      newDebt: usd(400_000),
      cashOutAtClosing: 0,
    });
    expect(boot.cashBoot).toBe(usd(140_000));
    expect(boot.recognizedGain).toBe(usd(140_000));
    expect(boot.deferredGain).toBe(usd(500_000));
    expect(boot.recognizedClassification.unrecaptured1250Gain).toBe(usd(140_000));
  });

  it("taxes net debt relief as mortgage boot, reduced by cash paid in", () => {
    const boot = applyBootRules({
      relinquished: [relinquished()],
      replacementPrice: usd(800_000),
      replacementClosingCosts: 0,
      newDebt: usd(100_000),
      cashOutAtClosing: 0,
    });
    // Needs 700,000 cash; exchange funds are 540,000, so 160,000 comes from the investor.
    expect(boot.additionalCashPaidIn).toBe(usd(160_000));
    expect(boot.mortgageBoot).toBe(usd(140_000)); // 400,000 relieved - 100,000 new debt - 160,000 cash
    expect(boot.cashBoot).toBe(0);
    expect(boot.recognizedGain).toBe(usd(140_000));
  });

  it("treats deliberately withdrawn cash as boot even when the replacement is more valuable", () => {
    const boot = applyBootRules({
      relinquished: [relinquished()],
      replacementPrice: usd(1_200_000),
      replacementClosingCosts: 0,
      newDebt: usd(660_000),
      cashOutAtClosing: usd(50_000),
    });
    expect(boot.cashBoot).toBe(usd(50_000));
    expect(boot.recognizedGain).toBe(usd(50_000));
  });

  it("never recognises more gain than was realised", () => {
    const small = relinquished({ totalGain: usd(10_000), adjustedBasis: usd(930_000) - 0 });
    const boot = applyBootRules({
      relinquished: [small],
      replacementPrice: usd(300_000),
      replacementClosingCosts: 0,
      newDebt: 0,
      cashOutAtClosing: 0,
    });
    expect(boot.totalBoot).toBeGreaterThan(boot.realizedGain);
    expect(boot.recognizedGain).toBe(usd(10_000));
  });

  it("does not recognise a loss and carries it into the replacement basis", () => {
    const loss = relinquished({ totalGain: -usd(50_000), adjustedBasis: usd(990_000) });
    const boot = applyBootRules({
      relinquished: [loss],
      replacementPrice: usd(1_000_000),
      replacementClosingCosts: 0,
      newDebt: usd(400_000),
      cashOutAtClosing: 0,
    });
    expect(boot.recognizedGain).toBe(0);
    expect(boot.deferredGain).toBe(-usd(50_000));
    expect(boot.replacementBasis).toBe(usd(1_050_000));
  });

  it("derives the replacement basis two ways that always agree", () => {
    const cases = [
      { price: 1_000_000, closing: 15_000, debt: 400_000, out: 0 },
      { price: 800_000, closing: 0, debt: 400_000, out: 0 },
      { price: 800_000, closing: 10_000, debt: 100_000, out: 20_000 },
      { price: 1_500_000, closing: 20_000, debt: 900_000, out: 100_000 },
    ];
    for (const c of cases) {
      const boot = applyBootRules({
        relinquished: [relinquished()],
        replacementPrice: usd(c.price),
        replacementClosingCosts: usd(c.closing),
        newDebt: usd(c.debt),
        cashOutAtClosing: usd(c.out),
      });
      expect(boot.replacementBasis).toBe(boot.replacementBasisCrossCheck);
      expect(boot.recognizedGain + boot.deferredGain).toBe(boot.realizedGain);
    }
  });
});

describe("45/180-day exchange windows", () => {
  it("places the deadlines relative to the December 31 closing", () => {
    const cal = buildExchangeCalendar(2028, 30, 120);
    expect(cal.timeline.relinquishedClosing).toBe("2028-12-31");
    expect(cal.timeline.identificationDeadline).toBe("2029-02-14");
    expect(cal.timeline.exchangeDeadline).toBe("2029-06-29");
    expect(cal.timeline.replacementClosing).toBe("2029-04-30");
    expect(cal.timeline.replacementFirstOwnedMonth).toBe("2029-05");
    expect(cal.valid).toBe(true);
    expect(IDENTIFICATION_WINDOW_DAYS).toBe(45);
    expect(EXCHANGE_WINDOW_DAYS).toBe(180);
  });

  it("accounts for leap years", () => {
    expect(buildExchangeCalendar(2027, 45, 180).timeline.identificationDeadline).toBe("2028-02-14");
    expect(buildExchangeCalendar(2027, 45, 180).timeline.exchangeDeadline).toBe("2028-06-28");
  });

  it("invalidates the exchange when identification or closing runs late", () => {
    expect(buildExchangeCalendar(2028, 46, 120).valid).toBe(false);
    expect(buildExchangeCalendar(2028, 30, 181).valid).toBe(false);
    expect(buildExchangeCalendar(2028, 45, 180).valid).toBe(true);
    expect(buildExchangeCalendar(2028, 60, 50).valid).toBe(false);
  });
});

describe("replacement property tax lot", () => {
  const p = simpleProperty();
  const lot: TaxLot = {
    landBasis: allocatePurchaseBasis(p).land,
    tranches: buildTranchesForProperty(p),
    carriedDepreciation: 0,
  };
  const at = midMonthIndex(2028, 12);
  const sale = computeSaleGain({
    propertyId: "p1",
    propertyName: "Test",
    salePrice: usd(700_000),
    sellingCostRate: 0.06,
    loanPayoff: 0,
    lot,
    at,
  });

  it("carries depreciation history and splits basis into carryover and new-money tranches", () => {
    const boot = applyBootRules({
      relinquished: [sale],
      replacementPrice: usd(900_000),
      replacementClosingCosts: usd(10_000),
      newDebt: 0,
      cashOutAtClosing: 0,
    });
    const replacement = buildReplacementLot({
      relinquished: [{ lot, at }],
      boot,
      replacementLandValuePct: 0.2,
      firstOwnedYear: 2029,
      firstOwnedMonth: 5,
    });
    const kinds = replacement.tranches.map((t) => t.kind);
    expect(kinds).toContain("carryover");
    expect(kinds).toContain("excess");
    // Total basis (land + tranches) equals the replacement basis to the cent.
    const total = replacement.landBasis + replacement.tranches.reduce((t, x) => t + x.basis, 0);
    expect(total).toBe(boot.replacementBasis);
    // Depreciation history carries over (nothing was recognised as boot).
    expect(replacement.carriedDepreciation).toBe(depreciationTakenAt(lot, at));
    // Carryover tranche keeps the remaining recovery period of the old building.
    const carry = replacement.tranches.find((t) => t.kind === "carryover");
    expect(carry?.lifeHalfMonths).toBeLessThan(660);
    // Adjusted basis at acquisition equals the replacement basis.
    expect(adjustedBasisAt(replacement, midMonthIndex(2029, 5))).toBe(boot.replacementBasis);
  });

  it("uses up carried recapture history when boot is recognised as recapture", () => {
    const boot = applyBootRules({
      relinquished: [sale],
      replacementPrice: usd(500_000),
      replacementClosingCosts: 0,
      newDebt: 0,
      cashOutAtClosing: 0,
    });
    expect(boot.recognizedGain).toBeGreaterThan(0);
    const replacement = buildReplacementLot({
      relinquished: [{ lot, at }],
      boot,
      replacementLandValuePct: 0.2,
      firstOwnedYear: 2029,
      firstOwnedMonth: 5,
    });
    expect(replacement.carriedDepreciation).toBe(
      Math.max(
        0,
        depreciationTakenAt(lot, at) - boot.recognizedClassification.unrecaptured1250Gain,
      ),
    );
  });
});
