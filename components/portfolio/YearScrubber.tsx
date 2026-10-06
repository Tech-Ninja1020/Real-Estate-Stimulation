"use client";

import { Button, SliderField } from "@/components/ui/primitives";
import type { Year } from "@/engine/types";

/**
 * A compact "move through time" control shared by the portfolio and property views. It drives the
 * app-wide scrubber year, so every figure on the page updates together.
 */
export function YearScrubber({
  year,
  asOfYear,
  horizonYear,
  onChange,
}: {
  year: Year;
  asOfYear: Year;
  horizonYear: Year;
  /** Pass `null` to return to the horizon (the default view). */
  onChange: (year: Year | null) => void;
}) {
  const elapsed = year - asOfYear;
  const total = horizonYear - asOfYear;
  return (
    <div className="no-print card flex flex-col gap-4 px-5 py-4 sm:flex-row sm:items-center sm:gap-6">
      <div className="min-w-0 flex-1">
        <SliderField
          label={`As of end of ${year}`}
          value={year}
          min={asOfYear}
          max={horizonYear}
          onChange={(v) => onChange(v >= horizonYear ? null : v)}
          display={elapsed === 0 ? "Today" : `Year ${elapsed} of ${total}`}
        />
        <div className="num text-ink-3 mt-0.5 flex justify-between text-[11px]" aria-hidden="true">
          <span>{asOfYear} · today</span>
          <span>{horizonYear} · horizon</span>
        </div>
      </div>
      <div className="flex shrink-0 gap-2">
        <Button
          size="sm"
          variant={year === asOfYear ? "primary" : "secondary"}
          aria-pressed={year === asOfYear}
          onClick={() => onChange(asOfYear)}
        >
          Today
        </Button>
        <Button
          size="sm"
          variant={year === horizonYear ? "primary" : "secondary"}
          aria-pressed={year === horizonYear}
          onClick={() => onChange(null)}
        >
          Horizon
        </Button>
      </div>
    </div>
  );
}
