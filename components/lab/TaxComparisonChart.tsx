"use client";

import { scaleLinear } from "d3-scale";
import { motion } from "framer-motion";
import { useId, useMemo, useState } from "react";
import type { TraceRef } from "@/engine/explain";
import type { Cents, SaleTaxBreakdown, ScenarioResults, StrategyKind, Year } from "@/engine/types";
import { ChartFrame, type LegendItem } from "@/components/charts/ChartFrame";
import { ChartTooltip, TooltipRow } from "@/components/charts/ChartTooltip";
import { Money } from "@/components/math/Fig";
import { Chip } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";
import { fmtCompact, fmtMoney, fmtPercent } from "@/lib/format";
import { STRATEGY_COLOR, STRATEGY_DASH, STRATEGY_LABEL, STRATEGY_ORDER } from "@/lib/strategy";
import { useChartSize } from "@/lib/use-chart-size";
import { useEntrance } from "./money-flow/use-entrance";

export interface TaxComparisonChartProps {
  results: ScenarioResults;
  stepUp: boolean;
}

type SeriesKey = "ops" | "recapture" | "capgains" | "niit" | "state" | "deferred";

interface SeriesDef {
  key: SeriesKey;
  label: string;
  fill: string;
}

interface Segment {
  key: SeriesKey;
  value: Cents;
  /** Cents interval on the axis (negative amounts sit left of zero). */
  lo: Cents;
  hi: Cents;
  trace?: TraceRef;
}

interface Bar {
  strategy: StrategyKind;
  segments: Segment[];
  paid: Cents;
  paidPlusDeferred: Cents;
  /** Sum of segment sizes used to express a segment as a share of its bar. */
  magnitude: Cents;
  extentLo: Cents;
  extentHi: Cents;
  paidTrace?: TraceRef;
}

const ROW_H = 80;
const BAR_H = 32;
const HEAD_H = 32;
const AXIS_H = 28;
const LABEL_W = 148;
const COL_W = 108;

const SERIES: SeriesDef[] = [
  { key: "ops", label: "Income tax on rental operations", fill: "var(--cost)" },
  { key: "recapture", label: "Depreciation recapture tax", fill: "var(--tax-1)" },
  { key: "capgains", label: "Capital gains tax", fill: "var(--tax-2)" },
  { key: "niit", label: "Net investment income tax", fill: "var(--tax-3)" },
  { key: "state", label: "State tax on the sale", fill: "var(--tax-4)" },
  { key: "deferred", label: "Deferred tax still owed at the horizon", fill: "" },
];

const SERIES_LABEL: Record<SeriesKey, string> = Object.fromEntries(
  SERIES.map((s) => [s.key, s.label]),
) as Record<SeriesKey, string>;

