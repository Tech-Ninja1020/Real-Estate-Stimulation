"use client";

import { useEffect, useState } from "react";
import { flushSync } from "react-dom";
import { Money } from "@/components/math/Fig";
import { cn } from "@/lib/cn";
import { STRATEGY_LABEL, STRATEGY_ORDER } from "@/lib/strategy";
import { ChevronIcon, StrategyKey } from "./icons";
import type { LoadedScenario } from "./types";

/** Which projection years to list: every year up to a 10-year horizon, otherwise every 2 to 5 years, plus the sale year and horizon. */
function checkpointYears(asOfYear: number, horizonYears: number, sellYear: number): number[] {
  const step = horizonYears <= 10 ? 1 : horizonYears <= 20 ? 2 : 5;
  const years = new Set<number>();
  for (let t = 0; t <= horizonYears; t += step) years.add(asOfYear + t);
  years.add(asOfYear + horizonYears);
  if (sellYear >= asOfYear && sellYear <= asOfYear + horizonYears) years.add(sellYear);
  return [...years].sort((a, b) => a - b);
}

export function YearTable({ s }: { s: LoadedScenario }) {
  const { household, config, results, stepUp, horizonYear } = s;
  const asOf = household.market.asOfYear;
  const years = checkpointYears(asOf, household.investor.horizonYears, config.sellYear);
  const [open, setOpen] = useState(false);

  // Always expanded when printing.
  useEffect(() => {
    let previous = false;
    const before = () => {
      previous = open;
      flushSync(() => setOpen(true));
    };
    const after = () => setOpen(previous);
    window.addEventListener("beforeprint", before);
    window.addEventListener("afterprint", after);
    return () => {
      window.removeEventListener("beforeprint", before);
      window.removeEventListener("afterprint", after);
    };
  }, [open]);

  const rowFor = (strategy: (typeof STRATEGY_ORDER)[number], year: number) =>
    results[strategy].years.find((r) => r.year === year);

  return (
    <details
      className="summary-year-details card group overflow-hidden"
      open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-5 select-none sm:px-8 [&::-webkit-details-marker]:hidden">
        <span>
          <span className="display text-ink block text-xl sm:text-2xl">Year by year</span>
          <span className="text-ink-2 mt-1 block text-sm">
            Net worth if liquidated{stepUp ? ", with step-up in basis" : ""}, at each checkpoint
          </span>
        </span>
        <span className="no-print text-ink-3 inline-flex items-center gap-2 text-xs font-medium">
          <span className="group-open:hidden">Show table</span>
          <span className="hidden group-open:inline">Hide table</span>
          <ChevronIcon className="transition-transform group-open:rotate-180" />
        </span>
      </summary>
      <div className="border-line overflow-x-auto border-t">
        <table className="w-full min-w-[34rem] border-collapse text-sm">
          <caption className="sr-only">Net worth if liquidated by strategy and year</caption>
          <thead>
            <tr className="text-left">
              <th scope="col" className="eyebrow px-5 py-3.5 font-semibold sm:px-8">
                Year
              </th>
              {STRATEGY_ORDER.map((st) => (
                <th key={st} scope="col" className="px-4 py-3.5 text-right">
                  <span className="text-ink-2 inline-flex items-center justify-end gap-2 text-xs font-semibold">
                    <StrategyKey strategy={st} width={20} />
                    {STRATEGY_LABEL[st]}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {years.map((year) => {
              const values = STRATEGY_ORDER.map((st) => {
                const row = rowFor(st, year);
                return row
                  ? stepUp
                    ? row.netWorthLiquidatedWithStepUp
                    : row.netWorthLiquidated
                  : null;
              });
              const best = Math.max(...values.map((v) => v ?? -Infinity));
              const isSale = year === config.sellYear;
              const isHorizon = year === horizonYear;
              return (
                <tr
                  key={year}
                  className={cn("border-line border-t", isHorizon && "bg-surface-2 font-medium")}
                  style={{ breakInside: "avoid" }}
                >
                  <th scope="row" className="num text-ink px-5 py-3 text-left font-medium sm:px-8">
                    {year}
                    {year === asOf && (
                      <span className="text-ink-3 ml-2 text-xs font-normal">Today</span>
                    )}
                    {isSale && (
                      <span className="bg-amber-soft text-amber ml-2 rounded-full px-2 py-0.5 text-[0.6875rem] font-medium">
                        Sale year
                      </span>
                    )}
                    {isHorizon && (
                      <span className="text-ink-3 ml-2 text-xs font-normal">Horizon</span>
                    )}
                  </th>
                  {STRATEGY_ORDER.map((st, i) => {
                    const v = values[i] ?? null;
                    return (
                      <td
                        key={st}
                        className={cn(
                          "num px-4 py-3 text-right",
                          v !== null && v === best ? "text-ink font-semibold" : "text-ink-2",
                        )}
                      >
                        {v === null ? (
                          "n/a"
                        ) : (
                          <Money
                            cents={v}
                            tween={false}
                            trace={{ kind: "netWorthLiquidated", strategy: st, year, stepUp }}
                          />
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="border-line text-ink-3 border-t px-5 py-3 text-xs sm:px-8">
          Bold marks the highest figure in each year.
        </p>
      </div>
    </details>
  );
}
