"use client";

import { Money } from "@/components/math/Fig";
import { cn } from "@/lib/cn";
import type { PropertyTimeline, Year } from "@/engine/types";

/** Operating performance by year: NOI, debt service, cash flow and taxable rental income. */
export function OperatingTable({
  timeline,
  asOfYear,
  scrubYear,
}: {
  timeline: PropertyTimeline;
  asOfYear: Year;
  scrubYear: Year;
}) {
  const rows = timeline.rows.filter((r) => r.year > asOfYear);
  const headers = ["Year", "NOI", "Debt service", "Cash flow before tax", "Taxable rental income"];
  return (
    <section className="card p-5 sm:p-6" aria-labelledby="ops-heading">
      <h3 id="ops-heading" className="display text-ink text-xl leading-tight">
        Operating performance
      </h3>
      <p className="text-ink-3 mt-1 max-w-xl text-sm leading-relaxed">
        What the property earns each year, what the loans take, and the rental income that reaches
        the tax return after depreciation.
      </p>
      <div
        className="border-line mt-4 max-h-[26rem] overflow-auto rounded-xl border"
        tabIndex={0}
        role="region"
        aria-label="Operating performance table"
      >
        <table className="num w-full min-w-[34rem] border-separate border-spacing-0 text-left text-sm">
          <caption className="sr-only">Operating performance for {timeline.name}</caption>
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
            {rows.map((r) => {
              const here = r.year === scrubYear;
              return (
                <tr
                  key={r.year}
                  aria-current={here ? "true" : undefined}
                  className={cn(here ? "bg-accent-soft" : "hover:bg-surface-2/60")}
                >
                  <td
                    className={cn(
                      "border-line text-ink border-b px-3 py-2 font-medium",
                      here && "border-l-accent border-l-2",
                    )}
                  >
                    {r.year}
                  </td>
                  <td className="border-line text-ink border-b px-3 py-2 text-right">
                    <Money
                      cents={r.noi}
                      tween={false}
                      trace={{
                        kind: "noi",
                        strategy: "hold",
                        year: r.year,
                        propertyId: timeline.id,
                      }}
                    />
                  </td>
                  <td className="border-line text-ink-2 border-b px-3 py-2 text-right">
                    <Money cents={r.debtService} tween={false} />
                  </td>
                  <td
                    className={cn(
                      "border-line border-b px-3 py-2 text-right font-medium",
                      r.cashFlowBeforeTax < 0 ? "text-amber" : "text-ink",
                    )}
                  >
                    <Money cents={r.cashFlowBeforeTax} tween={false} />
                  </td>
                  <td className="border-line text-ink-2 border-b px-3 py-2 text-right">
                    <Money cents={r.taxableRentalIncome} tween={false} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
