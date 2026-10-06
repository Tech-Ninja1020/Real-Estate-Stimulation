"use client";

import type { ReactNode } from "react";
import { Money, Pct } from "@/components/math/Fig";
import { loanToValue, recaptureTaxAtCeiling } from "@/components/portfolio/facts";
import type {
  Household,
  LoanSchedule,
  LoanYearRow,
  PropertyTimeline,
  PropertyYearRow,
  ScenarioConfig,
  ScenarioResults,
  Year,
} from "@/engine/types";

const WATCH_RECAPTURE_SHARE = 0.35;
const WATCH_LTV = 0.75;

function Strong({ children }: { children: ReactNode }) {
  return <span className="text-ink font-semibold">{children}</span>;
}

function WarnIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      className="text-amber mt-0.5 shrink-0"
    >
      <path
        d="M8 2.2 14.3 13H1.7L8 2.2Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <path
        d="M8 6.4v3.2M8 11.3v.1"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

interface LoanFacts {
  io?: { schedule: LoanSchedule; endYear: Year; before: LoanYearRow; after: LoanYearRow };
  arm?: {
    schedule: LoanSchedule;
    firstAdjusting: LoanYearRow;
    initial: LoanYearRow | undefined;
    current: LoanYearRow;
    capYear?: Year;
    capKind?: LoanYearRow["capHit"];
  };
  heloc?: { schedule: LoanSchedule; total: number; first: Year; last: Year; peak: number };
}

function loanFacts(p: PropertyTimeline, asOfYear: Year, year: Year): LoanFacts {
  const facts: LoanFacts = {};
  for (const s of p.loanSchedules) {
    if (s.type === "interestOnly" && !facts.io) {
      const idx = s.rows.findIndex((r) => r.phase === "amortizing");
      const after = s.rows[idx];
      const before = s.rows[idx - 1];
      if (idx > 0 && after && before)
        facts.io = { schedule: s, endYear: after.year, before, after };
    }
    if (s.type === "arm" && !facts.arm) {
      const adj = s.rows.filter((r) => r.phase === "armAdjusting");
      const firstAdjusting = adj[0];
      if (firstAdjusting) {
        const capRow = adj.find((r) => r.capHit !== "none");
        const idx = s.rows.indexOf(firstAdjusting);
        const current =
          s.rows.find((r) => r.year === year) ?? s.rows[s.rows.length - 1] ?? firstAdjusting;
        facts.arm = {
          schedule: s,
          firstAdjusting,
          initial: s.rows[idx - 1],
          current,
          capYear: capRow?.year,
          capKind: capRow?.capHit,
        };
      }
    }
    if (s.type === "heloc" && !facts.heloc) {
      const drawRows = s.rows.filter((r) => r.draws > 0 && r.year > asOfYear);
      const firstDraw = drawRows[0];
      const lastDraw = drawRows[drawRows.length - 1];
      if (firstDraw && lastDraw) {
        facts.heloc = {
          schedule: s,
          total: drawRows.reduce((a, r) => a + r.draws, 0),
          first: firstDraw.year,
          last: lastDraw.year,
          peak: Math.max(...s.rows.map((r) => r.closingBalance)),
        };
      }
    }
  }
  return facts;
}

/**
 * A deterministic plain-English read of one property at the scrubber year: every number is a
 * figure you can click to see its math, and the watch list flags what an advisor would raise.
 */
