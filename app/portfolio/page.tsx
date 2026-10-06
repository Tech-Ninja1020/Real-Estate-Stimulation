"use client";

import Link from "next/link";
import { ScenarioGate } from "@/components/ScenarioGate";
import { EquityDebtChart } from "@/components/portfolio/EquityDebtChart";
import { PortfolioKpis } from "@/components/portfolio/PortfolioKpis";
import { PropertyCard } from "@/components/portfolio/PropertyCard";
import { Skyline } from "@/components/portfolio/Skyline";
import { YearScrubber } from "@/components/portfolio/YearScrubber";
import {
  recaptureCeilingRate,
  recaptureTaxAtCeiling,
  rowForYear,
  sumRows,
} from "@/components/portfolio/facts";
import { EmptyState, SectionHeading } from "@/components/ui/primitives";

export default function PortfolioPage() {
  return (
    <ScenarioGate>
      {(s) => {
        const { household, config, results, year, horizonYear, setScrubYear } = s;
        const asOfYear = household.market.asOfYear;
        const hold = results.hold;
        const row = hold.years.find((r) => r.year === year) ?? hold.years[hold.years.length - 1];
        if (!row)
          return (
            <EmptyState
              title="No projection available"
              body="The simulation did not produce any years. Check the household inputs."
            />
          );

        const originals = hold.properties.filter((p) => p.origin === "original");
        const recapture = sumRows(
          originals.map((p) => rowForYear(p, year)),
          (r) => r.recaptureExposure,
        );
        const ceiling = recaptureCeilingRate(household);
        return (
          <div className="space-y-8">
            <SectionHeading
              eyebrow="Portfolio · today's holdings, unchanged"
              title={household.name}
            >
              {household.tagline} {household.description}
            </SectionHeading>

            <YearScrubber
              year={year}
              asOfYear={asOfYear}
              horizonYear={horizonYear}
              onChange={setScrubYear}
            />

            <PortfolioKpis
              row={row}
              year={year}
              recapture={recapture}
              recaptureTax={recaptureTaxAtCeiling(household, recapture)}
              ceilingRate={ceiling}
            />

            <Skyline properties={originals} year={year} salePlanIds={config.sellPropertyIds} />

            <section aria-labelledby="holdings-heading">
              <div className="mb-4 flex items-end justify-between gap-3">
                <h2 id="holdings-heading" className="display text-ink text-2xl">
                  Holdings
                </h2>
                <p className="num text-ink-3 text-xs">
                  {originals.length} {originals.length === 1 ? "property" : "properties"} · as of
                  end of {year}
                </p>
              </div>
              <ul className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                {originals.map((p, i) => {
                  const pRow = rowForYear(p, year);
                  if (!pRow) return null;
                  return (
                    <PropertyCard
                      key={p.id}
                      timeline={p}
                      property={household.properties.find((x) => x.id === p.id)}
                      row={pRow}
                      year={year}
                      index={i}
                      events={hold.events}
                      inSalePlan={config.sellPropertyIds.includes(p.id)}
                      recaptureTax={recaptureTaxAtCeiling(household, pRow.recaptureExposure)}
                    />
                  );
                })}
              </ul>
            </section>

            <EquityDebtChart years={hold.years} scrubYear={year} onScrub={setScrubYear} />

            <aside className="card text-ink-2 flex flex-wrap items-center justify-between gap-3 px-5 py-4 text-sm">
              <p>
                This is the portfolio as it stands today. To see what a sale or a 1031 exchange
                would change, open the lab.
              </p>
              <Link
                href="/lab"
                className="text-accent inline-flex items-center gap-1.5 font-medium underline-offset-4 hover:underline"
              >
                Compare strategies in the Scenario Lab
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path
                    d="M3 8h10M9 4l4 4-4 4"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </Link>
            </aside>
          </div>
        );
      }}
    </ScenarioGate>
  );
}
