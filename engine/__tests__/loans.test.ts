import { describe, expect, it } from "vitest";
import { usd } from "../money";
import {
  armIndexForYear,
  buildLoanSchedule,
  levelPayment,
  loanBalanceAtYearEnd,
  resetArmRate,
} from "../loans";
import type { ArmLoan, HelocLoan, InterestOnlyLoan, MarketAssumptions } from "../types";
import { fixedLoan } from "./fixtures";

const market: MarketAssumptions = {
  asOfYear: 2026,
  taxTableYear: 2026,
  inflationRate: 0.025,
  armIndexRate: 0.04,
  armIndexAnnualChange: 0.01,
};

describe("fixed-rate loans", () => {
  it("matches the textbook payment for $200,000 at 6% over 30 years", () => {
    expect(levelPayment(usd(200_000), 0.06, 360)).toBe(119_910); // $1,199.10
  });

  it("amortises to exactly zero with principal summing to the original balance", () => {
    const s = buildLoanSchedule(fixedLoan(), market, 2046);
    const principal = s.rows.reduce((t, r) => t + r.principal, 0);
    const interest = s.rows.reduce((t, r) => t + r.interest, 0);
    expect(principal).toBe(usd(200_000));
    expect(loanBalanceAtYearEnd(s, 2045)).toBe(0);
    expect(s.rows.find((r) => r.year === 2046)?.phase).toBe("paidOff");
    expect(Math.abs(interest - usd(231_676))).toBeLessThan(usd(10));
  });

  it("handles a zero interest rate", () => {
    const s = buildLoanSchedule(
      fixedLoan({ rate: 0, principal: usd(120_000), termYears: 10 }),
      market,
      2030,
    );
    expect(s.rows[0]?.interest).toBe(0);
    expect(s.rows[0]?.principal).toBe(usd(12_000));
  });

  it("reports a zero balance for four loans that are all fully repaid", () => {
    const loans = [
      fixedLoan({ id: "a", startYear: 2001, termYears: 15 }),
      fixedLoan({ id: "b", startYear: 2005, termYears: 10 }),
      fixedLoan({ id: "c", startYear: 2014, termYears: 7 }),
      fixedLoan({ id: "d", startYear: 2020, termYears: 3 }),
    ];
    for (const loan of loans) {
      const s = buildLoanSchedule(loan, market, 2030);
      expect(loanBalanceAtYearEnd(s, 2026)).toBe(0);
      expect(s.rows.find((r) => r.year === 2026)?.payment).toBe(0);
    }
  });
});

describe("interest-only loans", () => {
  const io: InterestOnlyLoan = {
    type: "interestOnly",
    id: "io",
    label: "IO",
    startYear: 2020,
    startMonth: 1,
    principal: usd(500_000),
    rate: 0.05,
    ioYears: 5,
    termYears: 30,
  };

  it("pays interest only, with a flat balance, during the IO period", () => {
    const s = buildLoanSchedule(io, market, 2040);
    for (const y of [2020, 2021, 2024]) {
      const row = s.rows.find((r) => r.year === y);
      expect(row?.principal).toBe(0);
      expect(row?.closingBalance).toBe(usd(500_000));
      // 12 monthly payments of $2,083.33 (interest is rounded to the cent each month).
      expect(row?.interest).toBe(12 * 208_333);
      expect(row?.phase).toBe("interestOnly");
    }
  });

  it("transitions to amortising on schedule and steps the payment up", () => {
    const s = buildLoanSchedule(io, market, 2060);
    const lastIo = s.rows.find((r) => r.year === 2024);
    const firstAmort = s.rows.find((r) => r.year === 2025);
    expect(firstAmort?.phase).toBe("amortizing");
    expect(firstAmort?.principal).toBeGreaterThan(0);
    expect((firstAmort?.payment ?? 0) > (lastIo?.payment ?? 0)).toBe(true);
    // 25 years remain: level payment on $500k at 5% is about $2,922.95 a month.
    expect(Math.abs((firstAmort?.payment ?? 0) - 2_922.95 * 12 * 100)).toBeLessThan(2_000);
    expect(loanBalanceAtYearEnd(s, 2049)).toBe(0);
  });
});

