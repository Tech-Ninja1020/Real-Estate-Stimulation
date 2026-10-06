import { describe, expect, it } from "vitest";
import { PRESETS } from "@/data/presets";
import { ASSUMPTION_IDS } from "@/data/assumptions";
import { resolveTrace } from "../explain";
import type { MathTrace, TraceContext, TraceRef, TraceValue } from "../explain";
import { buildStrategies, simulateScenario } from "../simulate";
import { formatPercent, formatUsd } from "../format";

function contextFor(index: number): { ctx: TraceContext; ref: Record<string, number> } {
  const preset = PRESETS[index];
  if (!preset) throw new Error("no preset");
  const results = simulateScenario(preset.household, buildStrategies(preset.scenario));
  return { ctx: { household: preset.household, results }, ref: {} };
}

const cents = (v: TraceValue): number => {
  if (v.kind !== "money") throw new Error("expected a money value");
  return v.cents;
};

describe("formatting", () => {
  it("formats dollars and percents without locale dependence", () => {
    expect(formatUsd(123_456_789)).toBe("$1,234,568");
    expect(formatUsd(-5_000_00)).toBe("−$5,000");
    expect(formatUsd(123_456, true)).toBe("$1,234.56");
    expect(formatPercent(0.0425, 2)).toBe("4.25%");
  });
});

describe("Show the math traces reproduce the engine's numbers", () => {
  const { ctx } = contextFor(0);
  const { hold, sell, exchange } = ctx.results;
  const horizon = ctx.household.market.asOfYear + ctx.household.investor.horizonYears;
  const saleYear = sell.sale?.year ?? 0;

  it("net worth if liquidated, with and without step-up", () => {
    const row = hold.years[hold.years.length - 1];
    if (!row) throw new Error("no row");
    const a = resolveTrace({ kind: "netWorthLiquidated", strategy: "hold", year: horizon }, ctx);
    const b = resolveTrace(
      { kind: "netWorthLiquidated", strategy: "hold", year: horizon, stepUp: true },
      ctx,
    );
    expect(cents(a.result)).toBe(row.netWorthLiquidated);
    expect(cents(b.result)).toBe(row.netWorthLiquidatedWithStepUp);
    // The last step of the trace equals the result.
    expect(cents(a.steps[a.steps.length - 1]?.value ?? { kind: "text", text: "" })).toBe(
      row.netWorthLiquidated,
    );
  });

  it("every sale-tax layer sums to the total, and the total matches the engine", () => {
    const total = resolveTrace({ kind: "saleTaxTotal", strategy: "sell", year: saleYear }, ctx);
    const layers = total.steps.filter((s) => s.label !== "Total").map((s) => cents(s.value));
    expect(layers.reduce((t, x) => t + x, 0)).toBe(sell.sale?.tax.total);
    expect(cents(total.result)).toBe(sell.sale?.tax.total);
  });

  it("recapture-tax slices add up (within a cent per slice) to the engine's recapture tax", () => {
    const t = resolveTrace({ kind: "recaptureTax", strategy: "sell", year: saleYear }, ctx);
    const slices = t.steps.filter((s) => s.label !== "Tax on recapture");
    const sum = slices.reduce((x, s) => x + cents(s.value), 0);
    expect(Math.abs(sum - cents(t.result))).toBeLessThanOrEqual(slices.length);
    expect(cents(t.result)).toBe(sell.sale?.tax.depreciationRecaptureTax);
  });

  it("net proceeds trace is price - costs - payoff - taxes", () => {
    const t = resolveTrace({ kind: "netProceeds", strategy: "sell" }, ctx);
    expect(cents(t.result)).toBe(sell.sale?.netProceedsAfterTax);
    const parts = t.steps
      .slice(0, 5)
      .filter((s) => !s.label.startsWith("Proceeds before"))
      .map((s) => cents(s.value));
    expect(parts.reduce((x, y) => x + y, 0)).toBe(sell.sale?.netProceedsAfterTax);
  });

  it("deferred-tax trace lists each property and ends at the engine's liability", () => {
    const t = resolveTrace({ kind: "deferredTax", strategy: "hold", year: horizon }, ctx);
    expect(cents(t.result)).toBe(hold.horizon.deferredTaxLiability);
    expect(t.steps.length).toBeGreaterThan(ctx.household.properties.length);
  });

  it("boot and replacement-basis traces agree with the exchange summary", () => {
    const boot = resolveTrace({ kind: "boot" }, ctx);
    expect(cents(boot.result)).toBe(exchange.exchange?.boot.totalBoot);
    const basis = resolveTrace({ kind: "replacementBasis" }, ctx);
    expect(cents(basis.result)).toBe(exchange.exchange?.boot.replacementBasis);
    expect(basis.steps.find((s) => s.label === "Check")?.value).toEqual({
      kind: "text",
      text: "Agree",
    });
  });

  it("depreciation traces reproduce the property rows", () => {
    const first = hold.properties[0];
    if (!first) throw new Error("no property");
    const row = first.rows.find((r) => r.year === 2030);
    const acc = resolveTrace(
      { kind: "accumulatedDepreciation", strategy: "hold", propertyId: first.id, year: 2030 },
      ctx,
    );
    const basis = resolveTrace(
      { kind: "adjustedBasis", strategy: "hold", propertyId: first.id, year: 2030 },
      ctx,
    );
    const dep = resolveTrace(
      { kind: "annualDepreciation", strategy: "hold", propertyId: first.id, year: 2030 },
      ctx,
    );
    expect(cents(acc.result)).toBe(row?.accumulatedDepreciation);
    expect(cents(basis.result)).toBe(row?.adjustedBasis);
    expect(cents(dep.result)).toBe(row?.depreciation);
  });

  it("every trace links only to assumptions that exist and has a formula and a title", () => {
    const refs: TraceRef[] = [
      { kind: "netWorthAfterTax", strategy: "exchange", year: horizon },
      { kind: "equity", strategy: "sell", year: horizon },
      { kind: "cumulativeTaxes", strategy: "hold", year: horizon },
      { kind: "cashFlow", strategy: "hold", year: 2028 },
      { kind: "cashAccount", strategy: "sell", year: saleYear },
      { kind: "taxOnOperations", strategy: "hold", year: 2028 },
      { kind: "noi", strategy: "hold", year: 2028 },
      { kind: "presentValue", strategy: "hold" },
      { kind: "saleGain", strategy: "sell", propertyId: "maple-court" },
      { kind: "saleBasis", strategy: "sell", propertyId: "maple-court" },
      { kind: "gainSplit", strategy: "sell" },
      { kind: "capitalGainsTax", strategy: "sell", year: saleYear },
      { kind: "niit", strategy: "sell", year: saleYear },
      { kind: "stateTax", strategy: "sell", year: saleYear },
      { kind: "deferredGain" },
      { kind: "recaptureExposure", strategy: "hold", propertyId: "maple-court", year: 2030 },
      { kind: "propertyValue", strategy: "hold", propertyId: "maple-court", year: 2030 },
      {
        kind: "loanPayment",
        strategy: "hold",
        propertyId: "riverside-triplex",
        loanId: "river-1",
        year: 2028,
      },
      {
        kind: "monteCarlo",
        strategy: "hold",
        year: horizon,
        percentile: 10,
        seed: 1,
        paths: 10,
        value: 100,
      },
    ];
    for (const ref of refs) {
      const t: MathTrace = resolveTrace(ref, ctx);
      expect(t.title.length, ref.kind).toBeGreaterThan(0);
      expect(t.formula.length, ref.kind).toBeGreaterThan(0);
      expect(t.steps.length + t.inputs.length, ref.kind).toBeGreaterThan(0);
      for (const id of t.assumptionIds)
        expect(ASSUMPTION_IDS, `${ref.kind} -> ${id}`).toContain(id);
      expect(JSON.stringify(t)).not.toMatch(/NaN|undefined|Infinity/);
    }
  });

  it("drill-down refs inside traces all resolve", () => {
    const t = resolveTrace({ kind: "netWorthLiquidated", strategy: "sell", year: horizon }, ctx);
    for (const input of t.inputs) {
      if (input.ref) expect(() => resolveTrace(input.ref as TraceRef, ctx)).not.toThrow();
    }
  });
});

