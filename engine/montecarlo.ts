/**
 * Monte Carlo uncertainty mode.
 *
 * Each path draws a year-by-year shock to appreciation and rent growth from a seeded PRNG
 * (mulberry32 + Box-Muller). The same shocks are applied to all three strategies on a path
 * ("common random numbers"), so differences between strategies reflect the strategy, not luck.
 * Results are reported as 10th / 50th / 90th percentile bands per year.
 */

import { toCents } from "./money";
import type { Cents } from "./money";
import { deriveSeed, gaussian, mulberry32 } from "./rng";
import { createSimulationCache, simulateScenario } from "./simulate";
import type {
  BandSeries,
  Household,
  MarketShocks,
  MonteCarloConfig,
  MonteCarloResult,
  StrategyKind,
  StrategySet,
} from "./types";

export const DEFAULT_MONTE_CARLO: MonteCarloConfig = {
  seed: 20260,
  paths: 200,
  appreciationVolatility: 0.06,
  rentGrowthVolatility: 0.015,
  correlation: 0.5,
};

/** Shocks for one path. Index 0 is unused so that index k means projection year k. */
export function generateShocks(
  config: MonteCarloConfig,
  horizonYears: number,
  pathIndex: number,
): MarketShocks {
  const rng = mulberry32(deriveSeed(config.seed, pathIndex));
  const rho = Math.max(-1, Math.min(1, config.correlation));
  const appreciation: number[] = [0];
  const rentGrowth: number[] = [0];
  for (let k = 1; k <= horizonYears; k++) {
    const z1 = gaussian(rng);
    const z2 = gaussian(rng);
    appreciation.push(config.appreciationVolatility * z1);
    rentGrowth.push(config.rentGrowthVolatility * (rho * z1 + Math.sqrt(1 - rho * rho) * z2));
  }
  return { appreciation, rentGrowth };
}

/** Linear-interpolated percentile of an ascending-sorted array (p in 0..1). */
export function percentile(sortedAscending: readonly number[], p: number): number {
  const n = sortedAscending.length;
  if (n === 0) return 0;
  const pos = (n - 1) * Math.min(1, Math.max(0, p));
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  const a = sortedAscending[lo] ?? 0;
  const b = sortedAscending[hi] ?? a;
  return a + (b - a) * (pos - lo);
}

function bands(years: number[], samplesByYear: Cents[][]): BandSeries {
  const p10: Cents[] = [];
  const p50: Cents[] = [];
  const p90: Cents[] = [];
  for (const samples of samplesByYear) {
    const sorted = [...samples].sort((a, b) => a - b);
    p10.push(toCents(percentile(sorted, 0.1)));
    p50.push(toCents(percentile(sorted, 0.5)));
    p90.push(toCents(percentile(sorted, 0.9)));
  }
  return { years, p10, p50, p90 };
}

/**
 * Incremental Monte Carlo runner. Call `runPath(i)` for i = 0..paths-1 (in any chunking the caller
 * likes, which keeps a UI responsive) and then `finish()`. Pure and deterministic.
 */
export function createMonteCarloRun(
  household: Household,
  strategies: StrategySet,
  config: MonteCarloConfig,
): { runPath: (index: number) => void; finish: () => MonteCarloResult } {
  const horizon = household.investor.horizonYears;
  const cache = createSimulationCache(household);
  const kinds: StrategyKind[] = ["hold", "sell", "exchange"];
  const rows = horizon + 1;
  const years = Array.from({ length: rows }, (_, i) => household.market.asOfYear + i);

  const empty = (): Record<StrategyKind, Cents[][]> => ({
    hold: Array.from({ length: rows }, () => []),
    sell: Array.from({ length: rows }, () => []),
    exchange: Array.from({ length: rows }, () => []),
  });
  const liquidated = empty();
  const afterTax = empty();
  const liquidatedStepUp = empty();
  let completed = 0;
  let sellBeats = 0;
  let exchangeBeats = 0;

  return {
    runPath(index: number): void {
      const shocks = generateShocks(config, horizon, index);
      const result = simulateScenario(household, strategies, { shocks, cache });
      for (const kind of kinds) {
        const r = result[kind];
        for (let t = 0; t < rows; t++) {
          const row = r.years[t];
          if (!row) continue;
          liquidated[kind][t]?.push(row.netWorthLiquidated);
          afterTax[kind][t]?.push(row.netWorthAfterTax);
          liquidatedStepUp[kind][t]?.push(row.netWorthLiquidatedWithStepUp);
        }
      }
      if (result.sell.horizon.netWorthLiquidated > result.hold.horizon.netWorthLiquidated)
        sellBeats++;
      if (result.exchange.horizon.netWorthLiquidated > result.hold.horizon.netWorthLiquidated) {
        exchangeBeats++;
      }
      completed++;
    },
    finish(): MonteCarloResult {
      const pack = (src: Record<StrategyKind, Cents[][]>): Record<StrategyKind, BandSeries> => ({
        hold: bands(years, src.hold),
        sell: bands(years, src.sell),
        exchange: bands(years, src.exchange),
      });
      return {
        config,
        liquidated: pack(liquidated),
        afterTax: pack(afterTax),
        liquidatedStepUp: pack(liquidatedStepUp),
        probabilityBeatsHold: {
          sell: completed > 0 ? sellBeats / completed : 0,
          exchange: completed > 0 ? exchangeBeats / completed : 0,
        },
      };
    },
  };
}

/** Run the full scenario under many random market paths. Deterministic for a given seed. */
export function runMonteCarlo(
  household: Household,
  strategies: StrategySet,
  config: MonteCarloConfig,
): MonteCarloResult {
  const run = createMonteCarloRun(household, strategies, config);
  for (let i = 0; i < config.paths; i++) run.runPath(i);
  return run.finish();
}
