"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Money } from "@/components/math/Fig";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { Chip } from "@/components/ui/primitives";
import { formatIsoLong } from "@/engine/format";
import type { ScenarioResults, StrategyKind, Year, YearRow } from "@/engine/types";
import { cn } from "@/lib/cn";
import { fmtMoney, fmtSigned } from "@/lib/format";
import {
  STRATEGY_BLURB,
  STRATEGY_COLOR,
  STRATEGY_DASH,
  STRATEGY_LABEL,
  STRATEGY_ORDER,
} from "@/lib/strategy";

function headline(row: YearRow, stepUp: boolean): number {
  return stepUp ? row.netWorthLiquidatedWithStepUp : row.netWorthLiquidated;
}

function Delta({ cents }: { cents: number }) {
  return (
    <AnimatedNumber
      value={cents}
      format={(v) => fmtSigned(Math.round(v))}
      className={cn(
        "num text-xs font-medium",
        cents > 0 ? "text-accent" : cents < 0 ? "text-ink-2" : "text-ink-3",
      )}
    />
  );
}

function Stat({
  label,
  children,
  tone,
}: {
  label: string;
  children: React.ReactNode;
  tone?: "amber";
}) {
  return (
    <div className="min-w-0">
      <dt className="text-ink-3 text-[0.6875rem] tracking-wide">{label}</dt>
      <dd
        className={cn(
          "num mt-0.5 text-sm font-medium",
          tone === "amber" ? "text-amber" : "text-ink",
        )}
      >
        {children}
      </dd>
    </div>
  );
}