export function AdvisorSummary({
  household,
  timeline,
  row,
  year,
  config,
  results,
}: {
  household: Household;
  timeline: PropertyTimeline;
  row: PropertyYearRow;
  year: Year;
  config: ScenarioConfig;
  results: ScenarioResults;
}) {
  const id = timeline.id;
  const asOf = household.market.asOfYear;
  const prop = household.properties.find((p) => p.id === id);
  const gain = row.unrealizedGain;
  const recapture = row.recaptureExposure;
  const ordinaryCapGain = Math.max(0, gain - recapture);
  const tax = recaptureTaxAtCeiling(household, recapture);
  const facts = loanFacts(timeline, asOf, year);
  const hasDebt = row.loanBalance > 0;
  const ltv = loanToValue(row);
  const futureRows = timeline.rows.filter((r) => r.year > asOf);
  const negativeYears = futureRows.filter((r) => r.cashFlowBeforeTax < 0);
  const sellRow =
    config.sellPropertyIds.includes(id) && results.sell.sale
      ? results.sell.sale.properties.find((s) => s.propertyId === id)
      : undefined;
  const recaptureShare = gain > 0 ? recapture / gain : 0;
  const underwater = prop !== undefined && row.marketValue < prop.purchasePrice && gain > 0;

  // Watch list, in priority order; show the top four.
  const flags: { key: string; body: ReactNode }[] = [];
  if (facts.arm?.capYear !== undefined) {
    flags.push({
      key: "cap",
      body: (
        <>
          The ARM hits its {facts.arm.capKind === "lifetime" ? "lifetime" : "periodic"} rate cap in{" "}
          <Strong>{facts.arm.capYear}</Strong>; the rate you pay stops tracking the index, so the
          cost of the loan is capped but sticky.
        </>
      ),
    });
  }
  if (facts.io) {
    flags.push({
      key: "io",
      body: (
        <>
          Interest-only ends in <Strong>{facts.io.endYear}</Strong>: the annual payment moves from{" "}
          <Money cents={facts.io.before.payment} tween={false} /> to{" "}
          <Money cents={facts.io.after.payment} tween={false} />.
        </>
      ),
    });
  }
  if (negativeYears.length > 0) {
    const firstNeg = negativeYears[0];
    flags.push({
      key: "cf",
      body: (
        <>
          Cash flow before tax is negative in <Strong>{negativeYears.length}</Strong> projected{" "}
          {negativeYears.length === 1 ? "year" : "years"}
          {firstNeg ? <>, starting {firstNeg.year}</> : null}. The shortfall is funded from other
          cash.
        </>
      ),
    });
  }
  if (underwater && prop) {
    flags.push({
      key: "underwater",
      body: (
        <>
          Worth less than the <Money cents={prop.purchasePrice} tween={false} /> paid, yet a sale
          would still show a taxable gain of <Money cents={gain} tween={false} />, because
          depreciation has already lowered the basis.
        </>
      ),
    });
  }
  if (recaptureShare >= WATCH_RECAPTURE_SHARE) {
    flags.push({
      key: "recapture",
      body: (
        <>
          Depreciation recapture is <Pct rate={recaptureShare} digits={0} tween={false} /> of the
          gain, taxed at up to 25% rather than the lower capital gains rates.
        </>
      ),
    });
  }
  if (ltv >= WATCH_LTV) {
    flags.push({
      key: "ltv",
      body: (
        <>
          Leverage is high at <Pct rate={ltv} digits={0} tween={false} /> loan-to-value, leaving a
          thin equity cushion.
        </>
      ),
    });
  }
  if (facts.heloc) {
    flags.push({
      key: "heloc",
      body: (
        <>
          HELOC draws of <Money cents={facts.heloc.total} tween={false} /> between{" "}
          {facts.heloc.first} and {facts.heloc.last} raise the balance to a peak of{" "}
          <Money cents={facts.heloc.peak} tween={false} />.
        </>
      ),
    });
  }
  const shown = flags.slice(0, 4);

  return (
    <section className="card-raised overflow-hidden" aria-labelledby="advisor-heading">
      <div className="grid gap-0 lg:grid-cols-[1.55fr_1fr]">
        <div className="px-6 py-6 sm:px-8 sm:py-7">
          <p className="eyebrow">What the advisor would see</p>
          <h2 id="advisor-heading" className="display text-ink mt-3 text-2xl">
            {timeline.name}, end of {year}
          </h2>
          <div className="text-ink-2 mt-4 space-y-4 text-[0.95rem] leading-7">
            <p>
              <Strong>Position.</Strong> The property is worth{" "}
              <Money
                cents={row.marketValue}
                trace={{ kind: "propertyValue", strategy: "hold", propertyId: id, year }}
                className="text-ink font-semibold"
              />
              {hasDebt ? (
                <>
                  {" "}
                  against <Money cents={row.loanBalance} className="text-ink font-semibold" /> of
                  debt, leaving <Money cents={row.equity} className="text-ink font-semibold" /> of
                  equity, a loan-to-value of <Pct rate={ltv} digits={0} />.
                </>
              ) : (
                <>
                  {" "}
                  and carries no debt, so all{" "}
                  <Money cents={row.equity} className="text-ink font-semibold" /> of it is equity.
                </>
              )}
            </p>
            <p>
              <Strong>Tax picture.</Strong> Adjusted basis is{" "}
              <Money
                cents={row.adjustedBasis}
                trace={{ kind: "adjustedBasis", strategy: "hold", propertyId: id, year }}
                className="text-ink font-semibold"
              />{" "}
              after{" "}
              <Money
                cents={row.accumulatedDepreciation}
                trace={{ kind: "accumulatedDepreciation", strategy: "hold", propertyId: id, year }}
              />{" "}
              of depreciation.{" "}
              {gain > 0 ? (
                <>
                  Selling at the year-end value would realize a gain of about{" "}
                  <Money cents={gain} className="text-ink font-semibold" />:{" "}
                  <Money
                    cents={recapture}
                    trace={{ kind: "recaptureExposure", strategy: "hold", propertyId: id, year }}
                    className="text-amber font-semibold"
                  />{" "}
                  is depreciation recapture (roughly <Money cents={tax} /> of tax at the 25%
                  ceiling) and <Money cents={ordinaryCapGain} /> is ordinary long-term capital gain.
                </>
              ) : (
                <>Selling at the year-end value would not produce a taxable gain.</>
              )}
            </p>
            <p>
              <Strong>Cash flow.</Strong> Net operating income is{" "}
              <Money
                cents={row.noi}
                trace={{ kind: "noi", strategy: "hold", year, propertyId: id }}
                className="text-ink font-semibold"
              />
              {row.debtService > 0 ? (
                <>
                  ; debt service takes <Money cents={row.debtService} />, leaving{" "}
                  <Money
                    cents={row.cashFlowBeforeTax}
                    className={
                      row.cashFlowBeforeTax < 0
                        ? "text-amber font-semibold"
                        : "text-ink font-semibold"
                    }
                  />{" "}
                  before tax{row.cashFlowBeforeTax < 0 ? ", a shortfall" : ""}.
                </>
              ) : (
                <>; with no debt service, all of it is cash flow before tax.</>
              )}
            </p>
            {(facts.io || facts.arm || facts.heloc) && (
              <p>
                <Strong>Loans.</Strong>{" "}
                {facts.io && (
                  <>
                    The interest-only period ends in {facts.io.endYear}, when the payment steps from{" "}
                    <Money
                      cents={facts.io.before.payment}
                      tween={false}
                      trace={{
                        kind: "loanPayment",
                        strategy: "hold",
                        propertyId: id,
                        loanId: facts.io.schedule.loanId,
                        year: facts.io.before.year,
                      }}
                    />{" "}
                    to{" "}
                    <Money
                      cents={facts.io.after.payment}
                      tween={false}
                      trace={{
                        kind: "loanPayment",
                        strategy: "hold",
                        propertyId: id,
                        loanId: facts.io.schedule.loanId,
                        year: facts.io.after.year,
                      }}
                    />
                    .{" "}
                  </>
                )}
                {facts.arm && (
                  <>
                    The ARM starts adjusting in {facts.arm.firstAdjusting.year}
                    {facts.arm.initial ? (
                      <>
                        {" "}
                        from <Pct rate={facts.arm.initial.endRate} digits={2} tween={false} />
                      </>
                    ) : null}{" "}
                    and sits at <Pct rate={facts.arm.current.endRate} digits={2} tween={false} /> in{" "}
                    {facts.arm.current.year}
                    {facts.arm.capYear !== undefined ? (
                      <>
                        , held back by its {facts.arm.capKind} cap from {facts.arm.capYear}
                      </>
                    ) : null}
                    .{" "}
                  </>
                )}
                {facts.heloc && (
                  <>
                    HELOC draws of <Money cents={facts.heloc.total} tween={false} /> are scheduled
                    between {facts.heloc.first} and {facts.heloc.last}.
                  </>
                )}
              </p>
            )}
            {sellRow && results.sell.sale && (
              <p className="bg-accent-soft text-ink-2 rounded-xl px-4 py-3">
                <Strong>In the sale plan.</Strong> Selling in {results.sell.sale.year} realizes a
                gain of{" "}
                <Money
                  cents={sellRow.totalGain}
                  trace={{ kind: "saleGain", strategy: "sell", propertyId: id }}
                  className="text-ink font-semibold"
                />{" "}
                on this property, against an adjusted basis of{" "}
                <Money
                  cents={sellRow.adjustedBasis}
                  trace={{ kind: "saleBasis", strategy: "sell", propertyId: id }}
                />
                .
              </p>
            )}
          </div>
        </div>

        <aside
          className="border-line bg-surface-2/60 border-t px-6 py-6 sm:px-8 lg:border-t-0 lg:border-l"
          aria-labelledby="watch-heading"
        >
          <h3 id="watch-heading" className="eyebrow">
            Watch list
          </h3>
          {shown.length === 0 ? (
            <p className="text-ink-3 mt-4 text-sm leading-relaxed">
              Nothing here would worry an advisor at this point in time. Slide the year to see how
              that changes.
            </p>
          ) : (
            <ul className="mt-4 space-y-3">
              {shown.map((f) => (
                <li
                  key={f.key}
                  className="bg-amber-soft text-ink-2 flex gap-2.5 rounded-xl px-3.5 py-3 text-sm leading-relaxed"
                >
                  <WarnIcon />
                  <span>{f.body}</span>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>
    </section>
  );
}
