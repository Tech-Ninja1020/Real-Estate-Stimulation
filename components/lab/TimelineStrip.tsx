"use client";

import { motion, useReducedMotion } from "framer-motion";
import { scaleLinear } from "d3-scale";
import { useMemo, useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent } from "react";
import { ChartFrame } from "@/components/charts/ChartFrame";
import { ChartTooltip } from "@/components/charts/ChartTooltip";
import type { ScenarioResults } from "@/engine/types";
import { useChartSize } from "@/lib/use-chart-size";
import { fmtDate } from "./net-worth/dates";
import { ExchangeClock } from "./net-worth/ExchangeClock";
import { GlyphBadge } from "./net-worth/glyphs";
import {
  KIND_NAME,
  SCOPE_LABEL,
  collectMarkers,
  markerTableRows,
  shortLabel,
} from "./net-worth/timeline-events";
import type { EventTone, MarkerEvent } from "./net-worth/timeline-events";

export interface TimelineStripProps {
  results: ScenarioResults;
  asOfYear: number;
  horizonYear: number;
  year: number;
  onYearChange: (y: number) => void;
}

const TONE_COLOR: Record<EventTone, string> = {
  neutral: "var(--ink-2)",
  amber: "var(--amber)",
  sell: "var(--c-sell)",
  exchange: "var(--c-exchange)",
  ink: "var(--ink)",
};

/** Match the net-worth chart plot area so year ticks line up across the two cards. */
const PAD_L = 56;
const PAD_R = 66;
const LANE_H = 27;
const PILL = { w: 58, h: 22 };

function toneNote(m: MarkerEvent): string {
  if (m.kind === "sale") return m.tone === "sell" ? "Sell" : "1031 Exchange";
  return SCOPE_LABEL[m.scope];
}

