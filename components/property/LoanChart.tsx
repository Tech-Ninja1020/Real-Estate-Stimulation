"use client";

import { motion, useReducedMotion } from "framer-motion";
import { scaleLinear } from "d3-scale";
import { line } from "d3-shape";
import { useCallback, useMemo, useRef, useState } from "react";
import { ChartFrame } from "@/components/charts/ChartFrame";
import type { LegendItem } from "@/components/charts/ChartFrame";
import { ChartTooltip, TooltipRow } from "@/components/charts/ChartTooltip";
import { Money } from "@/components/math/Fig";
import { fitText, roundedTopBar } from "@/components/portfolio/facts";
import { Segmented } from "@/components/ui/primitives";
import { fmtCompact, fmtMoney, fmtPercent } from "@/lib/format";
import { STRATEGY_COLOR } from "@/lib/strategy";
import { useChartSize } from "@/lib/use-chart-size";
import type {
  Cents,
  LoanPhase,
  LoanSchedule,
  LoanYearRow,
  PropertyTimeline,
  Rate,
  Year,
} from "@/engine/types";

const PHASE_LABEL: Record<LoanPhase, string> = {
  notStarted: "Not started",
  fixed: "Fixed",
  interestOnly: "Interest-only",
  amortizing: "Amortizing",
  armFixed: "ARM fixed",
  armAdjusting: "ARM adjusting",
  helocDraw: "HELOC draw",
  helocRepay: "HELOC repay",
  paidOff: "Paid off",
};

const tint = (color: string, pct: number) => `color-mix(in srgb, ${color} ${pct}%, transparent)`;
const PHASE_TINT: Record<LoanPhase, string> = {
  notStarted: "transparent",
  fixed: tint("var(--ink)", 5),
  interestOnly: tint("var(--c-hold)", 12),
  amortizing: tint("var(--accent)", 10),
  armFixed: tint("var(--ink)", 5),
  armAdjusting: tint("var(--amber-fill)", 22),
  helocDraw: tint("var(--c-hold)", 12),
  helocRepay: tint("var(--accent)", 10),
  paidOff: tint("var(--ink)", 2.5),
};

const PHASE_LEGEND: Record<LoanPhase, string> = {
  notStarted: "var(--surface-2)",
  fixed: tint("var(--ink)", 14),
  interestOnly: tint("var(--c-hold)", 32),
  amortizing: tint("var(--accent)", 30),
  armFixed: tint("var(--ink)", 14),
  armAdjusting: tint("var(--amber-fill)", 55),
  helocDraw: tint("var(--c-hold)", 32),
  helocRepay: tint("var(--accent)", 30),
  paidOff: tint("var(--ink)", 8),
};

interface Point {
  year: Year;
  opening: Cents;
  draws: Cents;
  interest: Cents;
  principal: Cents;
  payment: Cents;
  closing: Cents;
  rate: Rate | null;
  phase: LoanPhase | null;
  capHit: LoanYearRow["capHit"];
}

interface Run {
  phase: LoanPhase;
  from: number;
  to: number;
}

const HIDDEN = "inset(-8px 100% -8px -8px)";
const REVEALED = "inset(-8px -8px -8px -8px)";
const HEIGHT_TOP = 220;
const HEIGHT_BARS = 100;
const HEIGHT_RATE = 56;
const M = { top: 34, right: 66, bottom: 30, left: 58 };

function toPoint(r: LoanYearRow): Point {
  return {
    year: r.year,
    opening: r.openingBalance,
    draws: r.draws,
    interest: r.interest,
    principal: r.principal,
    payment: r.payment,
    closing: r.closingBalance,
    rate: r.endRate,
    phase: r.phase,
    capHit: r.capHit,
  };
}

function runsOf(points: readonly Point[]): Run[] {
  const runs: Run[] = [];
  points.forEach((p, i) => {
    if (!p.phase) return;
    const prev = runs[runs.length - 1];
    if (prev && prev.phase === p.phase && prev.to === i - 1) prev.to = i;
    else runs.push({ phase: p.phase, from: i, to: i });
  });
  return runs;
}

function capNote(c: LoanYearRow["capHit"]): string {
  return c === "periodic"
    ? "Periodic cap limited this reset"
    : c === "lifetime"
      ? "Lifetime cap reached"
      : "";
}

/**
 * Loan amortization with its phases made visible: interest-only stretches stay flat, HELOC draws
 * step the balance up, ARM resets are flagged (amber when a cap bites). One loan at a time, or all
 * loans combined.
 */
