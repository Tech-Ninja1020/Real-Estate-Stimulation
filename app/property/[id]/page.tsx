"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ScenarioGate } from "@/components/ScenarioGate";
import { YearScrubber } from "@/components/portfolio/YearScrubber";
import { loanTypeCounts, propertyBadges } from "@/components/portfolio/facts";
import { AdvisorSummary } from "@/components/property/AdvisorSummary";
import { BasisRollForward } from "@/components/property/BasisRollForward";
import { DepreciationSchedule } from "@/components/property/DepreciationSchedule";
import { LoanChart } from "@/components/property/LoanChart";
import { OperatingTable } from "@/components/property/OperatingTable";
import { PropertyKpis } from "@/components/property/PropertyKpis";
import { ButtonLink, Chip, EmptyState } from "@/components/ui/primitives";

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export default function PropertyPage() {
  const params = useParams<{ id: string }>();
  const id = decodeURIComponent(params.id ?? "");
  return (
    <ScenarioGate>
      {(s) => {
        const { household, config, results, year, horizonYear, setScrubYear } = s;
        const timeline = results.hold.properties.find((p) => p.id === id);
        const property = household.properties.find((p) => p.id === id);
        if (!timeline || !property) {
          return (
            <EmptyState
              title="We can't find that property"
              body={`There is no property called "${id}" in ${household.name}. It may belong to a different household, or the link is out of date.`}
              action={
                <ButtonLink href="/portfolio" variant="primary">
                  Back to the portfolio
                </ButtonLink>
              }
            />
          );
        }
        const asOfYear = household.market.asOfYear;
        const row =
          timeline.rows.find((r) => r.year === year) ?? timeline.rows[timeline.rows.length - 1];
        if (!row)
          return (
            <EmptyState
              title="No projection available"
              body="The simulation did not produce any rows for this property."
            />
          );
        const loans = loanTypeCounts(timeline.loanSchedules);
        const badges = propertyBadges(timeline, results.hold.events, row, year).filter(
          (b) => b.tone === "amber",
        );
        return (
          <div className="space-y-8">
            <div>
              <nav aria-label="Breadcrumb" className="mb-4">
                <Link
                  href="/portfolio"
                  className="text-ink-3 hover:text-ink inline-flex items-center gap-1.5 text-sm transition"
                >
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <path
                      d="M13 8H3M7 4 3 8l4 4"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  Portfolio
                </Link>
              </nav>
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div className="min-w-0">
                  <p className="eyebrow mb-2">Property · {household.name}</p>
                  <h1 className="display text-ink text-3xl leading-tight sm:text-4xl">
                    {timeline.name}
                  </h1>
                  <p className="text-ink-2 mt-1.5 text-sm">
                    {property.location} · Purchased {MONTHS[property.purchaseMonth - 1]}{" "}
                    {property.purchaseYear}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {config.sellPropertyIds.includes(id) && (
                    <Chip tone="accent">In the sale plan</Chip>
                  )}
                  {loans.map((l) => (
                    <Chip key={l.type}>
                      {l.label}
                      {l.count > 1 && <span className="num text-ink-3">×{l.count}</span>}
                    </Chip>
                  ))}
                  {loans.length === 0 && <Chip>No loans</Chip>}
                  {badges.map((b) => (
                    <Chip key={b.key} tone="amber">
                      {b.label}
                    </Chip>
                  ))}
                </div>
              </div>
            </div>

            <YearScrubber
              year={year}
              asOfYear={asOfYear}
              horizonYear={horizonYear}
              onChange={setScrubYear}
            />
            <PropertyKpis id={id} row={row} year={year} />
            <AdvisorSummary
              household={household}
              timeline={timeline}
              row={row}
              year={year}
              config={config}
              results={results}
            />

            {timeline.loanSchedules.length > 0 && (
              <LoanChart
                timeline={timeline}
                asOfYear={asOfYear}
                horizonYear={horizonYear}
                scrubYear={year}
                onScrub={setScrubYear}
              />
            )}

            <DepreciationSchedule
              timeline={timeline}
              asOfYear={asOfYear}
              horizonYear={horizonYear}
              scrubYear={year}
            />

            <div className="grid items-start gap-6 xl:grid-cols-2">
              <BasisRollForward timeline={timeline} asOfYear={asOfYear} scrubYear={year} />
              <OperatingTable timeline={timeline} asOfYear={asOfYear} scrubYear={year} />
            </div>
          </div>
        );
      }}
    </ScenarioGate>
  );
}
