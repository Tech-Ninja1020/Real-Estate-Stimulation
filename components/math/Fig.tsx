"use client";

import type { TraceRef } from "@/engine/explain";
import type { Cents, Rate } from "@/engine/types";
import { cn } from "@/lib/cn";
import { fmtCompact, fmtMoney, fmtNumber, fmtPercent } from "@/lib/format";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { useMath } from "./MathProvider";

interface BaseProps {
  /** Which figure to explain. Omit for a plain (non-clickable) number. */
  trace?: TraceRef;
  className?: string;
  /** Tween between values (default true). */
  tween?: boolean;
  /** Seconds. */
  duration?: number;
}

function Wrap({
  trace,
  className,
  children,
  label,
}: {
  trace?: TraceRef;
  className?: string;
  children: React.ReactNode;
  label: string;
}) {
  const math = useMath();
  if (!trace || !math.canResolve) return <span className={cn("num", className)}>{children}</span>;
  return (
    <button
      type="button"
      className={cn("fig num", className)}
      onClick={() => math.open(trace)}
      title="Show the math"
      aria-label={`${label}. Show the math`}
    >
      {children}
    </button>
  );
}

/** A dollar figure. With `trace`, it opens the Show-the-math drawer. */
export function Money({
  cents,
  compact,
  exact,
  tween = true,
  duration,
  trace,
  className,
}: BaseProps & { cents: Cents; compact?: boolean; exact?: boolean }) {
  const format = (v: number) =>
    compact ? fmtCompact(Math.round(v)) : fmtMoney(Math.round(v), { exact });
  return (
    <Wrap trace={trace} className={className} label={format(cents)}>
      {tween ? <AnimatedNumber value={cents} format={format} duration={duration} /> : format(cents)}
    </Wrap>
  );
}

export function Pct({
  rate,
  digits = 1,
  tween = true,
  duration,
  trace,
  className,
}: BaseProps & { rate: Rate; digits?: number }) {
  const format = (v: number) => fmtPercent(v, digits);
  return (
    <Wrap trace={trace} className={className} label={format(rate)}>
      {tween ? <AnimatedNumber value={rate} format={format} duration={duration} /> : format(rate)}
    </Wrap>
  );
}

export function Num({
  value,
  digits = 0,
  suffix,
  tween = true,
  duration,
  trace,
  className,
}: BaseProps & { value: number; digits?: number; suffix?: string }) {
  const format = (v: number) => `${fmtNumber(v, digits)}${suffix ?? ""}`;
  return (
    <Wrap trace={trace} className={className} label={format(value)}>
      {tween ? <AnimatedNumber value={value} format={format} duration={duration} /> : format(value)}
    </Wrap>
  );
}
