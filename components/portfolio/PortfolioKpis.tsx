"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Money } from "@/components/math/Fig";
import type { Cents, Rate, Year, YearRow } from "@/engine/types";

function Stat({
  label,
  caption,
  children,
  index,
}: {
  label: string;
  caption: string;
  children: React.ReactNode;
  index: number;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial={{ opacity: 0, y: reduce ? 0 : 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: reduce ? 0 : 0.5,
        delay: reduce ? 0 : 0.05 * index,
        ease: [0.22, 1, 0.36, 1],
      }}
      className="bg-surface min-w-0 px-5 py-5"
    >
      <p className="eyebrow">{label}</p>
      <p className="display text-ink mt-3 text-[1.7rem] leading-none sm:text-[2rem]">{children}</p>
      <p className="text-ink-3 mt-2 text-xs leading-snug">{caption}</p>
    </motion.div>
  );
}

/**
 * The portfolio's balance sheet and tax exposure at the scrubber year: four calm balance-sheet
 * stats plus an amber tax panel that makes recapture exposure the headline risk.
 */
export function PortfolioKpis({
  row,
  year,
  recapture,
  recaptureTax,
  ceilingRate,
}: {
  row: YearRow;
  year: Year;
  recapture: Cents;
  recaptureTax: Cents;
  ceilingRate: Rate;
}) {
  const reduce = useReducedMotion();
  return (
    <section aria-label={`Portfolio at the end of ${year}`} className="space-y-4">
      <div className="card-raised bg-line grid grid-cols-2 gap-px overflow-hidden xl:grid-cols-4">
        <Stat index={0} label="Portfolio value" caption="Market value of every property">
          <Money cents={row.propertyValue} />
        </Stat>
        <Stat index={1} label="Equity" caption="Value less loan balances">
          <Money cents={row.equity} trace={{ kind: "equity", strategy: "hold", year }} />
        </Stat>
        <Stat index={2} label="Debt" caption="Mortgages, interest-only and HELOC">
          <Money cents={row.loanBalance} />
        </Stat>
        <Stat index={3} label="Depreciation taken" caption="Cumulative, all properties">
          <Money cents={row.accumulatedDepreciation} />
        </Stat>
      </div>

      <motion.div
        initial={{ opacity: 0, y: reduce ? 0 : 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{
          duration: reduce ? 0 : 0.5,
          delay: reduce ? 0 : 0.2,
          ease: [0.22, 1, 0.36, 1],
        }}
        className="bg-amber-soft grid gap-5 rounded-[1.25rem] border border-[color-mix(in_srgb,var(--amber)_32%,transparent)] px-5 py-5 sm:grid-cols-2 sm:px-6"
      >
        <div className="min-w-0">
          <p className="eyebrow text-amber">Estimated recapture exposure</p>
          <p className="display text-amber mt-3 text-[2rem] leading-none sm:text-[2.4rem]">
            <Money cents={recapture} />
          </p>
          <p className="text-ink-2 mt-2 text-xs leading-snug">
            × {Math.round(ceilingRate * 100)}% max rate ≈{" "}
            <Money cents={recaptureTax} className="text-amber font-semibold" />
          </p>
        </div>
        <div className="min-w-0 border-t border-[color-mix(in_srgb,var(--amber)_28%,transparent)] pt-5 sm:border-t-0 sm:border-l sm:pt-0 sm:pl-6">
          <p className="eyebrow text-amber">Deferred tax if all sold</p>
          <p className="display text-amber mt-3 text-[2rem] leading-none sm:text-[2.4rem]">
            <Money
              cents={row.deferredTaxLiability}
              trace={{ kind: "deferredTax", strategy: "hold", year }}
            />
          </p>
          <p className="text-ink-2 mt-2 text-xs leading-snug">
            Federal, NIIT and state, on a sale at year end
          </p>
        </div>
      </motion.div>
    </section>
  );
}
