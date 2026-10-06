"use client";

import { motion, useReducedMotion } from "framer-motion";
import type { Cents } from "@/engine/money";
import { simulateStrategy } from "@/engine/simulate";
import type { Household, Year } from "@/engine/types";
import { Money } from "@/components/math/Fig";
import { Button } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";
import { CheckIcon, ErrorIcon, WarnIcon } from "./ui";

// ───────────────────────────── Live preview ─────────────────────────────

export interface Preview {
  horizonYear: Year;
  /** Hold net worth if everything were liquidated at the horizon. */
  netWorth: Cents;
  /** Net operating income in the first projection year. */
  noiYear1: Cents;
  propertyValue: Cents;
  debt: Cents;
  equity: Cents;
  equityByProperty: ReadonlyMap<string, Cents>;
}

/** Runs the Hold strategy for a valid draft. Never throws: returns null if the engine objects. */
export function computePreview(draft: Household): Preview | null {
  try {
    const r = simulateStrategy(draft, { kind: "hold" });
    const open = r.years[0];
    if (!open) return null;
    const equityByProperty = new Map<string, Cents>();
    for (const p of r.properties) {
      const row = p.rows[0];
      if (row) equityByProperty.set(p.id, row.equity);
    }
    return {
      horizonYear: r.horizon.year,
      netWorth: r.horizon.netWorthLiquidated,
      noiYear1: r.years[1]?.noi ?? 0,
      propertyValue: open.propertyValue,
      debt: open.loanBalance,
      equity: open.equity,
      equityByProperty,
    };
  } catch {
    return null;
  }
}

/** Sticky "Portfolio snapshot" card. */
export function Snapshot({
  preview,
  valid,
  className,
}: {
  preview: Preview | null;
  valid: boolean;
  className?: string;
}) {
  const showing = valid && preview !== null;
  const share =
    showing && preview.propertyValue > 0
      ? Math.max(0, Math.min(100, (preview.equity / preview.propertyValue) * 100))
      : 0;
  return (
    <aside aria-label="Portfolio snapshot" className={cn("card-raised p-5", className)}>
      <p className="eyebrow">Portfolio snapshot</p>
      {showing ? (
        <>
          <p className="text-ink-3 mt-4 text-xs">
            Hold net worth in {preview.horizonYear}, if liquidated
          </p>
          <p className="display num text-ink mt-1 text-[2rem] leading-none">
            <Money cents={preview.netWorth} />
          </p>
          <dl className="border-line mt-5 space-y-2.5 border-t pt-4 text-sm">
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-ink-2">First-year NOI</dt>
              <dd className="text-ink font-medium">
                <Money cents={preview.noiYear1} />
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-ink-2">Equity today</dt>
              <dd className="text-ink font-medium">
                <Money cents={preview.equity} />
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-ink-2">Debt today</dt>
              <dd className="text-ink font-medium">
                <Money cents={preview.debt} />
              </dd>
            </div>
          </dl>
          <div
            role="img"
            aria-label={`Equity is ${Math.round(share)} percent of property value`}
            className="bg-line-strong mt-4 flex h-1.5 overflow-hidden rounded-full"
          >
            <div
              className="bg-accent h-full rounded-full transition-[width] duration-500"
              style={{ width: `${share}%` }}
            />
          </div>
          <p className="text-ink-3 mt-2 text-[0.6875rem] leading-snug">
            Equity share of property value. Updates as you type.
          </p>
        </>
      ) : (
        <div className="mt-4">
          <p className="text-ink-2 flex items-start gap-2 text-sm leading-snug">
            <ErrorIcon size={15} className="text-ink-3 mt-0.5 shrink-0" />
            Fix the highlighted fields to preview.
          </p>
          <div aria-hidden="true" className="mt-5 space-y-3 opacity-60">
            <div className="skeleton h-8 w-40" />
            <div className="skeleton h-3.5 w-full" />
            <div className="skeleton h-3.5 w-5/6" />
            <div className="skeleton h-3.5 w-4/6" />
          </div>
        </div>
      )}
    </aside>
  );
}

// ───────────────────────────── Summary bar ─────────────────────────────

