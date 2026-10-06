import { describe, expect, it } from "vitest";
import { PRESETS } from "@/data/presets";
import { DEFAULT_MONTE_CARLO } from "@/engine/montecarlo";
import { decodeState, encodeState } from "@/lib/share";
import type { SharedState } from "@/lib/share";

const preset = PRESETS[0];
if (!preset) throw new Error("no preset");

const base: SharedState = {
  preset: preset.meta.id,
  config: preset.scenario,
  stepUp: true,
  monteCarlo: { enabled: true, config: { ...DEFAULT_MONTE_CARLO, seed: 4242 } },
};

describe("shareable links", () => {
  it("round-trips a preset-based view exactly", () => {
    expect(decodeState(encodeState(base))).toEqual(base);
  });

  it("keeps preset links short", () => {
    expect(encodeState(base).length).toBeLessThan(900);
  });

  it("round-trips a fully custom household", () => {
    const custom: SharedState = {
      household: preset.household,
      config: preset.scenario,
      stepUp: false,
      monteCarlo: base.monteCarlo,
    };
    expect(decodeState(encodeState(custom))).toEqual(custom);
  });

  it("rejects garbage, empty strings and unknown presets", () => {
    expect(decodeState("not a real link")).toBeNull();
    expect(decodeState("")).toBeNull();
    expect(decodeState(encodeState({ ...base, preset: "no-such-preset" }))).toBeNull();
  });
});
