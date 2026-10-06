import { describe, expect, it } from "vitest";
import { DEFAULT_MONTE_CARLO, generateShocks, percentile, runMonteCarlo } from "../montecarlo";
import { buildStrategies } from "../simulate";
import { mulberry32 } from "../rng";
import { simpleHousehold, simpleScenario } from "./fixtures";

const h = simpleHousehold();
const strategies = buildStrategies(simpleScenario());
const config = { ...DEFAULT_MONTE_CARLO, paths: 40 };

describe("seeded randomness", () => {
  it("mulberry32 is reproducible and uniform on [0, 1)", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const xs = Array.from({ length: 1000 }, () => a());
    expect(xs).toEqual(Array.from({ length: 1000 }, () => b()));
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...xs)).toBeLessThan(1);
    expect(xs.reduce((t, x) => t + x, 0) / xs.length).toBeCloseTo(0.5, 1);
  });

  it("generates identical shocks for the same seed and path, different shocks otherwise", () => {
    expect(generateShocks(config, 10, 3)).toEqual(generateShocks(config, 10, 3));
    expect(generateShocks(config, 10, 3)).not.toEqual(generateShocks(config, 10, 4));
    expect(generateShocks({ ...config, seed: 1 }, 10, 3)).not.toEqual(
      generateShocks(config, 10, 3),
    );
  });

  it("interpolates percentiles", () => {
    expect(percentile([1, 2, 3, 4, 5], 0.5)).toBe(3);
    expect(percentile([10, 20], 0.25)).toBe(12.5);
    expect(percentile([], 0.5)).toBe(0);
  });
});

describe("Monte Carlo runs", () => {
  const a = runMonteCarlo(h, strategies, config);

  it("is exactly reproducible for a given seed", () => {
    expect(JSON.stringify(runMonteCarlo(h, strategies, config))).toBe(JSON.stringify(a));
  });

  it("changes when the seed changes", () => {
    const b = runMonteCarlo(h, strategies, { ...config, seed: config.seed + 1 });
    expect(JSON.stringify(b)).not.toBe(JSON.stringify(a));
  });

  it("orders the percentile bands and widens them over time", () => {
    const band = a.liquidated.hold;
    for (let t = 0; t < band.years.length; t++) {
      expect(band.p10[t]).toBeLessThanOrEqual(band.p50[t] ?? 0);
      expect(band.p50[t]).toBeLessThanOrEqual(band.p90[t] ?? 0);
    }
    const first = (band.p90[0] ?? 0) - (band.p10[0] ?? 0);
    const last = (band.p90[band.years.length - 1] ?? 0) - (band.p10[band.years.length - 1] ?? 0);
    expect(first).toBe(0); // everyone starts at today's balance sheet
    expect(last).toBeGreaterThan(0);
  });

  it("collapses to the deterministic result when volatility is zero", () => {
    const flat = runMonteCarlo(h, strategies, {
      ...config,
      paths: 5,
      appreciationVolatility: 0,
      rentGrowthVolatility: 0,
    });
    const band = flat.liquidated.hold;
    const t = band.years.length - 1;
    expect(band.p10[t]).toBe(band.p90[t]);
  });

  it("reports probabilities between 0 and 1", () => {
    expect(a.probabilityBeatsHold.sell).toBeGreaterThanOrEqual(0);
    expect(a.probabilityBeatsHold.exchange).toBeLessThanOrEqual(1);
  });
});
