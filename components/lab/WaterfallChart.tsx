"use client";

import { scaleLinear } from "d3-scale";
import { motion } from "framer-motion";
import { useMemo, useState } from "react";
import type { TraceRef } from "@/engine/explain";
import type { Cents, SaleSummary } from "@/engine/types";
import { ChartFrame, type LegendItem } from "@/components/charts/ChartFrame";
import { Money, Pct } from "@/components/math/Fig";
import { Chip } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";
import { fmtCompact, fmtMoney } from "@/lib/format";
import { useChartSize } from "@/lib/use-chart-size";
import { useEntrance } from "./money-flow/use-entrance";

export interface WaterfallChartProps {
  /** results.sell.sale. null means no sale is selected. */
  sale: SaleSummary | null;
  /** The waterfall is for the SELL strategy. */
  strategy?: "sell";
}

type StepRole = "total" | "cost" | "tax" | "benefit";

interface Step {
  key: string;
  label: string;
  caption: string;
  role: StepRole;
  fill: string;
  /** Running total before this step (totals start at 0). */
  from: Cents;
  /** Running total after this step. */
  to: Cents;
  /** Signed amount shown beside the bar. */
  shown: Cents;
  trace: TraceRef;
}

const ROW_H = 52;
const BAR_H = 24;
const LABEL_W = 212;
const VALUE_W = 120;
const AXIS_H = 26;
const CALLOUT_H = 92;

function buildSteps(sale: SaleSummary, strategy: "sell"): { steps: Step[]; chainExact: boolean } {
  const { tax } = sale;
  const steps: Step[] = [];
  let running: Cents = 0;

  const total = (
    key: string,
    label: string,
    caption: string,
    value: Cents,
    fill: string,
    trace: TraceRef,
  ) => {
    steps.push({
      key,
      label,
      caption,
      role: "total",
      fill,
      from: 0,
      to: value,
      shown: value,
      trace,
    });
    running = value;
  };
  const delta = (
    key: string,
    label: string,
    caption: string,
    role: StepRole,
    fill: string,
    change: Cents,
    trace: TraceRef,
  ) => {
    steps.push({
      key,
      label,
      caption,
      role,
      fill,
      from: running,
      to: running + change,
      shown: change,
      trace,
    });
    running += change;
  };

  const netTrace: TraceRef = { kind: "netProceeds", strategy };
  total(
    "price",
    "Sale price",
    "All properties sold",
    sale.totalSalePrice,
    "var(--ink-2)",
    netTrace,
  );
  delta(
    "costs",
    "Selling costs",
    "Commissions and closing costs",
    "cost",
    "var(--cost)",
    -sale.totalSellingCosts,
    netTrace,
  );
  delta(
    "payoff",
    "Loan payoff",
    "Mortgage balances repaid",
    "cost",
    "var(--cost)",
    -sale.totalLoanPayoff,
    netTrace,
  );
  delta(
    "recapture",
    "Depreciation recapture tax",
    "Taxed at up to 25%",
    "tax",
    "var(--tax-1)",
    -tax.depreciationRecaptureTax,
    { kind: "recaptureTax", strategy, year: sale.year },
  );
  delta(
    "capgains",
    "Capital gains tax",
    "Long-term rates on the rest",
    "tax",
    "var(--tax-2)",
    -tax.capitalGainsTax,
    {
      kind: "capitalGainsTax",
      strategy,
      year: sale.year,
    },
  );
  delta(
    "niit",
    "Net investment income tax",
    "Medicare surtax",
    "tax",
    "var(--tax-3)",
    -tax.netInvestmentIncomeTax,
    {
      kind: "niit",
      strategy,
      year: sale.year,
    },
  );
  delta(
    "state",
    "State tax",
    "State income tax on the sale",
    "tax",
    "var(--tax-4)",
    -tax.stateTax,
    {
      kind: "stateTax",
      strategy,
      year: sale.year,
    },
  );
  if (tax.ordinaryLossBenefit !== 0) {
    // The engine reports a benefit as a negative tax, so the step up is its negation.
    delta(
      "loss",
      "Loss benefit",
      "Section 1231 loss offsets income",
      "benefit",
      "var(--accent)",
      -tax.ordinaryLossBenefit,
      {
        kind: "saleTaxTotal",
        strategy,
        year: sale.year,
      },
    );
  }
  const chainExact = running === sale.netProceedsAfterTax;
  total(
    "net",
    "Net proceeds",
    "What you keep after tax",
    sale.netProceedsAfterTax,
    sale.netProceedsAfterTax < 0 ? "var(--danger)" : "var(--accent)",
    netTrace,
  );
  return { steps, chainExact };
}

