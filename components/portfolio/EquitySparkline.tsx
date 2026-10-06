"use client";

import { motion, useReducedMotion } from "framer-motion";
import { scaleLinear } from "d3-scale";
import { area, line } from "d3-shape";
import { useId } from "react";
import { STRATEGY_COLOR } from "@/lib/strategy";
import { fmtCompact } from "@/lib/format";
import { useChartSize } from "@/lib/use-chart-size";
import type { PropertyYearRow, Year } from "@/engine/types";

/** A tiny equity-over-time line with a dot on the scrubber year. Decorative detail, summarised in the label. */
export function EquitySparkline({
  rows,
  year,
  name,
}: {
  rows: readonly PropertyYearRow[];
  year: Year;
  name: string;
}) {
  const reduce = useReducedMotion();
  const [ref, { width }] = useChartSize<HTMLDivElement>({ width: 260, height: 52 });
  const gradientId = useId();
  const height = 52;
  const pad = { top: 6, bottom: 4, left: 4, right: 6 };
  const first = rows[0];
  const last = rows[rows.length - 1];
  if (!first || !last) return null;

  const x = scaleLinear()
    .domain([first.year, last.year])
    .range([pad.left, Math.max(pad.left + 10, width - pad.right)]);
  const lo = Math.min(...rows.map((r) => r.equity));
  const hi = Math.max(lo + 1, ...rows.map((r) => r.equity));
  const y = scaleLinear()
    .domain([lo, hi])
    .range([height - pad.bottom, pad.top]);
  const linePath = line<PropertyYearRow>()
    .x((d) => x(d.year))
    .y((d) => y(d.equity))(rows as PropertyYearRow[]);
  const areaPath = area<PropertyYearRow>()
    .x((d) => x(d.year))
    .y0(y(lo))
    .y1((d) => y(d.equity))(rows as PropertyYearRow[]);
  const current = rows.find((r) => r.year === year) ?? last;

  return (
    <div ref={ref} className="h-[52px] w-full">
      <svg
        width={width}
        height={height}
        role="img"
        aria-label={`${name} equity from ${fmtCompact(first.equity)} in ${first.year} to ${fmtCompact(last.equity)} in ${last.year}; ${fmtCompact(current.equity)} at the end of ${current.year}`}
        className="block overflow-visible"
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={STRATEGY_COLOR.hold} stopOpacity="0.22" />
            <stop offset="100%" stopColor={STRATEGY_COLOR.hold} stopOpacity="0" />
          </linearGradient>
        </defs>
        <motion.path
          d={areaPath ?? ""}
          fill={`url(#${gradientId})`}
          initial={{ opacity: reduce ? 1 : 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: reduce ? 0 : 0.8, delay: reduce ? 0 : 0.3 }}
        />
        <motion.path
          d={linePath ?? ""}
          fill="none"
          stroke={STRATEGY_COLOR.hold}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={{ pathLength: reduce ? 1 : 0 }}
          animate={{ pathLength: 1 }}
          transition={{
            duration: reduce ? 0 : 0.9,
            delay: reduce ? 0 : 0.2,
            ease: [0.22, 1, 0.36, 1],
          }}
        />
        <circle
          cx={x(current.year)}
          cy={y(current.equity)}
          r={6}
          fill={STRATEGY_COLOR.hold}
          opacity={0.18}
        />
        <circle
          cx={x(current.year)}
          cy={y(current.equity)}
          r={3.5}
          fill="var(--surface)"
          stroke={STRATEGY_COLOR.hold}
          strokeWidth={2}
        />
      </svg>
    </div>
  );
}
