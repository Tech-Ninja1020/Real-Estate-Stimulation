"use client";

import { animate, useReducedMotion } from "framer-motion";
import { useEffect, useRef, useState } from "react";

interface Props {
  value: number;
  format: (value: number) => string;
  /** Seconds. */
  duration?: number;
  className?: string;
}

/**
 * Tweens between values by writing text straight into the DOM (no React re-render per frame).
 * Respects prefers-reduced-motion by jumping to the final value.
 */
export function AnimatedNumber({ value, format, duration = 0.7, className }: Props) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLSpanElement>(null);
  const previous = useRef(value);
  const formatRef = useRef(format);
  useEffect(() => {
    formatRef.current = format;
  });
  // The React-rendered text never changes after mount; the effect owns it from then on.
  const [initial] = useState(() => format(value));

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const from = previous.current;
    previous.current = value;
    if (reduce || from === value) {
      node.textContent = formatRef.current(value);
      return;
    }
    const controls = animate(from, value, {
      duration,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => {
        node.textContent = formatRef.current(v);
      },
      onComplete: () => {
        node.textContent = formatRef.current(value);
      },
    });
    return () => controls.stop();
  }, [value, duration, reduce]);

  return (
    <span ref={ref} className={className} suppressHydrationWarning>
      {initial}
    </span>
  );
}
