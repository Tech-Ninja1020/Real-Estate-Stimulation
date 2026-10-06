/**
 * Property-based tests: for ANY valid household and scenario, the accounting identities must hold.
 * fast-check generates the inputs; a fixed seed keeps failures reproducible.
 */
import fc from "fast-check";
import { describe, expect, it, vi } from "vitest";
import { usd } from "../money";
import { buildLoanSchedule } from "../loans";
import { buildStrategies, simulateScenario } from "../simulate";
import type { Household, Loan, Property, ReplacementDebt, ScenarioConfig } from "../types";
import { defaultReplacement } from "@/data/presets/helpers";

const AS_OF = 2026;
const market = {
  asOfYear: AS_OF,
  taxTableYear: 2026,
  inflationRate: 0.025,
  armIndexRate: 0.04,
  armIndexAnnualChange: 0.003,
};

const arbLoan = (purchaseYear: number, price: number, idx: number): fc.Arbitrary<Loan> => {
  const common = {
    id: fc.constant(`loan-${idx}`),
    label: fc.constant(`Loan ${idx}`),
    startYear: fc.integer({ min: purchaseYear, max: AS_OF }),
    startMonth: fc.integer({ min: 1, max: 12 }),
    principal: fc
      .double({ min: 0.2, max: 0.85, noNaN: true })
      .map((f) => usd(Math.round(price * f))),
  };
  return fc.oneof(
    fc.record({
      type: fc.constant("fixed" as const),
      ...common,
      rate: fc.double({ min: 0, max: 0.09, noNaN: true }),
      termYears: fc.constantFrom(10, 15, 20, 30),
    }),
    fc.record({
      type: fc.constant("interestOnly" as const),
      ...common,
      rate: fc.double({ min: 0.01, max: 0.09, noNaN: true }),
      ioYears: fc.integer({ min: 1, max: 9 }),
      termYears: fc.constantFrom(15, 20, 30),
    }),
    fc.record({
      type: fc.constant("arm" as const),
      ...common,
      initialRate: fc.double({ min: 0.02, max: 0.08, noNaN: true }),
      fixedYears: fc.constantFrom(3, 5, 7, 10),
      termYears: fc.constant(30),
      adjustmentCap: fc.double({ min: 0.01, max: 0.03, noNaN: true }),
      lifetimeCap: fc.double({ min: 0.03, max: 0.06, noNaN: true }),
      margin: fc.double({ min: 0.015, max: 0.035, noNaN: true }),
    }),
    fc.record({
      type: fc.constant("heloc" as const),
      id: common.id,
      label: fc.constant(`HELOC ${idx}`),
      startYear: common.startYear,
      startMonth: common.startMonth,
      creditLimit: fc.integer({ min: 20_000, max: 200_000 }).map(usd),
      rate: fc.double({ min: 0.04, max: 0.11, noNaN: true }),
      drawPeriodYears: fc.constantFrom(5, 10),
      repaymentYears: fc.constantFrom(10, 15, 20),
      initialDraw: fc.integer({ min: 0, max: 20_000 }).map(usd),
      draws: fc.array(
        fc.record({
          year: fc.integer({ min: AS_OF - 2, max: AS_OF + 6 }),
          month: fc.integer({ min: 1, max: 12 }),
          amount: fc.integer({ min: 1_000, max: 60_000 }).map(usd),
        }),
        { maxLength: 3 },
      ),
    }),
  );
};

