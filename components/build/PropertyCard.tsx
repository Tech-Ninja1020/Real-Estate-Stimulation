"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import type { Cents } from "@/engine/money";
import type { CapitalImprovement, LoanType, Property } from "@/engine/types";
import { Button, Chip } from "@/components/ui/primitives";
import { fmtMoney } from "@/lib/format";
import { cn } from "@/lib/cn";
import {
  FieldGrid,
  MonthField,
  MoneyField,
  NumberField,
  PercentField,
  SegmentedField,
  TextField,
  useIssuesAt,
} from "./fields";
import { LoanEditor } from "./LoanEditor";
import { LOAN_TYPES, LOAN_TYPE_LABEL, convertOperating, loanChipText } from "./model";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  CopyIcon,
  ErrorIcon,
  HomeIcon,
  IconButton,
  PlusIcon,
  SubHeading,
  TrashIcon,
  WarnIcon,
} from "./ui";

export interface PropertyCardProps {
  property: Property;
  index: number;
  count: number;
  open: boolean;
  onToggle: () => void;
  onChange: (next: Property) => void;
  onDuplicate: () => void;
  onRemove: () => void;
  onMove: (delta: -1 | 1) => void;
  onAddLoan: (type: LoanType) => void;
  onAddImprovement: () => void;
  /** Estimated equity at the as-of date, or null while the draft has errors. */
  equity: Cents | null;
  errorCount: number;
  warningCount: number;
}