export function LoanChart({
  timeline,
  asOfYear,
  horizonYear,
  scrubYear,
  onScrub,
}: {
  timeline: PropertyTimeline;
  asOfYear: Year;
  horizonYear: Year;
  scrubYear: Year;
  onScrub: (year: Year) => void;
}) {
  const reduce = useReducedMotion();
  const schedules = timeline.loanSchedules;
  const [selected, setSelected] = useState<string>(
    schedules.length > 1 ? "all" : (schedules[0]?.loanId ?? "all"),
  );
  const [ref, { width }] = useChartSize<HTMLDivElement>({ width: 760, height: 400 });
  const svgRef = useRef<SVGSVGElement>(null);
  const dragging = useRef(false);
  const [hover, setHover] = useState<number | null>(null);
  const [focused, setFocused] = useState(false);

  const loans: LoanSchedule[] = useMemo(
    () => (selected === "all" ? [...schedules] : schedules.filter((s) => s.loanId === selected)),
    [schedules, selected],
  );
  const single = loans.length === 1 ? loans[0] : undefined;

  // Year range: the later of loan start and (as-of − 5) through the horizon, trimmed after payoff.
  const range = useMemo(() => {
    const starts = loans.map((l) => l.rows[0]?.year ?? horizonYear);
    const start = Math.max(Math.min(...starts), asOfYear - 5);
    let lastActive = -Infinity;
    for (const l of loans)
      for (const r of l.rows)
        if (r.openingBalance > 0 || r.closingBalance > 0) lastActive = Math.max(lastActive, r.year);
    const end = Math.min(horizonYear, lastActive + 1);
    return { start, end, lastActive };
  }, [loans, asOfYear, horizonYear]);

  const points: Point[] = useMemo(() => {
    const out: Point[] = [];
    for (let yr = range.start; yr <= range.end; yr++) {
      const rows = loans
        .map((l) => l.rows.find((r) => r.year === yr))
        .filter((r): r is LoanYearRow => !!r);
      if (rows.length === 0) continue;
      if (single) {
        const only = rows[0];
        if (only) out.push(toPoint(only));
        continue;
      }
      const sum = (pick: (r: LoanYearRow) => Cents) => rows.reduce((a, r) => a + pick(r), 0);
      out.push({
        year: yr,
        opening: sum((r) => r.openingBalance),
        draws: sum((r) => r.draws),
        interest: sum((r) => r.interest),
        principal: sum((r) => r.principal),
        payment: sum((r) => r.payment),
        closing: sum((r) => r.closingBalance),
        rate: null,
        phase: null,
        capHit: rows.some((r) => r.capHit !== "none") ? "periodic" : "none",
      });
    }
    return out;
  }, [loans, range, single]);

  const n = points.length;
  const lanes = !single ? loans : [];
  const laneH = 30;
  const lanesH = lanes.length > 0 ? lanes.length * laneH + 6 : 0;
  const showRate = !!single;
  const iw = Math.max(120, width - M.left - M.right);
  const step = n > 0 ? iw / n : iw;
  const cx = (i: number) => (i + 0.5) * step;

  const topY0 = 20 + lanesH;
  const topY1 = topY0 + HEIGHT_TOP;
  const barsY0 = topY1 + 42;
  const barsY1 = barsY0 + HEIGHT_BARS;
  const rateY0 = barsY1 + 42;
  const rateY1 = rateY0 + HEIGHT_RATE;
  const plotBottom = showRate ? rateY1 : barsY1;
  const totalH = M.top + plotBottom + 32;

  const maxBal = Math.max(1, ...points.map((p) => Math.max(p.opening + p.draws, p.closing)));
  const yBal = scaleLinear()
    .domain([0, maxBal * 1.1])
    .nice(4)
    .range([topY1, topY0 + (single ? 28 : 8)]);
  const maxPay = Math.max(1, ...points.map((p) => p.interest + p.principal));
  const yBar = scaleLinear().domain([0, maxPay]).nice(3).range([barsY1, barsY0]);
  const rates = points.map((p) => p.rate ?? 0);
  const rLo = Math.min(...rates, Infinity);
  const rHi = Math.max(...rates, -Infinity);
  const rPad = Math.max(0.004, (rHi - rLo) * 0.25);
  const yRate = scaleLinear()
    .domain([Math.max(0, rLo - rPad), rHi + rPad])
    .range([rateY1, rateY0]);

  // Balance path: flat/linear year-end balances, with a vertical step wherever a draw happens.
  const balancePath: [number, number][] = [];
  points.forEach((p, i) => {
    if (p.draws > 0) {
      balancePath.push([cx(i), yBal(p.opening)]);
      balancePath.push([cx(i), yBal(p.opening + p.draws)]);
    }
    balancePath.push([cx(i), yBal(p.closing)]);
  });
  const lineD =
    line<[number, number]>()
      .x((d) => d[0])
      .y((d) => d[1])(balancePath) ?? "";
  const areaD =
    balancePath.length > 0
      ? `${lineD}L${balancePath[balancePath.length - 1]?.[0]},${topY1}L${balancePath[0]?.[0]},${topY1}Z`
      : "";
  const rateD =
    line<Point>()
      .x((_, i) => cx(i))
      .y((d) => yRate(d.rate ?? 0))(points) ?? "";

  const runs = single ? runsOf(points) : [];
  const phasesPresent = useMemo(() => {
    const set = new Set<LoanPhase>();
    for (const l of loans)
      for (const p of runsOf(
        points.map((pt) => ({
          ...pt,
          phase: l.rows.find((r) => r.year === pt.year)?.phase ?? null,
        })),
      ))
        set.add(p.phase);
    return [...set];
  }, [loans, points]);

  const tickEvery = step >= 52 ? 1 : step >= 26 ? 2 : step >= 15 ? 5 : 10;
  const first = points[0]?.year ?? range.start;
  const lastYear = points[n - 1]?.year ?? range.end;
  const effYear = Math.min(lastYear, Math.max(first, scrubYear));
  const effIdx = points.findIndex((p) => p.year === effYear);

  const idxAt = useCallback(
    (clientX: number) => {
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect || n === 0) return 0;
      return Math.min(n - 1, Math.max(0, Math.floor((clientX - rect.left - M.left) / step)));
    },
    [n, step],
  );

  const onKeyDown = (e: React.KeyboardEvent) => {
    const d = e.shiftKey ? 5 : 1;
    let next: number | null = null;
    if (e.key === "ArrowLeft" || e.key === "ArrowDown") next = effYear - d;
    else if (e.key === "ArrowRight" || e.key === "ArrowUp") next = effYear + d;
    else if (e.key === "Home") next = first;
    else if (e.key === "End") next = lastYear;
    if (next === null) return;
    e.preventDefault();
    onScrub(Math.min(lastYear, Math.max(first, next)));
  };

  const options = [
    { value: "all", label: "All loans" },
    ...schedules.map((s) => ({ value: s.loanId, label: s.label })),
  ];
  const legend: LegendItem[] = [
    { key: "bal", label: "Balance", color: STRATEGY_COLOR.hold },
    { key: "prin", label: "Principal", color: STRATEGY_COLOR.hold, shape: "swatch" },
    { key: "int", label: "Interest", color: "var(--cost)", shape: "swatch" },
    ...(showRate ? [{ key: "rate", label: "Rate", color: "var(--ink-2)" }] : []),
    ...phasesPresent.map((ph) => ({
      key: ph,
      label: PHASE_LABEL[ph],
      color: PHASE_LEGEND[ph],
      shape: "swatch" as const,
    })),
  ];

  const tipIdx = hover ?? (focused && effIdx >= 0 ? effIdx : null);
  const tip = tipIdx !== null ? points[tipIdx] : undefined;
  const subtitle =
    selected === "all"
      ? "Every loan on this property, combined. Phase lanes show where each one is in its life; select a single loan to see its rate path."
      : "Flat stretches are interest-only, steps up are HELOC draws, and amber marks ARM adjustments and the caps that limit them.";

  if (n === 0) {
    return (
      <ChartFrame
        title="Loan amortization"
        subtitle={subtitle}
        actions={
          schedules.length > 1 ? (
            <Segmented label="Loan" value={selected} onChange={setSelected} options={options} />
          ) : undefined
        }
      >
        <p className="border-line text-ink-3 rounded-lg border border-dashed px-4 py-10 text-center text-sm">
          {Number.isFinite(range.lastActive)
            ? `${selected === "all" ? "These loans were" : "This loan was"} paid off in ${range.lastActive + 1}, before the period shown (${Math.max(...loans.map((l) => l.rows[0]?.year ?? 0), asOfYear - 5)} onward).`
            : "No loan activity to show."}
        </p>
      </ChartFrame>
    );
  }

  const readoutRows = loans.map((l) => ({ loan: l, row: l.rows.find((r) => r.year === effYear) }));
  const eff = effIdx >= 0 ? points[effIdx] : undefined;

  return (
    <ChartFrame
      title="Loan amortization"
      subtitle={subtitle}
      legend={legend}
      actions={
        schedules.length > 1 ? (
          <Segmented label="Loan" value={selected} onChange={setSelected} options={options} />
        ) : undefined
      }
      table={{
        caption: `Loan schedule for ${timeline.name}`,
        columns: [
          "Year",
          "Phase",
          "Rate",
          "Opening",
          "Draws",
          "Interest",
          "Principal",
          "Payment",
          "Closing",
        ],
        rows: points.map((p) => [
          p.year,
          p.phase ? PHASE_LABEL[p.phase] : "Combined",
          p.rate === null ? "—" : fmtPercent(p.rate, 2),
          fmtMoney(p.opening),
          fmtMoney(p.draws),
          fmtMoney(p.interest),
          fmtMoney(p.principal),
          fmtMoney(p.payment),
          fmtMoney(p.closing),
        ]),
      }}
    >
      <div ref={ref} className="relative" style={{ height: totalH }}>
        <div
          role="slider"
          tabIndex={0}
          aria-label="Scrubber year"
          aria-valuemin={first}
          aria-valuemax={lastYear}
          aria-valuenow={effYear}
          aria-valuetext={
            eff
              ? `End of ${effYear}: balance ${fmtMoney(eff.closing)}, payment ${fmtMoney(eff.payment)}${eff.phase ? `, ${PHASE_LABEL[eff.phase]}` : ""}`
              : String(effYear)
          }
          onKeyDown={onKeyDown}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          className="focus-visible:ring-accent absolute inset-0 rounded-lg outline-none focus-visible:ring-2"
        >
          <svg
            ref={svgRef}
            width={width}
            height={totalH}
            aria-hidden="true"
            className="block cursor-ew-resize select-none"
            style={{ touchAction: "pan-y" }}
            onPointerDown={(e) => {
              dragging.current = true;
              e.currentTarget.setPointerCapture(e.pointerId);
              const p = points[idxAt(e.clientX)];
              if (p) onScrub(p.year);
            }}
            onPointerMove={(e) => {
              const i = idxAt(e.clientX);
              setHover(i);
              const p = points[i];
              if (dragging.current && p) onScrub(p.year);
            }}
            onPointerUp={(e) => {
              dragging.current = false;
              if (e.currentTarget.hasPointerCapture(e.pointerId))
                e.currentTarget.releasePointerCapture(e.pointerId);
            }}
            onPointerLeave={() => setHover(null)}
          >
            <g transform={`translate(${M.left},${M.top})`}>
              {/* panel titles */}
              <text x={0} y={8} className="chart-text" style={{ fontWeight: 600 }}>
                {single ? "Balance and phases" : "Balance and phase by loan"}
              </text>
              <text x={0} y={barsY0 - 14} className="chart-text" style={{ fontWeight: 600 }}>
                Interest vs principal paid each year
              </text>
              {showRate && (
                <text x={0} y={rateY0 - 14} className="chart-text" style={{ fontWeight: 600 }}>
                  Interest rate at year end
                </text>
              )}

              {/* single-loan phase bands */}
              {runs.map((r) => {
                const x0 = r.from * step;
                const w = (r.to - r.from + 1) * step;
                return (
                  <g key={`${r.phase}-${r.from}`}>
                    <rect
                      x={x0}
                      y={topY0}
                      width={w}
                      height={HEIGHT_TOP}
                      fill={PHASE_TINT[r.phase]}
                    />
                    {r.from > 0 && (
                      <line
                        x1={x0}
                        x2={x0}
                        y1={topY0}
                        y2={plotBottom}
                        stroke="var(--line-strong)"
                        strokeDasharray="2 4"
                      />
                    )}
                    <text
                      x={x0 + 8}
                      y={topY0 + 15}
                      className="chart-text"
                      style={{
                        fill: r.phase === "armAdjusting" ? "var(--amber)" : "var(--ink-2)",
                        fontWeight: 600,
                        fontSize: 10.5,
                      }}
                    >
                      {fitText(PHASE_LABEL[r.phase], w - 12, 6.3)}
                    </text>
                  </g>
                );
              })}

              {/* combined-mode lanes */}
              {lanes.map((l, li) => {
                const lp = points.map((pt) => ({
                  ...pt,
                  phase: l.rows.find((r) => r.year === pt.year)?.phase ?? null,
                }));
                const y0 = 18 + li * laneH;
                return (
                  <g key={l.loanId}>
                    <text x={0} y={y0 + 9} className="chart-text" style={{ fontSize: 10.5 }}>
                      {fitText(l.label, iw, 6)}
                    </text>
                    {runsOf(lp).map((r) => {
                      const w = (r.to - r.from + 1) * step;
                      return (
                        <g key={`${r.phase}-${r.from}`}>
                          <rect
                            x={r.from * step + 1}
                            y={y0 + 13}
                            width={Math.max(0, w - 2)}
                            height={14}
                            rx={4}
                            fill={PHASE_TINT[r.phase]}
                            stroke="var(--line)"
                          />
                          <text
                            x={r.from * step + 8}
                            y={y0 + 23.5}
                            className="chart-text"
                            style={{
                              fill: r.phase === "armAdjusting" ? "var(--amber)" : "var(--ink-2)",
                              fontSize: 10,
                              fontWeight: 600,
                            }}
                          >
                            {fitText(PHASE_LABEL[r.phase], w - 12, 5.8)}
                          </text>
                        </g>
                      );
                    })}
                    {l.rows
                      .filter((r) => r.capHit !== "none")
                      .map((r) => {
                        const i = points.findIndex((pt) => pt.year === r.year);
                        return i < 0 ? null : (
                          <circle
                            key={r.year}
                            cx={cx(i)}
                            cy={y0 + 20}
                            r={3}
                            fill="var(--amber-fill)"
                            stroke="var(--surface)"
                            strokeWidth={1}
                          />
                        );
                      })}
                  </g>
                );
              })}

              {/* grids */}
              {yBal.ticks(4).map((t) => (
                <g key={`b${t}`}>
                  <line x1={0} x2={iw} y1={yBal(t)} y2={yBal(t)} stroke="var(--grid)" />
                  <text x={-10} y={yBal(t)} dy="0.32em" textAnchor="end" className="chart-text">
                    {fmtCompact(t)}
                  </text>
                </g>
              ))}
              {yBar.ticks(3).map((t) => (
                <g key={`p${t}`}>
                  <line x1={0} x2={iw} y1={yBar(t)} y2={yBar(t)} stroke="var(--grid)" />
                  <text x={-10} y={yBar(t)} dy="0.32em" textAnchor="end" className="chart-text">
                    {fmtCompact(t)}
                  </text>
                </g>
              ))}
              {showRate &&
                [rLo, rHi].map((t, i) => (
                  <g key={`r${i}`}>
                    <line x1={0} x2={iw} y1={yRate(t)} y2={yRate(t)} stroke="var(--grid)" />
                    {(i === 0 ? rLo !== rHi : true) && (
                      <text
                        x={-10}
                        y={yRate(t)}
                        dy="0.32em"
                        textAnchor="end"
                        className="chart-text"
                      >
                        {fmtPercent(t, 2)}
                      </text>
                    )}
                  </g>
                ))}
              {points.map((p, i) =>
                i % tickEvery === 0 ? (
                  <text
                    key={p.year}
                    x={cx(i)}
                    y={plotBottom + 20}
                    textAnchor="middle"
                    className="chart-text"
                  >
                    {p.year}
                  </text>
                ) : null,
              )}

              <motion.g
                initial={{ clipPath: reduce ? REVEALED : HIDDEN }}
                animate={{ clipPath: REVEALED }}
                transition={{ duration: reduce ? 0 : 1.1, ease: [0.22, 1, 0.36, 1] }}
              >
                {/* balance */}
                <path d={areaD} fill={STRATEGY_COLOR.hold} fillOpacity={0.14} />
                <path
                  d={lineD}
                  fill="none"
                  stroke={STRATEGY_COLOR.hold}
                  strokeWidth={2}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />

                {/* HELOC draws */}
                {points.map((p, i) =>
                  p.draws > 0 ? (
                    <g key={`d${p.year}`}>
                      <path
                        d={`M${cx(i)},${yBal(p.opening + p.draws) - 11}l5,8.5h-10z`}
                        fill="var(--ink-2)"
                        stroke="var(--surface)"
                        strokeWidth={1}
                      />
                      <text
                        x={cx(i)}
                        y={yBal(p.opening + p.draws) - 16}
                        textAnchor="middle"
                        className="chart-text"
                        style={{ fill: "var(--ink-2)", fontWeight: 600, fontSize: 10.5 }}
                      >
                        +{fmtCompact(p.draws)}
                      </text>
                    </g>
                  ) : null,
                )}

                {/* ARM resets and caps */}
                {single?.type === "arm" &&
                  points.map((p, i) => {
                    if (p.phase !== "armAdjusting") return null;
                    const capped = p.capHit !== "none";
                    const firstAdj = points.findIndex((q) => q.phase === "armAdjusting") === i;
                    const py = yBal(p.closing);
                    const prevCap = i > 0 && points[i - 1]?.capHit === p.capHit;
                    return (
                      <g key={`a${p.year}`}>
                        <circle
                          cx={cx(i)}
                          cy={py}
                          r={4}
                          fill="var(--surface)"
                          stroke={capped ? "var(--amber)" : "var(--ink-2)"}
                          strokeWidth={2}
                        />
                        {(firstAdj || (capped && !prevCap)) && (
                          <text
                            x={cx(i)}
                            y={py - 12}
                            textAnchor="middle"
                            className="chart-text"
                            style={{
                              fill: capped ? "var(--amber)" : "var(--ink-2)",
                              fontWeight: 700,
                              fontSize: 10.5,
                            }}
                          >
                            {capped
                              ? `${p.capHit === "lifetime" ? "Lifetime cap" : "Cap hit"} · ${fmtPercent(p.rate ?? 0, 2)}`
                              : `Resets · ${fmtPercent(p.rate ?? 0, 2)}`}
                          </text>
                        )}
                      </g>
                    );
                  })}

                {/* interest vs principal */}
                {points.map((p, i) => {
                  const bw = Math.min(28, step * 0.64);
                  const x0 = cx(i) - bw / 2;
                  const yP = yBar(p.principal);
                  const yI = yBar(p.principal + p.interest);
                  return (
                    <g key={`bar${p.year}`}>
                      {p.principal > 0 && (
                        <path
                          d={roundedTopBar(x0, yP, bw, barsY1 - yP, 4, p.interest <= 0)}
                          fill={STRATEGY_COLOR.hold}
                          stroke="var(--surface)"
                          strokeWidth={1}
                        />
                      )}
                      {p.interest > 0 && (
                        <path
                          d={roundedTopBar(
                            x0,
                            yI,
                            bw,
                            (p.principal > 0 ? yP - 2 : barsY1) - yI,
                            4,
                            true,
                          )}
                          fill="var(--cost)"
                        />
                      )}
                    </g>
                  );
                })}

                {/* rate strip */}
                {showRate && (
                  <>
                    <path
                      d={rateD}
                      fill="none"
                      stroke="var(--ink-2)"
                      strokeWidth={2}
                      strokeLinejoin="round"
                    />
                    {points.map((p, i) => (
                      <circle
                        key={`r${p.year}`}
                        cx={cx(i)}
                        cy={yRate(p.rate ?? 0)}
                        r={p.capHit !== "none" ? 4 : 2.5}
                        fill={p.capHit !== "none" ? "var(--amber-fill)" : "var(--ink-2)"}
                        stroke="var(--surface)"
                        strokeWidth={1}
                      />
                    ))}
                  </>
                )}
              </motion.g>

              {showRate && n > 0 && (
                <text
                  x={cx(n - 1) + 12}
                  y={yRate(points[n - 1]?.rate ?? 0)}
                  dy="0.32em"
                  className="chart-text"
                  style={{ fill: "var(--ink)", fontWeight: 600 }}
                >
                  {fmtPercent(points[n - 1]?.rate ?? 0, 2)}
                </text>
              )}

              {/* crosshair + scrubber */}
              {tip && tipIdx !== null && (
                <line
                  x1={cx(tipIdx)}
                  x2={cx(tipIdx)}
                  y1={topY0}
                  y2={plotBottom}
                  stroke="var(--ink-3)"
                  strokeDasharray="3 3"
                  pointerEvents="none"
                />
              )}
              {effIdx >= 0 && (
                <g pointerEvents="none">
                  <line
                    x1={cx(effIdx)}
                    x2={cx(effIdx)}
                    y1={-6}
                    y2={plotBottom}
                    stroke="var(--accent)"
                    strokeWidth={2}
                  />
                  <rect
                    x={cx(effIdx) - 24}
                    y={-30}
                    width={48}
                    height={22}
                    rx={11}
                    fill="var(--accent)"
                  />
                  <text
                    x={cx(effIdx)}
                    y={-15}
                    textAnchor="middle"
                    className="chart-text"
                    style={{ fill: "var(--accent-ink)", fontWeight: 700 }}
                  >
                    {effYear}
                  </text>
                </g>
              )}
            </g>
          </svg>
        </div>

        {tip && (
          <ChartTooltip
            x={M.left + cx(tipIdx ?? 0)}
            y={M.top + topY0 + 6}
            containerWidth={width}
            width={230}
          >
            <p className="text-ink mb-1 font-semibold">
              End of {tip.year}
              {tip.phase ? ` · ${PHASE_LABEL[tip.phase]}` : ""}
            </p>
            {tip.rate !== null && <TooltipRow label="Rate" value={fmtPercent(tip.rate, 3)} />}
            <TooltipRow
              color={STRATEGY_COLOR.hold}
              label="Balance"
              value={fmtMoney(tip.closing)}
              strong
            />
            {tip.draws > 0 && (
              <TooltipRow label="Drawn this year" value={`+${fmtMoney(tip.draws)}`} />
            )}
            <TooltipRow color="var(--cost)" label="Interest" value={fmtMoney(tip.interest)} />
            <TooltipRow
              color={STRATEGY_COLOR.hold}
              label="Principal"
              value={fmtMoney(tip.principal)}
            />
            <div className="border-line mt-1 border-t pt-1">
              <TooltipRow label="Payment" value={fmtMoney(tip.payment)} strong />
            </div>
            {tip.capHit !== "none" && single && (
              <p className="text-amber mt-1 font-medium">{capNote(tip.capHit)}</p>
            )}
          </ChartTooltip>
        )}
      </div>

      {/* persistent readout */}
      <div className="border-line bg-surface-2 mt-4 rounded-xl border px-4 py-3" aria-live="polite">
        <p className="text-ink-3 mb-2 flex items-center justify-between text-xs">
          <span>
            <span className="text-ink-2 font-semibold">End of {effYear}</span>
            {effYear !== scrubYear && <span> · nearest year with loan activity</span>}
          </span>
          <span>Click a payment to show the math</span>
        </p>
        <div className="overflow-x-auto">
          <table className="num w-full text-left text-sm">
            <thead className="text-ink-3 text-[11px]">
              <tr>
                <th className="py-1 pr-3 font-medium">Loan</th>
                <th className="py-1 pr-3 font-medium">Phase</th>
                <th className="py-1 pr-3 text-right font-medium">Rate</th>
                <th className="py-1 pr-3 text-right font-medium">Balance</th>
                <th className="py-1 text-right font-medium">Payment</th>
              </tr>
            </thead>
            <tbody>
              {readoutRows.map(({ loan, row }) => (
                <tr key={loan.loanId} className="border-line border-t">
                  <td className="text-ink py-1.5 pr-3">{loan.label}</td>
                  <td className="text-ink-2 py-1.5 pr-3">{row ? PHASE_LABEL[row.phase] : "—"}</td>
                  <td className="text-ink py-1.5 pr-3 text-right">
                    {row ? fmtPercent(row.endRate, 2) : "—"}
                  </td>
                  <td className="text-ink py-1.5 pr-3 text-right">
                    {row ? <Money cents={row.closingBalance} tween={false} /> : "—"}
                  </td>
                  <td className="text-ink py-1.5 text-right font-medium">
                    {row ? (
                      <Money
                        cents={row.payment}
                        tween={false}
                        trace={{
                          kind: "loanPayment",
                          strategy: "hold",
                          propertyId: timeline.id,
                          loanId: loan.loanId,
                          year: effYear,
                        }}
                      />
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
              {readoutRows.length > 1 && eff && (
                <tr className="border-line-strong border-t font-semibold">
                  <td className="text-ink py-1.5 pr-3" colSpan={3}>
                    All loans
                  </td>
                  <td className="text-ink py-1.5 pr-3 text-right">
                    <Money cents={eff.closing} tween={false} />
                  </td>
                  <td className="text-ink py-1.5 text-right">
                    <Money cents={eff.payment} tween={false} />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </ChartFrame>
  );
}
