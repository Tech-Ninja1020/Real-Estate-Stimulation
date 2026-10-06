"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Money } from "@/components/math/Fig";
import type { PropertyYearRow, Year } from "@/engine/types";

function Cell({
  label,
  caption,
  index,
  tone,
  span,
  children,
}: {
  label: string;
  caption: string;
  index: number;
  tone?: "amber";
  span: string;
  children: React.ReactNode;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial={{ opacity: 0, y: reduce ? 0 : 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: reduce ? 0 : 0.5,
        delay: reduce ? 0 : index * 0.05,
        ease: [0.22, 1, 0.36, 1],
      }}
      className={`min-w-0 px-5 py-5 ${span} ${tone === "amber" ? "bg-[color-mix(in_srgb,var(--amber-fill)_16%,var(--surface))]" : "bg-surface"}`}
    >
      <p className={tone === "amber" ? "eyebrow text-amber" : "eyebrow"}>{label}</p>
      <p
        className={
          tone === "amber"
            ? "display text-amber mt-3 text-[1.7rem] leading-none"
            : "display text-ink mt-3 text-[1.7rem] leading-none"
        }
      >
        {children}
      </p>
      <p className="text-ink-3 mt-2 text-xs leading-snug">{caption}</p>
    </motion.div>
  );
}

/** Value, equity, basis, depreciation and recapture exposure for one property at the scrubber year. */
export function PropertyKpis({ id, row, year }: { id: string; row: PropertyYearRow; year: Year }) {
  return (
    <section
      aria-label={`${id} at the end of ${year}`}
      className="card-raised bg-line grid grid-cols-2 gap-px overflow-hidden md:grid-cols-6 xl:grid-cols-5"
    >
      <Cell
        span="md:col-span-2 xl:col-span-1"
        index={0}
        label="Market value"
        caption="Estimated, at year end"
      >
        <Money
          cents={row.marketValue}
          trace={{ kind: "propertyValue", strategy: "hold", propertyId: id, year }}
        />
      </Cell>
      <Cell
        span="md:col-span-2 xl:col-span-1"
        index={1}
        label="Equity"
        caption="Value less loan balance"
      >
        <Money cents={row.equity} />
      </Cell>
      <Cell
        span="col-span-2 md:col-span-2 xl:col-span-1"
        index={2}
        label="Adjusted basis"
        caption="Land, building and improvements, less depreciation"
      >
        <Money
          cents={row.adjustedBasis}
          trace={{ kind: "adjustedBasis", strategy: "hold", propertyId: id, year }}
        />
      </Cell>
      <Cell
        span="md:col-span-3 xl:col-span-1"
        index={3}
        label="Depreciation taken"
        caption="Cumulative deductions to date"
      >
        <Money
          cents={row.accumulatedDepreciation}
          trace={{ kind: "accumulatedDepreciation", strategy: "hold", propertyId: id, year }}
        />
      </Cell>
      <Cell
        span="md:col-span-3 xl:col-span-1"
        index={4}
        tone="amber"
        label="Recapture exposure"
        caption="Taxed up to 25% if sold at year end"
      >
        <Money
          cents={row.recaptureExposure}
          trace={{ kind: "recaptureExposure", strategy: "hold", propertyId: id, year }}
        />
      </Cell>
    </section>
  );
}