function buildBars(results: ScenarioResults, stepUp: boolean): Bar[] {
  const horizonYear = results.hold.horizon.year;
  return STRATEGY_ORDER.map((strategy) => {
    const r = results[strategy];
    let tax: SaleTaxBreakdown | null = null;
    let taxYear: Year | null = null;
    if (strategy === "sell" && r.sale) {
      tax = r.sale.tax;
      taxYear = r.sale.year;
    } else if (strategy === "exchange" && r.exchange) {
      tax = r.exchange.bootTax;
      taxYear = r.exchange.completed
        ? r.exchange.acquisitionYear
        : (r.sale?.year ?? r.exchange.sellYear);
    }
    const saleTrace = (
      kind: "recaptureTax" | "capitalGainsTax" | "niit" | "stateTax",
    ): TraceRef | undefined => (taxYear === null ? undefined : { kind, strategy, year: taxYear });

    const ops = r.years.reduce((sum, y) => sum + y.taxOnOperations, 0);
    const deferred = stepUp ? 0 : r.horizon.deferredTaxLiability;
    const values: { key: SeriesKey; value: Cents; trace?: TraceRef }[] = [
      { key: "ops", value: ops, trace: { kind: "cumulativeTaxes", strategy, year: horizonYear } },
      {
        key: "recapture",
        value: tax?.depreciationRecaptureTax ?? 0,
        trace: saleTrace("recaptureTax"),
      },
      { key: "capgains", value: tax?.capitalGainsTax ?? 0, trace: saleTrace("capitalGainsTax") },
      { key: "niit", value: tax?.netInvestmentIncomeTax ?? 0, trace: saleTrace("niit") },
      { key: "state", value: tax?.stateTax ?? 0, trace: saleTrace("stateTax") },
      {
        key: "deferred",
        value: deferred,
        trace: stepUp ? undefined : { kind: "deferredTax", strategy, year: horizonYear },
      },
    ];

    let pos: Cents = 0;
    let neg: Cents = 0;
    let magnitude: Cents = 0;
    let paid: Cents = 0;
    const segments: Segment[] = values.map((v) => {
      magnitude += Math.abs(v.value);
      if (v.key !== "deferred") paid += v.value;
      if (v.value >= 0) {
        const seg = { ...v, lo: pos, hi: pos + v.value };
        pos += v.value;
        return seg;
      }
      const seg = { ...v, lo: neg + v.value, hi: neg };
      neg += v.value;
      return seg;
    });
    return {
      strategy,
      segments,
      paid,
      paidPlusDeferred: paid + deferred,
      magnitude,
      extentLo: neg,
      extentHi: pos,
      paidTrace: { kind: "cumulativeTaxes", strategy, year: horizonYear },
    };
  });
}

interface Hover {
  row: number;
  seg: SeriesKey;
  x: number;
  y: number;
}