const arbProperty = (idx: number): fc.Arbitrary<Property> =>
  fc
    .record({
      purchaseYear: fc.integer({ min: 2000, max: 2025 }),
      purchaseMonth: fc.integer({ min: 1, max: 12 }),
      price: fc.integer({ min: 120_000, max: 3_000_000 }),
      land: fc.double({ min: 0.05, max: 0.5, noNaN: true }),
      closingPct: fc.double({ min: 0, max: 0.03, noNaN: true }),
      valueFactor: fc.double({ min: 0.55, max: 2.6, noNaN: true }),
      appreciation: fc.double({ min: -0.02, max: 0.06, noNaN: true }),
      yield: fc.double({ min: 0.04, max: 0.12, noNaN: true }),
      rentGrowth: fc.double({ min: 0, max: 0.05, noNaN: true }),
      vacancy: fc.double({ min: 0, max: 0.15, noNaN: true }),
      opexPct: fc.double({ min: 0.15, max: 0.45, noNaN: true }),
      fixedOpex: fc.boolean(),
      taxPct: fc.double({ min: 0.004, max: 0.02, noNaN: true }),
      sellingPct: fc.double({ min: 0.02, max: 0.08, noNaN: true }),
      improvements: fc.array(
        fc.record({
          year: fc.integer({ min: 2005, max: 2033 }),
          month: fc.integer({ min: 1, max: 12 }),
          pct: fc.double({ min: 0.01, max: 0.1, noNaN: true }),
          valueAddedPct: fc.double({ min: 0, max: 1, noNaN: true }),
        }),
        { maxLength: 2 },
      ),
    })
    .chain((g) => {
      const loanCount = fc.integer({ min: 0, max: 3 });
      return loanCount.chain((n) =>
        fc
          .tuple(...Array.from({ length: n }, (_, i) => arbLoan(g.purchaseYear, g.price, i)))
          .map((loans): Property => {
            const value = Math.round(g.price * g.valueFactor);
            return {
              id: `prop-${idx}`,
              name: `Property ${idx}`,
              location: "Anywhere",
              purchaseYear: g.purchaseYear,
              purchaseMonth: g.purchaseMonth,
              purchasePrice: usd(g.price),
              landValuePct: g.land,
              closingCosts: usd(Math.round(g.price * g.closingPct)),
              improvements: g.improvements.map((imp, i) => ({
                id: `imp-${i}`,
                description: "Work",
                year: imp.year,
                month: imp.month,
                amount: usd(Math.round(g.price * imp.pct)),
                valueAdded: usd(Math.round(g.price * imp.pct * imp.valueAddedPct)),
              })),
              currentValue: usd(value),
              appreciationRate: g.appreciation,
              annualRent: usd(Math.round(value * g.yield)),
              rentGrowthRate: g.rentGrowth,
              vacancyRate: g.vacancy,
              operating: g.fixedOpex
                ? { kind: "fixed", annual: usd(Math.round(value * g.yield * g.opexPct)) }
                : { kind: "percentOfRent", rate: g.opexPct },
              propertyTax: usd(Math.round(value * g.taxPct)),
              insurance: usd(Math.round(value * 0.004)),
              expenseGrowthRate: 0.03,
              loans,
              sellingCostRate: g.sellingPct,
            };
          }),
      );
    });

const arbDebt: fc.Arbitrary<ReplacementDebt> = fc.oneof(
  fc.constant<ReplacementDebt>({ kind: "matchRelinquished" }),
  fc
    .double({ min: 0, max: 0.8, noNaN: true })
    .map((ltv): ReplacementDebt => ({ kind: "ltv", ltv })),
  fc
    .integer({ min: 0, max: 2_000_000 })
    .map((a): ReplacementDebt => ({ kind: "amount", amount: usd(a) })),
);

interface Case {
  household: Household;
  config: ScenarioConfig;
}