export function TimelineStrip({
  results,
  asOfYear,
  horizonYear,
  year,
  onYearChange,
}: TimelineStripProps) {
  const reduce = useReducedMotion();
  const [wrapRef, size] = useChartSize<HTMLDivElement>({ width: 880, height: 200 });
  const frameRef = useRef<HTMLDivElement>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [hoverYear, setHoverYear] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const [handleFocus, setHandleFocus] = useState(false);

  const width = Math.max(320, size.width);
  const x = useMemo(
    () =>
      scaleLinear()
        .domain([asOfYear, horizonYear])
        .range([PAD_L, width - PAD_R]),
    [asOfYear, horizonYear, width],
  );

  const markers = useMemo(
    () => collectMarkers(results, asOfYear, horizonYear),
    [results, asOfYear, horizonYear],
  );

  // Greedy lane packing on each marker's full footprint (glyph plus caption); lane 0 sits nearest the axis.
  const { placed, laneCount } = useMemo(() => {
    const laneEnds: number[] = [];
    const out = markers.map((m) => {
      const px = x(m.pos);
      const textW = shortLabel(m).length * 6.1 + 6;
      const flip = px + 15 + textW > width - 4;
      const left = flip ? px - 15 - textW : px - 12;
      const right = flip ? px + 12 : px + 15 + textW;
      let lane = laneEnds.findIndex((end) => left - end >= 6);
      if (lane === -1) {
        lane = laneEnds.length;
        laneEnds.push(right);
      } else {
        laneEnds[lane] = right;
      }
      return { m, px, lane, flip };
    });
    return { placed: out, laneCount: Math.max(1, laneEnds.length) };
  }, [markers, x, width]);

  const clampYear = (v: number) => Math.min(horizonYear, Math.max(asOfYear, Math.round(v)));
  const scrubYear = clampYear(year);
  const topPad = 14;
  const axisY = topPad + laneCount * LANE_H + 14;
  const height = axisY + 44;
  const laneY = (lane: number) => axisY - 18 - lane * LANE_H;

  const step = (width - PAD_L - PAD_R) / Math.max(1, horizonYear - asOfYear) < 24 ? 5 : 2;
  const ticks: number[] = [];
  for (let yr = asOfYear; yr <= horizonYear; yr++) if ((yr - asOfYear) % step === 0) ticks.push(yr);

  const yearFromEvent = (e: PointerEvent<SVGElement>): number => {
    const box = frameRef.current?.getBoundingClientRect();
    return box ? clampYear(x.invert(e.clientX - box.left)) : scrubYear;
  };
  const commit = (v: number) => {
    if (v !== scrubYear) onYearChange(v);
  };
  const onPointerDown = (e: PointerEvent<SVGRectElement>) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
    commit(yearFromEvent(e));
  };
  const onPointerMove = (e: PointerEvent<SVGRectElement>) => {
    const v = yearFromEvent(e);
    setHoverYear((prev) => (prev === v ? prev : v));
    if (dragging) commit(v);
  };
  const endDrag = (e: PointerEvent<SVGRectElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId))
      e.currentTarget.releasePointerCapture(e.pointerId);
    setDragging(false);
    if (e.pointerType !== "mouse") setHoverYear(null);
  };
  const onSliderKey = (e: KeyboardEvent<SVGGElement>) => {
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
  const onMarkerKey = (e: KeyboardEvent<SVGGElement>, m: MarkerEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onYearChange(clampYear(m.year));
    }
  };

  const activeId = hoverId ?? focusId;
  const active = placed.find((p) => p.m.id === activeId);
  const pillX = x(scrubYear);

  return (
    <ChartFrame
      title="Timeline of events"
      subtitle="Loan milestones, the sale, and the 1031 exchange deadlines. Select a marker to jump to that year."
      table={{
        caption: "Timeline of events",
        columns: ["Date", "Event", "Applies to"],
        rows: markerTableRows(markers),
      }}
    >
      <div ref={wrapRef} className="w-full">
        <div ref={frameRef} className="relative" style={{ height }}>
          <svg
            width={width}
            height={height}
            className="block overflow-visible select-none"
            role="group"
            aria-label="Events from today to the planning horizon"
          >
            {/* pointer surface for click / drag-to-scrub */}
            <rect
              x={0}
              y={0}
              width={width}
              height={height}
              fill="transparent"
              style={{ cursor: dragging ? "grabbing" : "ew-resize", touchAction: "pan-y" }}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
              onPointerLeave={() => {
                if (!dragging) setHoverYear(null);
              }}
            />

            {/* axis */}
            <line
              x1={x(asOfYear)}
              x2={x(horizonYear)}
              y1={axisY}
              y2={axisY}
              stroke="var(--line-strong)"
              strokeWidth={1.5}
              strokeLinecap="round"
              pointerEvents="none"
            />
            {ticks.map((t) => {
              const hidden = Math.abs(x(t) - pillX) < 46;
              return (
                <g key={t} opacity={hidden ? 0 : 1} pointerEvents="none">
                  <line
                    x1={x(t)}
                    x2={x(t)}
                    y1={axisY}
                    y2={axisY + 5}
                    stroke="var(--ink-3)"
                    strokeOpacity={0.6}
                  />
                  <text x={x(t)} y={axisY + 20} textAnchor="middle" className="chart-text">
                    {t}
                  </text>
                </g>
              );
            })}

            {/* hover preview */}
            {hoverYear !== null && hoverYear !== scrubYear && (
              <line
                x1={x(hoverYear)}
                x2={x(hoverYear)}
                y1={4}
                y2={axisY}
                stroke="var(--ink-3)"
                strokeOpacity={0.4}
                strokeDasharray="2 3"
                pointerEvents="none"
              />
            )}

            {/* scrubber line sits behind the markers */}
            <line
              x1={pillX}
              x2={pillX}
              y1={4}
              y2={axisY + 4}
              stroke="var(--ink)"
              strokeWidth={1.25}
              pointerEvents="none"
            />

            {/* events */}
            {placed.map(({ m, px, lane, flip }, i) => {
              const color = TONE_COLOR[m.tone];
              const cy = laneY(lane);
              const isFocus = focusId === m.id;
              return (
                <motion.g
                  key={m.id}
                  initial={reduce ? false : { opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    delay: reduce ? 0 : Math.min(0.6, 0.15 + i * 0.03),
                    duration: 0.4,
                    ease: [0.22, 1, 0.36, 1],
                  }}
                >
                  <line
                    x1={px}
                    x2={px}
                    y1={cy + 10}
                    y2={axisY}
                    stroke={color}
                    strokeOpacity={0.4}
                    strokeWidth={1}
                    pointerEvents="none"
                  />
                  <circle cx={px} cy={axisY} r={2.5} fill={color} pointerEvents="none" />
                  <g
                    role="button"
                    tabIndex={0}
                    aria-label={`${m.labels.join(", ")}. ${fmtDate(m.date)}. Move the year to ${m.year}.`}
                    style={{ cursor: "pointer", outline: "none" }}
                    onClick={() => onYearChange(clampYear(m.year))}
                    onKeyDown={(e) => onMarkerKey(e, m)}
                    onPointerEnter={() => setHoverId(m.id)}
                    onPointerLeave={() => setHoverId((prev) => (prev === m.id ? null : prev))}
                    onFocus={(e) => {
                      if (e.currentTarget.matches(":focus-visible")) setFocusId(m.id);
                    }}
                    onBlur={() => setFocusId((prev) => (prev === m.id ? null : prev))}
                  >
                    <circle cx={px} cy={cy} r={14} fill="transparent" />
                    {isFocus && (
                      <circle
                        cx={px}
                        cy={cy}
                        r={14}
                        fill="none"
                        stroke="var(--accent)"
                        strokeWidth={2}
                      />
                    )}
                    <GlyphBadge
                      kind={m.kind}
                      cx={px}
                      cy={cy}
                      color={color}
                      r={10}
                      filled={m.kind === "sale" || m.kind === "replacementClosing"}
                    />
                    <text
                      x={flip ? px - 15 : px + 15}
                      y={cy}
                      dy="0.34em"
                      textAnchor={flip ? "end" : "start"}
                      className="chart-text"
                      style={{
                        fill: "var(--ink-2)",
                        fontWeight: 500,
                        paintOrder: "stroke",
                        stroke: "var(--surface)",
                        strokeWidth: 4,
                        strokeLinejoin: "round",
                      }}
                    >
                      {shortLabel(m)}
                    </text>
                  </g>
                </motion.g>
              );
            })}

            {/* draggable year handle on the axis, operable by keyboard */}
            <g
              role="slider"
              tabIndex={0}
              aria-label="Year"
              aria-valuenow={scrubYear}
              aria-valuemin={asOfYear}
              aria-valuemax={horizonYear}
              aria-orientation="horizontal"
              onKeyDown={onSliderKey}
              style={{ outline: "none", pointerEvents: "none" }}
              onFocus={(e) => setHandleFocus(e.currentTarget.matches(":focus-visible"))}
              onBlur={() => setHandleFocus(false)}
              transform={`translate(${pillX - PILL.w / 2},${axisY + 6})`}
            >
              {handleFocus && (
                <rect
                  x={-3}
                  y={-3}
                  width={PILL.w + 6}
                  height={PILL.h + 6}
                  rx={(PILL.h + 6) / 2}
                  fill="none"
                  stroke="var(--accent)"
                  strokeWidth={2}
                />
              )}
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
          </svg>

          {active && (
            <ChartTooltip
              x={active.px}
              y={laneY(active.lane) + 18}
              containerWidth={width}
              width={252}
            >
              <p className="eyebrow mb-1.5" style={{ color: "var(--ink-3)" }}>
                {KIND_NAME[active.m.kind]} · {toneNote(active.m)}
              </p>
              {active.m.labels.slice(0, 4).map((l) => (
                <p key={l} className="text-ink py-0.5 leading-snug font-medium">
                  {l}
                </p>
              ))}
              {active.m.labels.length > 4 && (
                <p className="text-ink-3">+{active.m.labels.length - 4} more</p>
              )}
              <p className="num text-ink-3 mt-1">{fmtDate(active.m.date)}</p>
            </ChartTooltip>
          )}
        </div>
      </div>

      <div className="border-line mt-6 border-t pt-5">
        <div className="mb-3">
          <h4 className="display text-ink text-lg leading-tight">1031 exchange clock</h4>
          <p className="text-ink-3 mt-1 max-w-2xl text-sm leading-relaxed">
            Both windows run from the day the sale closes. They are only about six months long, so
            they are drawn here at day scale rather than on the multi-year strip.
          </p>
        </div>
        <ExchangeClock exchange={results.exchange.exchange} />
      </div>
    </ChartFrame>
  );
}
