"use client";

import type { ReactNode } from "react";
import { TAX_TABLES } from "@/data/tax";
import type { FilingStatus, HorizonYears, Household } from "@/engine/types";
import {
  FieldGrid,
  MoneyField,
  NumberField,
  PercentField,
  SegmentedField,
  SelectField,
  TextField,
} from "./fields";
import { FILING_LABEL } from "./model";
import type { Section } from "./model";

/** A numbered section of the workbench: a landmark with a calm heading. */
export function StepSection({
  id,
  step,
  eyebrow,
  title,
  lede,
  action,
  children,
}: {
  id: Section;
  step: number;
  eyebrow: string;
  title: string;
  lede: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section id={`build-${id}`} aria-labelledby={`build-${id}-title`} className="scroll-mt-28">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="eyebrow mb-2.5 flex items-center gap-2">
            <span className="num bg-accent-soft text-accent grid size-5 place-items-center rounded-full text-[0.65rem]">
              {step}
            </span>
            {eyebrow}
          </p>
          <h2
            id={`build-${id}-title`}
            className="display text-ink text-2xl leading-tight sm:text-3xl"
          >
            {title}
          </h2>
          <p className="text-ink-2 mt-1.5 max-w-2xl text-sm leading-relaxed">{lede}</p>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

const FILING_OPTIONS = (Object.keys(FILING_LABEL) as FilingStatus[]).map((k) => ({
  value: k as string,
  label: FILING_LABEL[k],
}));

const HORIZONS: { value: HorizonYears; label: string }[] = [
  { value: 5, label: "5" },
  { value: 10, label: "10" },
  { value: 20, label: "20" },
  { value: 30, label: "30" },
];

interface SectionProps {
  draft: Household;
  onChange: (next: Household) => void;
}

export function InvestorFields({ draft, onChange }: SectionProps) {
  const inv = draft.investor;
  const setInv = (patch: Partial<Household["investor"]>): void =>
    onChange({ ...draft, investor: { ...inv, ...patch } });
  return (
    <div className="card-raised p-5 sm:p-7">
      <FieldGrid cols={3}>
        <TextField
          label="Household name"
          hint="Shown in the header and on the summary."
          path="name"
          value={draft.name}
          onChange={(name) => onChange({ ...draft, name })}
          placeholder="The Alvarez Household"
          className="md:col-span-3"
        />
        <SelectField
          label="Filing status"
          hint="Sets the tax brackets and thresholds."
          value={inv.filingStatus}
          onChange={(v) => setInv({ filingStatus: v as FilingStatus })}
          options={FILING_OPTIONS}
        />
        <MoneyField
          label="Other taxable income"
          hint="Wages, pension and the like, outside this portfolio. In today's dollars."
          path="investor.otherTaxableIncome"
          value={inv.otherTaxableIncome}
          onChange={(otherTaxableIncome) => setInv({ otherTaxableIncome })}
          suffix="/yr"
        />
        <PercentField
          label="State income tax rate"
          hint="Flat rate on rental income and gains. Use 0% if there is no state tax."
          path="investor.stateTaxRate"
          value={inv.stateTaxRate}
          onChange={(stateTaxRate) => setInv({ stateTaxRate })}
        />
        <SegmentedField<HorizonYears>
          label="Planning horizon (years)"
          hint="How far the simulation looks ahead."
          value={inv.horizonYears}
          onChange={(horizonYears) => setInv({ horizonYears })}
          options={HORIZONS}
        />
        <PercentField
          label="Discount rate"
          hint="Used to express future net worth in today's dollars."
          path="investor.discountRate"
          value={inv.discountRate}
          onChange={(discountRate) => setInv({ discountRate })}
        />
        <PercentField
          label="Reinvestment return"
          hint="Treated as an after-tax return on cash and on reinvested sale proceeds."
          path="investor.reinvestmentReturnRate"
          value={inv.reinvestmentReturnRate}
          onChange={(reinvestmentReturnRate) => setInv({ reinvestmentReturnRate })}
          suffix="% / yr"
        />
      </FieldGrid>
    </div>
  );
}

const TAX_YEAR_OPTIONS = Object.keys(TAX_TABLES)
  .map(Number)
  .sort((a, b) => a - b)
  .map((y) => ({ value: String(y), label: `${y} tax tables` }));

export function MarketFields({ draft, onChange }: SectionProps) {
  const mk = draft.market;
  const setMk = (patch: Partial<Household["market"]>): void =>
    onChange({ ...draft, market: { ...mk, ...patch } });
  return (
    <div className="card-raised p-5 sm:p-7">
      <FieldGrid cols={3}>
        <NumberField
          label="As-of year"
          hint="Today's balance sheet is struck at Dec 31 of this year; projections start the next."
          path="market.asOfYear"
          value={mk.asOfYear}
          onChange={(asOfYear) => setMk({ asOfYear })}
        />
        <SelectField
          label="Tax table"
          hint="Brackets and deductions. Later years are inflated from this table."
          value={String(mk.taxTableYear)}
          onChange={(v) => setMk({ taxTableYear: Number(v) })}
          options={TAX_YEAR_OPTIONS}
        />
        <PercentField
          label="Inflation"
          hint="Moves tax brackets, deductions and other income forward."
          path="market.inflationRate"
          value={mk.inflationRate}
          onChange={(inflationRate) => setMk({ inflationRate })}
          suffix="% / yr"
        />
        <PercentField
          label="ARM index rate"
          hint="Benchmark such as SOFR, as of the as-of year. Only matters for adjustable loans."
          path="market.armIndexRate"
          value={mk.armIndexRate}
          onChange={(armIndexRate) => setMk({ armIndexRate })}
        />
        <PercentField
          label="ARM index drift"
          hint="Yearly change in the index after that. Negative means falling rates."
          path="market.armIndexAnnualChange"
          value={mk.armIndexAnnualChange}
          onChange={(armIndexAnnualChange) => setMk({ armIndexAnnualChange })}
          suffix="% / yr"
        />
      </FieldGrid>
    </div>
  );
}