export function TaxComparisonChart({ results, stepUp }: TaxComparisonChartProps) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const hatchId = `hatch${uid}`;
  const horizonYear = results.hold.horizon.year;
  const bars = useMemo(() => buildBars(results, stepUp), [results, stepUp]);
  const { barTransition, afterTransition, reduce } = useEntrance(bars.length, 0.1);
  const [ref, size] = useChartSize<HTMLDivElement>({ width: 0, height: 0 });
  const [hover, setHover] = useState<Hover | null>(null);
  const width = size.width;
  const pad = 10;

  const x = useMemo(() => {
    const lo = Math.min(0, ...bars.map((b) => b.extentLo));
    const hi = Math.max(0, ...bars.map((b) => b.extentHi));
    return scaleLinear()
      .domain([lo, hi === lo ? lo + 100_000 : hi])
      .range([pad, Math.max(pad + 1, width - pad - 36)])
      .nice(4);
  }, [bars, width]);
  const ticks = useMemo(() => x.ticks(width < 420 ? 3 : 5), [x, width]);
  const hasNegative = bars.some((b) => b.extentLo < 0);

  const legend: LegendItem[] = SERIES.map((s) => ({
    key: s.key,
    label: s.label,
    color: s.key === "deferred" ? `url(#${hatchId})` : s.fill,
    shape: "swatch",
  }));

  const tableData = {
    caption: `Tax cost by strategy at ${horizonYear}`,
    columns: ["Strategy", ...SERIES.map((s) => s.label), "Paid by the horizon", "Paid + deferred"],
    rows: bars.map((b) => [
      STRATEGY_LABEL[b.strategy],
      ...b.segments.map((s) => fmtMoney(s.value)),
      fmtMoney(b.paid),
      fmtMoney(b.paidPlusDeferred),
    ]),
  };

  const chartLabel = `Stacked bars of tax cost through ${horizonYear}. ${bars
    .map(
      (b) =>
        `${STRATEGY_LABEL[b.strategy]}: ${fmtMoney(b.paid)} paid, ${fmtMoney(b.paidPlusDeferred)} including deferred tax`,
    )
    .join("; ")}.`;

  const activeBar = hover ? bars[hover.row] : null;
  const activeSeg = hover && activeBar ? activeBar.segments.find((s) => s.key === hover.seg) : null;

  return (
    <div className="relative">
      {/* Shared hatch pattern so the legend swatch and the bars read the same. */}
      <svg aria-hidden="true" focusable="false" className="absolute h-0 w-0">
        <defs>
          <pattern
            id={hatchId}
            width="7"
            height="7"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <rect width="7" height="7" fill="var(--amber-soft)" />
            <line x1="0" y1="0" x2="0" y2="7" stroke="var(--amber)" strokeWidth="2.2" />
          </pattern>
        </defs>
      </svg>

      <ChartFrame
        title="What does each path cost in tax?"
        subtitle={`Hold and 1031 Exchange postpone tax rather than avoid it. The hatched part is still owed at ${horizonYear}, and a step-up in basis at death would erase it.`}
        legend={legend}
        table={tableData}
        actions={
          stepUp ? (
            <Chip tone="accent">Step-up at death assumed: deferred tax = $0</Chip>
          ) : undefined
        }
      >
        <div className="relative" style={{ paddingBottom: AXIS_H }}>
          <ul className="m-0 list-none p-0">
            <li
              aria-hidden="true"
              className="text-ink-3 grid items-end pb-1.5 text-[11px] font-medium"
              style={{
                gridTemplateColumns: `${LABEL_W}px minmax(0, 1fr) ${COL_W}px ${COL_W}px`,
                height: HEAD_H,
              }}
            >
              <span />
              <span />
              <span className="pr-2 text-right leading-tight">Paid by the horizon</span>
              <span className="pr-2 text-right leading-tight">Paid + deferred</span>
            </li>
            {bars.map((b) => (
              <li
                key={b.strategy}
                className="border-line grid items-center border-t"
                style={{
                  gridTemplateColumns: `${LABEL_W}px minmax(0, 1fr) ${COL_W}px ${COL_W}px`,
                  height: ROW_H,
                }}
              >
                <div className="flex min-w-0 flex-col items-start gap-1.5 pr-3 pl-1">
                  <svg width="22" height="10" aria-hidden="true" className="shrink-0">
                    <line
                      x1="1"
                      y1="5"
                      x2="21"
                      y2="5"
                      stroke={STRATEGY_COLOR[b.strategy]}
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeDasharray={STRATEGY_DASH[b.strategy]}
                    />
                  </svg>
                  <span className="display text-ink max-w-full truncate text-[18px] leading-none">
                    {STRATEGY_LABEL[b.strategy]}
                  </span>
                </div>
                <div aria-hidden="true" />
                <div className="text-ink pr-2 text-right text-sm font-medium">
                  <Money cents={b.paid} trace={b.paidTrace} />
                </div>
                <div className="text-ink pr-2 text-right text-sm font-semibold">
                  <Money cents={b.paidPlusDeferred} />
                </div>
              </li>
            ))}
          </ul>

          <div
            ref={ref}
            className="pointer-events-none absolute bottom-0"
            style={{ left: LABEL_W, right: COL_W * 2, top: HEAD_H }}
          >
            {width > 0 && (
              <svg
                width={width}
                height={bars.length * ROW_H + AXIS_H}
                role="img"
                aria-label={chartLabel}
                className="absolute top-0 left-0 overflow-visible"
              >
                <defs>
                  {bars.map((b, i) => (
                    <clipPath key={b.strategy} id={`clip${uid}${i}`}>
                      <motion.rect
                        y={i * ROW_H + (ROW_H - BAR_H) / 2}
                        height={BAR_H}
                        rx={4}
                        ry={4}
                        initial={reduce ? false : { x: x(0), width: 0 }}
                        animate={{
                          x: x(b.extentLo),
                          width: Math.max(0, x(b.extentHi) - x(b.extentLo)),
                        }}
                        transition={barTransition(i)}
                      />
                    </clipPath>
                  ))}
                </defs>

                {ticks.map((t) => (
                  <g key={t}>
                    <line
                      x1={x(t)}
                      x2={x(t)}
                      y1={0}
                      y2={bars.length * ROW_H}
                      stroke="var(--grid)"
                      strokeWidth={1}
                    />
                    <text
                      x={x(t)}
                      y={bars.length * ROW_H + 18}
                      textAnchor="middle"
                      className="chart-text"
                    >
                      {fmtCompact(t)}
                    </text>
                  </g>
                ))}
                <line
                  x1={x(0)}
                  x2={x(0)}
                  y1={0}
                  y2={bars.length * ROW_H}
                  stroke="var(--line-strong)"
                  strokeWidth={hasNegative ? 1.5 : 1}
                />

                {bars.map((b, i) => {
                  const y = i * ROW_H + (ROW_H - BAR_H) / 2;
                  if (b.magnitude === 0) {
                    return (
                      <g key={b.strategy}>
                        <rect
                          x={x(0)}
                          y={y + BAR_H / 2 - 1}
                          width={28}
                          height={2}
                          rx={1}
                          fill="var(--ink-3)"
                        />
                        <text x={x(0) + 36} y={y + BAR_H / 2 + 4} className="chart-text">
                          $0
                        </text>
                      </g>
                    );
                  }
                  return (
                    <g key={b.strategy} clipPath={`url(#clip${uid}${i})`}>
                      {b.segments.map((s) => {
                        if (s.value === 0) return null;
                        const sx = x(s.lo);
                        const sw = Math.max(0, x(s.hi) - x(s.lo));
                        const def = SERIES.find((d) => d.key === s.key);
                        const fill =
                          s.key === "deferred" ? `url(#${hatchId})` : (def?.fill ?? "var(--cost)");
                        const dimmed = hover !== null && !(hover.row === i && hover.seg === s.key);
                        const label = `${STRATEGY_LABEL[b.strategy]}, ${SERIES_LABEL[s.key]}: ${fmtMoney(s.value)}`;
                        return (
                          <motion.rect
                            key={s.key}
                            y={y}
                            height={BAR_H}
                            fill={fill}
                            stroke="var(--surface)"
                            strokeWidth={2}
                            tabIndex={0}
                            role="img"
                            aria-label={label}
                            style={{ pointerEvents: "auto", cursor: "default", outlineOffset: 1 }}
                            initial={reduce ? false : { x: x(0), width: 0, opacity: 1 }}
                            animate={{ x: sx, width: sw, opacity: dimmed ? 0.5 : 1 }}
                            transition={{ ...barTransition(i), opacity: { duration: 0.15 } }}
                            onPointerMove={(e) => {
                              const box = ref.current?.getBoundingClientRect();
                              if (!box) return;
                              setHover({
                                row: i,
                                seg: s.key,
                                x: e.clientX - box.left,
                                y: e.clientY - box.top - 10,
                              });
                            }}
                            onPointerLeave={() => setHover(null)}
                            onFocus={() =>
                              setHover({ row: i, seg: s.key, x: sx + sw / 2, y: y + BAR_H })
                            }
                            onBlur={() => setHover(null)}
                          />
                        );
                      })}
                    </g>
                  );
                })}

                {/* Dashed outline reinforces "owed later, not yet paid" beyond the hatch. */}
                {bars.map((b, i) => {
                  const d = b.segments.find((s) => s.key === "deferred");
                  if (!d || d.value === 0) return null;
                  const y = i * ROW_H + (ROW_H - BAR_H) / 2;
                  return (
                    <motion.rect
                      key={`o-${b.strategy}`}
                      y={y + 1.5}
                      height={BAR_H - 3}
                      rx={3}
                      fill="none"
                      stroke="var(--amber)"
                      strokeWidth={1.25}
                      strokeDasharray="4 3"
                      pointerEvents="none"
                      initial={reduce ? false : { x: x(0), width: 0, opacity: 0 }}
                      animate={{
                        x: x(d.lo) + 2,
                        width: Math.max(0, x(d.hi) - x(d.lo) - 4),
                        opacity: 1,
                      }}
                      transition={{
                        ...afterTransition,
                        x: barTransition(i),
                        width: barTransition(i),
                      }}
                    />
                  );
                })}
              </svg>
            )}

            {hover && activeBar && activeSeg && (
              <ChartTooltip x={hover.x} y={hover.y} containerWidth={width} width={236}>
                <p className="text-ink mb-1 font-semibold">{STRATEGY_LABEL[activeBar.strategy]}</p>
                <TooltipRow
                  label={SERIES_LABEL[activeSeg.key]}
                  value={fmtMoney(activeSeg.value)}
                  strong
                />
                {activeBar.magnitude > 0 && activeSeg.value > 0 && (
                  <TooltipRow
                    label="Share of this bar"
                    value={fmtPercent(activeSeg.value / activeBar.magnitude, 0)}
                  />
                )}
                {activeSeg.key === "deferred" && (
                  <p className="text-ink-3 mt-1 text-[11px] leading-snug">
                    Owed later, not paid by {horizonYear}.
                  </p>
                )}
              </ChartTooltip>
            )}
          </div>
        </div>
      </ChartFrame>

      <BreakdownCard bars={bars} horizonYear={horizonYear} stepUp={stepUp} />
    </div>
  );
}

