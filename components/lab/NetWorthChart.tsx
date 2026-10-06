"use client";

import { motion, useReducedMotion } from "framer-motion";
import { area as d3Area, curveMonotoneX, line as d3Line } from "d3-shape";
import { scaleLinear } from "d3-scale";
import { useCallback, useId, useMemo, useState } from "react";
import type { KeyboardEvent, PointerEvent } from "react";
import { ChartFrame } from "@/components/charts/ChartFrame";
import type { LegendItem } from "@/components/charts/ChartFrame";
import { ChartTooltip, TooltipRow } from "@/components/charts/ChartTooltip";
import { Money } from "@/components/math/Fig";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { Segmented } from "@/components/ui/primitives";
import type { BandSeries, Cents, ScenarioResults, StrategyKind, YearRow } from "@/engine/types";
import type { TraceRef } from "@/engine/explain";
import { fmtCompact, fmtMoney, fmtSigned } from "@/lib/format";
import { cn } from "@/lib/cn";
import type { McState } from "@/lib/scenario-store";
import { STRATEGY_COLOR, STRATEGY_DASH, STRATEGY_LABEL, STRATEGY_ORDER } from "@/lib/strategy";
import { useChartSize } from "@/lib/use-chart-size";
import { TweenPath } from "./net-worth/TweenPath";
import type { PathPoints } from "./net-worth/TweenPath";

export interface NetWorthChartProps {
  results: ScenarioResults;
  mc: McState;
  showBands: boolean;
  metric: "liquidated" | "afterTax";
  onMetricChange: (m: "liquidated" | "afterTax") => void;
  stepUp: boolean;
  year: number;
  onYearChange: (y: number) => void;
  asOfYear: number;
  horizonYear: number;
  sellYear: number;
}

type Metric = NetWorthChartProps["metric"];

const MARGIN = { top: 30, right: 66, bottom: 40, left: 56 };
const SHORT_LABEL: Record<StrategyKind, string> = { hold: "Hold", sell: "Sell", exchange: "1031" };
const num = (row: readonly number[] | undefined, i: number): number => row?.[i] ?? 0;
const PILL = { w: 58, h: 22 };

function pickValue(row: YearRow, metric: Metric, stepUp: boolean): Cents {
  if (metric === "afterTax") return row.netWorthAfterTax;
  return stepUp ? row.netWorthLiquidatedWithStepUp : row.netWorthLiquidated;
}

function subtitleFor(metric: Metric, stepUp: boolean): string {
  if (metric === "afterTax") {
    return "After-tax net worth is cash plus equity at market value, after the taxes already paid; deferred taxes are not yet subtracted.";
  }
  return stepUp
    ? "Net worth if liquidated subtracts selling costs, with deferred taxes assumed wiped out by a step-up in basis at death."
    : "Net worth if liquidated subtracts selling costs and deferred taxes, so strategies compare fairly.";
}

/** Spread labels apart so none sit closer than `gap` pixels, keeping them inside [lo, hi]. */
function spreadLabels(targets: number[], gap: number, lo: number, hi: number): number[] {
  const order = targets.map((_, i) => i).sort((a, b) => (targets[a] ?? 0) - (targets[b] ?? 0));
  const out = [...targets];
  let prev = -Infinity;
  for (const i of order) {
    const v = Math.max(lo, targets[i] ?? 0, prev + gap);
    out[i] = v;
    prev = v;
  }
  let next = Infinity;
  for (let k = order.length - 1; k >= 0; k--) {
    const i = order[k] ?? 0;
    const v = Math.min(out[i] ?? 0, hi, next - gap);
    out[i] = v;
    next = v;
  }
  return out;
}

function DeltaBadge({ delta }: { delta: Cents }) {
  const up = delta > 0;
  const flat = delta === 0;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-xs font-medium",
        flat ? "text-ink-3" : up ? "text-accent" : "text-danger",
      )}
    >
      {!flat && (
        <svg width="9" height="9" viewBox="0 0 9 9" aria-hidden="true">
          <path d={up ? "M4.5 1 8 7H1z" : "M4.5 8 1 2h7z"} fill="currentColor" />
        </svg>
      )}
      <AnimatedNumber
        value={delta}
        format={(v) => fmtSigned(Math.round(v))}
        duration={0.3}
        className="num"
      />
      <span className="text-ink-3 font-normal">vs Hold</span>
    </span>
  );
}

