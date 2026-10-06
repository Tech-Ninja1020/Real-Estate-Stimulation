"use client";

import { motion, useReducedMotion } from "framer-motion";
import { scaleLinear } from "d3-scale";
import { useEffect, useMemo, useRef, useState } from "react";
import { ChartFrame } from "@/components/charts/ChartFrame";
import { ChartTooltip, TooltipRow } from "@/components/charts/ChartTooltip";
import { Money } from "@/components/math/Fig";
import { fitText, roundedTopBar } from "@/components/portfolio/facts";
import { cn } from "@/lib/cn";
import { fmtCompact, fmtMoney } from "@/lib/format";
import { useChartSize } from "@/lib/use-chart-size";
import { buildDepreciationSchedule } from "@/engine/depreciation";
import type { DepreciationScheduleRow } from "@/engine/depreciation";
import type { PropertyTimeline, Year } from "@/engine/types";

const HEIGHT = 190;
const M = { top: 44, right: 16, bottom: 26, left: 56 };

interface Mark {
  key: string;
  year: Year;
  label: string;
  kind: "purchase" | "improvement" | "complete" | "today";
}

/** Annual depreciation chart plus the full year-by-year schedule, with the scrubber year highlighted. */
export function DepreciationSchedule({
  timeline,
  asOfYear,
  horizonYear,
  scrubYear,
}: {
  timeline: PropertyTimeline;
  asOfYear: Year;
  horizonYear: Year;
  scrubYear: Year;
}) {
  const reduce = useReducedMotion();
  const [ref, { width }] = useChartSize<HTMLDivElement>({ width: 760, height: HEIGHT });
  const [hover, setHover] = useState<number | null>(null);
  const scroller = useRef<HTMLDivElement>(null);

  const tranches = timeline.tranches;
  const buildingIds = useMemo(
    () => new Set(tranches.filter((t) => t.kind === "building").map((t) => t.id)),
    [tranches],
  );
  const hasImprovements = tranches.some((t) => t.kind !== "building");

  const rows: DepreciationScheduleRow[] = useMemo(() => {
    if (tranches.length === 0) return [];
    const firstYear = Math.min(...tranches.map((t) => t.placedInServiceYear));
    const lastPlaced = Math.max(...tranches.map((t) => t.placedInServiceYear));
    const all = buildDepreciationSchedule(tranches, firstYear, Math.max(horizonYear, lastPlaced));
    // Stop once every tranche is placed in service and fully depreciated.
    const done = all.findIndex((r) => r.remainingDepreciableBasis === 0 && r.year >= lastPlaced);
    const cut = done >= 0 ? all.slice(0, done + 1) : all;
    return cut.filter((r) => r.year <= Math.max(horizonYear, lastPlaced));
  }, [tranches, horizonYear]);

  const split = (r: DepreciationScheduleRow) => {
    let building = 0;
    let improvements = 0;
    for (const [id, v] of Object.entries(r.byTranche)) {
      if (buildingIds.has(id)) building += v;
      else improvements += v;
    }
    return { building, improvements };
  };

  const marks: Mark[] = useMemo(() => {
    const out: Mark[] = [];
    const bld = tranches.filter((t) => t.kind === "building");
    const purchase = Math.min(...tranches.map((t) => t.placedInServiceYear));
    out.push({ key: "purchase", year: purchase, label: `Purchased ${purchase}`, kind: "purchase" });
    for (const t of tranches.filter((t) => t.kind !== "building")) {
      out.push({
        key: t.id,
        year: t.placedInServiceYear,
        label: `${t.label} ${t.placedInServiceYear}`,
        kind: "improvement",
      });
    }
    // The year the building's 27.5 years end: the last year it still deducts anything.
    let completeYear: Year | null = null;
    for (const r of rows) if (bld.some((b) => (r.byTranche[b.id] ?? 0) > 0)) completeYear = r.year;
    const lastRow = rows[rows.length - 1];
    const buildingDone =
      completeYear !== null &&
      lastRow !== undefined &&
      (completeYear < lastRow.year || lastRow.remainingDepreciableBasis === 0);
    if (completeYear !== null && buildingDone) {
      out.push({
        key: "complete",
        year: completeYear,
        label: `27.5 years complete ${completeYear}`,
        kind: "complete",
      });
    }
    if (asOfYear >= (rows[0]?.year ?? 0) && asOfYear <= (lastRow?.year ?? 0))
      out.push({ key: "today", year: asOfYear, label: "Today", kind: "today" });
    return out;
  }, [tranches, rows, asOfYear]);

  useEffect(() => {
    const box = scroller.current;
    if (!box) return;
    const tr = box.querySelector<HTMLElement>(`tr[data-year="${scrubYear}"]`);
    if (!tr) return;
    const top = tr.offsetTop - box.clientHeight / 2 + tr.clientHeight / 2;
    box.scrollTo({ top: Math.max(0, top), behavior: reduce ? "auto" : "smooth" });
  }, [scrubYear, reduce, rows.length]);

  if (rows.length === 0) return null;

  const n = rows.length;
  const iw = Math.max(100, width - M.left - M.right);
  const ih = HEIGHT - M.top - M.bottom;
  const step = iw / n;
  const cx = (i: number) => (i + 0.5) * step;
  const idxOf = (year: Year) => rows.findIndex((r) => r.year === year);
  const maxD = Math.max(1, ...rows.map((r) => r.depreciation));
  const y = scaleLinear().domain([0, maxD]).nice(3).range([ih, 0]);
  const bw = Math.min(26, step * 0.68);
  const tickEvery = step >= 40 ? 1 : step >= 20 ? 2 : 5;

  // Greedy label placement so annotations never collide.
  let lastEnd = -Infinity;
  const labelled = new Set<string>();
  [...marks]
    .filter((m) => m.kind !== "today")
    .sort((a, b) => a.year - b.year)
    .forEach((m) => {
      const i = idxOf(m.year);
      if (i < 0) return;
      const w = m.label.length * 5.8 + 10;
      const x0 = cx(i) - w / 2;
      if (x0 >= lastEnd) {
        labelled.add(m.key);
        lastEnd = x0 + w;
      }
    });

  const inWindowAnnual = (yr: Year) => yr > asOfYear && yr <= horizonYear;
  const inWindowAccum = (yr: Year) => yr >= asOfYear && yr <= horizonYear;
  const tip = hover !== null ? rows[hover] : undefined;
  const tipSplit = tip ? split(tip) : undefined;
  const tagFor = (yr: Year) => marks.filter((m) => m.year === yr).map((m) => m.kind);

  return (
    <ChartFrame
      title="Depreciation schedule"
      subtitle="Residential rental property depreciates straight-line over 27.5 years with the mid-month convention. Every improvement starts its own 27.5-year clock."
      legend={[
        { key: "b", label: "Building", color: "var(--tax-3)", shape: "swatch" },
        ...(hasImprovements
          ? [{ key: "i", label: "Improvements", color: "var(--tax-1)", shape: "swatch" as const }]
          : []),
      ]}
    >
      <div ref={ref} className="relative" style={{ height: HEIGHT }}>
        <svg
          width={width}
          height={HEIGHT}
          role="img"
          aria-label={`Annual depreciation from ${rows[0]?.year} to ${rows[n - 1]?.year}, peaking at ${fmtCompact(maxD)} a year. The full schedule follows in the table.`}
          onPointerLeave={() => setHover(null)}
        >
          <g transform={`translate(${M.left},${M.top})`}>
            {y.ticks(3).map((t) => (
              <g key={t}>
                <line x1={0} x2={iw} y1={y(t)} y2={y(t)} stroke="var(--grid)" />
                <text x={-10} y={y(t)} dy="0.32em" textAnchor="end" className="chart-text">
                  {fmtCompact(t)}
                </text>
              </g>
            ))}
            {rows.map((r, i) =>
              i % tickEvery === 0 ? (
                <text key={r.year} x={cx(i)} y={ih + 18} textAnchor="middle" className="chart-text">
                  {r.year}
                </text>
              ) : null,
            )}
            {rows.map((r, i) => {
              const { building, improvements } = split(r);
              const yB = y(building);
              const yT = y(building + improvements);
              const x0 = cx(i) - bw / 2;
              const delay = reduce ? 0 : 0.15 + i * 0.015;
              return (
                <motion.g
                  key={r.year}
                  initial={{ opacity: reduce ? 1 : 0, y: reduce ? 0 : 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: reduce ? 0 : 0.45, delay }}
                >
                  <rect
                    x={cx(i) - step / 2}
                    y={-6}
                    width={step}
                    height={ih + 6}
                    fill="transparent"
                    onPointerEnter={() => setHover(i)}
                  />
                  {building > 0 && (
                    <path
                      d={roundedTopBar(x0, yB, bw, ih - yB, 4, improvements <= 0)}
                      fill="var(--tax-3)"
                      stroke="var(--surface)"
                      strokeWidth={1}
                    />
                  )}
                  {improvements > 0 && (
                    <path
                      d={roundedTopBar(
                        x0,
                        yT,
                        bw,
                        Math.max(0, yB - yT - (building > 0 ? 2 : 0)),
                        4,
                        true,
                      )}
                      fill="var(--tax-1)"
                    />
                  )}
                </motion.g>
              );
            })}

            {marks.map((m) => {
              const i = idxOf(m.year);
              if (i < 0) return null;
              const x = cx(i);
              if (m.kind === "today") {
                return (
                  <line
                    key={m.key}
                    x1={x}
                    x2={x}
                    y1={0}
                    y2={ih}
                    stroke="var(--ink-3)"
                    strokeDasharray="2 4"
                    pointerEvents="none"
                  />
                );
              }
              return (
                <g key={m.key} pointerEvents="none">
                  <line
                    x1={x}
                    x2={x}
                    y1={-8}
                    y2={ih}
                    stroke={m.kind === "complete" ? "var(--amber)" : "var(--ink-3)"}
                    strokeDasharray={m.kind === "complete" ? "4 3" : "1 3"}
                  />
                  {m.kind === "improvement" ? (
                    <path
                      d={`M${x},${-22}l4.5,4.5l-4.5,4.5l-4.5,-4.5z`}
                      fill="var(--tax-1)"
                      stroke="var(--surface)"
                    />
                  ) : (
                    <circle
                      cx={x}
                      cy={-17}
                      r={3.5}
                      fill={m.kind === "complete" ? "var(--amber)" : "var(--ink-2)"}
                      stroke="var(--surface)"
                    />
                  )}
                  {labelled.has(m.key) && (
                    <text
                      x={Math.min(iw - 4, Math.max(4, x))}
                      y={-28}
                      textAnchor={x > iw - 80 ? "end" : x < 80 ? "start" : "middle"}
                      className="chart-text"
                      style={{
                        fill: m.kind === "complete" ? "var(--amber)" : "var(--ink-2)",
                        fontWeight: 600,
                        fontSize: 10.5,
                      }}
                    >
                      {fitText(m.label, 200, 5.8)}
                    </text>
                  )}
                </g>
              );
            })}

            {idxOf(scrubYear) >= 0 && (
              <g pointerEvents="none">
                <line
                  x1={cx(idxOf(scrubYear))}
                  x2={cx(idxOf(scrubYear))}
                  y1={0}
                  y2={ih}
                  stroke="var(--accent)"
                  strokeWidth={2}
                />
              </g>
            )}
          </g>
        </svg>
        {tip && tipSplit && (
          <ChartTooltip x={M.left + cx(hover ?? 0)} y={M.top} containerWidth={width} width={210}>
            <p className="text-ink mb-1 font-semibold">{tip.year}</p>
            <TooltipRow color="var(--tax-3)" label="Building" value={fmtMoney(tipSplit.building)} />
            {hasImprovements && (
              <TooltipRow
                color="var(--tax-1)"
                label="Improvements"
                value={fmtMoney(tipSplit.improvements)}
              />
            )}
            <div className="border-line mt-1 border-t pt-1">
              <TooltipRow label="Total" value={fmtMoney(tip.depreciation)} strong />
            </div>
          </ChartTooltip>
        )}
      </div>

      <div
        ref={scroller}
        className="border-line relative mt-5 max-h-[26rem] overflow-auto rounded-xl border"
        tabIndex={0}
        role="region"
        aria-label="Depreciation schedule table"
      >
        <table className="num w-full min-w-[40rem] border-separate border-spacing-0 text-left text-sm">
          <caption className="sr-only">Year-by-year depreciation for {timeline.name}</caption>
          <thead>
            <tr className="text-ink-3 text-xs">
              {[
                "Year",
                "Building",
                ...(hasImprovements ? ["Improvements"] : []),
                "Total depreciation",
                "Accumulated",
                "Remaining basis",
              ].map((h, i) => (
                <th
                  key={h}
                  scope="col"
                  className={cn(
                    "border-line bg-surface-2 sticky top-0 z-10 border-b px-3 py-2.5 font-medium",
                    i > 0 && "text-right",
                  )}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const { building, improvements } = split(r);
              const here = r.year === scrubYear;
              const tags = tagFor(r.year);
              return (
                <tr
                  key={r.year}
                  data-year={r.year}
                  aria-current={here ? "true" : undefined}
                  className={cn(here ? "bg-accent-soft" : "hover:bg-surface-2/60")}
                >
                  <td
                    className={cn(
                      "border-line text-ink border-b px-3 py-2 font-medium",
                      here && "border-l-accent border-l-2",
                    )}
                  >
                    <span className="inline-flex flex-wrap items-center gap-1.5">
                      {r.year}
                      {tags.includes("purchase") && (
                        <span className="bg-surface-3 text-ink-2 rounded-full px-1.5 py-px text-[10px] font-medium">
                          Purchased
                        </span>
                      )}
                      {tags.includes("improvement") && (
                        <span className="bg-amber-soft text-amber rounded-full px-1.5 py-px text-[10px] font-medium">
                          Improvement
                        </span>
                      )}
                      {tags.includes("complete") && (
                        <span className="bg-amber-soft text-amber rounded-full px-1.5 py-px text-[10px] font-medium">
                          27.5 yrs complete
                        </span>
                      )}
                      {tags.includes("today") && (
                        <span className="bg-surface-3 text-ink-2 rounded-full px-1.5 py-px text-[10px] font-medium">
                          Today
                        </span>
                      )}
                    </span>
                  </td>
                  <td className="border-line text-ink-2 border-b px-3 py-2 text-right">
                    {fmtMoney(building)}
                  </td>
                  {hasImprovements && (
                    <td className="border-line text-ink-2 border-b px-3 py-2 text-right">
                      {fmtMoney(improvements)}
                    </td>
                  )}
                  <td className="border-line text-ink border-b px-3 py-2 text-right font-medium">
                    <Money
                      cents={r.depreciation}
                      tween={false}
                      trace={
                        inWindowAnnual(r.year)
                          ? {
                              kind: "annualDepreciation",
                              strategy: "hold",
                              propertyId: timeline.id,
                              year: r.year,
                            }
                          : undefined
                      }
                    />
                  </td>
                  <td className="border-line text-ink border-b px-3 py-2 text-right">
                    <Money
                      cents={r.accumulated}
                      tween={false}
                      trace={
                        inWindowAccum(r.year)
                          ? {
                              kind: "accumulatedDepreciation",
                              strategy: "hold",
                              propertyId: timeline.id,
                              year: r.year,
                            }
                          : undefined
                      }
                    />
                  </td>
                  <td className="border-line text-ink-2 border-b px-3 py-2 text-right">
                    {fmtMoney(r.remainingDepreciableBasis)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-ink-3 mt-2 text-xs">
        Figures are clickable from {asOfYear + 1} onward, the years inside the simulation window.
      </p>
    </ChartFrame>
  );
}