import { buildNarrative } from "../narrative";
import { DEFAULT_MONTE_CARLO, runMonteCarlo } from "../montecarlo";

describe("narrative", () => {
  for (const [i, preset] of PRESETS.entries()) {
    it(`is deterministic and complete for ${preset.meta.name}`, () => {
      const { ctx } = contextFor(i);
      const a = buildNarrative(ctx, { stepUp: false });
      const b = buildNarrative(ctx, { stepUp: false });
      expect(JSON.stringify(a)).toBe(JSON.stringify(b));
      expect(a.paragraphs.map((p) => p.id)).toEqual(
        expect.arrayContaining(["hold", "sell", "exchange", "step-up"]),
      );
      expect(a.caveats.length).toBeGreaterThanOrEqual(4);
      const flat = JSON.stringify(a);
      expect(flat).not.toMatch(/NaN|undefined|Infinity|lorem/i);
      // Figure refs inside the narrative resolve to real traces.
      for (const para of a.paragraphs) {
        for (const seg of para.segments) {
          if (seg.kind === "money" && seg.ref)
            expect(() => resolveTrace(seg.ref as TraceRef, ctx)).not.toThrow();
        }
      }
    });
  }

  it("changes the verdict language when step-up is assumed and adds uncertainty when Monte Carlo is provided", () => {
    const preset = PRESETS[0];
    if (!preset) throw new Error("no preset");
    const { ctx } = contextFor(0);
    const mc = runMonteCarlo(preset.household, buildStrategies(preset.scenario), {
      ...DEFAULT_MONTE_CARLO,
      paths: 20,
    });
    const withStepUp = buildNarrative(ctx, { stepUp: true, monteCarlo: mc });
    expect(JSON.stringify(withStepUp.headline)).toContain("step-up");
    expect(withStepUp.paragraphs.some((p) => p.id === "uncertainty")).toBe(true);
  });

  it("explains a no-sale scenario instead of inventing a comparison", () => {
    const preset = PRESETS[1];
    if (!preset) throw new Error("no preset");
    const results = simulateScenario(
      preset.household,
      buildStrategies({ ...preset.scenario, sellPropertyIds: [] }),
    );
    const n = buildNarrative({ household: preset.household, results }, { stepUp: false });
    expect(n.winner).toBe("tie");
    expect(JSON.stringify(n.headline)).toContain("No properties are selected");
  });
});
