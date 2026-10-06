"use client";

import { Money } from "@/components/math/Fig";
import { cn } from "@/lib/cn";
import type { PropertyTimeline, Year } from "@/engine/types";

/** Adjusted basis rolled forward year by year: opening + improvements − depreciation = closing. */
export function BasisRollForward({
  timeline,
  asOfYear,
  scrubYear,
}: {
  timeline: PropertyTimeline;
  asOfYear: Year;
  scrubYear: Year;
}) {
  const lines = timeline.rows
    .map((r, i) => ({ r, prev: timeline.rows[i - 1] }))
    .filter(
      (x): x is { r: (typeof timeline.rows)[number]; prev: (typeof timeline.rows)[number] } =>
        x.prev !== undefined && x.r.year > asOfYear,
    )
    .map(({ r, prev }) => ({
      row: r,
      opening: prev.adjustedBasis,
      // Zero in every normal year; non-zero only where the year-end basis includes a mid-month sale adjustment.
      adjustment: r.adjustedBasis - (prev.adjustedBasis + r.capex - r.depreciation),
    }));
  const hasAdjustment = lines.some((l) => l.adjustment !== 0);

  const headers = [
    "Year",
    "Opening basis",
    "+ Improvements",
    "− Depreciation",
    ...(hasAdjustment ? ["± Mid-month sale adj."] : []),
    "Closing basis",
  ];
  return (
    <section className="card p-5 sm:p-6" aria-labelledby="basis-heading">
      <h3 id="basis-heading" className="display text-ink text-xl leading-tight">
        Basis roll-forward
      </h3>
      <p className="text-ink-3 mt-1 max-w-xl text-sm leading-relaxed">
        Adjusted basis = land + building + improvements − depreciation. Each year it grows with
        capital improvements and shrinks with the depreciation deduction.
      </p>
      <div
        className="border-line mt-4 max-h-[26rem] overflow-auto rounded-xl border"
        tabIndex={0}
        role="region"
        aria-label="Basis roll-forward table"
      >
        <table className="num w-full min-w-[34rem] border-separate border-spacing-0 text-left text-sm">
          <caption className="sr-only">Adjusted basis roll-forward for {timeline.name}</caption>
          <thead>
            <tr className="text-ink-3 text-xs">
              {headers.map((h, i) => (
                <th
                  key={h}
                  scope="col"
                  className={cn(
                    "border-line bg-surface-2 sticky top-0 z-10 border-b px-3 py-2.5 font-medium",
                    i > 0 && "text-right",
                  )}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lines.map(({ row, opening, adjustment }) => {
              const here = row.year === scrubYear;
              return (
                <tr
                  key={row.year}
                  aria-current={here ? "true" : undefined}
                  className={cn(here ? "bg-accent-soft" : "hover:bg-surface-2/60")}
                >
                  <td
                    className={cn(
                      "border-line text-ink border-b px-3 py-2 font-medium",
                      here && "border-l-accent border-l-2",
                    )}
                  >
                    {row.year}
                  </td>
                  <td className="border-line text-ink-2 border-b px-3 py-2 text-right">
                    <Money
                      cents={opening}
                      tween={false}
                      trace={{
                        kind: "adjustedBasis",
                        strategy: "hold",
                        propertyId: timeline.id,
                        year: row.year - 1,
                      }}
                    />
                  </td>
                  <td className="border-line text-ink-2 border-b px-3 py-2 text-right">
                    {row.capex > 0 ? <Money cents={row.capex} tween={false} /> : "—"}
                  </td>
                  <td className="border-line text-ink-2 border-b px-3 py-2 text-right">
                    <Money
                      cents={row.depreciation}
                      tween={false}
                      trace={{
                        kind: "annualDepreciation",
                        strategy: "hold",
                        propertyId: timeline.id,
                        year: row.year,
                      }}
                    />
                  </td>
                  {hasAdjustment && (
                    <td className="border-line text-amber border-b px-3 py-2 text-right">
                      {adjustment === 0 ? "—" : <Money cents={adjustment} tween={false} />}
                    </td>
                  )}
                  <td className="border-line text-ink border-b px-3 py-2 text-right font-medium">
                    <Money
                      cents={row.adjustedBasis}
                      tween={false}
                      trace={{
                        kind: "adjustedBasis",
                        strategy: "hold",
                        propertyId: timeline.id,
                        year: row.year,
                      }}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {hasAdjustment && (
        <p className="text-ink-3 mt-2 text-xs">
          In a sale year the engine stops depreciating mid-December, while the basis shown is as of
          December 31; the extra column closes that small gap.
        </p>
      )}
    </section>
  );
}
