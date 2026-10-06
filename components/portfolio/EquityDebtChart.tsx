"use client";

import { motion, useReducedMotion } from "framer-motion";
import { scaleLinear } from "d3-scale";
import { area, line } from "d3-shape";
import { useCallback, useMemo, useRef, useState } from "react";
import { ChartFrame } from "@/components/charts/ChartFrame";
import { ChartTooltip, TooltipRow } from "@/components/charts/ChartTooltip";
import { fmtCompact, fmtMoney } from "@/lib/format";
import { STRATEGY_COLOR } from "@/lib/strategy";
import { useChartSize } from "@/lib/use-chart-size";
import type { Year, YearRow } from "@/engine/types";

const HIDDEN = "inset(-8px 100% -8px -8px)";
const REVEALED = "inset(-8px -8px -8px -8px)";
const HEIGHT = 340;
const M = { top: 34, right: 60, bottom: 30, left: 58 };

/**
 * Stacked areas: property equity (bottom) plus debt (top) add up to market value. A marker at the
 * scrubber year can be clicked, dragged or moved with the arrow keys.
 */
export function EquityDebtChart({
  years,
  scrubYear,
  onScrub,
}: {
  years: readonly YearRow[];
  scrubYear: Year;
  onScrub: (year: Year) => void;
}) {
  const reduce = useReducedMotion();
  const [ref, { width }] = useChartSize<HTMLDivElement>({ width: 760, height: HEIGHT });
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<Year | null>(null);
  const [focused, setFocused] = useState(false);
  const dragging = useRef(false);

  const first = years[0]?.year ?? 0;
  const last = years[years.length - 1]?.year ?? 0;
  const iw = Math.max(80, width - M.left - M.right);
  const ih = HEIGHT - M.top - M.bottom;

  const x = useMemo(() => scaleLinear().domain([first, last]).range([0, iw]), [first, last, iw]);
  const yMax = useMemo(() => Math.max(1, ...years.map((d) => d.propertyValue)), [years]);
  const y = useMemo(() => scaleLinear().domain([0, yMax]).nice(4).range([ih, 0]), [yMax, ih]);

  const equityTop = (d: YearRow) => Math.max(0, d.equity);
  const equityArea = useMemo(
    () =>
      area<YearRow>()
        .x((d) => x(d.year))
        .y0(y(0))
        .y1((d) => y(equityTop(d)))(years as YearRow[]) ?? "",
    [years, x, y],
  );
  const debtArea = useMemo(
    () =>
      area<YearRow>()
        .x((d) => x(d.year))
        .y0((d) => y(equityTop(d)))
        .y1((d) => y(Math.max(d.propertyValue, equityTop(d))))(years as YearRow[]) ?? "",
    [years, x, y],
  );
  const equityEdge = useMemo(
    () =>
      line<YearRow>()
        .x((d) => x(d.year))
        .y((d) => y(equityTop(d)))(years as YearRow[]) ?? "",
    [years, x, y],
  );
  const valueEdge = useMemo(
    () =>
      line<YearRow>()
        .x((d) => x(d.year))
        .y((d) => y(d.propertyValue))(years as YearRow[]) ?? "",
    [years, x, y],
  );

  const yearTicks = useMemo(() => {
    const target = iw < 520 ? 5 : 9;
    return x.ticks(target).filter((t) => Number.isInteger(t));
  }, [x, iw]);
  const yTicks = y.ticks(4);

  const yearAt = useCallback(
    (clientX: number): Year => {
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) return first;
      const v = Math.round(x.invert(clientX - rect.left - M.left));
      return Math.min(last, Math.max(first, v));
    },
    [x, first, last],
  );

  const rowFor = (yr: Year) => years.find((d) => d.year === yr);
  const tooltipYear = hover ?? (focused ? scrubYear : null);
  const tip = tooltipYear !== null ? rowFor(tooltipYear) : undefined;
  const current = rowFor(scrubYear);

  const onKeyDown = (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 5 : 1;
    let next: Year | null = null;
    if (e.key === "ArrowLeft" || e.key === "ArrowDown") next = scrubYear - step;
    else if (e.key === "ArrowRight" || e.key === "ArrowUp") next = scrubYear + step;
    else if (e.key === "PageDown") next = scrubYear - 5;
    else if (e.key === "PageUp") next = scrubYear + 5;
    else if (e.key === "Home") next = first;
    else if (e.key === "End") next = last;
    if (next === null) return;
    e.preventDefault();
    onScrub(Math.min(last, Math.max(first, next)));
  };

  const lastRow = years[years.length - 1];
  const bandMid = (d: YearRow | undefined, part: "equity" | "debt") => {
    if (!d) return null;
    const eq = equityTop(d);
    const mid = part === "equity" ? eq / 2 : eq + (Math.max(d.propertyValue, eq) - eq) / 2;
    const height = part === "equity" ? y(0) - y(eq) : y(eq) - y(Math.max(d.propertyValue, eq));
    return height > 16 ? y(mid) : null;
  };
  const eqLabelY = bandMid(lastRow, "equity");
  const debtLabelY = bandMid(lastRow, "debt");

  return (
    <ChartFrame
      title="Equity and debt over time"
      subtitle="Property equity plus loan balances add up to market value. Cash held in the Hold lane is not part of this chart. Click or drag to move through time."
      legend={[
        { key: "equity", label: "Equity", color: STRATEGY_COLOR.hold, shape: "area" },
        { key: "debt", label: "Debt", color: "var(--cost)", shape: "area" },
      ]}
      table={{
        caption: "Portfolio equity, debt and market value at each year end",
        columns: ["Year", "Equity", "Debt", "Property value"],
        rows: years.map((d) => [
          d.year,
          fmtMoney(d.equity),
          fmtMoney(d.loanBalance),
          fmtMoney(d.propertyValue),
        ]),
      }}
    >
      <div ref={ref} className="relative" style={{ height: HEIGHT }}>
        <div
          role="slider"
          tabIndex={0}
          aria-label="Scrubber year"
          aria-valuemin={first}
          aria-valuemax={last}
          aria-valuenow={scrubYear}
          aria-valuetext={
            current
              ? `End of ${scrubYear}: equity ${fmtMoney(current.equity)}, debt ${fmtMoney(current.loanBalance)}, property value ${fmtMoney(current.propertyValue)}`
              : String(scrubYear)
          }
          onKeyDown={onKeyDown}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          className="focus-visible:ring-accent absolute inset-0 rounded-lg outline-none focus-visible:ring-2"
        >
          <svg
            ref={svgRef}
            width={width}
            height={HEIGHT}
            className="block cursor-ew-resize select-none"
            style={{ touchAction: "pan-y" }}
            aria-hidden="true"
            onPointerDown={(e) => {
              dragging.current = true;
              e.currentTarget.setPointerCapture(e.pointerId);
              onScrub(yearAt(e.clientX));
            }}
            onPointerMove={(e) => {
              const yr = yearAt(e.clientX);
              setHover(yr);
              if (dragging.current) onScrub(yr);
            }}
            onPointerUp={(e) => {
              dragging.current = false;
              if (e.currentTarget.hasPointerCapture(e.pointerId))
                e.currentTarget.releasePointerCapture(e.pointerId);
            }}
            onPointerLeave={() => setHover(null)}
          >
            <g transform={`translate(${M.left},${M.top})`}>
              {yTicks.map((t) => (
                <g key={t}>
                  <line x1={0} x2={iw} y1={y(t)} y2={y(t)} stroke="var(--grid)" strokeWidth={1} />
                  <text x={-10} y={y(t)} dy="0.32em" textAnchor="end" className="chart-text">
                    {fmtCompact(t)}
                  </text>
                </g>
              ))}
              {yearTicks.map((t) => (
                <text key={t} x={x(t)} y={ih + 20} textAnchor="middle" className="chart-text">
                  {t}
                </text>
              ))}

              <motion.g
                initial={{ clipPath: reduce ? REVEALED : HIDDEN }}
                animate={{ clipPath: REVEALED }}
                transition={{ duration: reduce ? 0 : 1.1, ease: [0.22, 1, 0.36, 1] }}
              >
                <path
                  d={equityArea}
                  fill={STRATEGY_COLOR.hold}
                  fillOpacity={0.85}
                  stroke="var(--surface)"
                  strokeWidth={2}
                  strokeLinejoin="round"
                />
                <path
                  d={debtArea}
                  fill="var(--cost)"
                  fillOpacity={0.55}
                  stroke="var(--surface)"
                  strokeWidth={2}
                  strokeLinejoin="round"
                />
                <path d={valueEdge} fill="none" stroke="var(--cost)" strokeWidth={1.5} />
                <path
                  d={equityEdge}
                  fill="none"
                  stroke={STRATEGY_COLOR.hold}
                  strokeWidth={2}
                  strokeLinejoin="round"
                />
              </motion.g>

              {eqLabelY !== null && (
                <text
                  x={iw + 8}
                  y={eqLabelY}
                  dy="0.32em"
                  className="chart-text"
                  style={{ fill: "var(--ink-2)", fontWeight: 600 }}
                >
                  Equity
                </text>
              )}
              {debtLabelY !== null && (
                <text
                  x={iw + 8}
                  y={debtLabelY}
                  dy="0.32em"
                  className="chart-text"
                  style={{ fill: "var(--ink-2)", fontWeight: 600 }}
                >
                  Debt
                </text>
              )}

              {tooltipYear !== null && tip && (
                <g pointerEvents="none">
                  <line
                    x1={x(tip.year)}
                    x2={x(tip.year)}
                    y1={0}
                    y2={ih}
                    stroke="var(--ink-3)"
                    strokeWidth={1}
                    strokeDasharray="3 3"
                  />
                  <circle
                    cx={x(tip.year)}
                    cy={y(equityTop(tip))}
                    r={4}
                    fill="var(--surface)"
                    stroke={STRATEGY_COLOR.hold}
                    strokeWidth={2}
                  />
                  <circle
                    cx={x(tip.year)}
                    cy={y(tip.propertyValue)}
                    r={4}
                    fill="var(--surface)"
                    stroke="var(--cost)"
                    strokeWidth={2}
                  />
                </g>
              )}

              {current && (
                <g pointerEvents="none">
                  <line
                    x1={x(scrubYear)}
                    x2={x(scrubYear)}
                    y1={-6}
                    y2={ih}
                    stroke="var(--accent)"
                    strokeWidth={2}
                  />
                  <rect
                    x={x(scrubYear) - 24}
                    y={-30}
                    width={48}
                    height={22}
                    rx={11}
                    fill="var(--accent)"
                  />
                  <text
                    x={x(scrubYear)}
                    y={-15}
                    textAnchor="middle"
                    className="chart-text"
                    style={{ fill: "var(--accent-ink)", fontWeight: 700 }}
                  >
                    {scrubYear}
                  </text>
                </g>
              )}
            </g>
          </svg>
        </div>

        {tip && tooltipYear !== null && (
          <ChartTooltip x={M.left + x(tip.year)} y={M.top + 8} containerWidth={width}>
            <p className="text-ink mb-1 font-semibold">End of {tip.year}</p>
            <TooltipRow color={STRATEGY_COLOR.hold} label="Equity" value={fmtMoney(tip.equity)} />
            <TooltipRow color="var(--cost)" label="Debt" value={fmtMoney(tip.loanBalance)} />
            <div className="border-line mt-1 border-t pt-1">
              <TooltipRow label="Property value" value={fmtMoney(tip.propertyValue)} strong />
            </div>
          </ChartTooltip>
        )}
      </div>
    </ChartFrame>
  );
}