export function PropertyCard({
  property: p,
  index,
  count,
  open,
  onToggle,
  onChange,
  onDuplicate,
  onRemove,
  onMove,
  onAddLoan,
  onAddImprovement,
  equity,
  errorCount,
  warningCount,
}: PropertyCardProps) {
  const reduce = useReducedMotion();
  const base = `properties[${index}]`;
  const bodyId = `property-body-${index}-${p.id}`;
  const titleId = `property-title-${index}-${p.id}`;
  const name = p.name.trim() || "Untitled property";
  const set = (patch: Partial<Property>): void => onChange({ ...p, ...patch });

  return (
    <article
      aria-labelledby={titleId}
      data-property-index={index}
      className={cn(
        "card-raised overflow-hidden transition-shadow",
        errorCount > 0 && "border-[color-mix(in_srgb,var(--danger)_45%,var(--line))]",
      )}
    >
      <div className="flex items-center gap-1 pr-3 sm:pr-4">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={onToggle}
          className="flex min-w-0 flex-1 items-center gap-4 rounded-l-[inherit] p-4 text-left sm:p-5"
        >
          <span
            aria-hidden="true"
            className="border-line bg-surface text-accent shadow-soft grid size-10 shrink-0 place-items-center rounded-xl border"
          >
            <HomeIcon size={18} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
              <span id={titleId} className="display text-ink truncate text-lg leading-tight">
                {name}
              </span>
              {p.location.trim() && (
                <span className="text-ink-3 truncate text-xs">{p.location.trim()}</span>
              )}
            </span>
            <span className="mt-2 flex flex-wrap items-center gap-1.5">
              {p.loans.length === 0 ? (
                <Chip>No debt</Chip>
              ) : (
                p.loans.map((l) => <Chip key={l.id}>{loanChipText(l)}</Chip>)
              )}
              {errorCount > 0 && (
                <Chip tone="danger">
                  <ErrorIcon size={12} />
                  {errorCount} {errorCount === 1 ? "error" : "errors"}
                </Chip>
              )}
              {errorCount === 0 && warningCount > 0 && (
                <Chip tone="amber">
                  <WarnIcon size={12} />
                  {warningCount} {warningCount === 1 ? "warning" : "warnings"}
                </Chip>
              )}
            </span>
          </span>
          <span className="hidden shrink-0 gap-7 text-right sm:flex">
            <span>
              <span className="eyebrow block">Value</span>
              <span className="num text-ink mt-1.5 block text-sm font-medium">
                {fmtMoney(p.currentValue)}
              </span>
            </span>
            <span title="Estimated equity at the as-of date: value less remaining loan balances">
              <span className="eyebrow block">Equity</span>
              <span className="num text-ink mt-1.5 block text-sm font-medium">
                {equity === null ? "—" : fmtMoney(equity)}
              </span>
            </span>
          </span>
          <ChevronDown
            size={18}
            className={cn("text-ink-3 shrink-0 transition-transform", open && "rotate-180")}
          />
        </button>
        <div className="flex shrink-0 items-center">
          <IconButton label={`Move ${name} up`} disabled={index === 0} onClick={() => onMove(-1)}>
            <ArrowUp />
          </IconButton>
          <IconButton
            label={`Move ${name} down`}
            disabled={index === count - 1}
            onClick={() => onMove(1)}
          >
            <ArrowDown />
          </IconButton>
          <IconButton label={`Duplicate ${name}`} onClick={onDuplicate}>
            <CopyIcon />
          </IconButton>
          <IconButton label={`Remove ${name}`} tone="danger" onClick={onRemove}>
            <TrashIcon />
          </IconButton>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id={bodyId}
            key="body"
            role="region"
            aria-labelledby={titleId}
            initial={reduce ? false : { height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
            transition={{ duration: reduce ? 0 : 0.28, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="border-line space-y-9 border-t p-5 sm:p-7">
              <section aria-label="Acquisition and exit">
                <SubHeading title="Acquisition and exit" />
                <FieldGrid cols={2}>
                  <TextField
                    label="Property name"
                    path={`${base}.name`}
                    value={p.name}
                    onChange={(name) => set({ name })}
                    placeholder="Maple Court Fourplex"
                  />
                  <TextField
                    label="Location"
                    hint="Optional. City and state are enough."
                    path={`${base}.location`}
                    value={p.location}
                    onChange={(location) => set({ location })}
                    placeholder="Columbus, OH"
                  />
                </FieldGrid>
                <FieldGrid cols={3} className="mt-5">
                  <MonthField
                    label="Purchase month"
                    path={`${base}.purchaseMonth`}
                    value={p.purchaseMonth}
                    onChange={(purchaseMonth) => set({ purchaseMonth })}
                  />
                  <NumberField
                    label="Purchase year"
                    path={`${base}.purchaseYear`}
                    value={p.purchaseYear}
                    onChange={(purchaseYear) => set({ purchaseYear })}
                  />
                  <MoneyField
                    label="Purchase price"
                    path={`${base}.purchasePrice`}
                    value={p.purchasePrice}
                    onChange={(purchasePrice) => set({ purchasePrice })}
                  />
                  <MoneyField
                    label="Capitalized closing costs"
                    hint="Added to your tax basis."
                    path={`${base}.closingCosts`}
                    value={p.closingCosts}
                    onChange={(closingCosts) => set({ closingCosts })}
                  />
                  <PercentField
                    label="Land share of price"
                    hint="Land is never depreciated."
                    path={`${base}.landValuePct`}
                    value={p.landValuePct}
                    onChange={(landValuePct) => set({ landValuePct })}
                  />
                  <PercentField
                    label="Selling costs"
                    hint="Agent fees and closing costs on a sale."
                    path={`${base}.sellingCostRate`}
                    value={p.sellingCostRate}
                    onChange={(sellingCostRate) => set({ sellingCostRate })}
                  />
                </FieldGrid>
              </section>

              <section aria-label="Value and income">
                <SubHeading title="Value and income" />
                <FieldGrid cols={3}>
                  <MoneyField
                    label="Current market value"
                    hint="At the as-of date."
                    path={`${base}.currentValue`}
                    value={p.currentValue}
                    onChange={(currentValue) => set({ currentValue })}
                  />
                  <MoneyField
                    label="Annual rent"
                    hint="Gross scheduled rent per year."
                    path={`${base}.annualRent`}
                    value={p.annualRent}
                    onChange={(annualRent) => set({ annualRent })}
                    suffix="/yr"
                  />
                  <PercentField
                    label="Vacancy"
                    path={`${base}.vacancyRate`}
                    value={p.vacancyRate}
                    onChange={(vacancyRate) => set({ vacancyRate })}
                  />
                  <PercentField
                    label="Appreciation"
                    hint="Expected yearly change in value."
                    path={`${base}.appreciationRate`}
                    value={p.appreciationRate}
                    onChange={(appreciationRate) => set({ appreciationRate })}
                    suffix="% / yr"
                  />
                  <PercentField
                    label="Rent growth"
                    path={`${base}.rentGrowthRate`}
                    value={p.rentGrowthRate}
                    onChange={(rentGrowthRate) => set({ rentGrowthRate })}
                    suffix="% / yr"
                  />
                  <PercentField
                    label="Expense growth"
                    hint="Applies to tax, insurance and fixed costs."
                    path={`${base}.expenseGrowthRate`}
                    value={p.expenseGrowthRate}
                    onChange={(expenseGrowthRate) => set({ expenseGrowthRate })}
                    suffix="% / yr"
                  />
                </FieldGrid>
              </section>

              <section aria-label="Operating costs">
                <SubHeading title="Operating costs" />
                <FieldGrid cols={4}>
                  <SegmentedField
                    label="Operating expenses are"
                    value={p.operating.kind}
                    onChange={(kind) => set({ operating: convertOperating(p, kind) })}
                    options={[
                      { value: "percentOfRent", label: "% of rent" },
                      { value: "fixed", label: "Fixed $ / yr" },
                    ]}
                  />
                  {p.operating.kind === "percentOfRent" ? (
                    <PercentField
                      label="Operating expenses"
                      hint="Management, repairs, utilities."
                      path={`${base}.operating`}
                      value={p.operating.rate}
                      onChange={(rate) => set({ operating: { kind: "percentOfRent", rate } })}
                      suffix="% of rent"
                    />
                  ) : (
                    <MoneyField
                      label="Operating expenses"
                      hint="Management, repairs, utilities."
                      path={`${base}.operating`}
                      value={p.operating.annual}
                      onChange={(annual) => set({ operating: { kind: "fixed", annual } })}
                      suffix="/yr"
                    />
                  )}
                  <MoneyField
                    label="Property tax"
                    path={`${base}.propertyTax`}
                    value={p.propertyTax}
                    onChange={(propertyTax) => set({ propertyTax })}
                    suffix="/yr"
                  />
                  <MoneyField
                    label="Insurance"
                    path={`${base}.insurance`}
                    value={p.insurance}
                    onChange={(insurance) => set({ insurance })}
                    suffix="/yr"
                  />
                </FieldGrid>
              </section>

              <section aria-label="Capital improvements">
                <SubHeading
                  title="Capital improvements"
                  hint="Money spent on the building after purchase. It adds to basis and is depreciated separately."
                  action={
                    <Button size="sm" onClick={onAddImprovement}>
                      <PlusIcon size={13} />
                      Add improvement
                    </Button>
                  }
                />
                {p.improvements.length === 0 ? (
                  <p className="border-line-strong text-ink-3 rounded-xl border border-dashed px-4 py-3.5 text-sm">
                    No improvements recorded.
                  </p>
                ) : (
                  <ul className="space-y-3">
                    {p.improvements.map((imp, j) => (
                      <li key={imp.id}>
                        <ImprovementRow
                          imp={imp}
                          index={j}
                          basePath={`${base}.improvements[${j}]`}
                          onChange={(next) =>
                            set({
                              improvements: p.improvements.map((x, k) => (k === j ? next : x)),
                            })
                          }
                          onRemove={() =>
                            set({ improvements: p.improvements.filter((_, k) => k !== j) })
                          }
                        />
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section aria-label="Loans">
                <SubHeading
                  title="Loans"
                  hint="Every lien against the property, including ones already repaid."
                />
                <LoansNotice path={`${base}.loans`} />
                {p.loans.length === 0 ? (
                  <p className="border-line-strong text-ink-3 mb-4 rounded-xl border border-dashed px-4 py-3.5 text-sm">
                    Unlevered: no loans on this property.
                  </p>
                ) : (
                  <ul className="mb-4 space-y-4">
                    {p.loans.map((loan, j) => (
                      <li key={loan.id}>
                        <LoanEditor
                          loan={loan}
                          index={j}
                          basePath={`${base}.loans[${j}]`}
                          onChange={(next) =>
                            set({ loans: p.loans.map((x, k) => (k === j ? next : x)) })
                          }
                          onRemove={() => set({ loans: p.loans.filter((_, k) => k !== j) })}
                        />
                      </li>
                    ))}
                  </ul>
                )}
                <div
                  role="group"
                  aria-label="Add a loan"
                  className="flex flex-wrap items-center gap-2"
                >
                  <span className="text-ink-3 mr-1 text-xs">Add a loan</span>
                  {LOAN_TYPES.map((t) => (
                    <Button key={t} size="sm" onClick={() => onAddLoan(t)}>
                      <PlusIcon size={13} />
                      {LOAN_TYPE_LABEL[t]}
                    </Button>
                  ))}
                </div>
              </section>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </article>
  );
}

function LoansNotice({ path }: { path: string }) {
  const issues = useIssuesAt(path);
  if (issues.length === 0) return null;
  return (
    <div className="mb-4 space-y-2">
      {issues.map((i) => (
        <p
          key={i.message}
          className={cn(
            "flex items-start gap-2 rounded-lg px-3.5 py-2.5 text-sm leading-snug",
            i.severity === "error" ? "bg-danger-soft text-danger" : "bg-amber-soft text-amber",
          )}
        >
          {i.severity === "error" ? (
            <ErrorIcon size={15} className="mt-0.5 shrink-0" />
          ) : (
            <WarnIcon size={15} className="mt-0.5 shrink-0" />
          )}
          <span>
            <strong className="font-semibold">
              {i.severity === "error" ? "Error: " : "Warning: "}
            </strong>
            {i.message}
          </span>
        </p>
      ))}
    </div>
  );
}

function ImprovementRow({
  imp,
  index,
  basePath,
  onChange,
  onRemove,
}: {
  imp: CapitalImprovement;
  index: number;
  basePath: string;
  onChange: (next: CapitalImprovement) => void;
  onRemove: () => void;
}) {
  return (
    <div
      role="group"
      aria-label={`Improvement ${index + 1}`}
      className="border-line bg-surface-2/40 rounded-xl border p-4 sm:p-5"
    >
      <div className="flex items-start gap-3">
        <TextField
          label="Description"
          path={`${basePath}.description`}
          value={imp.description}
          onChange={(description) => onChange({ ...imp, description })}
          placeholder="Roof replacement"
          className="flex-1"
        />
        <IconButton
          label={`Remove improvement ${index + 1}`}
          tone="danger"
          onClick={onRemove}
          className="mt-[1.65rem]"
        >
          <TrashIcon />
        </IconButton>
      </div>
      <FieldGrid cols={4} className="mt-4">
        <NumberField
          label="Year"
          path={`${basePath}.year`}
          value={imp.year}
          onChange={(year) => onChange({ ...imp, year })}
        />
        <MonthField
          label="Month"
          path={`${basePath}.month`}
          value={imp.month}
          onChange={(month) => onChange({ ...imp, month })}
        />
        <MoneyField
          label="Amount spent"
          path={`${basePath}.amount`}
          value={imp.amount}
          onChange={(amount) => onChange({ ...imp, amount })}
        />
        <MoneyField
          label="Value added"
          hint="Market value it adds at once."
          path={`${basePath}.valueAdded`}
          value={imp.valueAdded ?? 0}
          onChange={(valueAdded) => onChange({ ...imp, valueAdded })}
        />
      </FieldGrid>
    </div>
  );
}
