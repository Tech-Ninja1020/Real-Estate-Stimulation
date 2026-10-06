"use client";

import type {
  ArmLoan,
  FixedLoan,
  HelocLoan,
  InterestOnlyLoan,
  Loan,
  LoanType,
} from "@/engine/types";
import { usd } from "@/engine/money";
import { Button } from "@/components/ui/primitives";
import {
  FieldGrid,
  MonthField,
  MoneyField,
  NumberField,
  PercentField,
  SegmentedField,
  TextField,
} from "./fields";
import { LOAN_TYPES, LOAN_TYPE_LABEL, convertLoan } from "./model";
import { IconButton, PlusIcon, TrashIcon } from "./ui";

interface LoanEditorProps {
  loan: Loan;
  /** Position within the property, for labels and validation paths. */
  index: number;
  basePath: string;
  onChange: (loan: Loan) => void;
  onRemove: () => void;
}

const TYPE_HINT: Record<LoanType, string> = {
  fixed: "Level payments at one rate for the whole term.",
  interestOnly: "Interest-only first, then it amortizes over the remaining term.",
  arm: "Fixed for a while, then resets yearly to the index plus a margin, within caps.",
  heloc: "A revolving line: interest-only while drawing, then it amortizes.",
};

export function LoanEditor({ loan, index, basePath, onChange, onRemove }: LoanEditorProps) {
  return (
    <div
      role="group"
      aria-label={`Loan ${index + 1}: ${loan.label || LOAN_TYPE_LABEL[loan.type]}`}
      className="border-line bg-surface-2/40 rounded-xl border p-4 sm:p-5"
    >
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <SegmentedField<LoanType>
          label="Loan type"
          hint={TYPE_HINT[loan.type]}
          value={loan.type}
          onChange={(t) => onChange(convertLoan(loan, t))}
          options={LOAN_TYPES.map((t) => ({ value: t, label: LOAN_TYPE_LABEL[t] }))}
        />
        <IconButton
          label={`Remove loan ${index + 1}`}
          tone="danger"
          onClick={onRemove}
          className="-mt-1"
        >
          <TrashIcon />
        </IconButton>
      </div>

      <FieldGrid cols={3}>
        <TextField
          label="Label"
          path={`${basePath}.label`}
          value={loan.label}
          onChange={(label) => onChange({ ...loan, label })}
          placeholder="First mortgage"
          className="sm:col-span-2 lg:col-span-1"
        />
        <MonthField
          label="Start month"
          path={`${basePath}.startMonth`}
          value={loan.startMonth}
          onChange={(startMonth) => onChange({ ...loan, startMonth })}
        />
        <NumberField
          label="Start year"
          path={`${basePath}.startYear`}
          value={loan.startYear}
          onChange={(startYear) => onChange({ ...loan, startYear })}
        />
      </FieldGrid>

      <div className="mt-5">
        {loan.type === "fixed" && (
          <FixedFields loan={loan} basePath={basePath} onChange={onChange} />
        )}
        {loan.type === "interestOnly" && (
          <InterestOnlyFields loan={loan} basePath={basePath} onChange={onChange} />
        )}
        {loan.type === "arm" && <ArmFields loan={loan} basePath={basePath} onChange={onChange} />}
        {loan.type === "heloc" && (
          <HelocFields loan={loan} basePath={basePath} onChange={onChange} />
        )}
      </div>
    </div>
  );
}

interface FieldsProps<L extends Loan> {
  loan: L;
  basePath: string;
  onChange: (loan: Loan) => void;
}

function FixedFields({ loan, basePath, onChange }: FieldsProps<FixedLoan>) {
  return (
    <FieldGrid cols={3}>
      <MoneyField
        label="Original principal"
        path={`${basePath}.principal`}
        value={loan.principal}
        onChange={(principal) => onChange({ ...loan, principal })}
      />
      <PercentField
        label="Interest rate"
        path={`${basePath}.rate`}
        value={loan.rate}
        onChange={(rate) => onChange({ ...loan, rate })}
      />
      <NumberField
        label="Term"
        suffix="years"
        path={`${basePath}.termYears`}
        value={loan.termYears}
        onChange={(termYears) => onChange({ ...loan, termYears })}
      />
    </FieldGrid>
  );
}

function InterestOnlyFields({ loan, basePath, onChange }: FieldsProps<InterestOnlyLoan>) {
  return (
    <FieldGrid cols={4}>
      <MoneyField
        label="Original principal"
        path={`${basePath}.principal`}
        value={loan.principal}
        onChange={(principal) => onChange({ ...loan, principal })}
      />
      <PercentField
        label="Interest rate"
        path={`${basePath}.rate`}
        value={loan.rate}
        onChange={(rate) => onChange({ ...loan, rate })}
      />
      <NumberField
        label="Interest-only period"
        suffix="years"
        path={`${basePath}.ioYears`}
        value={loan.ioYears}
        onChange={(ioYears) => onChange({ ...loan, ioYears })}
      />
      <NumberField
        label="Total term"
        suffix="years"
        path={`${basePath}.termYears`}
        value={loan.termYears}
        onChange={(termYears) => onChange({ ...loan, termYears })}
      />
    </FieldGrid>
  );
}

