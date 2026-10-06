"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Money } from "@/components/math/Fig";
import type { SaleSummary } from "@/engine/types";
import { fmtPercent } from "@/lib/format";

interface Segment {
  key: string;
  label: string;
  cents: number;
  color: string;
  trace?: Parameters<typeof Money>[0]["trace"];
}

/**
 * "Of every sale dollar": the sale price re-cut as 100 cents and split into what repays lenders,
 * what the closing table takes, what the IRS and state take, and what you keep. The proportions
 * are display ratios of engine amounts; no tax math happens here.
 */
export function SaleDollarBar({ sale }: { sale: SaleSummary | null }) {
  const reduce = useReducedMotion();
  if (!sale || sale.totalSalePrice <= 0) return null;

  const t = sale.tax;
  const year = sale.year;
  const positiveTax = (c: number) => Math.max(0, c);
  const benefit = Math.max(0, -t.ordinaryLossBenefit);
  const keep = Math.max(0, sale.netProceedsAfterTax);
  const all: Segment[] = [
    {
      key: "keep",
      label: "You keep",
      cents: keep,
      color: "var(--accent)",
      trace: { kind: "netProceeds", strategy: "sell" },
    },
    {
      key: "payoff",
      label: "Repays lenders",
      cents: sale.totalLoanPayoff,
      color: "var(--cost)",
      trace: { kind: "netProceeds", strategy: "sell" },
    },
    {
      key: "costs",
      label: "Selling costs",
      cents: sale.totalSellingCosts,
      color: "color-mix(in srgb, var(--cost) 55%, var(--surface))",
      trace: { kind: "netProceeds", strategy: "sell" },
    },
    {
      key: "recapture",
      label: "Depreciation recapture",
      cents: positiveTax(t.depreciationRecaptureTax),
      color: "var(--tax-1)",
      trace: { kind: "recaptureTax", strategy: "sell", year },
    },
    {
      key: "gains",
      label: "Capital gains",
      cents: positiveTax(t.capitalGainsTax),
      color: "var(--tax-2)",
      trace: { kind: "capitalGainsTax", strategy: "sell", year },
    },
    {
      key: "niit",
      label: "NIIT",
      cents: positiveTax(t.netInvestmentIncomeTax),
      color: "var(--tax-3)",
      trace: { kind: "niit", strategy: "sell", year },
    },
    {
      key: "state",
      label: "State",
      cents: positiveTax(t.stateTax),
      color: "var(--tax-4)",
      trace: { kind: "stateTax", strategy: "sell", year },
    },
  ];
  const segments = all.filter((s) => s.cents > 0);

  const total = segments.reduce((sum, s) => sum + s.cents, 0);
  if (total <= 0) return null;
  const share = (c: number) => c / total;
  const taxCents = segments
    .filter((s) => ["recapture", "gains", "niit", "state"].includes(s.key))
    .reduce((sum, s) => sum + s.cents, 0);
  const underwater = sale.netProceedsAfterTax < 0;
  const keepCents = Math.round(share(keep) * 100);

  return (
    <section className="card p-5 sm:p-6" aria-label="Where each sale dollar goes">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-x-8 gap-y-2">
        <div>
          <p className="eyebrow mb-2">Of every sale dollar · {year}</p>
          <h3 className="display text-ink text-2xl leading-tight sm:text-3xl">
            {underwater ? (
              <>The sale does not cover its debt, costs and tax</>
            ) : (
              <>
                You keep <span className="text-accent">{keepCents}¢</span>, taxes take{" "}
                <span className="text-amber">{Math.round(share(taxCents) * 100)}¢</span>
              </>
            )}
          </h3>
        </div>
        <p className="text-ink-3 max-w-sm text-sm leading-relaxed">
          Taxes are {fmtPercent(share(taxCents), 1)} of the sale price and{" "}
          {fmtPercent(keep + taxCents > 0 ? taxCents / (keep + taxCents) : 0, 0)} of what is left
          after the lenders and closing costs.
          {benefit > 0
            ? " A loss on the sale lowers tax elsewhere; that benefit is included in what you keep."
            : ""}
        </p>
      </div>

      <div
        role="img"
        aria-label={segments
          .map((s) => `${s.label} ${Math.round(share(s.cents) * 100)} cents`)
          .join(", ")}
        className="flex h-11 w-full gap-[2px] overflow-hidden rounded-xl"
      >
        {segments.map((s, i) => (
          <motion.div
            key={s.key}
            title={`${s.label}: ${fmtPercent(share(s.cents), 1)}`}
            className="h-full origin-left"
            style={{
              background: s.color,
              flexGrow: share(s.cents) * 1000,
              flexBasis: 0,
              minWidth: 3,
            }}
            initial={{ scaleX: 0, opacity: 0 }}
            animate={{ scaleX: 1, opacity: 1 }}
            transition={{
              duration: reduce ? 0 : 0.7,
              delay: reduce ? 0 : 0.08 * i,
              ease: [0.22, 1, 0.36, 1],
            }}
          />
        ))}
      </div>

      <ul className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3 xl:grid-cols-4">
        {segments.map((s) => (
          <li key={s.key} className="flex items-start gap-2.5">
            <span
              className="mt-1 size-2.5 shrink-0 rounded-[3px]"
              style={{ background: s.color }}
              aria-hidden="true"
            />
            <span className="min-w-0">
              <span className="text-ink-3 block text-xs">{s.label}</span>
              <span className="num text-ink block text-sm font-medium">
                {(share(s.cents) * 100).toFixed(1)}¢ · <Money cents={s.cents} trace={s.trace} />
              </span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