function EmptyCard() {
  return (
    <section className="card flex flex-col items-center gap-3 px-6 py-14 text-center">
      <svg
        width="44"
        height="44"
        viewBox="0 0 44 44"
        fill="none"
        aria-hidden="true"
        className="text-ink-3"
      >
        <rect x="6" y="9" width="32" height="6" rx="3" fill="currentColor" opacity="0.35" />
        <rect x="6" y="19" width="22" height="6" rx="3" fill="currentColor" opacity="0.25" />
        <rect x="6" y="29" width="12" height="6" rx="3" fill="currentColor" opacity="0.18" />
      </svg>
      <h3 className="display text-ink text-xl">Where did the money go?</h3>
      <p className="text-ink-3 max-w-sm text-sm leading-relaxed">
        No sale in this strategy. Select properties to sell in the Scenario Lab controls.
      </p>
    </section>
  );
}

export function WaterfallChart({ sale, strategy = "sell" }: WaterfallChartProps) {
  if (!sale) return <EmptyCard />;
  return <WaterfallBody sale={sale} strategy={strategy} />;
}

function WaterfallBody({ sale, strategy }: { sale: SaleSummary; strategy: "sell" }) {
  const { steps, chainExact } = useMemo(() => buildSteps(sale, strategy), [sale, strategy]);
  const n = steps.length;
  const { barTransition, afterTransition, reduce } = useEntrance(n);
  const [ref, size] = useChartSize<HTMLDivElement>({ width: 0, height: 0 });
  const [hover, setHover] = useState<number | null>(null);

  const { tax } = sale;
  const isLoss = sale.totalGain < 0;
  const recaptureIdx = steps.findIndex((s) => s.key === "recapture");
  // Presentation-only ratios (guarded); the dollar figures all come from the engine.
  const recaptureShare = tax.total > 0 ? tax.depreciationRecaptureTax / tax.total : null;
  const taxOfGain = sale.totalGain > 0 ? tax.total / sale.totalGain : null;

  const width = size.width;
  const plotPad = 8;
  const x = useMemo(() => {
    const lows = steps.map((s) => Math.min(s.from, s.to));
    const highs = steps.map((s) => Math.max(s.from, s.to));
    const lo = Math.min(0, ...lows);
    const hi = Math.max(0, ...highs);
    return scaleLinear()
      .domain([lo, hi === lo ? lo + 1 : hi])
      .range([plotPad, Math.max(plotPad + 1, width - plotPad)]);
  }, [steps, width]);

  const ticks = useMemo(() => {
    const target = width < 420 ? 3 : 5;
    return x.ticks(target);
  }, [x, width]);

  const rowTop = (i: number) => i * ROW_H;
  const barY = (i: number) => rowTop(i) + (ROW_H - BAR_H) / 2;
  const geom = steps.map((s) => {
    const a = x(s.from);
    const b = x(s.to);
    const lo = Math.min(a, b);
    const w = Math.max(Math.abs(b - a), s.from === s.to ? 2 : 0);
    return { x: s.from === s.to ? a - 1 : lo, w };
  });

  // Callout for depreciation recapture: sits in the emptier side of the three rows beneath it.
  const callout = useMemo(() => {
    if (isLoss || recaptureIdx < 0 || width <= 0 || tax.depreciationRecaptureTax <= 0) return null;
    const below = steps.slice(recaptureIdx + 1, recaptureIdx + 4).filter((s) => s.role !== "total");
    if (below.length < 3) return null;
    const lo = Math.min(...below.map((s) => x(Math.min(s.from, s.to))));
    const hi = Math.max(...below.map((s) => x(Math.max(s.from, s.to))));
    const leftFree = lo - plotPad;
    const rightFree = width - plotPad - hi;
    const need = 214;
    const side = rightFree >= leftFree ? "right" : "left";
    const free = Math.max(leftFree, rightFree);
    if (free < need + 28) return null;
    const boxW = Math.min(268, free - 28);
    const boxX = side === "right" ? width - plotPad - boxW : plotPad + 10;
    const bar = steps[recaptureIdx];
    if (!bar) return null;
    const barLeft = x(Math.min(bar.from, bar.to));
    const barRight = x(Math.max(bar.from, bar.to));
    const startX = side === "right" ? barRight : barLeft;
    const startY = rowTop(recaptureIdx) + ROW_H / 2;
    const boxTop = rowTop(recaptureIdx + 1) + 8;
    const elbowX = Math.min(Math.max(boxX + boxW / 2, boxX + 24), boxX + boxW - 24);
    const dir = side === "right" ? 1 : -1;
    const path =
      Math.abs(elbowX - startX) < 4
        ? `M${startX},${startY} V${boxTop}`
        : `M${startX + dir * 4},${startY} H${elbowX} V${boxTop}`;
    return { boxX, boxW, boxTop, path, startX: startX + dir * 4, startY };
  }, [isLoss, recaptureIdx, width, steps, x, tax.depreciationRecaptureTax]);

  const legend: LegendItem[] = [
    { key: "totals", label: "Sale price and net proceeds", color: "var(--ink-2)", shape: "swatch" },
    { key: "costs", label: "Selling costs and loan payoff", color: "var(--cost)", shape: "swatch" },
    { key: "taxes", label: "Taxes", color: "var(--tax-2)", shape: "swatch" },
    ...(tax.ordinaryLossBenefit !== 0
      ? [
          {
            key: "benefit",
            label: "Loss benefit",
            color: "var(--accent)",
            shape: "swatch" as const,
          },
        ]
      : []),
  ];

  const tableRows = steps.map((s) => [s.label, fmtMoney(s.shown), fmtMoney(s.to)]);

  const chartLabel = `Waterfall from a ${fmtMoney(sale.totalSalePrice)} sale price to ${fmtMoney(sale.netProceedsAfterTax)} net proceeds after ${fmtMoney(
    sale.totalSellingCosts,
  )} selling costs, ${fmtMoney(sale.totalLoanPayoff)} loan payoff and ${fmtMoney(tax.total)} of tax.`;

  return (
    <div className="space-y-4">
      <ChartFrame
        title="Where did the money go?"
        subtitle={`From the ${fmtMoney(sale.totalSalePrice)} sale price in ${sale.year} down to what you keep: selling costs, the loan payoff, then each layer of tax.`}
        legend={legend}
        table={{
          caption: "Sale price to net proceeds, step by step",
          columns: ["Step", "Amount", "Running total"],
          rows: tableRows,
        }}
      >
        {isLoss && (
          <div className="bg-amber-soft text-amber mb-4 flex items-start gap-3 rounded-xl px-4 py-3 text-sm leading-relaxed">
            <svg
              width="18"
              height="18"
              viewBox="0 0 18 18"
              fill="none"
              aria-hidden="true"
              className="mt-0.5 shrink-0"
            >
              <path
                d="M9 2.5 16 15H2L9 2.5Z"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinejoin="round"
              />
              <path
                d="M9 7.5v3.2M9 12.6v.1"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
            </svg>
            <p>
              <span className="font-semibold">This sale is at a loss.</span> Under Section 1231, a
              net loss on property used in a rental business is treated as an ordinary loss
              {sale.classification.ordinaryLoss1231 > 0 && (
                <>
                  {" "}
                  of{" "}
                  <Money
                    cents={sale.classification.ordinaryLoss1231}
                    trace={{ kind: "gainSplit", strategy }}
                  />
                </>
              )}
              , so it can offset other income instead of being limited like a capital loss. There is
              no depreciation recapture to pay.
            </p>
          </div>
        )}

        <div
          className="relative"
          style={{ paddingBottom: AXIS_H }}
          onPointerLeave={() => setHover(null)}
        >
          {/* Row scaffolding: labels left, bars (SVG overlay) middle, clickable values right. */}
          <ul className="m-0 list-none p-0">
            {steps.map((s, i) => {
              const isRecapture = s.key === "recapture" && !isLoss;
              const strong = s.role === "total";
              return (
                <li
                  key={s.key}
                  onPointerEnter={() => setHover(i)}
                  className={cn(
                    "grid items-center rounded-lg transition-colors",
                    hover === i && "bg-surface-2",
                    isRecapture && hover !== i && "bg-amber-soft",
                  )}
                  style={{
                    gridTemplateColumns: `${LABEL_W}px minmax(0, 1fr) ${VALUE_W}px`,
                    height: ROW_H,
                  }}
                >
                  <div className="min-w-0 pr-3 pl-2">
                    <div
                      className={cn(
                        "truncate text-[13px] leading-tight",
                        strong ? "text-ink font-semibold" : "text-ink font-medium",
                      )}
                    >
                      {s.label}
                    </div>
                    <div className="text-ink-3 mt-0.5 truncate text-[11px] leading-tight">
                      {s.caption}
                    </div>
                  </div>
                  <div aria-hidden="true" />
                  <div
                    className={cn(
                      "pr-2 text-right text-sm",
                      strong ? "text-ink font-semibold" : s.shown === 0 ? "text-ink-3" : "text-ink",
                      s.role === "benefit" && "text-accent",
                    )}
                  >
                    <Money
                      cents={s.shown}
                      trace={s.trace}
                      className={strong ? "text-[15px]" : undefined}
                    />
                  </div>
                </li>
              );
            })}
          </ul>

          <div
            ref={ref}
            className="pointer-events-none absolute top-0 bottom-0"
            style={{ left: LABEL_W, right: VALUE_W }}
          >
            {width > 0 && (
              <svg
                width={width}
                height={n * ROW_H + AXIS_H}
                role="img"
                aria-label={chartLabel}
                className="absolute top-0 left-0 overflow-visible"
              >
                <g>
                  {ticks.map((t) => (
                    <g key={t}>
                      <line
                        x1={x(t)}
                        x2={x(t)}
                        y1={0}
                        y2={n * ROW_H}
                        stroke={t === 0 ? "var(--line-strong)" : "var(--grid)"}
                        strokeWidth={1}
                      />
                      <text x={x(t)} y={n * ROW_H + 16} textAnchor="middle" className="chart-text">
                        {fmtCompact(t)}
                      </text>
                    </g>
                  ))}
                </g>

                {/* Connectors between consecutive running totals. */}
                {steps.slice(0, -1).map((s, i) => {
                  const cx = x(s.to);
                  return (
                    <motion.line
                      key={`c-${s.key}`}
                      initial={reduce ? false : { opacity: 0 }}
                      animate={{ opacity: 1, x1: cx, x2: cx }}
                      transition={{
                        ...afterTransition,
                        x1: barTransition(0),
                        x2: barTransition(0),
                      }}
                      y1={barY(i) + BAR_H}
                      y2={barY(i + 1)}
                      stroke="var(--ink-3)"
                      strokeWidth={1}
                      strokeDasharray="2 2"
                    />
                  );
                })}

                {steps.map((s, i) => {
                  const g = geom[i];
                  if (!g) return null;
                  return (
                    <motion.rect
                      key={s.key}
                      y={barY(i)}
                      height={BAR_H}
                      rx={4}
                      ry={4}
                      fill={s.fill}
                      initial={reduce ? false : { x: x(s.from), width: 0 }}
                      animate={{
                        x: g.x,
                        width: g.w,
                        opacity: hover === null || hover === i ? 1 : 0.55,
                      }}
                      transition={{ ...barTransition(i), opacity: { duration: 0.18 } }}
                    />
                  );
                })}

                {callout && (
                  <motion.path
                    d={callout.path}
                    fill="none"
                    stroke="var(--tax-1)"
                    strokeWidth={1.25}
                    initial={reduce ? false : { opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={afterTransition}
                  />
                )}
                {callout && (
                  <circle cx={callout.startX} cy={callout.startY} r={3} fill="var(--tax-1)" />
                )}
              </svg>
            )}

            {callout && (
              <motion.div
                initial={reduce ? false : { opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={afterTransition}
                className="border-line-strong bg-surface pointer-events-auto absolute rounded-xl border px-3.5 py-2.5 shadow-md"
                style={{
                  left: callout.boxX,
                  top: callout.boxTop,
                  width: callout.boxW,
                  minHeight: CALLOUT_H - 12,
                  borderLeft: "3px solid var(--tax-1)",
                }}
              >
                <p className="eyebrow">Depreciation recapture</p>
                <p className="mt-1.5 leading-none">
                  <Money
                    cents={tax.depreciationRecaptureTax}
                    trace={{ kind: "recaptureTax", strategy, year: sale.year }}
                    className="display text-ink text-2xl"
                  />
                </p>
                <p className="text-ink-2 mt-1.5 text-[12.5px] leading-snug">
                  Taxed at up to 25%
                  {recaptureShare !== null && (
                    <>
                      {" "}
                      &middot;{" "}
                      <Pct rate={recaptureShare} digits={0} className="text-ink font-semibold" /> of
                      the sale tax
                    </>
                  )}
                </p>
              </motion.div>
            )}
          </div>
        </div>

        {!callout && !isLoss && tax.depreciationRecaptureTax > 0 && (
          <div
            className="border-line-strong bg-surface-2 text-ink-2 mt-2 rounded-xl border px-4 py-3 text-sm leading-snug"
            style={{ borderLeft: "3px solid var(--tax-1)" }}
          >
            <span className="eyebrow mr-2">Depreciation recapture</span>
            <Money
              cents={tax.depreciationRecaptureTax}
              trace={{ kind: "recaptureTax", strategy, year: sale.year }}
              className="display text-ink text-lg"
            />{" "}
            taxed at up to 25%
            {recaptureShare !== null && (
              <>
                , <Pct rate={recaptureShare} digits={0} className="text-ink font-semibold" /> of the
                total sale tax
              </>
            )}
            .
          </div>
        )}

        {!chainExact && (
          <p className="mt-3">
            <Chip tone="danger">The bars do not chain to the engine&apos;s net proceeds</Chip>
          </p>
        )}
      </ChartFrame>

      <section className="card overflow-hidden" aria-label="Gain summary and properties sold">
        <dl className="divide-line grid grid-cols-1 divide-y sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          <div className="flex flex-col justify-between gap-2 px-5 py-4">
            <dt className="eyebrow">Total gain</dt>
            <dd className="text-ink mt-2 text-2xl">
              <Money
                cents={sale.totalGain}
                trace={{ kind: "gainSplit", strategy }}
                className="display"
              />
            </dd>
          </div>
          <div className="flex flex-col justify-between gap-2 px-5 py-4">
            <dt className="eyebrow">Of which depreciation recapture</dt>
            <dd className="text-ink mt-2 text-2xl">
              <Money
                cents={sale.classification.unrecaptured1250Gain}
                trace={{ kind: "gainSplit", strategy }}
                className="display"
              />
            </dd>
          </div>
          <div className="flex flex-col justify-between gap-2 px-5 py-4">
            <dt className="eyebrow">Tax as % of gain</dt>
            <dd className="text-ink mt-2 text-2xl">
              {taxOfGain !== null ? (
                <Pct rate={taxOfGain} digits={1} className="display" />
              ) : (
                <span className="display text-ink-3" aria-label="Not applicable">
                  n/a
                </span>
              )}
            </dd>
          </div>
        </dl>

        <div className="border-line border-t">
          <div className="overflow-x-auto">
            <table className="num w-full min-w-[560px] text-left text-sm">
              <caption className="sr-only">Properties sold in {sale.year}</caption>
              <thead className="text-ink-3 text-xs">
                <tr>
                  <th scope="col" className="px-5 py-2.5 font-medium">
                    Property sold
                  </th>
                  <th scope="col" className="px-3 py-2.5 text-right font-medium">
                    Sale price
                  </th>
                  <th scope="col" className="px-3 py-2.5 text-right font-medium">
                    Adjusted basis
                  </th>
                  <th scope="col" className="px-3 py-2.5 text-right font-medium">
                    Gain
                  </th>
                  <th scope="col" className="px-5 py-2.5 text-right font-medium">
                    Depreciation taken
                  </th>
                </tr>
              </thead>
              <tbody className="divide-line border-line divide-y border-t">
                {sale.properties.map((p) => (
                  <tr key={p.propertyId}>
                    <th scope="row" className="text-ink px-5 py-2.5 font-medium">
                      {p.propertyName}
                    </th>
                    <td className="text-ink px-3 py-2.5 text-right">
                      <Money cents={p.salePrice} />
                    </td>
                    <td className="text-ink px-3 py-2.5 text-right">
                      <Money
                        cents={p.adjustedBasis}
                        trace={{ kind: "saleBasis", strategy, propertyId: p.propertyId }}
                      />
                    </td>
                    <td
                      className={cn(
                        "px-3 py-2.5 text-right",
                        p.totalGain < 0 ? "text-danger" : "text-ink",
                      )}
                    >
                      <Money
                        cents={p.totalGain}
                        trace={{ kind: "saleGain", strategy, propertyId: p.propertyId }}
                      />
                    </td>
                    <td className="text-ink px-5 py-2.5 text-right">
                      <Money cents={p.accumulatedDepreciation} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}
