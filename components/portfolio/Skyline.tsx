"use client";

import Link from "next/link";
import { animate, motion, useMotionValue, useReducedMotion, useTransform } from "framer-motion";
import { scaleLinear } from "d3-scale";
import { useEffect, useId, useMemo, useState } from "react";
import { ChartFrame } from "@/components/charts/ChartFrame";
import { ChartTooltip, TooltipRow } from "@/components/charts/ChartTooltip";
import { Money } from "@/components/math/Fig";
import type { PropertyTimeline, Year } from "@/engine/types";
import { fmtCompact, fmtMoney, fmtPercent } from "@/lib/format";
import { useChartSize } from "@/lib/use-chart-size";
import { loanToValue, rowForYear } from "./facts";

/* ───────────────────────────── layout constants ───────────────────────────── */

const SVG_H = 308; // sky height (ground line sits at the bottom)
const REFLECT_H = 34; // faint ground reflection below the ground line
const TOP_PAD = 58; // headroom for rooflines, antennas and the sale-plan flag
const PAD_L = 46; // room for the value scale
const PAD_R = 46;
const MAX_SLOT = 172;
const MAX_TOWER = 80;
const MIN_TOWER = 26;
/** How far each roofline style rises above the main body (px). */
const ROOF_EXTRA = [3, 16, 14, 24] as const;

const SPRING = { type: "spring", stiffness: 82, damping: 17, mass: 0.9 } as const;

/** Sky palette per theme, expressed only through the app's tokens. */
const SKY_CSS = `
.sl-sky{
  --sl-top:color-mix(in srgb,var(--c-hold) 11%,var(--surface));
  --sl-mid:var(--surface);
  --sl-hz:color-mix(in srgb,var(--amber-fill) 17%,var(--surface));
  --sl-glow:color-mix(in srgb,var(--amber-fill) 26%,transparent);
  --sl-star:0;
  --sl-win:var(--surface);
  --sl-win-o:.3;
  background:linear-gradient(180deg,var(--sl-top) 0%,var(--sl-mid) 52%,var(--sl-hz) 100%);
}
.sl-stars{opacity:var(--sl-star)}
.sl-win{fill:var(--sl-win);opacity:var(--sl-win-o)}
:root[data-theme="dark"] .sl-sky{
  --sl-top:var(--bg);
  --sl-mid:color-mix(in srgb,var(--c-hold) 6%,var(--bg));
  --sl-hz:color-mix(in srgb,var(--c-hold) 24%,var(--surface));
  --sl-glow:color-mix(in srgb,var(--c-hold) 38%,transparent);
  --sl-star:.75;
  --sl-win:var(--ink);
  --sl-win-o:.2;
}
@media (prefers-color-scheme:dark){
  :root:where(:not([data-theme="light"])) .sl-sky{
    --sl-top:var(--bg);
    --sl-mid:color-mix(in srgb,var(--c-hold) 6%,var(--bg));
    --sl-hz:color-mix(in srgb,var(--c-hold) 24%,var(--surface));
    --sl-glow:color-mix(in srgb,var(--c-hold) 38%,transparent);
    --sl-star:.75;
    --sl-win:var(--ink);
    --sl-win-o:.2;
  }
}
`;

/* ───────────────────────────── pure helpers ───────────────────────────── */

const n = (v: number) => Math.round(v * 100) / 100;