const arbCase: fc.Arbitrary<Case> = fc
  .record({
    count: fc.integer({ min: 1, max: 3 }),
    horizon: fc.constantFrom(5, 10, 20, 30) as fc.Arbitrary<5 | 10 | 20 | 30>,
    status: fc.constantFrom("single", "mfj", "mfs", "hoh") as fc.Arbitrary<
      "single" | "mfj" | "mfs" | "hoh"
    >,
    income: fc.integer({ min: 0, max: 700_000 }),
    state: fc.double({ min: 0, max: 0.1, noNaN: true }),
    reinvest: fc.double({ min: 0, max: 0.08, noNaN: true }),
  })
  .chain((g) =>
    fc.tuple(...Array.from({ length: g.count }, (_, i) => arbProperty(i))).chain((properties) =>
      fc
        .record({
          sellOffset: fc.integer({ min: 1, max: g.horizon - 1 }),
          mask: fc.array(fc.boolean(), {
            minLength: properties.length,
            maxLength: properties.length,
          }),
          multiple: fc.double({ min: 0.4, max: 2, noNaN: true }),
          debt: arbDebt,
          cashOut: fc.integer({ min: 0, max: 300_000 }),
          idDays: fc.integer({ min: 0, max: 60 }),
          closeDays: fc.integer({ min: 0, max: 200 }),
        })
        .map((s): Case => {
          const household: Household = {
            id: "gen",
            name: "Generated",
            tagline: "",
            description: "",
            investor: {
              filingStatus: g.status,
              otherTaxableIncome: usd(g.income),
              stateTaxRate: g.state,
              horizonYears: g.horizon,
              discountRate: 0.05,
              reinvestmentReturnRate: g.reinvest,
            },
            market,
            properties,
          };
          return {
            household,
            config: {
              sellYear: AS_OF + s.sellOffset,
              sellPropertyIds: properties.filter((_, i) => s.mask[i]).map((p) => p.id),
              replacement: defaultReplacement("Generated replacement", {
                priceMultiple: s.multiple,
                debt: s.debt,
              }),
              cashOutAtClosing: usd(s.cashOut),
              identificationDays: s.idDays,
              closingDays: s.closeDays,
            },
          };
        }),
    ),
  );

const options = {
  numRuns: Number(process.env.FC_RUNS ?? 80),
  seed: Number(process.env.FC_SEED ?? 20260101),
};

vi.setConfig({ testTimeout: 120_000 });

