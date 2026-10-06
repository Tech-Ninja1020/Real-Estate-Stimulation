import { describe, expect, it } from "vitest";
import { PRESETS } from "@/data/presets";
import { ASSUMPTIONS, ASSUMPTION_IDS, getAssumption } from "@/data/assumptions";
import { LATEST_TAX_YEAR, TAX_TABLES, getTaxTable } from "@/data/tax";
import { validateHousehold, validateScenarioConfig } from "@/engine/validate";
import type { FilingStatus } from "@/engine/types";

const STATUSES: FilingStatus[] = ["single", "mfj", "mfs", "hoh"];

describe("preset households", () => {
  it("ships exactly the three named presets", () => {
    expect(PRESETS.map((p) => p.meta.name)).toEqual([
      "The Retiring Landlord",
      "The Accidental Portfolio",
      "The Leveraged Builder",
    ]);
  });

  for (const preset of PRESETS) {
    it(`${preset.meta.name} passes validation with no errors`, () => {
      const issues = [
        ...validateHousehold(preset.household),
        ...validateScenarioConfig(preset.household, preset.scenario),
      ];
      expect(issues.filter((i) => i.severity === "error")).toEqual([]);
    });

    it(`${preset.meta.name} has rich data: several properties, mixed loans, improvements`, () => {
      const loanTypes = new Set(
        preset.household.properties.flatMap((p) => p.loans.map((l) => l.type)),
      );
      expect(preset.household.properties.length).toBeGreaterThanOrEqual(3);
      expect(loanTypes.size).toBeGreaterThanOrEqual(2);
      expect(preset.household.properties.some((p) => p.improvements.length > 0)).toBe(true);
    });

    it(`${preset.meta.name} has unique ids and a sensible default sale`, () => {
      const ids = preset.household.properties.map((p) => p.id);
      expect(new Set(ids).size).toBe(ids.length);
      for (const id of preset.scenario.sellPropertyIds) expect(ids).toContain(id);
    });
  }

  it("rejects an invalid household with precise paths", () => {
    const preset = PRESETS[0];
    if (!preset) throw new Error("no preset");
    const bad = structuredClone(preset.household);
    const first = bad.properties[0];
    if (!first) throw new Error("no property");
    first.purchasePrice = -1;
    first.landValuePct = 2;
    const issues = validateHousehold(bad);
    expect(issues.map((i) => i.path)).toEqual(
      expect.arrayContaining(["properties[0].purchasePrice", "properties[0].landValuePct"]),
    );
  });
});

describe("versioned tax tables", () => {
  it("registers each year and rejects unknown years", () => {
    expect(Object.keys(TAX_TABLES).map(Number)).toContain(LATEST_TAX_YEAR);
    expect(getTaxTable(2025).taxYear).toBe(2025);
    expect(() => getTaxTable(1999)).toThrow(RangeError);
  });

  for (const year of Object.keys(TAX_TABLES).map(Number)) {
    it(`${year}: brackets ascend, rates rise, and the top bracket is open-ended`, () => {
      const t = getTaxTable(year);
      for (const status of STATUSES) {
        const brackets = t.ordinaryBrackets[status];
        expect(brackets.map((b) => b.rate)).toEqual([0.1, 0.12, 0.22, 0.24, 0.32, 0.35, 0.37]);
        let last = 0;
        for (const b of brackets.slice(0, -1)) {
          expect(b.upTo).toBeGreaterThan(last);
          last = b.upTo ?? 0;
        }
        expect(brackets[brackets.length - 1]?.upTo).toBeNull();
        const bp = t.ltcgBreakpoints[status];
        expect(bp.fifteenRateTop).toBeGreaterThan(bp.zeroRateTop);
        expect(t.standardDeduction[status]).toBeGreaterThan(0);
        expect(t.niit.magiThreshold[status]).toBeGreaterThan(0);
      }
      expect(t.unrecaptured1250MaxRate).toBe(0.25);
      expect(t.niit.rate).toBe(0.038);
    });
  }

  it("joint brackets are wider than single brackets (marriage penalty only at the top)", () => {
    const t = getTaxTable(LATEST_TAX_YEAR);
    expect(t.ordinaryBrackets.mfj[0]?.upTo).toBe((t.ordinaryBrackets.single[0]?.upTo ?? 0) * 2);
  });
});

describe("assumptions registry", () => {
  it("has unique ids and non-empty content", () => {
    expect(new Set(ASSUMPTION_IDS).size).toBe(ASSUMPTIONS.length);
    for (const a of ASSUMPTIONS) {
      expect(a.title.length).toBeGreaterThan(0);
      expect(a.summary.length).toBeGreaterThan(10);
      expect(a.details.length).toBeGreaterThan(0);
    }
  });

  it("documents what is not modeled", () => {
    const text = getAssumption("not-modeled")?.details.join(" ") ?? "";
    for (const topic of [
      "Passive activity",
      "Alternative Minimum Tax",
      "Section 121",
      "Installment",
      "Cost segregation",
    ]) {
      expect(text).toContain(topic);
    }
  });
});