function ArmFields({ loan, basePath, onChange }: FieldsProps<ArmLoan>) {
  return (
    <FieldGrid cols={4}>
      <MoneyField
        label="Original principal"
        path={`${basePath}.principal`}
        value={loan.principal}
        onChange={(principal) => onChange({ ...loan, principal })}
      />
      <PercentField
        label="Initial rate"
        path={`${basePath}.initialRate`}
        value={loan.initialRate}
        onChange={(initialRate) => onChange({ ...loan, initialRate })}
      />
      <NumberField
        label="Fixed period"
        suffix="years"
        path={`${basePath}.fixedYears`}
        value={loan.fixedYears}
        onChange={(fixedYears) => onChange({ ...loan, fixedYears })}
      />
      <NumberField
        label="Total term"
        suffix="years"
        path={`${basePath}.termYears`}
        value={loan.termYears}
        onChange={(termYears) => onChange({ ...loan, termYears })}
      />
      <PercentField
        label="Annual adjustment cap"
        hint="Largest change at each yearly reset."
        path={`${basePath}.adjustmentCap`}
        value={loan.adjustmentCap}
        onChange={(adjustmentCap) => onChange({ ...loan, adjustmentCap })}
      />
      <PercentField
        label="Lifetime cap"
        hint="Largest total rise over the initial rate."
        path={`${basePath}.lifetimeCap`}
        value={loan.lifetimeCap}
        onChange={(lifetimeCap) => onChange({ ...loan, lifetimeCap })}
      />
      <PercentField
        label="Margin"
        hint="Added to the market index at each reset."
        path={`${basePath}.margin`}
        value={loan.margin}
        onChange={(margin) => onChange({ ...loan, margin })}
      />
    </FieldGrid>
  );
}

function HelocFields({ loan, basePath, onChange }: FieldsProps<HelocLoan>) {
  const setDraw = (k: number, patch: Partial<HelocLoan["draws"][number]>): void => {
    onChange({ ...loan, draws: loan.draws.map((d, i) => (i === k ? { ...d, ...patch } : d)) });
  };
  const addDraw = (): void => {
    const last = loan.draws[loan.draws.length - 1];
    onChange({
      ...loan,
      draws: [
        ...loan.draws,
        {
          year: last ? last.year + 1 : loan.startYear + 1,
          month: last ? last.month : loan.startMonth,
          amount: usd(10_000),
        },
      ],
    });
  };
  return (
    <>
      <FieldGrid cols={4}>
        <MoneyField
          label="Credit limit"
          path={`${basePath}.creditLimit`}
          value={loan.creditLimit}
          onChange={(creditLimit) => onChange({ ...loan, creditLimit })}
        />
        <PercentField
          label="Interest rate"
          path={`${basePath}.rate`}
          value={loan.rate}
          onChange={(rate) => onChange({ ...loan, rate })}
        />
        <NumberField
          label="Draw period"
          suffix="years"
          path={`${basePath}.drawPeriodYears`}
          value={loan.drawPeriodYears}
          onChange={(drawPeriodYears) => onChange({ ...loan, drawPeriodYears })}
        />
        <NumberField
          label="Repayment period"
          suffix="years"
          path={`${basePath}.repaymentYears`}
          value={loan.repaymentYears}
          onChange={(repaymentYears) => onChange({ ...loan, repaymentYears })}
        />
        <MoneyField
          label="Drawn at opening"
          path={`${basePath}.initialDraw`}
          value={loan.initialDraw}
          onChange={(initialDraw) => onChange({ ...loan, initialDraw })}
        />
      </FieldGrid>

      <div className="border-line mt-6 border-t pt-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h5 className="text-ink text-[13px] font-medium">Additional draws</h5>
            <p className="text-ink-3 mt-0.5 text-xs">
              Later withdrawals against the line. Interest accrues from the month of each draw.
            </p>
          </div>
          <Button size="sm" onClick={addDraw}>
            <PlusIcon size={13} />
            Add draw
          </Button>
        </div>
        {loan.draws.length === 0 ? (
          <p className="border-line-strong text-ink-3 rounded-lg border border-dashed px-4 py-3 text-xs">
            No further draws. Only the opening balance is borrowed.
          </p>
        ) : (
          <ul className="space-y-3">
            {loan.draws.map((d, k) => (
              <li key={k} className="flex items-start gap-2 sm:gap-3">
                <div className="grid min-w-0 flex-1 grid-cols-2 gap-3 sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)_minmax(0,1.4fr)]">
                  <NumberField
                    label="Draw year"
                    hideLabel={k > 0}
                    path={`${basePath}.draws[${k}].year`}
                    value={d.year}
                    onChange={(year) => setDraw(k, { year })}
                  />
                  <MonthField
                    label="Draw month"
                    hideLabel={k > 0}
                    path={`${basePath}.draws[${k}].month`}
                    value={d.month}
                    onChange={(month) => setDraw(k, { month })}
                  />
                  <MoneyField
                    label="Draw amount"
                    hideLabel={k > 0}
                    path={`${basePath}.draws[${k}].amount`}
                    value={d.amount}
                    onChange={(amount) => setDraw(k, { amount })}
                    className="col-span-2 sm:col-span-1"
                  />
                </div>
                <div className={k === 0 ? "pt-[1.65rem]" : undefined}>
                  <IconButton
                    label={`Remove draw ${k + 1}`}
                    tone="danger"
                    onClick={() =>
                      onChange({ ...loan, draws: loan.draws.filter((_, i) => i !== k) })
                    }
                  >
                    <TrashIcon />
                  </IconButton>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
