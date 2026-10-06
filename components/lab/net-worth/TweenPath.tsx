"use client";

import { animate, useReducedMotion } from "framer-motion";
import { useEffect, useRef, useState, type SVGProps } from "react";

/** Each point is a row of numbers whose first entry is the x pixel (used to detect resizes). */
export type PathPoints = number[][];

interface TweenPathProps extends Omit<SVGProps<SVGPathElement>, "d" | "ref"> {
  data: PathPoints;
  /** Turns a (possibly interpolated) set of points into an SVG path string. */
  build: (points: PathPoints) => string;
  duration?: number;
}

const n = (row: readonly number[] | undefined, i: number): number => row?.[i] ?? 0;

function sameShape(a: PathPoints, b: PathPoints): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (n(a[i], 0) !== n(b[i], 0) && Math.abs(n(a[i], 0) - n(b[i], 0)) > 0.5) return false;
    if ((a[i]?.length ?? 0) !== (b[i]?.length ?? 0)) return false;
  }
  return true;
}

/**
 * A path that re-tweens when its points change. The `d` attribute is written straight to the DOM
 * during the tween (no React re-render per frame), so dragging a slider stays cheap.
 */
export function TweenPath({ data, build, duration = 0.38, ...rest }: TweenPathProps) {
  const reduce = useReducedMotion();
  const ref = useRef<SVGPathElement>(null);
  const current = useRef<PathPoints>(data);
  const buildRef = useRef(build);
  // React owns `d` only for the first paint; the effect owns it afterwards.
  const [initial] = useState(() => build(data));

  useEffect(() => {
    buildRef.current = build;
  }, [build]);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const from = current.current;
    const to = data;
    if (from === to) return;
    if (reduce || !sameShape(from, to)) {
      current.current = to;
      node.setAttribute("d", buildRef.current(to));
      return;
    }
    const start = from.map((p) => p.slice());
    const controls = animate(0, 1, {
      duration,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (t) => {
        const next = to.map((p, i) => p.map((v, j) => n(start[i], j) + (v - n(start[i], j)) * t));
        current.current = next;
        node.setAttribute("d", buildRef.current(next));
      },
      onComplete: () => {
        current.current = to;
        node.setAttribute("d", buildRef.current(to));
      },
    });
    return () => controls.stop();
  }, [data, reduce, duration]);

  return <path ref={ref} d={initial} {...rest} />;
}