function LaneCard({
  lane,
  results,
  year,
  horizonYear,
  stepUp,
  leader,
  index,
}: {
  lane: StrategyKind;
  results: ScenarioResults;
  year: Year;
  horizonYear: Year;
  stepUp: boolean;
  leader: boolean;
  index: number;
}) {
  const reduce = useReducedMotion();
  const res = results[lane];
  const row = res.years.find((y) => y.year === year) ?? res.years[res.years.length - 1];
  const holdRow =
    results.hold.years.find((y) => y.year === year) ??
    results.hold.years[results.hold.years.length - 1];
  if (!row || !holdRow) return null;
  const deferred = stepUp ? 0 : row.deferredTaxLiability;
  const sale = res.sale;
  const ex = res.exchange;

  return (
    <motion.article
      initial={{ opacity: 0, y: reduce ? 0 : 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        delay: reduce ? 0 : 0.06 * index,
        duration: reduce ? 0 : 0.45,
        ease: [0.22, 1, 0.36, 1],
      }}
      className={cn(
        "card relative flex flex-col overflow-hidden",
        leader && "ring-1 ring-[color-mix(in_srgb,var(--accent)_55%,transparent)]",
      )}
      aria-label={`${STRATEGY_LABEL[lane]} lane`}
    >
      <div className="h-1 w-full" style={{ background: STRATEGY_COLOR[lane] }} aria-hidden="true" />
      <div className="flex flex-1 flex-col p-5">
        <header className="mb-4 flex min-h-[4.25rem] items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="text-ink flex items-center gap-2 text-sm font-semibold">
              <svg width="22" height="10" aria-hidden="true">
                <line
                  x1="1"
                  y1="5"
                  x2="21"
                  y2="5"
                  stroke={STRATEGY_COLOR[lane]}
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeDasharray={STRATEGY_DASH[lane]}
                />
              </svg>
              {STRATEGY_LABEL[lane]}
            </h3>
            <p className="text-ink-3 mt-1 text-xs leading-relaxed">{STRATEGY_BLURB[lane]}</p>
          </div>
          {leader && (
            <Chip tone="accent">
              <svg width="11" height="11" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path
                  d="m3.5 8.5 3 3 6-7"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              Leads
            </Chip>
          )}
        </header>

        <p className="eyebrow mb-1.5">Net worth if liquidated · {year}</p>
        <p className="display text-ink text-[2.1rem] leading-none">
          <Money
            cents={headline(row, stepUp)}
            trace={{ kind: "netWorthLiquidated", strategy: lane, year, stepUp }}
          />
        </p>
        <p className="mt-1.5 h-4">
          {lane === "hold" ? (
            <span className="text-ink-3 text-xs">The baseline</span>
          ) : (
            <span className="text-ink-3 flex items-center gap-1.5 text-xs">
              <Delta cents={headline(row, stepUp) - headline(holdRow, stepUp)} /> vs Hold
            </span>
          )}
        </p>

        <dl className="border-line mt-5 grid grid-cols-2 gap-x-4 gap-y-3 border-t pt-4">
          <Stat label="After-tax net worth">
            <Money
              cents={row.netWorthAfterTax}
              trace={{ kind: "netWorthAfterTax", strategy: lane, year }}
            />
          </Stat>
          <Stat label="Equity">
            <Money cents={row.equity} trace={{ kind: "equity", strategy: lane, year }} />
          </Stat>
          <Stat label="Taxes paid to date">
            <Money
              cents={row.cumulativeTaxesPaid}
              trace={{ kind: "cumulativeTaxes", strategy: lane, year }}
            />
          </Stat>
          <Stat label={stepUp ? "Deferred tax (stepped up)" : "Deferred tax owed"} tone="amber">
            <Money cents={deferred} trace={{ kind: "deferredTax", strategy: lane, year }} />
          </Stat>
          <Stat label="Cash flow after tax">
            <Money
              cents={row.cashFlowAfterTax}
              trace={{ kind: "cashFlow", strategy: lane, year }}
            />
          </Stat>
          <Stat label="Cash and funds held">
            <Money
              cents={row.cashBalance + row.intermediaryFunds}
              trace={{ kind: "cashAccount", strategy: lane, year }}
            />
          </Stat>
        </dl>
        <div className="min-h-4 flex-1" aria-hidden="true" />

        {lane === "sell" && (
          <div className="bg-surface-2 text-ink-2 mt-4 rounded-xl p-3.5 text-xs leading-relaxed">
            {sale ? (
              <>
                Sold in {sale.year}: gain{" "}
                <Money
                  cents={sale.totalGain}
                  trace={{ kind: "gainSplit", strategy: "sell" }}
                  className="text-ink font-medium"
                />
                , tax{" "}
                <Money
                  cents={sale.tax.total}
                  trace={{ kind: "saleTaxTotal", strategy: "sell", year: sale.year }}
                  className="text-amber font-medium"
                />
                , net proceeds{" "}
                <Money
                  cents={sale.netProceedsAfterTax}
                  trace={{ kind: "netProceeds", strategy: "sell" }}
                  className="text-ink font-medium"
                />
                .
              </>
            ) : (
              "No properties selected to sell."
            )}
          </div>
        )}
        {lane === "exchange" && (
          <div className="bg-surface-2 text-ink-2 mt-4 rounded-xl p-3.5 text-xs leading-relaxed">
            {!ex ? (
              "No properties selected to exchange."
            ) : !ex.completed ? (
              <span className="text-amber">
                A deadline is missed (identify by{" "}
                {formatIsoLong(ex.timeline.identificationDeadline)}, close by{" "}
                {formatIsoLong(ex.timeline.exchangeDeadline)}), so the exchange fails and the sale
                is fully taxable.
              </span>
            ) : (
              <>
                Defers{" "}
                <Money
                  cents={ex.boot.deferredGain}
                  trace={{ kind: "deferredGain" }}
                  className="text-ink font-medium"
                />{" "}
                of gain
                {ex.boot.totalBoot > 0 ? (
                  <>
                    ;{" "}
                    <Money
                      cents={ex.boot.totalBoot}
                      trace={{ kind: "boot" }}
                      className="text-amber font-medium"
                    />{" "}
                    boot is taxable now
                  </>
                ) : (
                  <> with no boot</>
                )}
                . Replacement basis{" "}
                <Money
                  cents={ex.boot.replacementBasis}
                  trace={{ kind: "replacementBasis" }}
                  className="text-ink font-medium"
                />
                , closing {formatIsoLong(ex.timeline.replacementClosing)}.
              </>
            )}
          </div>
        )}
        {lane === "hold" && (
          <div className="bg-surface-2 text-ink-2 mt-4 rounded-xl p-3.5 text-xs leading-relaxed">
            Depreciation taken so far:{" "}
            <Money cents={row.accumulatedDepreciation} className="text-ink font-medium" />. Selling
            everything in {year} would cost{" "}
            <span className="num text-amber font-medium">
              {fmtMoney(row.liquidationSellingCosts)}
            </span>{" "}
            in selling costs and trigger the deferred tax above.
          </div>
        )}
        <p className="sr-only">Horizon year is {horizonYear}.</p>
      </div>
    </motion.article>
  );
}

export function LaneCards({
  results,
  year,
  horizonYear,
  stepUp,
}: {
  results: ScenarioResults;
  year: Year;
  horizonYear: Year;
  stepUp: boolean;
}) {
  const values = STRATEGY_ORDER.map((k) => {
    const row =
      results[k].years.find((y) => y.year === year) ??
      results[k].years[results[k].years.length - 1];
    return { k, v: row ? headline(row, stepUp) : 0 };
  });
  const max = Math.max(...values.map((x) => x.v));
  const min = Math.min(...values.map((x) => x.v));
  const noLeader = max === min;
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {STRATEGY_ORDER.map((lane, i) => (
        <LaneCard
          key={lane}
          lane={lane}
          index={i}
          results={results}
          year={year}
          horizonYear={horizonYear}
          stepUp={stepUp}
          leader={!noLeader && values.find((x) => x.k === lane)?.v === max}
        />
      ))}
    </div>
  );
}