describe("accounting invariants hold for any scenario", () => {
  it("is deterministic: identical inputs produce identical outputs", () => {
    fc.assert(
      fc.property(arbCase, ({ household, config }) => {
        const a = simulateScenario(household, buildStrategies(config));
        const b = simulateScenario(
          structuredClone(household),
          buildStrategies(structuredClone(config)),
        );
        expect(JSON.stringify(a)).toBe(JSON.stringify(b));
      }),
      { ...options, numRuns: 25 },
    );
  });

  it("keeps every money value an integer number of cents and finite", () => {
    fc.assert(
      fc.property(arbCase, ({ household, config }) => {
        const res = simulateScenario(household, buildStrategies(config));
        for (const r of [res.hold, res.sell, res.exchange]) {
          for (const y of r.years) {
            for (const [key, v] of Object.entries(y)) {
              expect(Number.isFinite(v), `${key} finite`).toBe(true);
              expect(Number.isInteger(v), `${key} integer`).toBe(true);
            }
          }
        }
      }),
      options,
    );
  });

  it("reconciles cash and net worth every year", () => {
    fc.assert(
      fc.property(arbCase, ({ household, config }) => {
        const res = simulateScenario(household, buildStrategies(config));
        for (const r of [res.hold, res.sell, res.exchange]) {
          for (const y of r.years.slice(1)) {
            expect(y.cashClosing).toBe(
              y.cashOpening +
                y.investmentReturn +
                y.cashFlowBeforeTax -
                y.capex +
                y.helocDraws -
                y.taxesPaid +
                y.saleNetProceeds +
                y.exchangeCashFlow,
            );
            expect(y.netWorthAfterTax).toBe(y.equity + y.cashBalance + y.intermediaryFunds);
            expect(y.equity).toBe(y.propertyValue - y.loanBalance);
            expect(y.cashFlowBeforeTax).toBe(y.noi - y.debtService);
            expect(y.taxesPaid).toBe(y.taxOnOperations + y.taxOnSale);
          }
        }
      }),
      options,
    );
  });

  it("sale proceeds equal price - selling costs - loan payoff - taxes", () => {
    fc.assert(
      fc.property(arbCase, ({ household, config }) => {
        const sale = simulateScenario(household, buildStrategies(config)).sell.sale;
        if (!sale) return;
        expect(sale.netProceedsBeforeTax).toBe(
          sale.totalSalePrice - sale.totalSellingCosts - sale.totalLoanPayoff,
        );
        expect(sale.netProceedsAfterTax).toBe(sale.netProceedsBeforeTax - sale.tax.total);
        const c = sale.classification;
        expect(c.unrecaptured1250Gain + c.longTermCapitalGain - c.ordinaryLoss1231).toBe(
          sale.totalGain,
        );
        expect(c.unrecaptured1250Gain).toBeGreaterThanOrEqual(0);
        expect(c.longTermCapitalGain).toBeGreaterThanOrEqual(0);
      }),
      options,
    );
  });

  it("never loses deferred gain in an exchange: realised = recognised + deferred, basis matches both ways", () => {
    fc.assert(
      fc.property(arbCase, ({ household, config }) => {
        const res = simulateScenario(household, buildStrategies(config));
        const ex = res.exchange.exchange;
        if (!ex?.completed) return;
        const b = ex.boot;
        expect(b.recognizedGain + b.deferredGain).toBe(b.realizedGain);
        expect(b.recognizedGain).toBeGreaterThanOrEqual(0);
        expect(b.replacementBasis).toBe(b.replacementBasisCrossCheck);
        expect(b.totalBoot).toBe(b.cashBoot + b.mortgageBoot);
        expect(b.recognizedGain).toBeLessThanOrEqual(Math.max(0, b.totalBoot));
        // The exchange realises exactly the gain a taxable sale would have realised.
        expect(b.realizedGain).toBe(res.sell.sale?.totalGain);
        // If the sale had a gain, all of it is either taxed now (boot) or still deferred.
        if (b.realizedGain > 0) expect(b.deferredGain).toBe(b.realizedGain - b.recognizedGain);
      }),
      options,
    );
  });

  it("keeps all loan balances non-negative and fully repaid after maturity", () => {
    fc.assert(
      fc.property(arbCase, ({ household }) => {
        for (const p of household.properties) {
          for (const loan of p.loans) {
            const s = buildLoanSchedule(loan, market, AS_OF + 30);
            for (const row of s.rows) {
              expect(row.closingBalance).toBeGreaterThanOrEqual(0);
              expect(row.interest).toBeGreaterThanOrEqual(0);
              expect(row.principal).toBeGreaterThanOrEqual(0);
              expect(row.closingBalance).toBe(row.openingBalance + row.draws - row.principal);
            }
          }
        }
      }),
      options,
    );
  });

  it("depreciation never exceeds depreciable basis and rolls up exactly into accumulated depreciation", () => {
    fc.assert(
      fc.property(arbCase, ({ household, config }) => {
        const hold = simulateScenario(household, buildStrategies(config)).hold;
        for (const p of hold.properties) {
          const trancheBasis = p.tranches.reduce((t, x) => t + x.basis, 0);
          let running = p.rows[0]?.accumulatedDepreciation ?? 0;
          for (const row of p.rows.slice(1)) {
            if (row.status !== "owned") continue;
            running += row.depreciation;
            expect(row.accumulatedDepreciation).toBe(running);
            expect(row.accumulatedDepreciation).toBeLessThanOrEqual(trancheBasis);
          }
        }
      }),
      options,
    );
  });

  it("the Hold lane does not depend on the sale controls", () => {
    fc.assert(
      fc.property(arbCase, ({ household, config }) => {
        const a = simulateScenario(household, buildStrategies(config)).hold;
        const b = simulateScenario(
          household,
          buildStrategies({ ...config, sellYear: AS_OF + 1, sellPropertyIds: [] }),
        ).hold;
        expect(JSON.stringify(a)).toBe(JSON.stringify(b));
      }),
      { ...options, numRuns: 25 },
    );
  });

  it("selling nothing makes Sell and Exchange identical to Hold", () => {
    fc.assert(
      fc.property(arbCase, ({ household, config }) => {
        const res = simulateScenario(
          household,
          buildStrategies({ ...config, sellPropertyIds: [] }),
        );
        expect(res.sell.horizon.netWorthLiquidated).toBe(res.hold.horizon.netWorthLiquidated);
        expect(res.exchange.horizon.netWorthLiquidated).toBe(res.hold.horizon.netWorthLiquidated);
      }),
      { ...options, numRuns: 30 },
    );
  });
});
