/**
 * Golden-file tests lock the COMPLETE simulation output for each preset household. Any change to
 * the engine's math shows up as a diff in engine/__tests__/golden/*.txt that must be reviewed.
 * To accept an intentional change: `npx vitest run -u`.
 */
import { describe, expect, it } from "vitest";
import { PRESETS } from "@/data/presets";
import { buildStrategies, simulateScenario } from "../simulate";
import type { ScenarioResults, StrategyResult } from "../types";

/** Stable, line-oriented serialisation: one JSON object per line so diffs are readable. */
function serialise(res: ScenarioResults): string {
  const lines: string[] = [];
  const section = (name: string): void => {
    lines.push("", `## ${name}`);
  };
  const write = (r: StrategyResult, label: string): void => {
    section(`${label}: strategy`);
    lines.push(JSON.stringify(r.strategy));
    section(`${label}: year rows`);
    for (const y of r.years) lines.push(JSON.stringify(y));
    section(`${label}: sale`);
    lines.push(JSON.stringify(r.sale));
    section(`${label}: exchange`);
    lines.push(JSON.stringify(r.exchange));
    section(`${label}: horizon`);
    lines.push(JSON.stringify(r.horizon));
    section(`${label}: tax by year`);
    for (const t of r.taxByYear)
      lines.push(
        JSON.stringify({
          year: t.year,
          ops: t.taxOnOperations,
          sale: t.taxOnSale,
          total: t.total,
          breakdown: t.breakdown,
        }),
      );
    section(`${label}: liquidation by year`);
    for (const l of r.liquidationByYear)
      lines.push(
        JSON.stringify({
          year: l.year,
          deferredTax: l.deferredTax,
          sellingCosts: l.sellingCosts,
          classification: l.classification,
          tax: l.tax,
        }),
      );
    section(`${label}: events`);
    for (const e of r.events) lines.push(JSON.stringify(e));
    section(`${label}: warnings`);
    lines.push(JSON.stringify(r.warnings));
  };
  write(res.hold, "HOLD");
  write(res.sell, "SELL");
  write(res.exchange, "EXCHANGE");
  // Per-property detail for the Hold lane (basis roll-forward, depreciation, loans).
  for (const p of res.hold.properties) {
    section(`HOLD property ${p.id}: rows`);
    for (const row of p.rows) lines.push(JSON.stringify(row));
    section(`HOLD property ${p.id}: loan schedules`);
    for (const s of p.loanSchedules) {
      lines.push(JSON.stringify({ id: s.loanId, type: s.type }));
      for (const row of s.rows) lines.push(JSON.stringify(row));
    }
  }
  return lines.join("\n") + "\n";
}

describe("golden simulation outputs", () => {
  for (const preset of PRESETS) {
    it(`locks the full output for ${preset.meta.name}`, async () => {
      const res = simulateScenario(preset.household, buildStrategies(preset.scenario));
      await expect(serialise(res)).toMatchFileSnapshot(`./golden/${preset.meta.id}.txt`);
    });
  }

  it("is stable across two independent runs of each preset", () => {
    for (const preset of PRESETS) {
      const a = serialise(simulateScenario(preset.household, buildStrategies(preset.scenario)));
      const b = serialise(
        simulateScenario(
          structuredClone(preset.household),
          buildStrategies(structuredClone(preset.scenario)),
        ),
      );
      expect(a).toBe(b);
    }
  });
});
