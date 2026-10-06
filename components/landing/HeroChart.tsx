"use client";

import { extent } from "d3-array";
import { scaleLinear } from "d3-scale";
import { curveMonotoneX, line } from "d3-shape";
import { motion, useMotionValue, useReducedMotion, useSpring, useTransform } from "framer-motion";
import { useEffect, useMemo } from "react";
import type { MotionValue } from "framer-motion";
import type { ScenarioResults, StrategyKind } from "@/engine/types";
import { STRATEGY_COLOR, STRATEGY_LABEL, STRATEGY_ORDER } from "@/lib/strategy";
import { useChartSize } from "@/lib/use-chart-size";

const MASK = "linear-gradient(90deg, transparent 30%, rgba(0,0,0,0.5) 50%, #000 72%)";

const DEPTH: Record<StrategyKind, number> = { hold: 7, sell: 13, exchange: 20 };
const BREATH: Record<StrategyKind, number> = { hold: 9, sell: 11, exchange: 13 };

function Layer({
  kind,
  d,
  last,
  height,
  px,
  py,
  reduce,
  index,
  showLabel,
}: {
  kind: StrategyKind;
  d: string;
  last: { x: number; y: number };
  height: number;
  px: MotionValue<number>;
  py: MotionValue<number>;
  reduce: boolean;
  index: number;
  showLabel: boolean;
}) {
  const x = useTransform(px, (v) => v * DEPTH[kind]);
  const y = useTransform(py, (v) => v * DEPTH[kind] * 0.6);
  return (
    <motion.g style={{ x, y }}>
      <motion.g
        style={{ transformOrigin: `0px ${height}px` }}
        animate={reduce ? undefined : { scaleY: [1, 1.045] }}
        transition={
          reduce
            ? undefined
            : {
                duration: BREATH[kind],
                repeat: Infinity,
                repeatType: "mirror",
                ease: "easeInOut",
                delay: 2.4,
              }
        }
      >
        <motion.path
          d={d}
          fill="none"
          stroke={STRATEGY_COLOR[kind]}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 0.7 }}
          transition={{
            duration: reduce ? 0 : 2.4,
            delay: reduce ? 0 : 0.25 + index * 0.22,
            ease: [0.22, 1, 0.36, 1],
          }}
        />
        <motion.circle
          cx={last.x}
          cy={last.y}
          r={4}
          fill={STRATEGY_COLOR[kind]}
          initial={{ opacity: 0, scale: 0 }}
          animate={{ opacity: 0.8, scale: 1 }}
          transition={{ duration: reduce ? 0 : 0.5, delay: reduce ? 0 : 2.4 + index * 0.22 }}
          style={{ transformBox: "fill-box", transformOrigin: "center" }}
        />
        {showLabel && (
          <motion.text
            x={last.x + 12}
            y={last.y + 4}
            className="chart-text"
            fontSize={12}
            fontWeight={600}
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.85 }}
            transition={{ duration: reduce ? 0 : 0.5, delay: reduce ? 0 : 2.6 + index * 0.22 }}
          >
            {kind === "exchange" ? "1031" : STRATEGY_LABEL[kind]}
          </motion.text>
        )}
      </motion.g>
    </motion.g>
  );
}

/**
 * A big, soft, slowly breathing chart of liquidated net worth under Hold / Sell / 1031,
 * drawn from the real engine output. Decorative: the page's headline carries the meaning.
 */
export function HeroChart({ results }: { results: ScenarioResults }) {
  const reduce = useReducedMotion() ?? false;
  const [ref, size] = useChartSize<HTMLDivElement>({ width: 1200, height: 640 });
  const { width, height } = size;

  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const px = useSpring(mx, { stiffness: 40, damping: 18, mass: 1 });
  const py = useSpring(my, { stiffness: 40, damping: 18, mass: 1 });

  useEffect(() => {
    if (reduce) return;
    const move = (e: PointerEvent) => {
      mx.set((e.clientX / window.innerWidth - 0.5) * 2);
      my.set((e.clientY / window.innerHeight - 0.5) * 2);
    };
    window.addEventListener("pointermove", move, { passive: true });
    return () => window.removeEventListener("pointermove", move);
  }, [reduce, mx, my]);

  const geometry = useMemo(() => {
    const years = results.hold.years.map((r) => r.year);
    const narrow = width < 900;
    const x0 = narrow ? 0.62 : 0.42;
    const x1 = narrow ? 0.88 : 0.9;
    const padTop = height * 0.16;
    const padBottom = height * 0.12;
    const x = scaleLinear()
      .domain([years[0] ?? 0, years[years.length - 1] ?? 1])
      .range([width * x0, width * x1]);
    const all = STRATEGY_ORDER.flatMap((k) => results[k].years.map((r) => r.netWorthLiquidated));
    const [lo = 0, hi = 1] = extent(all);
    const y = scaleLinear()
      .domain([lo, hi])
      .range([height - padBottom, padTop]);
    const gen = line<{ year: number; v: number }>()
      .x((p) => x(p.year))
      .y((p) => y(p.v))
      .curve(curveMonotoneX);
    const paths = STRATEGY_ORDER.map((kind) => {
      const pts = results[kind].years.map((r) => ({ year: r.year, v: r.netWorthLiquidated }));
      const last = pts[pts.length - 1];
      return {
        kind,
        d: gen(pts) ?? "",
        last: last ? { x: x(last.year), y: y(last.v) } : { x: 0, y: 0 },
      };
    });
    const gridY = Array.from(
      { length: 6 },
      (_, i) => padTop + ((height - padBottom - padTop) * i) / 5,
    );
    const gridX = Array.from({ length: 9 }, (_, i) => width * x0 + (width * (x1 - x0) * i) / 8);
    return { paths, gridX, gridY };
  }, [results, width, height]);

  return (
    <div
      ref={ref}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 overflow-hidden"
      style={{
        WebkitMaskImage: MASK,
        maskImage: MASK,
      }}
    >
      <svg width={width} height={height} className="absolute inset-0">
        <g stroke="var(--grid)" strokeWidth={1}>
          {geometry.gridY.map((gy) => (
            <line key={`h${gy}`} x1={0} x2={width} y1={gy} y2={gy} />
          ))}
          {geometry.gridX.map((gx) => (
            <line key={`v${gx}`} x1={gx} x2={gx} y1={0} y2={height} />
          ))}
        </g>
        {geometry.paths.map((p, i) => (
          <Layer
            key={p.kind}
            kind={p.kind}
            d={p.d}
            last={p.last}
            height={height}
            px={px}
            py={py}
            reduce={reduce}
            index={i}
            showLabel={width > 760}
          />
        ))}
      </svg>
    </div>
  );
}
