"use client";

import { extent } from "d3-array";
import { scaleLinear } from "d3-scale";
import { curveMonotoneX, line } from "d3-shape";
import { motion, useReducedMotion } from "framer-motion";
import { useMemo } from "react";
import type { ScenarioResults } from "@/engine/types";
import { fmtCompact } from "@/lib/format";
import { STRATEGY_COLOR, STRATEGY_DASH, STRATEGY_LABEL, STRATEGY_ORDER } from "@/lib/strategy";

const W = 340;
const H = 104;
const RIGHT = 92;

/** Three-line sparkline of liquidated net worth with tiny direct labels at the line ends. */
export function Sparkline({ results, label }: { results: ScenarioResults; label: string }) {
  const reduce = useReducedMotion() ?? false;
  const geo = useMemo(() => {
    const years = results.hold.years.map((r) => r.year);
    const x = scaleLinear()
      .domain([years[0] ?? 0, years[years.length - 1] ?? 1])
      .range([2, W - RIGHT]);
    const all = STRATEGY_ORDER.flatMap((k) => results[k].years.map((r) => r.netWorthLiquidated));
    const [lo = 0, hi = 1] = extent(all);
    const y = scaleLinear()
      .domain([lo, hi])
      .range([H - 8, 8]);
    const gen = line<{ year: number; v: number }>()
      .x((p) => x(p.year))
      .y((p) => y(p.v))
      .curve(curveMonotoneX);
    const lines = STRATEGY_ORDER.map((kind) => {
      const pts = results[kind].years.map((r) => ({ year: r.year, v: r.netWorthLiquidated }));
      const last = pts[pts.length - 1] ?? { year: 0, v: 0 };
      return { kind, d: gen(pts) ?? "", ex: x(last.year), ey: y(last.v), end: last.v };
    });
    // Keep the end labels at least 12px apart.
    const sorted = [...lines].sort((a, b) => a.ey - b.ey);
    const labelY = new Map<string, number>();
    let prev = -Infinity;
    for (const l of sorted) {
      const ly = Math.max(l.ey, prev + 12);
      labelY.set(l.kind, ly);
      prev = ly;
    }
    return { lines, labelY };
  }, [results]);

  const summary = `${label}: ${geo.lines.map((l) => `${STRATEGY_LABEL[l.kind]} ends at ${fmtCompact(l.end)}`).join(", ")}.`;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={summary}
      className="h-auto w-full overflow-visible"
    >
      <line x1={0} x2={W - RIGHT + 6} y1={H - 1} y2={H - 1} stroke="var(--grid)" />
      {geo.lines.map((l, i) => (
        <g key={l.kind}>
          <motion.path
            d={l.d}
            fill="none"
            stroke={STRATEGY_COLOR[l.kind]}
            strokeWidth={2}
            strokeLinecap="round"
            strokeDasharray={STRATEGY_DASH[l.kind]}
            initial={{ pathLength: 0 }}
            whileInView={{ pathLength: 1 }}
            viewport={{ once: true }}
            transition={{
              duration: reduce ? 0 : 1.4,
              delay: reduce ? 0 : 0.2 + i * 0.12,
              ease: [0.22, 1, 0.36, 1],
            }}
          />
          <circle cx={l.ex} cy={l.ey} r={3} fill={STRATEGY_COLOR[l.kind]} />
          <text
            x={l.ex + 9}
            y={(geo.labelY.get(l.kind) ?? l.ey) + 3.5}
            className="chart-text"
            style={{ fontSize: 10.5 }}
          >
            <tspan fontWeight={600} fill="var(--ink-2)">
              {l.kind === "exchange" ? "1031" : STRATEGY_LABEL[l.kind]}
            </tspan>{" "}
            <tspan>{fmtCompact(l.end)}</tspan>
          </text>
        </g>
      ))}
    </svg>
  );
}
