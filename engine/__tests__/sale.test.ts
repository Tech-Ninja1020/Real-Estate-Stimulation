import { describe, expect, it } from "vitest";
import { usd } from "../money";
import { buildTranchesForProperty, midMonthIndex, allocatePurchaseBasis } from "../depreciation";
import {
  adjustedBasisAt,
  classifyGains,
  classifyNetGain,
  computeSaleGain,
  computeUnrecapturedSection1250Gain,
  depreciationTakenAt,
} from "../sale";
import type { TaxLot } from "../sale";
import { simpleProperty } from "./fixtures";

function lotFor(overrides = {}): TaxLot {
  const p = simpleProperty(overrides);
  return {
    landBasis: allocatePurchaseBasis(p).land,
    tranches: buildTranchesForProperty(p),
    carriedDepreciation: 0,
  };
}

const AT = midMonthIndex(2030, 12);

describe("adjusted basis", () => {
  it("equals purchase price + closing costs + improvements - depreciation", () => {
    const lot = lotFor({
      improvements: [{ id: "r", description: "Roof", year: 2020, month: 6, amount: usd(30_000) }],
    });
    const dep = depreciationTakenAt(lot, AT);
    expect(adjustedBasisAt(lot, AT)).toBe(usd(300_000) + usd(6_000) + usd(30_000) - dep);
  });

  it("does not yet include an improvement placed in service after the sale date", () => {
    const lot = lotFor({
      improvements: [{ id: "r", description: "Roof", year: 2035, month: 6, amount: usd(30_000) }],
    });
    expect(adjustedBasisAt(lot, AT)).toBe(usd(306_000) - depreciationTakenAt(lot, AT));
  });
});

describe("sale gain", () => {
  it("computes amount realised and total gain from price, costs and basis", () => {
    const lot = lotFor();
    const sale = computeSaleGain({
      propertyId: "p1",
      propertyName: "Test",
      salePrice: usd(600_000),
      sellingCostRate: 0.06,
      loanPayoff: usd(100_000),
      lot,
      at: AT,
    });
    expect(sale.sellingCosts).toBe(usd(36_000));
    expect(sale.amountRealized).toBe(usd(564_000));
    expect(sale.totalGain).toBe(sale.amountRealized - sale.adjustedBasis);
    expect(sale.netProceedsBeforeTax).toBe(usd(464_000));
  });

  it("splits gain into unrecaptured 1250 gain up to depreciation taken and long-term gain beyond", () => {
    const lot = lotFor();
    const sale = computeSaleGain({
      propertyId: "p1",
      propertyName: "Test",
      salePrice: usd(600_000),
      sellingCostRate: 0.06,
      loanPayoff: 0,
      lot,
      at: AT,
    });
    const c = classifyGains([sale]);
    expect(c.unrecaptured1250Gain).toBe(sale.accumulatedDepreciation);
    expect(c.longTermCapitalGain).toBe(sale.totalGain - sale.accumulatedDepreciation);
    expect(c.unrecaptured1250Gain + c.longTermCapitalGain).toBe(c.netGain);
  });

  it("limits recapture to the gain when the gain is smaller than depreciation taken", () => {
    expect(computeUnrecapturedSection1250Gain(usd(20_000), usd(90_000))).toBe(usd(20_000));
    expect(computeUnrecapturedSection1250Gain(usd(120_000), usd(90_000))).toBe(usd(90_000));
  });

  it("treats a sale below adjusted basis as an ordinary 1231 loss with no recapture", () => {
    const lot = lotFor();
    const sale = computeSaleGain({
      propertyId: "p1",
      propertyName: "Test",
      // Depreciation has cut the adjusted basis to about $176k, so only a sale below that is a loss.
      salePrice: usd(100_000),
      sellingCostRate: 0.06,
      loanPayoff: 0,
      lot,
      at: AT,
    });
    expect(sale.totalGain).toBeLessThan(0);
    const c = classifyGains([sale]);
    expect(c.ordinaryLoss1231).toBe(-sale.totalGain);
    expect(c.unrecaptured1250Gain).toBe(0);
    expect(c.longTermCapitalGain).toBe(0);
  });

  it("handles a zero-gain sale: no recapture, no capital gain, no loss", () => {
    const c = classifyNetGain(0, usd(50_000));
    expect(c).toEqual({
      netGain: 0,
      unrecaptured1250Gain: 0,
      longTermCapitalGain: 0,
      ordinaryLoss1231: 0,
    });
  });

  it("nets a loss on one property against a gain on another in the same year", () => {
    const winner = {
      ...salePlaceholder(),
      totalGain: usd(100_000),
      accumulatedDepreciation: usd(80_000),
    };
    const loser = {
      ...salePlaceholder(),
      propertyId: "p2",
      totalGain: -usd(30_000),
      accumulatedDepreciation: usd(40_000),
    };
    const c = classifyGains([winner, loser]);
    expect(c.netGain).toBe(usd(70_000));
    expect(c.unrecaptured1250Gain).toBe(usd(70_000)); // capacity 80k, limited to the 70k net gain
    expect(c.longTermCapitalGain).toBe(0);
  });

  it("includes a capital improvement made in the sale year in the basis", () => {
    const base = lotFor();
    const withImprovement = lotFor({
      improvements: [
        { id: "k", description: "Kitchen", year: 2030, month: 6, amount: usd(55_000) },
      ],
    });
    const baseBasis = adjustedBasisAt(base, AT);
    const newBasis = adjustedBasisAt(withImprovement, AT);
    // +$55,000 of basis less 12 half-months of depreciation ($1,000.00) on the new tranche.
    expect(newBasis - baseBasis).toBe(usd(55_000) - 100_000);
  });
});

function salePlaceholder() {
  return {
    propertyId: "p1",
    propertyName: "x",
    salePrice: 0,
    sellingCosts: 0,
    amountRealized: 0,
    adjustedBasis: 0,
    accumulatedDepreciation: 0,
    totalGain: 0,
    loanPayoff: 0,
    netProceedsBeforeTax: 0,
  };
}