export function NetWorthChart({
  results,
  mc,
  showBands,
  metric,
  onMetricChange,
  stepUp,
  year,
  onYearChange,
  asOfYear,
  horizonYear,
  sellYear,
}: NetWorthChartProps) {
  const reduce = useReducedMotion();
  const [wrapRef, size] = useChartSize<HTMLDivElement>({ width: 880, height: 380 });
  const clipId = `nw-clip-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const [drawn, setDrawn] = useState(false);
  const [hover, setHover] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const [keyboardFocus, setKeyboardFocus] = useState(false);

  const width = Math.max(320, size.width);
  const height = width < 640 ? 320 : 380;
  const plotW = Math.max(120, width - MARGIN.left - MARGIN.right);
  const plotH = height - MARGIN.top - MARGIN.bottom;

  // ───── data ─────
  const years = useMemo(() => results.hold.years.map((r) => r.year), [results]);
  const firstYear = years[0] ?? asOfYear;
  const values = useMemo(() => {
    const out = {} as Record<StrategyKind, Cents[]>;
    for (const k of STRATEGY_ORDER)
      out[k] = results[k].years.map((r) => pickValue(r, metric, stepUp));
    return out;
  }, [results, metric, stepUp]);

  const bands: Record<StrategyKind, BandSeries> | null = useMemo(() => {
    if (!showBands || mc.status !== "done") return null;
    if (metric === "afterTax") return mc.result.afterTax;
    return stepUp ? mc.result.liquidatedStepUp : mc.result.liquidated;
  }, [showBands, mc, metric, stepUp]);

  const x = useMemo(
    () => scaleLinear().domain([asOfYear, horizonYear]).range([0, plotW]),
    [asOfYear, horizonYear, plotW],
  );
  const y = useMemo(() => {
    let lo = 0;
    let hi = 0;
    for (const k of STRATEGY_ORDER) {
      for (const v of values[k]) {
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
      if (bands) {
        for (const v of bands[k].p10) if (v < lo) lo = v;
        for (const v of bands[k].p90) if (v > hi) hi = v;
      }
    }
    if (hi <= lo) hi = lo + 100_000;
    return scaleLinear().domain([lo, hi]).nice(5).range([plotH, 0]);
  }, [values, bands, plotH]);

  const linePoints = useMemo(() => {
    const out = {} as Record<StrategyKind, PathPoints>;
    for (const k of STRATEGY_ORDER) out[k] = years.map((yr, i) => [x(yr), y(values[k][i] ?? 0)]);
    return out;
  }, [years, values, x, y]);

  const bandPoints = useMemo(() => {
    if (!bands) return null;
    const out = {} as Record<StrategyKind, { area: PathPoints; median: PathPoints }>;
    for (const k of STRATEGY_ORDER) {
      const b = bands[k];
      out[k] = {
        area: b.years.map((yr, i) => [x(yr), y(b.p10[i] ?? 0), y(b.p90[i] ?? 0)]),
        median: b.years.map((yr, i) => [x(yr), y(b.p50[i] ?? 0)]),
      };
    }
    return out;
  }, [bands, x, y]);

  const lineGen = useMemo(
    () =>
      d3Line<number[]>()
        .x((p) => num(p, 0))
        .y((p) => num(p, 1))
        .curve(curveMonotoneX),
    [],
  );
  const areaGen = useMemo(
    () =>
      d3Area<number[]>()
        .x((p) => num(p, 0))
        .y0((p) => num(p, 1))
        .y1((p) => num(p, 2))
        .curve(curveMonotoneX),
    [],
  );
  const buildLine = useCallback((pts: PathPoints) => lineGen(pts) ?? "", [lineGen]);
  const buildArea = useCallback((pts: PathPoints) => areaGen(pts) ?? "", [areaGen]);

  const yTicks = useMemo(() => y.ticks(5), [y]);
  const domainLo = y.domain()[0] ?? 0;
  const step = plotW / Math.max(1, horizonYear - asOfYear) < 24 ? 5 : 2;
  const xTicks = useMemo(() => {
    const out: number[] = [];
    for (let yr = asOfYear; yr <= horizonYear; yr++) if ((yr - asOfYear) % step === 0) out.push(yr);
    return out;
  }, [asOfYear, horizonYear, step]);

  // ───── scrubber state ─────
  const clampYear = useCallback(
    (v: number) => Math.min(horizonYear, Math.max(asOfYear, Math.round(v))),
    [asOfYear, horizonYear],
  );
  const scrubYear = clampYear(year);
  const activeYear = hover ?? scrubYear;
  const idx = (yr: number) => Math.min(years.length - 1, Math.max(0, yr - firstYear));

  const yearFromEvent = (e: PointerEvent<SVGElement>): number => {
    const box = wrapRef.current?.getBoundingClientRect();
    if (!box) return scrubYear;
    return clampYear(x.invert(e.clientX - box.left - MARGIN.left));
  };
  const commit = (v: number) => {
    if (v !== scrubYear) onYearChange(v);
  };
  const onPointerDown = (e: PointerEvent<SVGRectElement>) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
    const v = yearFromEvent(e);
    setHover(v);
    commit(v);
  };
  const onPointerMove = (e: PointerEvent<SVGRectElement>) => {
    const v = yearFromEvent(e);
    setHover((prev) => (prev === v ? prev : v));
    if (dragging) commit(v);
  };
  const endDrag = (e: PointerEvent<SVGRectElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId))
      e.currentTarget.releasePointerCapture(e.pointerId);
    setDragging(false);
    if (e.pointerType !== "mouse") setHover(null);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const big = e.shiftKey ? 5 : 1;
    let next: number | null = null;
    if (e.key === "ArrowLeft" || e.key === "ArrowDown") next = scrubYear - big;
    else if (e.key === "ArrowRight" || e.key === "ArrowUp") next = scrubYear + big;
    else if (e.key === "Home") next = asOfYear;
    else if (e.key === "End") next = horizonYear;
    if (next === null) return;
    e.preventDefault();
    commit(clampYear(next));
  };

  // ───── derived display values ─────
  const at = idx(activeYear);
  const scrubIdx = idx(scrubYear);
  const holdAtActive = values.hold[at] ?? 0;
  const traceFor = (strategy: StrategyKind, yr: number): TraceRef =>
    metric === "liquidated"
      ? { kind: "netWorthLiquidated", strategy, year: yr, stepUp }
      : { kind: "netWorthAfterTax", strategy, year: yr };

  const endLabelY = useMemo(() => {
    const targets = STRATEGY_ORDER.map((k) => y(values[k][values[k].length - 1] ?? 0));
    return spreadLabels(targets, 15, 6, plotH - 2);
  }, [values, y, plotH]);

  const showTooltip = hover !== null || dragging || keyboardFocus;
  const tooltipX = MARGIN.left + x(activeYear);
  // Park the tooltip in the emptier half of the plot so it never covers the lines it describes.
  const meanLineY =
    STRATEGY_ORDER.reduce((sum, k) => sum + y(values[k][at] ?? 0), 0) / STRATEGY_ORDER.length;
  const tooltipY = meanLineY < plotH / 2 ? MARGIN.top + plotH - 150 : MARGIN.top + 8;

  const legend: LegendItem[] = [
    ...STRATEGY_ORDER.map((k) => ({
      key: k,
      label: STRATEGY_LABEL[k],
      color: STRATEGY_COLOR[k],
      dash: STRATEGY_DASH[k],
    })),
    ...(bands
      ? [
          {
            key: "band",
            label: "10–90% range",
            color: "color-mix(in srgb, var(--ink-3) 30%, transparent)",
            shape: "area" as const,
          },
        ]
      : []),
  ];

  const table = {
    caption: `Net worth by year (${metric === "afterTax" ? "after-tax" : "if liquidated"})`,
    columns: ["Year", ...STRATEGY_ORDER.map((k) => STRATEGY_LABEL[k])],
    rows: years.map((yr, i) => [yr, ...STRATEGY_ORDER.map((k) => fmtMoney(values[k][i] ?? 0))]),
  };

  const ariaValueText = `${scrubYear}: ${STRATEGY_ORDER.map((k) => `${STRATEGY_LABEL[k]} ${fmtMoney(values[k][scrubIdx] ?? 0)}`).join(", ")}`;
  const sellX = x(Math.min(horizonYear, Math.max(asOfYear, sellYear)));
  const sellLabelRight = sellX > plotW - 150;
  const pillX = Math.min(plotW + 8, Math.max(-8, x(scrubYear)));
  const drawDuration = reduce || drawn ? 0 : 1.3;

  const range = mc.status === "done" && bands ? mc.result.config : null;

  return (
    <ChartFrame
      title="Net worth over time"
      subtitle={subtitleFor(metric, stepUp)}
      legend={legend}
      table={table}
      actions={
        <Segmented<Metric>
          label="Net worth measure"
          value={metric}
          onChange={onMetricChange}
          options={[
            { value: "liquidated", label: "If liquidated" },
            { value: "afterTax", label: "After-tax" },
          ]}
        />
      }
    >
      {showBands && (
        <div className="text-ink-3 mb-1 flex h-6 items-center gap-3 text-xs" role="status">
          {mc.status === "running" && (
            <>
              <span
                className="bg-surface-3 h-1 w-28 overflow-hidden rounded-full"
                aria-hidden="true"
              >
                <span
                  className="bg-accent block h-full rounded-full transition-[width] duration-200"
                  style={{ width: `${Math.round(mc.progress * 100)}%` }}
                />
              </span>
              <span className="num">Simulating markets… {Math.round(mc.progress * 100)}%</span>
            </>
          )}
          {range && (
            <span className="num">
              {range.paths.toLocaleString("en-US")} simulated markets · seed {range.seed}
            </span>
          )}
        </div>
      )}

      <div ref={wrapRef} className="relative rounded-xl" style={{ height }}>
        <div
          role="slider"
          tabIndex={0}
          aria-label="Net worth over time by strategy. Use the left and right arrow keys to move the year, Shift for five years, Home and End for the first and last year."
          aria-roledescription="year scrubber"
          aria-valuenow={scrubYear}
          aria-valuemin={asOfYear}
          aria-valuemax={horizonYear}
          aria-valuetext={ariaValueText}
          onKeyDown={onKeyDown}
          onFocus={(e) => setKeyboardFocus(e.currentTarget.matches(":focus-visible"))}
          onBlur={() => setKeyboardFocus(false)}
          className="absolute inset-0 rounded-xl outline-offset-0"
        >
          <svg
            width={width}
            height={height}
            className="block overflow-visible select-none"
            aria-hidden="true"
          >
            <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
              {/* grid + y axis */}
              {yTicks.map((t) => (
                <g key={t}>
                  <line
                    x1={0}
                    x2={plotW}
                    y1={y(t)}
                    y2={y(t)}
                    stroke="var(--grid)"
                    strokeWidth={1}
                  />
                  <text x={-10} y={y(t)} dy="0.32em" textAnchor="end" className="chart-text">
                    {fmtCompact(t)}
                  </text>
                </g>
              ))}
              {domainLo < 0 && (
                <line
                  x1={0}
                  x2={plotW}
                  y1={y(0)}
                  y2={y(0)}
                  stroke="var(--ink-3)"
                  strokeOpacity={0.55}
                  strokeWidth={1}
                />
              )}

              {/* x axis */}
              {xTicks.map((t) => {
                const hidden = Math.abs(x(t) - x(scrubYear)) < 46;
                return (
                  <g key={t} opacity={hidden ? 0 : 1}>
                    <line
                      x1={x(t)}
                      x2={x(t)}
                      y1={plotH}
                      y2={plotH + 4}
                      stroke="var(--line-strong)"
                    />
                    <text x={x(t)} y={plotH + 19} textAnchor="middle" className="chart-text">
                      {t}
                    </text>
                  </g>
                );
              })}

              {/* sale / exchange marker */}
              <g>
                <line
                  x1={sellX}
                  x2={sellX}
                  y1={-8}
                  y2={plotH}
                  stroke="var(--ink-3)"
                  strokeOpacity={0.7}
                  strokeDasharray="3 4"
                />
                <text
                  x={sellX + (sellLabelRight ? -6 : 6)}
                  y={-13}
                  textAnchor={sellLabelRight ? "end" : "start"}
                  className="chart-text"
                  style={{ fontWeight: 500 }}
                >
                  Sale / exchange {sellYear}
                </text>
              </g>

              <defs>
                <clipPath id={clipId}>
                  <motion.rect
                    x={-4}
                    y={-10}
                    height={plotH + 20}
                    initial={{ width: reduce ? plotW + 12 : 0 }}
                    animate={{ width: plotW + 12 }}
                    transition={{ duration: drawDuration, ease: [0.22, 1, 0.36, 1] }}
                    onAnimationComplete={() => setDrawn(true)}
                  />
                </clipPath>
              </defs>

              <g clipPath={`url(#${clipId})`}>
                {/* Monte Carlo bands */}
                {bandPoints && (
                  <motion.g
                    initial={{ opacity: reduce ? 1 : 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.5 }}
                  >
                    {STRATEGY_ORDER.map((k) => (
                      <g key={`band-${k}`}>
                        <TweenPath
                          data={bandPoints[k].area}
                          build={buildArea}
                          fill={STRATEGY_COLOR[k]}
                          fillOpacity={0.14}
                          stroke="none"
                        />
                        <TweenPath
                          data={bandPoints[k].median}
                          build={buildLine}
                          fill="none"
                          stroke={STRATEGY_COLOR[k]}
                          strokeWidth={1}
                          strokeDasharray="1 3"
                          strokeLinecap="round"
                          strokeOpacity={0.9}
                        />
                      </g>
                    ))}
                  </motion.g>
                )}
                {/* strategy lines: Sell and Exchange first so Hold sits on top where they overlap */}
                {[...STRATEGY_ORDER].reverse().map((k) => (
                  <TweenPath
                    key={k}
                    data={linePoints[k]}
                    build={buildLine}
                    fill="none"
                    stroke={STRATEGY_COLOR[k]}
                    strokeWidth={2}
                    strokeDasharray={STRATEGY_DASH[k]}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                ))}
              </g>

              {/* hover preview crosshair */}
              {hover !== null && hover !== scrubYear && (
                <g pointerEvents="none">
                  <line
                    x1={x(hover)}
                    x2={x(hover)}
                    y1={0}
                    y2={plotH}
                    stroke="var(--ink-3)"
                    strokeOpacity={0.5}
                    strokeWidth={1}
                  />
                  {STRATEGY_ORDER.map((k) => (
                    <circle
                      key={k}
                      cx={x(hover)}
                      cy={y(values[k][idx(hover)] ?? 0)}
                      r={3.5}
                      fill="var(--surface)"
                      stroke={STRATEGY_COLOR[k]}
                      strokeWidth={1.5}
                    />
                  ))}
                </g>
              )}

              {/* scrubber */}
              <g pointerEvents="none">
                <line
                  x1={x(scrubYear)}
                  x2={x(scrubYear)}
                  y1={0}
                  y2={plotH + 4}
                  stroke="var(--ink)"
                  strokeWidth={1.25}
                />
                {STRATEGY_ORDER.map((k) => (
                  <circle
                    key={k}
                    cx={x(scrubYear)}
                    cy={y(values[k][scrubIdx] ?? 0)}
                    r={4.5}
                    fill="var(--surface)"
                    stroke={STRATEGY_COLOR[k]}
                    strokeWidth={2}
                  />
                ))}
                <g transform={`translate(${pillX - PILL.w / 2},${plotH + 4})`}>
                  <rect width={PILL.w} height={PILL.h} rx={PILL.h / 2} fill="var(--ink)" />
                  <path
                    d="M10 7.5 6.5 11 10 14.5"
                    fill="none"
                    stroke="var(--surface)"
                    strokeOpacity={0.6}
                    strokeWidth={1.4}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d={`M${PILL.w - 10} 7.5 ${PILL.w - 6.5} 11 ${PILL.w - 10} 14.5`}
                    fill="none"
                    stroke="var(--surface)"
                    strokeOpacity={0.6}
                    strokeWidth={1.4}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <text
                    x={PILL.w / 2}
                    y={PILL.h / 2}
                    dy="0.34em"
                    textAnchor="middle"
                    fill="var(--surface)"
                    className="num"
                    style={{ fontSize: 12, fontWeight: 600 }}
                  >
                    {scrubYear}
                  </text>
                </g>
              </g>

              {/* direct labels */}
              <motion.g
                initial={{ opacity: reduce ? 1 : 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: reduce ? 0 : 1.0, duration: 0.4 }}
                pointerEvents="none"
              >
                {STRATEGY_ORDER.map((k, i) => {
                  const lineY = y(values[k][values[k].length - 1] ?? 0);
                  return (
                    <g key={k}>
                      <path
                        d={`M${plotW + 2} ${lineY} L${plotW + 9} ${endLabelY[i]}`}
                        stroke={STRATEGY_COLOR[k]}
                        strokeWidth={1}
                        fill="none"
                        strokeOpacity={0.7}
                      />
                      <circle cx={plotW + 14} cy={endLabelY[i]} r={3} fill={STRATEGY_COLOR[k]} />
                      <text
                        x={plotW + 22}
                        y={endLabelY[i]}
                        dy="0.34em"
                        className="chart-text"
                        style={{ fill: "var(--ink-2)", fontWeight: 600, fontSize: 12 }}
                      >
                        {SHORT_LABEL[k]}
                      </text>
                    </g>
                  );
                })}
              </motion.g>

              {/* pointer surface */}
              <rect
                x={-6}
                y={-8}
                width={plotW + 12}
                height={plotH + 8 + PILL.h + 12}
                fill="transparent"
                style={{ cursor: dragging ? "grabbing" : "ew-resize", touchAction: "pan-y" }}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
                onPointerLeave={() => {
                  if (!dragging) setHover(null);
                }}
              />
            </g>
          </svg>
        </div>

        {showTooltip && (
          <ChartTooltip x={tooltipX} y={tooltipY} containerWidth={width} width={236}>
            <div className="mb-1.5 flex items-baseline justify-between">
              <span className="display text-ink text-sm">{activeYear}</span>
              <span className="text-ink-3 text-[11px]">Year {activeYear - asOfYear}</span>
            </div>
            {STRATEGY_ORDER.map((k) => {
              const v = values[k][at] ?? 0;
              return (
                <div key={k}>
                  <TooltipRow
                    color={STRATEGY_COLOR[k]}
                    dash={STRATEGY_DASH[k]}
                    label={STRATEGY_LABEL[k]}
                    value={fmtMoney(v)}
                    strong
                  />
                  {k !== "hold" && (
                    <div className="num text-ink-3 pb-0.5 pl-[22px] text-[11px]">
                      {fmtSigned(v - holdAtActive)} vs Hold
                    </div>
                  )}
                </div>
              );
            })}
          </ChartTooltip>
        )}
      </div>

      {/* Persistent readout for the scrubber year: where users click into the math. */}
      <div className="border-line mt-5 border-t pt-4">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <p className="eyebrow">
            End of <span className="num">{scrubYear}</span>
          </p>
          <p className="no-print text-ink-3 text-xs">
            Drag the handle or press ← → to change the year. Select a figure to see the math.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {STRATEGY_ORDER.map((k) => {
            const v = values[k][scrubIdx] ?? 0;
            const band = bands?.[k];
            const bi = band ? band.years.indexOf(scrubYear) : -1;
            const p10 = band?.p10[bi] ?? 0;
            const p90 = band?.p90[bi] ?? 0;
            return (
              <div key={k} className="border-line bg-surface-2/60 rounded-xl border px-4 py-3.5">
                <div className="text-ink-2 flex items-center gap-2 text-xs font-medium">
                  <svg width="22" height="8" aria-hidden="true">
                    <line
                      x1="1"
                      y1="4"
                      x2="21"
                      y2="4"
                      stroke={STRATEGY_COLOR[k]}
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeDasharray={STRATEGY_DASH[k]}
                    />
                  </svg>
                  {STRATEGY_LABEL[k]}
                </div>
                <div className="display text-ink mt-2.5 text-[1.75rem] leading-none sm:text-[1.9rem]">
                  <Money cents={v} trace={traceFor(k, scrubYear)} duration={0.3} />
                </div>
                <div className="mt-2 min-h-4">
                  {k === "hold" ? (
                    <span className="text-ink-3 text-xs">Baseline for comparison</span>
                  ) : (
                    <DeltaBadge delta={v - (values.hold[scrubIdx] ?? 0)} />
                  )}
                </div>
                {band && range && bi >= 0 && (
                  <div className="border-line text-ink-2 mt-2 flex flex-wrap items-center gap-x-1 border-t pt-2 text-[11px]">
                    <span className="text-ink-3">10–90% range</span>
                    <Money
                      compact
                      cents={p10}
                      duration={0.3}
                      trace={{
                        kind: "monteCarlo",
                        strategy: k,
                        year: scrubYear,
                        percentile: 10,
                        seed: range.seed,
                        paths: range.paths,
                        value: p10,
                      }}
                    />
                    <span aria-hidden="true">–</span>
                    <Money
                      compact
                      cents={p90}
                      duration={0.3}
                      trace={{
                        kind: "monteCarlo",
                        strategy: k,
                        year: scrubYear,
                        percentile: 90,
                        seed: range.seed,
                        paths: range.paths,
                        value: p90,
                      }}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </ChartFrame>
  );
}