describe("adjustable-rate loans", () => {
  const arm: ArmLoan = {
    type: "arm",
    id: "arm",
    label: "7/1 ARM",
    startYear: 2020,
    startMonth: 1,
    principal: usd(300_000),
    initialRate: 0.035,
    fixedYears: 7,
    termYears: 30,
    adjustmentCap: 0.02,
    lifetimeCap: 0.05,
    margin: 0.0275,
  };

  it("keeps the initial rate through the fixed period", () => {
    const s = buildLoanSchedule(arm, market, 2040);
    expect(s.rows.find((r) => r.year === 2026)?.endRate).toBe(0.035);
    expect(s.rows.find((r) => r.year === 2026)?.phase).toBe("armFixed");
  });

  it("clamps the first reset to the periodic adjustment cap", () => {
    // Index 4% + 1%/yr drift: 2027 index 5%, +2.75% margin = 7.75% fully indexed, capped at 5.5%.
    const s = buildLoanSchedule(arm, market, 2040);
    const reset = s.rows.find((r) => r.year === 2027);
    expect(reset?.endRate).toBeCloseTo(0.055, 10);
    expect(reset?.capHit).toBe("periodic");
    expect(reset?.phase).toBe("armAdjusting");
  });

  it("stops at the lifetime cap on later resets", () => {
    const s = buildLoanSchedule(arm, market, 2040);
    const rates = s.rows.filter((r) => r.year >= 2027 && r.year <= 2034).map((r) => r.endRate);
    expect(Math.max(...rates)).toBeCloseTo(0.085, 10); // initial 3.5% + 5% lifetime cap
    expect(s.rows.find((r) => r.year === 2030)?.capHit).toBe("lifetime");
  });

  it("recasts the payment at a reset and still amortises to zero", () => {
    const s = buildLoanSchedule(arm, market, 2055);
    const before = s.rows.find((r) => r.year === 2026);
    const after = s.rows.find((r) => r.year === 2027);
    expect((after?.payment ?? 0) > (before?.payment ?? 0)).toBe(true);
    expect(loanBalanceAtYearEnd(s, 2049)).toBe(0);
  });

  it("lets the rate fall when the index drops, limited by the periodic cap", () => {
    const r = resetArmRate(arm, 0.07, 0.01);
    expect(r.rate).toBeCloseTo(0.05, 10); // 7% - 2% cap, not 3.75% fully indexed
    expect(r.capHit).toBe("periodic");
    expect(armIndexForYear(market, 2030)).toBeCloseTo(0.08, 10);
  });
});

describe("HELOC", () => {
  const heloc: HelocLoan = {
    type: "heloc",
    id: "heloc",
    label: "HELOC",
    startYear: 2026,
    startMonth: 1,
    creditLimit: usd(100_000),
    rate: 0.08,
    drawPeriodYears: 5,
    repaymentYears: 10,
    initialDraw: usd(20_000),
    draws: [
      { year: 2027, month: 6, amount: usd(30_000) },
      { year: 2028, month: 2, amount: usd(30_000) },
    ],
  };

  it("adds draws to the balance and charges interest only during the draw period", () => {
    const s = buildLoanSchedule(heloc, market, 2045);
    expect(s.rows.find((r) => r.year === 2026)?.closingBalance).toBe(usd(20_000));
    const y27 = s.rows.find((r) => r.year === 2027);
    expect(y27?.draws).toBe(usd(30_000));
    expect(y27?.closingBalance).toBe(usd(50_000));
    expect(y27?.principal).toBe(0);
    expect(s.rows.find((r) => r.year === 2028)?.closingBalance).toBe(usd(80_000));
  });

  it("amortises after the draw period ends and repays fully", () => {
    const s = buildLoanSchedule(heloc, market, 2045);
    expect(s.rows.find((r) => r.year === 2031)?.phase).toBe("helocRepay");
    expect(s.rows.find((r) => r.year === 2031)?.principal).toBeGreaterThan(0);
    expect(loanBalanceAtYearEnd(s, 2040)).toBe(0);
  });

  it("limits a draw to the available credit and warns", () => {
    const s = buildLoanSchedule(
      { ...heloc, draws: [{ year: 2027, month: 1, amount: usd(500_000) }] },
      market,
      2030,
    );
    expect(s.rows.find((r) => r.year === 2027)?.closingBalance).toBe(usd(100_000));
    expect(s.warnings.some((w) => w.includes("limited"))).toBe(true);
  });

  it("ignores draws scheduled after the draw period", () => {
    const s = buildLoanSchedule(
      { ...heloc, draws: [{ year: 2035, month: 1, amount: usd(10_000) }] },
      market,
      2040,
    );
    expect(s.warnings.some((w) => w.includes("ignored"))).toBe(true);
  });
});
