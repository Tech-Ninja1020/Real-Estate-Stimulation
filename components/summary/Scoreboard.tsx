"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Money } from "@/components/math/Fig";
import type { TraceRef } from "@/engine/explain";
import type { Cents } from "@/engine/types";
import { cn } from "@/lib/cn";
import { STRATEGY_BLURB, STRATEGY_LABEL, STRATEGY_ORDER } from "@/lib/strategy";
import { AwardIcon, StrategyKey } from "./icons";
import type { LoadedScenario } from "./types";

function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2.5">
      <dt className="text-ink-2 min-w-0 text-[0.8125rem] leading-snug">
        {label}
        {hint && <span className="text-ink-3 mt-0.5 block text-xs">{hint}</span>}
      </dt>
      <dd className="num text-ink shrink-0 text-right text-sm font-medium">{children}</dd>
    </div>
  );
}

export function Scoreboard({ s }: { s: LoadedScenario }) {
  const reduce = useReducedMotion();
  const { results, horizonYear, stepUp, narrative } = s;
  const winner = narrative?.winner ?? "tie";

  return (
    <section aria-labelledby="scoreboard-heading">
      <h2 id="scoreboard-heading" className="display text-ink mb-5 text-2xl sm:text-3xl">
        The scoreboard at {horizonYear}
      </h2>
      <div className="summary-scoreboard-grid grid gap-4 md:grid-cols-3">
        {STRATEGY_ORDER.map((strategy, i) => {
          const h = results[strategy].horizon;
          const isWinner = winner === strategy;
          const liquidated: Cents = stepUp ? h.netWorthLiquidatedWithStepUp : h.netWorthLiquidated;
          const trace = (
            kind: "netWorthAfterTax" | "cumulativeTaxes" | "deferredTax",
          ): TraceRef => ({
            kind,
            strategy,
            year: horizonYear,
          });
          return (
            <motion.article
              key={strategy}
              aria-label={`${STRATEGY_LABEL[strategy]} results`}
              className={cn(
                "card-raised relative flex flex-col p-5 lg:p-6",
                isWinner && "border-accent shadow-[0_0_0_1px_var(--accent),var(--shadow-md)]",
              )}
              initial={{ opacity: 0, y: reduce ? 0 : 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: reduce ? 0 : 0.5,
                delay: reduce ? 0 : 0.08 * i,
                ease: [0.22, 1, 0.36, 1],
              }}
            >
              <div className={cn("mb-3 h-6 items-center", isWinner ? "flex" : "hidden md:flex")}>
                {isWinner && (
                  <span className="bg-accent-soft text-accent inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[0.6875rem] font-semibold">
                    <AwardIcon size={13} />
                    Highest net worth
                  </span>
                )}
              </div>
              <header className="min-h-[4.25rem]">
                <div className="flex items-center gap-2.5">
                  <StrategyKey strategy={strategy} />
                  <h3 className="text-ink text-base font-semibold">{STRATEGY_LABEL[strategy]}</h3>
                </div>
                <p className="text-ink-3 mt-1.5 text-xs leading-relaxed">
                  {STRATEGY_BLURB[strategy]}
                </p>
              </header>

              <div className="border-line mt-5 border-b pb-5">
                <p className="eyebrow">Net worth if liquidated</p>
                <p className="display text-ink mt-2.5 text-[2rem] leading-none sm:text-[2.25rem]">
                  <Money
                    cents={liquidated}
                    trace={{ kind: "netWorthLiquidated", strategy, year: horizonYear, stepUp }}
                  />
                </p>
                <p className="text-ink-3 mt-2 text-xs">
                  After selling costs{stepUp ? " and with a basis step-up" : " and deferred taxes"}
                </p>
              </div>

              <dl className="divide-line divide-y">
                <Row label="After-tax net worth">
                  <Money cents={h.netWorthAfterTax} trace={trace("netWorthAfterTax")} />
                </Row>
                <Row label="Cumulative taxes paid">
                  <Money cents={h.cumulativeTaxesPaid} trace={trace("cumulativeTaxes")} />
                </Row>
                <Row
                  label="Deferred tax still owed"
                  hint={
                    stepUp && h.deferredTaxLiability > 0
                      ? "Erased by the step-up in basis"
                      : stepUp
                        ? "Nothing deferred"
                        : undefined
                  }
                >
                  {stepUp ? (
                    <span className="inline-flex flex-col items-end">
                      <Money cents={0} />
                      {h.deferredTaxLiability > 0 && (
                        <span className="text-ink-3 decoration-ink-3 mt-0.5 text-xs font-normal line-through">
                          <Money
                            cents={h.deferredTaxLiability}
                            trace={trace("deferredTax")}
                            tween={false}
                            className="text-ink-3"
                          />
                        </span>
                      )}
                    </span>
                  ) : (
                    <Money
                      cents={h.deferredTaxLiability}
                      trace={trace("deferredTax")}
                      className="text-amber"
                    />
                  )}
                </Row>
                <Row label="Present value of net worth" hint="Discounted to today">
                  <Money
                    cents={h.presentValueOfLiquidatedNetWorth}
                    trace={{ kind: "presentValue", strategy }}
                  />
                </Row>
                <Row label="Cumulative after-tax cash flow">
                  <Money cents={h.cumulativeCashFlowAfterTax} />
                </Row>
              </dl>
            </motion.article>
          );
        })}
      </div>
    </section>
  );
}
