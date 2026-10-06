import { describe, expect, it } from "vitest";
import { usd } from "../money";
import {
  accumulatedDepreciationAt,
  accumulatedDepreciationAtDisposition,
  allocatePurchaseBasis,
  buildDepreciationSchedule,
  buildTranchesForProperty,
  RESIDENTIAL_LIFE_HALF_MONTHS,
  yearEndIndex,
} from "../depreciation";
import { simpleProperty } from "./fixtures";

describe("residential depreciation (27.5 years, mid-month)", () => {
  const property = simpleProperty(); // basis 306,000; land 20% -> building 244,800
  const tranches = buildTranchesForProperty(property);

  it("excludes land and capitalises closing costs pro rata", () => {
    const alloc = allocatePurchaseBasis(property);
    expect(alloc.total).toBe(usd(306_000));
    expect(alloc.building).toBe(usd(244_800));
    expect(alloc.land).toBe(usd(61_200));
    expect(alloc.land + alloc.building).toBe(alloc.total);
  });

  it("gives 23 half-months (3.485%) in the first year for a January placed-in-service", () => {
    const first = buildDepreciationSchedule(tranches, 2016, 2016)[0];
    // 244,800 x 23 / 660 = 8,530.909... dollars
    expect(first?.depreciation).toBe(853_091);
    expect((first?.depreciation ?? 0) / usd(244_800)).toBeCloseTo(0.03485, 4);
  });

  it("gives only half a month for a December placed-in-service", () => {
    const dec = buildTranchesForProperty(simpleProperty({ purchaseYear: 2020, purchaseMonth: 12 }));
    const first = buildDepreciationSchedule(dec, 2020, 2020)[0];
    expect(first?.depreciation).toBe(Math.round((24_480_000 * 1) / 660));
  });

  it("depreciates a full year at 1/27.5 in the middle years", () => {
    const rows = buildDepreciationSchedule(tranches, 2016, 2030);
    const mid = rows.find((r) => r.year === 2020);
    expect(Math.abs((mid?.depreciation ?? 0) - Math.round(24_480_000 / 27.5))).toBeLessThanOrEqual(
      1,
    );
  });

  it("is fully depreciated after 27.5 years and sums exactly to the building basis", () => {
    const rows = buildDepreciationSchedule(tranches, 2016, 2050);
    const total = rows.reduce((t, r) => t + r.depreciation, 0);
    expect(total).toBe(usd(244_800));
    expect(rows[rows.length - 1]?.remainingDepreciableBasis).toBe(0);
    // Final partial year is the 28th: Jan 2016 + 27.5 years ends mid-July 2043.
    expect(rows.find((r) => r.year === 2044)?.depreciation).toBe(0);
    expect(rows.find((r) => r.year === 2043)?.depreciation).toBeGreaterThan(0);
  });

  it("depreciates each capital improvement as its own 27.5-year tranche", () => {
    const withImp = buildTranchesForProperty(
      simpleProperty({
        improvements: [
          { id: "roof", description: "Roof", year: 2020, month: 7, amount: usd(30_000) },
        ],
      }),
    );
    expect(withImp).toHaveLength(2);
    const roof = withImp[1];
    expect(roof?.basis).toBe(usd(30_000));
    expect(roof?.lifeHalfMonths).toBe(RESIDENTIAL_LIFE_HALF_MONTHS);
    // July placed in service -> (12 - 7) full months + half month = 11 half-months.
    if (!roof) throw new Error("missing roof tranche");
    expect(accumulatedDepreciationAt(roof, yearEndIndex(2020))).toBe(
      Math.round((3_000_000 * 11) / 660),
    );
  });

  it("applies the half-month convention in the month of disposition", () => {
    // Mid-January 2016 to mid-December 2020 is 4 years + 11 months = 118 half-months.
    const acc = accumulatedDepreciationAtDisposition(tranches, 2020, 12);
    const expected = Math.round((24_480_000 * (22 + 24 * 4)) / 660);
    expect(acc).toBe(expected);
  });

  it("accrues nothing for an improvement placed in service in the month of a December sale", () => {
    const t = buildTranchesForProperty(
      simpleProperty({
        improvements: [
          { id: "x", description: "Late repair", year: 2030, month: 12, amount: usd(10_000) },
        ],
      }),
    );
    const imp = t[1];
    if (!imp) throw new Error("missing tranche");
    expect(accumulatedDepreciationAt(imp, 24 * 2030 + 23)).toBe(0);
  });
});
