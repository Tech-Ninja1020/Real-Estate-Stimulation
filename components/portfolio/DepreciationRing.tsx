"use client";

import { motion, useReducedMotion } from "framer-motion";
import { accruedHalfMonths, midMonthIndex, yearEndIndex } from "@/engine/depreciation";
import type { DepreciationTranche, PropertyTimeline, Year } from "@/engine/types";
import { fmtNumber } from "@/lib/format";

interface Clock {
  fraction: number;
  /** Years of depreciation still to run at the end of the scrubber year. */
  yearsLeft: number;
  /** Calendar year in which the clock runs out. */
  doneYear: Year;
  lifeYears: number;
}

/** The building tranche, or the carried-over tranches combined when there is no building. */
function clockFor(tranches: readonly DepreciationTranche[], year: Year): Clock | null {
  const building = tranches.filter((t) => t.kind === "building");
  const use = building.length > 0 ? building : tranches.filter((t) => t.kind === "carryover");
  if (use.length === 0) return null;
  const at = yearEndIndex(year);
  let weight = 0;
  let used = 0;
  let leftHalfMonths = 0;
  let doneIndex = 0;
  let lifeHalfMonths = 0;
  for (const t of use) {
    if (t.lifeHalfMonths <= 0) continue;
    const w = Math.max(1, t.basis);
    const accrued = accruedHalfMonths(t, at);
    weight += w;
    used += (w * accrued) / t.lifeHalfMonths;
    leftHalfMonths = Math.max(leftHalfMonths, t.lifeHalfMonths - accrued);
    doneIndex = Math.max(
      doneIndex,
      midMonthIndex(t.placedInServiceYear, t.placedInServiceMonth) + t.lifeHalfMonths,
    );
    lifeHalfMonths = Math.max(lifeHalfMonths, t.lifeHalfMonths);
  }
  if (weight === 0) return null;
  return {
    fraction: Math.min(1, Math.max(0, used / weight)),
    yearsLeft: leftHalfMonths / 24,
    doneYear: Math.ceil(doneIndex / 24) - 1,
    lifeYears: lifeHalfMonths / 24,
  };
}

/**
 * A small ring showing how much of the building's depreciation clock (27.5 years for
 * residential rental property) has run by the end of the scrubber year. It turns amber once the
 * building is fully depreciated: basis cannot shrink further and recapture exposure is maxed.
 */
export function DepreciationRing({
  timeline,
  year,
  size = 48,
}: {
  timeline: PropertyTimeline;
  year: Year;
  size?: number;
}) {
  const reduce = useReducedMotion();
  const clock = clockFor(timeline.tranches, year);
  if (!clock) return null;

  const stroke = 4;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.floor(clock.fraction * 100 + 1e-9);
  const done = clock.fraction >= 1;
  const life = fmtNumber(clock.lifeYears, clock.lifeYears % 1 === 0 ? 0 : 1);
  const leftText = done ? "0" : fmtNumber(clock.yearsLeft, 1);
  const label = `Depreciation clock: ${pct}% of ${life} years used`;
  const tip = done
    ? `${label}\nFully depreciated since ${clock.doneYear}`
    : `${label}\nYears left: ${leftText}\nFully depreciated in ${clock.doneYear}`;

  return (
    <div
      role="img"
      aria-label={`${label}. ${done ? `Fully depreciated since ${clock.doneYear}.` : `Years left: ${leftText}. Fully depreciated in ${clock.doneYear}.`}`}
      title={tip}
      className="relative z-10 shrink-0 cursor-help"
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--ink)"
          strokeOpacity={0.1}
          strokeWidth={stroke}
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={done ? "var(--amber-fill)" : "var(--c-hold)"}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c * (1 - clock.fraction) }}
          transition={{ duration: reduce ? 0 : 0.9, ease: [0.22, 1, 0.36, 1] }}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <span
        aria-hidden="true"
        className={`num absolute inset-0 flex items-center justify-center text-[11px] font-semibold tracking-tight ${done ? "text-amber" : "text-ink"}`}
      >
        {pct}%
      </span>
    </div>
  );
}
