import type { StrategyKind } from "@/engine/types";

export const STRATEGY_ORDER: readonly StrategyKind[] = ["hold", "sell", "exchange"];

export const STRATEGY_LABEL: Record<StrategyKind, string> = {
  hold: "Hold",
  sell: "Sell",
  exchange: "1031 Exchange",
};

export const STRATEGY_BLURB: Record<StrategyKind, string> = {
  hold: "Keep every property and let it compound.",
  sell: "Sell, pay the tax, reinvest the proceeds.",
  exchange: "Roll the gain into a replacement property.",
};

/** CSS variable for each strategy's colour. These are validated categorical slots (blue, orange, aqua). */
export const STRATEGY_COLOR: Record<StrategyKind, string> = {
  hold: "var(--c-hold)",
  sell: "var(--c-sell)",
  exchange: "var(--c-exchange)",
};

/** Dash pattern as a secondary (non-colour) encoding, so lines stay distinguishable without colour. */
export const STRATEGY_DASH: Record<StrategyKind, string | undefined> = {
  hold: undefined,
  sell: "6 4",
  exchange: "2 3",
};
