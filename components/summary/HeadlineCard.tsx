"use client";

import { motion, useReducedMotion } from "framer-motion";
import type { Narrative } from "@/engine/narrative";
import { Money } from "@/components/math/Fig";
import { cn } from "@/lib/cn";
import { STRATEGY_COLOR, STRATEGY_LABEL } from "@/lib/strategy";
import { AwardIcon, InfoIcon, StrategyKey } from "./icons";
import { NarrativeText } from "./NarrativeText";
import type { LoadedScenario } from "./types";

export function HeadlineCard({ s }: { s: LoadedScenario }) {
  const reduce = useReducedMotion();
  const { narrative, horizonYear, stepUp } = s;
  if (!narrative) return null;
  const { winner, ranking, headline } = narrative;
  const max = Math.max(1, ...ranking.map((r) => r.netWorth));

  return (
    <section
      aria-labelledby="verdict-heading"
      className="card-raised relative overflow-hidden p-6 sm:p-9"
    >
      <div
        aria-hidden="true"
        className="no-print pointer-events-none absolute -top-32 -right-24 size-80 rounded-full opacity-70 blur-3xl"
        style={{ background: "radial-gradient(closest-side, var(--bg-glow-1), transparent)" }}
      />
      <div className="relative">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="verdict-heading" className="eyebrow">
            The verdict
          </h2>
          <WinnerBadge winner={winner} />
        </div>
        <p className="display text-ink mt-5 max-w-[46ch] text-[1.625rem] leading-[1.25] sm:text-[2rem] lg:text-[2.25rem] lg:leading-[1.2]">
          <NarrativeText segments={headline} figureClassName="font-medium text-ink" />
        </p>

        <div className="border-line mt-9 border-t pt-6">
          <p className="eyebrow mb-4">
            Net worth if liquidated in {horizonYear}
            {stepUp ? ", with step-up" : ""}
          </p>
          <ol className="space-y-3.5">
            {ranking.map((r, i) => (
              <li
                key={r.strategy}
                className="grid items-center gap-x-4 gap-y-1.5 sm:grid-cols-[11.5rem_1fr_8rem]"
              >
                <div className="flex items-center gap-2.5">
                  <StrategyKey strategy={r.strategy} />
                  <span className="text-ink text-sm font-medium">{STRATEGY_LABEL[r.strategy]}</span>
                  <span className="num text-ink-3 text-xs">#{i + 1}</span>
                </div>
                <div className="bg-surface-3 h-3.5 rounded-full" aria-hidden="true">
                  <motion.div
                    className="h-full rounded-l-full rounded-r-[4px]"
                    style={{ background: STRATEGY_COLOR[r.strategy] }}
                    initial={{ width: reduce ? `${(Math.max(0, r.netWorth) / max) * 100}%` : 0 }}
                    animate={{ width: `${(Math.max(0, r.netWorth) / max) * 100}%` }}
                    transition={{
                      duration: reduce ? 0 : 0.9,
                      delay: reduce ? 0 : 0.15 + i * 0.1,
                      ease: [0.22, 1, 0.36, 1],
                    }}
                  />
                </div>
                <div className="display text-ink text-lg sm:text-right">
                  <Money
                    cents={r.netWorth}
                    trace={{
                      kind: "netWorthLiquidated",
                      strategy: r.strategy,
                      year: horizonYear,
                      stepUp,
                    }}
                  />
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}

function WinnerBadge({ winner }: { winner: Narrative["winner"] }) {
  if (winner === "tie") {
    return (
      <span className="border-line bg-surface-2 text-ink-2 inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold">
        <InfoIcon size={14} />
        No clear winner
      </span>
    );
  }
  return (
    <span
      className={cn(
        "bg-accent-soft text-accent inline-flex items-center gap-2 rounded-full border border-transparent px-3 py-1.5 text-xs font-semibold",
      )}
    >
      <AwardIcon size={14} />
      <span>Winner</span>
      <span aria-hidden="true" className="h-3 w-px bg-current opacity-30" />
      <StrategyKey strategy={winner} width={22} />
      <span className="text-ink">{STRATEGY_LABEL[winner]}</span>
    </span>
  );
}
