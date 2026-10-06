"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { Money, Pct } from "@/components/math/Fig";
import { Chip } from "@/components/ui/primitives";
import type {
  Cents,
  Property,
  PropertyTimeline,
  PropertyYearRow,
  TimelineEvent,
  Year,
} from "@/engine/types";
import { EquitySparkline } from "./EquitySparkline";
import { loanToValue, loanTypeCounts, propertyBadges } from "./facts";

const STATUS_LABEL = { owned: "Owned", pending: "Not yet owned", sold: "Sold" } as const;

function Metric({
  label,
  children,
  sub,
}: {
  label: string;
  children: React.ReactNode;
  sub?: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-ink-3 text-[11px] font-medium">{label}</dt>
      <dd className="num text-ink mt-0.5 truncate text-sm font-medium">{children}</dd>
      {sub && <dd className="text-ink-3 mt-0.5 text-[11px]">{sub}</dd>}
    </div>
  );
}

/**
 * One property at the scrubber year. The whole card navigates to the property page through a
 * stretched link on the name; every figure button sits above it so the math drawer still opens.
 */
export function PropertyCard({
  timeline,
  property,
  row,
  year,
  index,
  events,
  inSalePlan,
  recaptureTax,
}: {
  timeline: PropertyTimeline;
  property: Property | undefined;
  row: PropertyYearRow;
  year: Year;
  index: number;
  events: readonly TimelineEvent[];
  inSalePlan: boolean;
  recaptureTax: Cents;
}) {
  const reduce = useReducedMotion();
  const id = timeline.id;
  const badges = propertyBadges(timeline, events, row, year);
  const loans = loanTypeCounts(timeline.loanSchedules);
  return (
    <motion.li
      initial={{ opacity: 0, y: reduce ? 0 : 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: reduce ? 0 : 0.55,
        delay: reduce ? 0 : 0.08 + index * 0.06,
        ease: [0.22, 1, 0.36, 1],
      }}
      className="list-none"
    >
      <article
        className="card-raised group hover:border-line-strong hover:shadow-pop has-[a:focus-visible]:ring-accent relative flex h-full flex-col p-5 transition duration-300 hover:-translate-y-0.5 has-[a:focus-visible]:ring-2 [&_.fig]:relative [&_.fig]:z-10"
        aria-labelledby={`prop-${id}`}
      >
        <header className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 id={`prop-${id}`} className="display text-ink text-xl leading-tight">
              <Link
                href={`/property/${id}`}
                className="rounded-sm outline-none after:absolute after:inset-0 after:rounded-[inherit] after:content-['']"
              >
                {timeline.name}
              </Link>
            </h3>
            <p className="text-ink-3 mt-1 text-xs">{property?.location ?? ""}</p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1.5">
            <Chip>
              {row.status === "owned" && property
                ? `Owned since ${property.purchaseYear}`
                : STATUS_LABEL[row.status]}
            </Chip>
            {inSalePlan && <Chip tone="accent">In the sale plan</Chip>}
          </div>
        </header>

        <div className="border-line mt-5 grid grid-cols-2 gap-4 border-b pb-4">
          <div className="min-w-0">
            <p className="text-ink-3 text-[11px] font-medium">Market value</p>
            <p className="display text-ink mt-1 truncate text-[1.65rem] leading-none">
              <Money
                cents={row.marketValue}
                trace={{ kind: "propertyValue", strategy: "hold", propertyId: id, year }}
              />
            </p>
          </div>
          <div className="min-w-0">
            <p className="text-ink-3 text-[11px] font-medium">Equity</p>
            <p className="display text-ink mt-1 truncate text-[1.65rem] leading-none">
              <Money cents={row.equity} />
            </p>
          </div>
        </div>

        <dl className="mt-4 grid grid-cols-3 gap-x-4 gap-y-3.5">
          <Metric label="Loan balance">
            <Money cents={row.loanBalance} />
          </Metric>
          <Metric label="Loan-to-value">
            <Pct rate={loanToValue(row)} digits={0} />
          </Metric>
          <Metric label="NOI (annual)">
            <Money
              cents={row.noi}
              trace={{ kind: "noi", strategy: "hold", year, propertyId: id }}
            />
          </Metric>
          <div className="col-span-3 grid grid-cols-2 gap-x-4">
            <Metric label="Adjusted basis">
              <Money
                cents={row.adjustedBasis}
                trace={{ kind: "adjustedBasis", strategy: "hold", propertyId: id, year }}
              />
            </Metric>
            <Metric label="Depreciation taken">
              <Money
                cents={row.accumulatedDepreciation}
                trace={{ kind: "accumulatedDepreciation", strategy: "hold", propertyId: id, year }}
              />
            </Metric>
          </div>
          <div className="bg-amber-soft col-span-3 flex items-center justify-between gap-3 rounded-lg px-3 py-2.5">
            <div className="min-w-0">
              <dt className="text-amber text-[11px] font-medium">Est. recapture exposure</dt>
              <dd className="text-ink-2 mt-0.5 text-[11px]">
                ≈ <Money cents={recaptureTax} className="font-medium" /> tax at 25%
              </dd>
            </div>
            <dd className="display text-amber shrink-0 text-xl">
              <Money
                cents={row.recaptureExposure}
                trace={{ kind: "recaptureExposure", strategy: "hold", propertyId: id, year }}
              />
            </dd>
          </div>
        </dl>

        <div className="mt-5">
          <div className="text-ink-3 mb-1 flex items-baseline justify-between text-[11px]">
            <span>Equity over time</span>
            <span className="num">
              {timeline.rows[0]?.year}–{timeline.rows[timeline.rows.length - 1]?.year}
            </span>
          </div>
          <EquitySparkline rows={timeline.rows} year={year} name={timeline.name} />
        </div>

        <footer className="mt-4 flex flex-1 flex-wrap items-end gap-1.5">
          {loans.map((l) => (
            <span
              key={l.type}
              className="border-line text-ink-2 inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium"
            >
              {l.label}
              {l.count > 1 && <span className="num text-ink-3">×{l.count}</span>}
            </span>
          ))}
          {loans.length === 0 && <span className="text-ink-3 text-[11px]">No loans</span>}
          {badges.map((b) => (
            <Chip key={b.key} tone={b.tone === "amber" ? "amber" : "neutral"}>
              {b.label}
            </Chip>
          ))}
        </footer>
      </article>
    </motion.li>
  );
}
