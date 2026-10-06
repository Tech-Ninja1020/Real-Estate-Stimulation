"use client";

import type { ReactNode } from "react";

/**
 * An HTML tooltip positioned inside a `position: relative` chart container. It flips to the
 * left of the anchor when it would overflow the container's right edge.
 */
export function ChartTooltip({
  x,
  y,
  containerWidth,
  children,
  width = 220,
}: {
  x: number;
  y: number;
  containerWidth: number;
  children: ReactNode;
  width?: number;
}) {
  const flip = x + width + 24 > containerWidth;
  const left = flip ? x - width - 14 : x + 14;
  return (
    <div
      role="status"
      className="border-line-strong bg-surface shadow-pop pointer-events-none absolute z-20 rounded-xl border px-3.5 py-2.5 text-xs"
      style={{ left: Math.max(4, left), top: Math.max(4, y), width }}
    >
      {children}
    </div>
  );
}

export function TooltipRow({
  color,
  dash,
  label,
  value,
  strong,
}: {
  color?: string;
  dash?: string;
  label: ReactNode;
  value: ReactNode;
  strong?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-0.5">
      <span className="text-ink-2 flex min-w-0 items-center gap-2">
        {color && (
          <svg width="14" height="8" aria-hidden="true" className="shrink-0">
            <line
              x1="1"
              y1="4"
              x2="13"
              y2="4"
              stroke={color}
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeDasharray={dash}
            />
          </svg>
        )}
        <span className="truncate">{label}</span>
      </span>
      <span className={`num shrink-0 ${strong ? "text-ink font-semibold" : "text-ink"}`}>
        {value}
      </span>
    </div>
  );
}