function BreakdownCard({
  bars,
  horizonYear,
  stepUp,
}: {
  bars: Bar[];
  horizonYear: Year;
  stepUp: boolean;
}) {
  return (
    <section
      className={cn("card mt-4 overflow-hidden")}
      aria-label={`Tax breakdown by strategy at ${horizonYear}`}
    >
      <div className="overflow-x-auto">
        <table className="num w-full min-w-[520px] text-left text-sm">
          <caption className="sr-only">
            Tax cost by strategy through {horizonYear}. Figures open the math behind them.
          </caption>
          <thead className="text-ink-3 text-xs">
            <tr>
              <th scope="col" className="px-5 py-3 font-medium">
                Through {horizonYear}
              </th>
              {bars.map((b) => (
                <th key={b.strategy} scope="col" className="px-3 py-3 text-right font-medium">
                  {STRATEGY_LABEL[b.strategy]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-line border-line divide-y border-t">
            {SERIES.map((s) => (
              <tr key={s.key}>
                <th scope="row" className="text-ink-2 px-5 py-2.5 font-normal">
                  <span className="flex items-center gap-2.5">
                    <svg width="14" height="10" aria-hidden="true" className="shrink-0">
                      <rect
                        x="0"
                        y="0"
                        width="14"
                        height="10"
                        rx="2"
                        fill={s.key === "deferred" ? "var(--amber-soft)" : s.fill}
                        stroke={s.key === "deferred" ? "var(--amber)" : "none"}
                        strokeDasharray={s.key === "deferred" ? "3 2" : undefined}
                      />
                    </svg>
                    {s.label}
                  </span>
                </th>
                {bars.map((b) => {
                  const seg = b.segments.find((g) => g.key === s.key);
                  return (
                    <td key={b.strategy} className="text-ink px-3 py-2.5 text-right">
                      <Money cents={seg?.value ?? 0} trace={seg?.trace} />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
          <tfoot className="border-line-strong border-t">
            <tr>
              <th scope="row" className="text-ink px-5 py-3 font-semibold">
                Paid by the horizon
              </th>
              {bars.map((b) => (
                <td key={b.strategy} className="text-ink px-3 py-3 text-right font-semibold">
                  <Money cents={b.paid} trace={b.paidTrace} />
                </td>
              ))}
            </tr>
            <tr>
              <th scope="row" className="text-ink px-5 pb-3 font-semibold">
                Paid + deferred{stepUp ? " (step-up: deferred = $0)" : ""}
              </th>
              {bars.map((b) => (
                <td key={b.strategy} className="text-ink px-3 pb-3 text-right font-semibold">
                  <Money cents={b.paidPlusDeferred} />
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}
