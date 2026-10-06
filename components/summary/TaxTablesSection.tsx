"use client";

import { useState } from "react";
import { Segmented } from "@/components/ui/primitives";
import { TAX_TABLES } from "@/data/tax";
import type { FilingStatus } from "@/engine/types";
import { cn } from "@/lib/cn";
import { fmtMoney, fmtPercent } from "@/lib/format";

const FILING: { value: FilingStatus; label: string }[] = [
  { value: "single", label: "Single" },
  { value: "mfj", label: "Married filing jointly" },
  { value: "mfs", label: "Married filing separately" },
  { value: "hoh", label: "Head of household" },
];

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="border-line bg-surface-2 rounded-xl border p-4">
      <p className="eyebrow !leading-snug">{label}</p>
      <p className="display num text-ink mt-2.5 text-2xl">{value}</p>
      {note && <p className="text-ink-3 mt-1.5 text-xs leading-relaxed">{note}</p>}
    </div>
  );
}

export function TaxTablesSection({ flash = false }: { flash?: boolean }) {
  const yearKeys = Object.keys(TAX_TABLES)
    .map(Number)
    .sort((a, b) => a - b);
  const [year, setYear] = useState<number>(yearKeys[yearKeys.length - 1] ?? 0);
  const [status, setStatus] = useState<FilingStatus>("mfj");
  const table = TAX_TABLES[year];
  if (!table) return null;

  const brackets = table.ordinaryBrackets[status];
  const ltcg = table.ltcgBreakpoints[status];

  return (
    <section id="tax-tables" className="scroll-mt-28" aria-labelledby="tax-tables-title">
      <div className={cn("assumption-section card-raised p-6 sm:p-9", flash && "is-flash")}>
        <p className="eyebrow">Versioned data</p>
        <h2 id="tax-tables-title" className="display text-ink mt-3 text-2xl sm:text-3xl">
          Versioned tax tables
        </h2>
        <p className="text-ink-2 mt-3 max-w-[62ch] text-base leading-relaxed">
          The engine reads every tax rate from a table for the tax year you pick, never from numbers
          buried in code. These are the tables it uses.
        </p>

        <div className="mt-7 flex flex-wrap items-center gap-x-8 gap-y-4">
          <div className="flex items-center gap-3">
            <span className="text-ink-3 text-xs font-medium">Tax year</span>
            <Segmented
              label="Tax year"
              value={year}
              onChange={setYear}
              options={yearKeys.map((y) => ({ value: y, label: String(y) }))}
            />
          </div>
          <div className="flex min-w-0 items-center gap-3">
            <span className="text-ink-3 text-xs font-medium">Filing status</span>
            <div className="max-w-full overflow-x-auto">
              <Segmented
                label="Filing status"
                value={status}
                onChange={setStatus}
                options={FILING}
              />
            </div>
          </div>
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
          <div>
            <h3 className="text-ink text-sm font-semibold">Ordinary income brackets</h3>
            <div className="border-line mt-3 overflow-hidden rounded-xl border">
              <table className="w-full border-collapse text-sm">
                <caption className="sr-only">
                  {year} ordinary income brackets, {FILING.find((f) => f.value === status)?.label}
                </caption>
                <thead className="bg-surface-2 text-left">
                  <tr>
                    <th scope="col" className="eyebrow px-4 py-3 font-semibold">
                      Rate
                    </th>
                    <th scope="col" className="eyebrow px-4 py-3 text-right font-semibold">
                      From
                    </th>
                    <th scope="col" className="eyebrow px-4 py-3 text-right font-semibold">
                      To
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {brackets.map((b, i) => {
                    const from = i === 0 ? 0 : (brackets[i - 1]?.upTo ?? 0);
                    return (
                      <tr key={`${b.rate}-${from}`} className="border-line border-t">
                        <th
                          scope="row"
                          className="num text-ink px-4 py-2.5 text-left font-semibold"
                        >
                          {fmtPercent(b.rate, b.rate * 100 === Math.round(b.rate * 100) ? 0 : 1)}
                        </th>
                        <td className="num text-ink-2 px-4 py-2.5 text-right">{fmtMoney(from)}</td>
                        <td className="num text-ink-2 px-4 py-2.5 text-right">
                          {b.upTo === null ? "and above" : fmtMoney(b.upTo)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid content-start gap-3 sm:grid-cols-2">
            <Stat
              label="Standard deduction"
              value={fmtMoney(table.standardDeduction[status])}
              note="Subtracted from ordinary income."
            />
            <Stat
              label="Unrecaptured §1250 cap"
              value={fmtPercent(table.unrecaptured1250MaxRate, 0)}
              note="Maximum rate on depreciation recapture."
            />
            <div className="border-line bg-surface-2 rounded-xl border p-4 sm:col-span-2">
              <p className="eyebrow">Long-term capital gains rates</p>
              <dl className="mt-3 space-y-2 text-sm">
                <div className="flex items-baseline justify-between gap-4">
                  <dt className="text-ink-2">
                    {fmtPercent(table.ltcgRates.zero, 0)} up to taxable income of
                  </dt>
                  <dd className="num text-ink font-medium">{fmtMoney(ltcg.zeroRateTop)}</dd>
                </div>
                <div className="flex items-baseline justify-between gap-4">
                  <dt className="text-ink-2">{fmtPercent(table.ltcgRates.fifteen, 0)} up to</dt>
                  <dd className="num text-ink font-medium">{fmtMoney(ltcg.fifteenRateTop)}</dd>
                </div>
                <div className="flex items-baseline justify-between gap-4">
                  <dt className="text-ink-2">{fmtPercent(table.ltcgRates.twenty, 0)} above</dt>
                  <dd className="num text-ink font-medium">{fmtMoney(ltcg.fifteenRateTop)}</dd>
                </div>
              </dl>
            </div>
            <div className="border-line bg-surface-2 rounded-xl border p-4 sm:col-span-2">
              <p className="eyebrow">Net investment income tax</p>
              <p className="text-ink-2 mt-3 text-sm leading-relaxed">
                <span className="num text-ink font-medium">{fmtPercent(table.niit.rate, 1)}</span>{" "}
                on investment income when modified adjusted gross income exceeds{" "}
                <span className="num text-ink font-medium">
                  {fmtMoney(table.niit.magiThreshold[status])}
                </span>
                .
              </p>
            </div>
          </div>
        </div>

        <div className="border-line text-ink-2 mt-7 grid gap-4 border-t pt-6 text-sm leading-relaxed sm:grid-cols-2">
          <p>
            <span className="eyebrow mr-2">Source</span>
            {table.source}
          </p>
          <p>
            Tables live in /data/tax: add a file per year. Values should be verified against IRS
            publications before relying on them.
          </p>
        </div>
      </div>
    </section>
  );
}