/** Deterministic 32-bit FNV-1a hash, used to give each property its own roofline. */
function hashId(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

type RoofStyle = 0 | 1 | 2 | 3;

/** Closed outline of a tower whose main body is `h` px tall, with its roofline on top. */
function silhouette(style: RoofStyle, x: number, w: number, base: number, h: number): string {
  if (h < 1) return `M${x} ${base}Z`;
  const t = base - h;
  switch (style) {
    case 0:
      return `M${x} ${base}V${n(t - 3)}H${x + 5}V${n(t)}H${x + w - 5}V${n(t - 3)}H${x + w}V${base}Z`;
    case 1:
      return `M${x} ${base}V${n(t)}H${n(x + w * 0.12)}V${n(t - 8)}H${n(x + w * 0.28)}V${n(t - 16)}H${n(x + w * 0.72)}V${n(t - 8)}H${n(x + w * 0.88)}V${n(t)}H${x + w}V${base}Z`;
    case 2:
      return `M${x} ${base}V${n(t)}L${n(x + w / 2)} ${n(t - 14)}L${x + w} ${n(t)}V${base}Z`;
    default:
      return `M${x} ${base}V${n(t)}H${n(x + w * 0.18)}V${n(t - 4)}H${n(x + w / 2 - 1.5)}V${n(t - 24)}H${n(x + w / 2 + 1.5)}V${n(t - 4)}H${n(x + w * 0.82)}V${n(t)}H${x + w}V${base}Z`;
  }
}

/** Tiny deterministic scatter for the night sky (a pure function of the index). */
function stars(count: number): { fx: number; fy: number; r: number }[] {
  const out: { fx: number; fy: number; r: number }[] = [];
  let s = 12345;
  const next = () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
  for (let i = 0; i < count; i++)
    out.push({ fx: next(), fy: next() * 0.62, r: 0.5 + next() * 0.7 });
  return out;
}
const STARS = stars(34);

/* ───────────────────────────── one tower ───────────────────────────── */

interface TowerTarget {
  /** Main-body height in px. */
  h: number;
  /** Equity fill height in px (extends over the roofline when there is no debt). */
  eh: number;
  /** Recapture marker height in px. */
  rh: number;
}

function Tower({
  uid,
  index,
  x,
  w,
  base,
  style,
  target,
  recapLabel,
  saleFlag,
  dim,
  mounted,
}: {
  uid: string;
  index: number;
  x: number;
  w: number;
  base: number;
  style: RoofStyle;
  target: TowerTarget;
  recapLabel: string | null;
  saleFlag: string | null;
  dim: boolean;
  mounted: boolean;
}) {
  const reduce = useReducedMotion();
  const h = useMotionValue(0);
  const eh = useMotionValue(0);
  const rh = useMotionValue(0);

  useEffect(() => {
    const delay = reduce || mounted ? 0 : 0.12 + index * 0.09;
    const t = reduce ? { duration: 0 } : { ...SPRING, delay };
    const controls = [
      animate(h, target.h, t),
      animate(eh, target.eh, t),
      animate(rh, target.rh, t),
    ];
    return () => controls.forEach((c) => c.stop());
  }, [target.h, target.eh, target.rh, index, reduce, mounted, h, eh, rh]);

  const sil = useTransform(h, (v) => silhouette(style, x, w, base, v));
  const eq = useTransform(eh, (v) =>
    v < 0.5 ? "" : `M${x - 1} ${base}V${n(base - v)}H${x + w + 1}V${base}Z`,
  );
  const gap = useTransform(eh, (v) => `M${x - 1} ${n(base - v)}H${x + w + 1}`);
  const shade = useTransform(
    h,
    (v) => `M${n(x + w * 0.62)} ${base}V${n(base - v - 30)}H${x + w + 1}V${base}Z`,
  );
  const win = useTransform(h, (v) => {
    const top = Math.min(base - 6, base - v + 7);
    return `M${x + 5} ${base - 6}V${n(top)}H${x + w - 5}V${base - 6}Z`;
  });
  const bar = useTransform(rh, (v) => `M${x + w - 3} ${base}V${n(base - v)}H${x + w}V${base}Z`);
  const lift = useTransform(rh, (v) => -v);
  const flagLift = useTransform(h, (v) => -v);

  const cols = Math.max(2, Math.floor((w - 10) / 9));
  const cw = (w - 10) / cols;
  const roof = ROOF_EXTRA[style];
  const flagW = saleFlag ? Math.round(saleFlag.length * 5.5 + 16) : 0;
  const fy = base - roof - 8 - 17; // flag pill top (relative to the body top via translate)

  return (
    <g style={{ opacity: dim ? 0.5 : 1, transition: "opacity .25s ease" }}>
      <defs>
        <clipPath id={`${uid}-clip-${index}`}>
          <motion.path d={sil} />
        </clipPath>
        <pattern
          id={`${uid}-win-${index}`}
          x={x + 5}
          y={base - 6 - 13}
          width={n(cw)}
          height={13}
          patternUnits="userSpaceOnUse"
        >
          <rect
            className="sl-win"
            x={n(cw * 0.24)}
            y={3}
            width={n(cw * 0.52)}
            height={6}
            rx={0.5}
          />
        </pattern>
      </defs>

      <g id={`${uid}-body-${index}`}>
        <g clipPath={`url(#${uid}-clip-${index})`}>
          <motion.path d={sil} fill="var(--cost)" fillOpacity={0.16} />
          <motion.path d={sil} fill={`url(#${uid}-hatch)`} />
          <motion.path d={eq} fill={`url(#${uid}-eq)`} />
          <motion.path
            d={gap}
            stroke="var(--surface)"
            strokeWidth={2}
            fill="none"
            shapeRendering="crispEdges"
          />
          <motion.path d={shade} fill="var(--ink)" fillOpacity={0.09} />
          <motion.path d={win} fill={`url(#${uid}-win-${index})`} shapeRendering="crispEdges" />
          <motion.path d={bar} fill="var(--amber-fill)" />
        </g>
        <motion.path
          d={sil}
          fill="none"
          stroke={saleFlag ? "var(--accent)" : "var(--ink)"}
          strokeOpacity={saleFlag ? 1 : 0.22}
          strokeWidth={saleFlag ? 2 : 1}
          strokeLinejoin="round"
        />
      </g>

      {recapLabel !== null && (
        <motion.g
          style={{ y: lift }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{
            duration: reduce ? 0 : 0.5,
            delay: reduce || mounted ? 0 : 0.7 + index * 0.09,
          }}
        >
          <line
            x1={x - 5}
            x2={x + w + 8}
            y1={base}
            y2={base}
            stroke="var(--surface)"
            strokeWidth={3.5}
            strokeLinecap="round"
          />
          <line
            x1={x - 5}
            x2={x + w + 8}
            y1={base}
            y2={base}
            stroke="var(--amber-fill)"
            strokeWidth={1.5}
            strokeLinecap="round"
          />
          <circle
            cx={x + w + 8}
            cy={base}
            r={2.6}
            fill="var(--amber-fill)"
            stroke="var(--surface)"
            strokeWidth={1.2}
          />
          {recapLabel && (
            <text
              x={x + w + 15}
              y={base + 3.5}
              fontSize={10.5}
              fontWeight={600}
              className="num"
              fill="var(--amber)"
              stroke="var(--surface)"
              strokeWidth={3}
              strokeLinejoin="round"
              paintOrder="stroke"
            >
              {recapLabel}
            </text>
          )}
        </motion.g>
      )}

      {saleFlag && (
        <motion.g
          style={{ y: flagLift }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{
            duration: reduce ? 0 : 0.5,
            delay: reduce || mounted ? 0 : 0.8 + index * 0.09,
          }}
        >
          <line
            x1={x + w / 2}
            x2={x + w / 2}
            y1={base - roof - 1}
            y2={base - roof - 9}
            stroke="var(--accent)"
            strokeWidth={1.5}
          />
          <rect
            x={n(x + w / 2 - flagW / 2)}
            y={fy}
            width={flagW}
            height={17}
            rx={8.5}
            fill="var(--surface)"
            stroke="var(--accent)"
            strokeWidth={1.25}
          />
          <text
            x={x + w / 2}
            y={fy + 11.7}
            textAnchor="middle"
            fontSize={9.5}
            fontWeight={600}
            fill="var(--accent)"
          >
            {saleFlag}
          </text>
        </motion.g>
      )}
    </g>
  );
}

/* ───────────────────────────── the skyline ───────────────────────────── */

/**
 * The Hold-lane portfolio as a city skyline. Every original property is a tower on a shared
 * ground line: height is market value (one scale across all years, so towers grow as the
 * scrubber moves), solid blue is equity, grey hatching is debt, and the amber mark is the
 * depreciation recapture waiting to be taxed.
 */
export function Skyline({
  properties,
  year,
  salePlanIds,
}: {
  properties: readonly PropertyTimeline[];
  year: Year;
  salePlanIds: readonly string[];
}) {
  const reduce = useReducedMotion();
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const [ref, { width }] = useChartSize<HTMLDivElement>({ width: 760, height: SVG_H });
  const [hover, setHover] = useState<string | null>(null);
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => {
      setSettled(true);
    }, 1600);
    return () => clearTimeout(t);
  }, []);

  const base = SVG_H;
  const maxH = SVG_H - TOP_PAD;
  const count = properties.length;

  const yMax = useMemo(
    () => Math.max(1, ...properties.flatMap((p) => p.rows.map((r) => r.marketValue))),
    [properties],
  );
  const y = useMemo(() => scaleLinear().domain([0, yMax]).range([0, maxH]), [yMax, maxH]);
  const ticks = useMemo(() => y.ticks(3).filter((t) => t > 0), [y]);

  const usable = Math.max(120, width - PAD_L - PAD_R);
  const slot = Math.min(MAX_SLOT, usable / Math.max(1, count));
  const tw = Math.round(
    Math.min(MAX_TOWER, Math.max(MIN_TOWER, slot * (slot < 125 ? 0.45 : 0.52))),
  );
  const gapPx = slot - tw;
  const x0 = PAD_L + (usable - slot * count) / 2;
  const showSuffix = gapPx - 22 >= 88;
  const showRecapText = gapPx >= 56;
  const flagText = slot >= 100 ? "For sale plan" : "Sale plan";

  const towers = properties.map((p, i) => {
    const row = rowForYear(p, year);
    const value = Math.max(0, row?.marketValue ?? 0);
    const equity = Math.max(0, row?.equity ?? 0);
    const recapture = Math.max(0, row?.recaptureExposure ?? 0);
    const h = y(value);
    const noDebt = value > 0 && (row?.loanBalance ?? 0) <= value * 0.002;
    const eh = noDebt ? h + 40 : value > 0 ? y(Math.min(equity, value)) : 0;
    const rh = Math.min(y(recapture), h);
    const style = (hashId(p.id) % 4) as RoofStyle;
    const left = Math.round(x0 + i * slot + (slot - tw) / 2);
    return {
      p,
      row,
      value,
      equity,
      recapture,
      h,
      eh,
      rh,
      style,
      left,
      sale: salePlanIds.includes(p.id),
    };
  });

  const hot = hover ? towers.find((t) => t.p.id === hover) : undefined;
  const totalValue = towers.reduce((s, t) => s + t.value, 0);

  return (
    <ChartFrame
      title="Your portfolio skyline"
      subtitle="Height is market value. Solid is equity, hatched is debt, the amber mark is depreciation recapture waiting to be taxed."
      legend={[
        { key: "equity", label: "Equity", color: "var(--c-hold)", shape: "area" },
        { key: "debt", label: "Debt", color: "var(--cost)", shape: "area" },
        {
          key: "recapture",
          label: "Recapture exposure",
          color: "var(--amber-fill)",
          shape: "area",
        },
      ]}
      table={{
        caption: `Market value, equity, debt and recapture exposure by property at the end of ${year}`,
        columns: ["Property", "Market value", "Equity", "Debt", "Recapture exposure"],
        rows: towers.map((t) => [
          t.p.name,
          fmtMoney(t.value),
          fmtMoney(t.row?.equity ?? 0),
          fmtMoney(t.row?.loanBalance ?? 0),
          fmtMoney(t.recapture),
        ]),
      }}
    >
      <style>{SKY_CSS}</style>
      <div ref={ref} className="relative">
        <div
          className="sl-sky relative overflow-hidden rounded-xl"
          style={{ height: SVG_H + REFLECT_H }}
        >
          {/* a very slow ambient glow on the horizon */}
          <motion.div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-[-10%] bottom-0 h-3/4"
            style={{
              background:
                "radial-gradient(60% 70% at 32% 100%, var(--sl-glow), transparent 70%), radial-gradient(40% 50% at 78% 100%, color-mix(in srgb, var(--sl-glow) 55%, transparent), transparent 70%)",
            }}
            animate={reduce ? undefined : { x: ["-3%", "3%"], opacity: [0.85, 1] }}
            transition={
              reduce
                ? undefined
                : { duration: 14, repeat: Infinity, repeatType: "mirror", ease: "easeInOut" }
            }
          />
          <svg
            width={width}
            height={SVG_H + REFLECT_H}
            viewBox={`0 0 ${width} ${SVG_H + REFLECT_H}`}
            role="img"
            aria-label={`Skyline of ${count} ${count === 1 ? "property" : "properties"} at the end of ${year}, total market value ${fmtMoney(totalValue)}. ${towers
              .map((t) => `${t.p.name} ${fmtMoney(t.value)}`)
              .join(", ")}.`}
            className="block"
          >
            <defs>
              <pattern
                id={`${uid}-hatch`}
                width={5}
                height={5}
                patternUnits="userSpaceOnUse"
                patternTransform="rotate(45)"
              >
                <line x1={0} y1={0} x2={0} y2={5} stroke="var(--cost)" strokeWidth={1.7} />
              </pattern>
              <linearGradient id={`${uid}-eq`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="var(--c-hold)" stopOpacity={0.88} />
                <stop offset="1" stopColor="var(--c-hold)" />
              </linearGradient>
              <linearGradient id={`${uid}-fade`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#fff" stopOpacity={0.5} />
                <stop offset="1" stopColor="#fff" stopOpacity={0} />
              </linearGradient>
              <mask
                id={`${uid}-reflect`}
                maskUnits="userSpaceOnUse"
                x={0}
                y={base}
                width={width}
                height={REFLECT_H}
              >
                <rect x={0} y={base} width={width} height={REFLECT_H} fill={`url(#${uid}-fade)`} />
              </mask>
              <linearGradient id={`${uid}-ground`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="var(--ink)" stopOpacity={0.09} />
                <stop offset="1" stopColor="var(--ink)" stopOpacity={0} />
              </linearGradient>
            </defs>

            {/* stars (night only) */}
            <g className="sl-stars" aria-hidden="true">
              {STARS.map((s, i) => (
                <circle
                  key={i}
                  cx={n(8 + s.fx * (width - 16))}
                  cy={n(6 + s.fy * (SVG_H - 6))}
                  r={n(s.r)}
                  fill="var(--ink)"
                  fillOpacity={0.35 + (i % 4) * 0.15}
                />
              ))}
            </g>

            {/* value scale */}
            <g aria-hidden="true">
              {ticks.map((t) => (
                <g key={t}>
                  <line
                    x1={PAD_L - 6}
                    x2={width - 14}
                    y1={base - y(t)}
                    y2={base - y(t)}
                    stroke="var(--ink)"
                    strokeOpacity={0.1}
                    strokeDasharray="1 5"
                    strokeLinecap="round"
                  />
                  <text
                    x={12}
                    y={base - y(t) - 5}
                    fontSize={10}
                    className="num"
                    fill="var(--ink-3)"
                  >
                    {fmtCompact(Math.round(t))}
                  </text>
                </g>
              ))}
            </g>

            {/* ground */}
            <rect x={0} y={base} width={width} height={REFLECT_H} fill={`url(#${uid}-ground)`} />

            {/* faint reflection of the tower bodies (shares the live geometry) */}
            <g mask={`url(#${uid}-reflect)`} aria-hidden="true">
              {towers.map((t, i) => (
                <use
                  key={t.p.id}
                  href={`#${uid}-body-${i}`}
                  transform={`translate(0 ${2 * base}) scale(1 -1)`}
                  opacity={0.3}
                />
              ))}
            </g>

            <g>
              {towers.map((t, i) => (
                <Tower
                  key={t.p.id}
                  uid={uid}
                  index={i}
                  x={t.left}
                  w={tw}
                  base={base}
                  style={t.style}
                  target={{ h: t.h, eh: t.eh, rh: t.rh }}
                  recapLabel={
                    t.recapture > 0
                      ? showRecapText
                        ? `${fmtCompact(t.recapture)}${showSuffix ? " recapture" : ""}`
                        : ""
                      : null
                  }
                  saleFlag={t.sale ? flagText : null}
                  dim={hover !== null && hover !== t.p.id}
                  mounted={settled}
                />
              ))}
            </g>

            <line
              x1={0}
              x2={width}
              y1={base + 0.5}
              y2={base + 0.5}
              stroke="var(--ink)"
              strokeOpacity={0.28}
            />
          </svg>
          <p className="num text-ink-3 pointer-events-none absolute top-3 left-4 text-[11px] font-medium tracking-[0.12em] uppercase">
            End of {year}
          </p>
          <div
            aria-hidden="true"
            className="border-line pointer-events-none absolute inset-0 rounded-xl border"
          />
        </div>

        {/* keyboard- and pointer-operable hit areas over each tower */}
        {towers.map((t) => {
          const top = Math.max(0, base - t.h - ROOF_EXTRA[t.style] - (t.sale ? 30 : 4));
          return (
            <Link
              key={t.p.id}
              href={`/property/${t.p.id}`}
              aria-label={`Open ${t.p.name}`}
              className="absolute rounded-md"
              style={{ left: t.left - 5, width: tw + 10, top, height: Math.max(28, base - top) }}
              onMouseEnter={() => setHover(t.p.id)}
              onMouseLeave={() => setHover((h) => (h === t.p.id ? null : h))}
              onFocus={() => setHover(t.p.id)}
              onBlur={() => setHover((h) => (h === t.p.id ? null : h))}
            />
          );
        })}

        {/* persistent figures: real buttons that open the math drawer */}
        <div className="relative" style={{ height: 88 }}>
          {towers.map((t) => (
            <div
              key={t.p.id}
              className="absolute top-3 flex flex-col items-center px-1 text-center"
              style={{ left: x0 + towers.indexOf(t) * slot, width: slot }}
            >
              <p
                className="text-ink-2 line-clamp-2 w-full text-xs leading-snug font-medium"
                style={{ minHeight: slot < 130 ? "2.1rem" : undefined }}
                title={t.p.name}
              >
                {t.p.name}
              </p>
              <p className="display text-ink mt-1 text-lg leading-none">
                <Money
                  cents={t.value}
                  compact={slot < 110}
                  trace={{ kind: "propertyValue", strategy: "hold", propertyId: t.p.id, year }}
                />
              </p>
              {t.recapture > 0 && slot >= 100 && (
                <p className="text-amber mt-1 text-[11px]">
                  <Money
                    cents={t.recapture}
                    compact
                    trace={{
                      kind: "recaptureExposure",
                      strategy: "hold",
                      propertyId: t.p.id,
                      year,
                    }}
                  />{" "}
                  recapture
                </p>
              )}
            </div>
          ))}
        </div>

        {hot && hot.row && (
          <ChartTooltip
            x={hot.left + tw}
            y={Math.min(Math.max(8, base - hot.h - 12), SVG_H - 190)}
            containerWidth={width}
            width={228}
          >
            <p className="display text-ink mb-1 text-base leading-tight">{hot.p.name}</p>
            {hot.sale && (
              <p className="text-accent mb-1 text-[11px] font-medium">In the sale plan</p>
            )}
            <TooltipRow label="Market value" value={fmtMoney(hot.value)} strong />
            <TooltipRow color="var(--c-hold)" label="Equity" value={fmtMoney(hot.row.equity)} />
            <TooltipRow color="var(--cost)" label="Debt" value={fmtMoney(hot.row.loanBalance)} />
            <TooltipRow label="Loan-to-value" value={fmtPercent(loanToValue(hot.row), 0)} />
            <TooltipRow label="Adjusted basis" value={fmtMoney(hot.row.adjustedBasis)} />
            <TooltipRow
              color="var(--amber-fill)"
              label="Recapture exposure"
              value={fmtMoney(hot.recapture)}
            />
          </ChartTooltip>
        )}
      </div>
    </ChartFrame>
  );
}