export const RUN_SWEEP_MS = 1100;

function Stat({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <p className="eyebrow whitespace-nowrap">{label}</p>
      <p className="num text-ink mt-1.5 text-[0.95rem] font-medium whitespace-nowrap sm:text-base">
        {children}
      </p>
    </div>
  );
}

export function SummaryBar({
  propertyCount,
  totalValue,
  debt,
  errors,
  warnings,
  running,
  onRun,
  onApply,
  notice,
}: {
  propertyCount: number;
  totalValue: Cents;
  /** Null when the draft cannot be simulated yet. */
  debt: Cents | null;
  errors: number;
  warnings: number;
  running: boolean;
  onRun: () => void;
  /** Present only when an existing scenario can be updated in place. */
  onApply?: () => void;
  /** An inline message (for example the undo bar) stacked above the bar. */
  notice?: React.ReactNode;
}) {
  const reduce = useReducedMotion();
  const blocked = errors > 0;
  return (
    <div
      role="region"
      aria-label="Household summary"
      className="no-print sticky bottom-4 z-30 mt-10 space-y-2.5"
    >
      {notice}
      <div className="border-line-strong shadow-pop relative overflow-hidden rounded-2xl border bg-[color-mix(in_srgb,var(--surface)_88%,transparent)] backdrop-blur-xl">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3 sm:px-6 sm:py-3.5">
          <div className="flex min-w-0 flex-1 items-center gap-4 sm:gap-6 lg:gap-8">
            <Stat label="Properties" className="hidden sm:block">
              {propertyCount}
            </Stat>
            <Stat label="Total value">
              <Money cents={totalValue} />
            </Stat>
            <Stat label="Total debt" className="hidden sm:block">
              {debt === null ? "—" : <Money cents={debt} />}
            </Stat>
            <div className={cn("shrink-0", !blocked && warnings === 0 && "hidden lg:block")}>
              <p className="eyebrow">Status</p>
              <p
                className={cn(
                  "mt-1.5 flex items-center gap-1.5 text-sm font-medium",
                  blocked ? "text-danger" : warnings > 0 ? "text-amber" : "text-accent",
                )}
              >
                {blocked ? (
                  <ErrorIcon size={14} />
                ) : warnings > 0 ? (
                  <WarnIcon size={14} />
                ) : (
                  <CheckIcon size={14} />
                )}
                {blocked
                  ? `${errors} ${errors === 1 ? "error" : "errors"}`
                  : warnings > 0
                    ? `${warnings} ${warnings === 1 ? "warning" : "warnings"}`
                    : "Ready to run"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {onApply && (
              <span className="hidden md:block">
                <Button onClick={onApply} disabled={blocked || running}>
                  Apply to current scenario
                </Button>
              </span>
            )}
            <Button
              variant="primary"
              size="lg"
              onClick={onRun}
              disabled={blocked || running}
              aria-describedby={blocked ? "build-run-blocked" : undefined}
            >
              {running ? "Preparing your lab" : "Run the simulation"}
              {!running && (
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path
                    d="M3 8h9.5M8.8 4.2 12.6 8l-3.8 3.8"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
            </Button>
          </div>
        </div>
        <p id="build-run-blocked" className="sr-only">
          Fix the errors above to run the simulation.
        </p>
        {running && (
          <>
            <motion.div
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 w-1/2 bg-gradient-to-r from-transparent via-[var(--accent-soft)] to-transparent"
              initial={{ x: "-60%" }}
              animate={{ x: "220%" }}
              transition={{ duration: reduce ? 0 : 0.9, ease: "easeInOut", repeat: reduce ? 0 : 1 }}
            />
            <motion.div
              aria-hidden="true"
              className="bg-accent absolute inset-x-0 bottom-0 h-[3px] origin-left"
              initial={{ scaleX: reduce ? 1 : 0 }}
              animate={{ scaleX: 1 }}
              transition={{ duration: reduce ? 0 : RUN_SWEEP_MS / 1000, ease: [0.4, 0, 0.2, 1] }}
            />
          </>
        )}
      </div>
    </div>
  );
}
