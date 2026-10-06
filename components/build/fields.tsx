"use client";

/**
 * Reusable controlled inputs for the household editor.
 *
 * - `MoneyField` stores integer CENTS and lets the advisor type dollars ("1,250,000", "1.2m").
 * - `PercentField` stores a decimal rate: typing 4.25 stores 0.0425.
 * - `NumberField` stores whole numbers (years, months).
 * Every field shows its label, an optional hint and an inline issue slot (aria-invalid +
 * aria-describedby). Pass `path` (for example "properties[0].loans[1].rate") and the field finds
 * its own validation issue through `FieldIssuesProvider`; pass `error` to override.
 */

import {
  createContext,
  useContext,
  useId,
  useState,
  type ChangeEvent,
  type FocusEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { usd } from "@/engine/money";
import type { Cents, Rate } from "@/engine/money";
import type { ValidationIssue } from "@/engine/validate";
import { Segmented } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";
import { fieldDomId } from "./model";
import { ChevronDown, ErrorIcon, WarnIcon } from "./ui";

// ───────────────────────────── Issues context ─────────────────────────────

const EMPTY: Map<string, ValidationIssue[]> = new Map();
const IssuesContext = createContext<Map<string, ValidationIssue[]>>(EMPTY);

export function FieldIssuesProvider({
  issues,
  children,
}: {
  issues: Map<string, ValidationIssue[]>;
  children: ReactNode;
}) {
  return <IssuesContext.Provider value={issues}>{children}</IssuesContext.Provider>;
}

export function useIssuesAt(path: string | undefined): ValidationIssue[] {
  const map = useContext(IssuesContext);
  return (path ? map.get(path) : undefined) ?? [];
}

// ───────────────────────────── Shared chrome ─────────────────────────────

interface FieldBase {
  label: string;
  hint?: string;
  /** Validation path; the field reads its issue from the surrounding provider. */
  path?: string;
  /** Overrides any issue found through `path`. */
  error?: string;
  disabled?: boolean;
  className?: string;
  /** Visually hide the label (it stays available to assistive tech). */
  hideLabel?: boolean;
}

interface Meta {
  id: string;
  hintId: string;
  messageId: string;
  invalid: boolean;
  describedBy: string | undefined;
  errors: string[];
  warnings: string[];
}

function useFieldMeta(
  path: string | undefined,
  error: string | undefined,
  hint: string | undefined,
): Meta {
  const reactId = useId();
  const id = path ? fieldDomId(path) : `fld${reactId.replace(/[^A-Za-z0-9]/g, "")}`;
  const issues = useIssuesAt(path);
  const errors = error
    ? [error]
    : issues.filter((i) => i.severity === "error").map((i) => i.message);
  const warnings = error
    ? []
    : issues.filter((i) => i.severity === "warning").map((i) => i.message);
  const hasMessage = errors.length + warnings.length > 0;
  const hintId = `${id}-hint`;
  const messageId = `${id}-msg`;
  const describedBy = hasMessage ? messageId : hint ? hintId : undefined;
  return { id, hintId, messageId, invalid: errors.length > 0, describedBy, errors, warnings };
}

function Frame({
  meta,
  label,
  hint,
  hideLabel,
  className,
  children,
  htmlFor = true,
}: {
  meta: Meta;
  label: string;
  hint?: string;
  hideLabel?: boolean;
  className?: string;
  children: ReactNode;
  htmlFor?: boolean;
}) {
  const hasMessage = meta.errors.length + meta.warnings.length > 0;
  return (
    <div className={cn("min-w-0", className)}>
      {htmlFor ? (
        <label
          htmlFor={meta.id}
          className={cn(
            "text-ink-2 mb-1.5 block text-[13px] leading-tight font-medium",
            hideLabel && "sr-only",
          )}
        >
          {label}
        </label>
      ) : (
        <p
          id={`${meta.id}-label`}
          className={cn(
            "text-ink-2 mb-1.5 block text-[13px] leading-tight font-medium",
            hideLabel && "sr-only",
          )}
        >
          {label}
        </p>
      )}
      {children}
      {hasMessage ? (
        <div id={meta.messageId} aria-live="polite" className="mt-1.5 space-y-0.5">
          {meta.errors.map((m) => (
            <p key={m} className="text-danger flex items-start gap-1.5 text-xs leading-snug">
              <ErrorIcon size={13} className="mt-px shrink-0" />
              <span>
                <span className="sr-only">Error: </span>
                {m}
              </span>
            </p>
          ))}
          {meta.warnings.map((m) => (
            <p key={m} className="text-amber flex items-start gap-1.5 text-xs leading-snug">
              <WarnIcon size={13} className="mt-px shrink-0" />
              <span>
                <span className="sr-only">Warning: </span>
                {m}
              </span>
            </p>
          ))}
        </div>
      ) : hint ? (
        <p id={meta.hintId} className="text-ink-3 mt-1.5 text-xs leading-snug">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/** The bordered box around an input: hairline, accent focus ring, optional adornments. */
function Box({
  invalid,
  warn,
  disabled,
  prefix,
  suffix,
  children,
}: {
  invalid: boolean;
  warn?: boolean;
  disabled?: boolean;
  prefix?: string;
  suffix?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "bg-surface-2/60 relative flex h-10 items-center rounded-lg border px-3 transition",
        "focus-within:bg-surface focus-within:shadow-[0_0_0_3px_var(--accent-soft)]",
        invalid
          ? "border-danger focus-within:shadow-[0_0_0_3px_var(--danger-soft)]"
          : warn
            ? "border-amber"
            : "border-line-strong hover:border-ink-3 focus-within:border-accent",
        disabled && "opacity-55",
      )}
    >
      {prefix && (
        <span aria-hidden="true" className="num text-ink-3 mr-1.5 text-sm select-none">
          {prefix}
        </span>
      )}
      {children}
      {suffix && (
        <span
          aria-hidden="true"
          className="text-ink-3 ml-1.5 text-xs whitespace-nowrap select-none"
        >
          {suffix}
        </span>
      )}
    </div>
  );
}

const INPUT_BASE =
  "min-w-0 flex-1 bg-transparent text-[15px] text-ink outline-none placeholder:text-ink-3 disabled:cursor-not-allowed";

// ───────────────────────────── Numeric core ─────────────────────────────

interface NumericProps extends FieldBase {
  value: number;
  onChange: (value: number) => void;
  format: (value: number) => string;
  /** Text shown while the field is being edited. */
  editText: (value: number) => string;
  /** Parse the typed text; null when it is not a usable number. */
  parse: (text: string) => number | null;
  /** Characters that may be typed; everything else is dropped. */
  allowed: RegExp;
  prefix?: string;
  suffix?: string;
  placeholder?: string;
  inputMode: "decimal" | "numeric";
}

function NumericField({
  label,
  hint,
  path,
  error,
  disabled,
  className,
  hideLabel,
  value,
  onChange,
  format,
  editText,
  parse,
  allowed,
  prefix,
  suffix,
  placeholder,
  inputMode,
}: NumericProps) {
  const meta = useFieldMeta(path, error, hint);
  // `text` is null while the field is not being edited; the committed value is then shown formatted.
  const [text, setText] = useState<string | null>(null);

  const commit = (raw: string): void => {
    const next = raw.trim() === "" ? 0 : parse(raw);
    if (next !== null && Number.isFinite(next) && next !== value) onChange(next);
  };

  const handleChange = (e: ChangeEvent<HTMLInputElement>): void => {
    const cleaned = e.target.value.replace(allowed, "");
    setText(cleaned);
    // Commit as soon as the text is a complete number, so validation and the preview stay live.
    if (cleaned.trim() !== "") {
      const next = parse(cleaned);
      if (next !== null && Number.isFinite(next) && next !== value) onChange(next);
    }
  };

  const handleBlur = (e: FocusEvent<HTMLInputElement>): void => {
    commit(e.target.value);
    setText(null);
  };

  const handleKey = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === "Enter") e.currentTarget.blur();
  };

  const shown = text ?? (Number.isFinite(value) ? format(value) : "");
  return (
    <Frame meta={meta} label={label} hint={hint} hideLabel={hideLabel} className={className}>
      <Box
        invalid={meta.invalid}
        warn={meta.warnings.length > 0}
        disabled={disabled}
        prefix={prefix}
        suffix={suffix}
      >
        <input
          id={meta.id}
          type="text"
          inputMode={inputMode}
          autoComplete="off"
          spellCheck={false}
          disabled={disabled}
          placeholder={placeholder}
          value={shown}
          aria-invalid={meta.invalid || undefined}
          aria-describedby={meta.describedBy}
          onFocus={(e) => {
            setText(Number.isFinite(value) ? editText(value) : "");
            const el = e.currentTarget;
            requestAnimationFrame(() => el.select());
          }}
          onChange={handleChange}
          onBlur={handleBlur}
          onKeyDown={handleKey}
          className={cn(INPUT_BASE, "num text-right")}
        />
      </Box>
    </Frame>
  );
}

// ───────────────────────────── Money ─────────────────────────────

const groupFmt = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const centsFmt = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function formatDollars(cents: Cents): string {
  if (cents % 100 === 0) return groupFmt.format(cents / 100);
  return centsFmt.format(cents / 100);
}

/** "1,250,000", "$1.2m", "850k", "12,400.50" to cents; null if it is not a number. */
export function parseDollars(text: string): Cents | null {
  const t = text.replace(/[$,\s]/g, "").toLowerCase();
  const m = /^(\d*\.?\d*)([km]?)$/.exec(t);
  if (!m || m[1] === undefined || m[1] === "" || m[1] === ".") return null;
  const mult = m[2] === "k" ? 1_000 : m[2] === "m" ? 1_000_000 : 1;
  const dollars = Number(m[1]) * mult;
  if (!Number.isFinite(dollars) || dollars > 1e12) return null;
  return usd(dollars);
}

export function MoneyField(
  props: FieldBase & {
    value: Cents;
    onChange: (cents: Cents) => void;
    suffix?: string;
    placeholder?: string;
  },
) {
  const { value, onChange, suffix, placeholder, ...base } = props;
  return (
    <NumericField
      {...base}
      value={value}
      onChange={onChange}
      format={formatDollars}
      editText={formatDollars}
      parse={parseDollars}
      allowed={/[^0-9.,kKmM$\s]/g}
      prefix="$"
      suffix={suffix}
      placeholder={placeholder}
      inputMode="decimal"
    />
  );
}

// ───────────────────────────── Percent ─────────────────────────────

function formatPercent(rate: Rate): string {
  const fixed = (rate * 100).toFixed(3);
  // Keep at least two decimals, drop a trailing zero from the third: 4.250 -> 4.25, 0.125 stays.
  return fixed.endsWith("0") ? fixed.slice(0, -1) : fixed;
}

/** "4.25" to 0.0425; null if it is not a number. */
export function parsePercent(text: string): Rate | null {
  const t = text.replace(/[%\s]/g, "");
  if (!/^-?(\d+\.?\d*|\.\d+)$/.test(t)) return null;
  const n = Number(t);
  if (!Number.isFinite(n)) return null;
  // Round to three decimals of a percent so 4.25 becomes exactly 0.0425.
  return Math.round(n * 1000) / 100_000;
}

export function PercentField(
  props: FieldBase & {
    value: Rate;
    onChange: (rate: Rate) => void;
    placeholder?: string;
    /** Replaces the default "%" adornment, for example "% / yr". */
    suffix?: string;
  },
) {
  const { value, onChange, placeholder, suffix = "%", ...base } = props;
  return (
    <NumericField
      {...base}
      value={value}
      onChange={onChange}
      format={formatPercent}
      editText={formatPercent}
      parse={parsePercent}
      allowed={/[^0-9.\-%\s]/g}
      suffix={suffix}
      placeholder={placeholder}
      inputMode="decimal"
    />
  );
}

// ───────────────────────────── Whole numbers ─────────────────────────────

export function NumberField(
  props: FieldBase & {
    value: number;
    onChange: (n: number) => void;
    suffix?: string;
    placeholder?: string;
  },
) {
  const { value, onChange, suffix, placeholder, ...base } = props;
  return (
    <NumericField
      {...base}
      value={value}
      onChange={onChange}
      format={(n) => String(n)}
      editText={(n) => String(n)}
      parse={(t) => (/^\d+$/.test(t.trim()) ? Number(t.trim()) : null)}
      allowed={/[^0-9]/g}
      suffix={suffix}
      placeholder={placeholder}
      inputMode="numeric"
    />
  );
}

// ───────────────────────────── Text & select ─────────────────────────────

export function TextField({
  label,
  hint,
  path,
  error,
  disabled,
  className,
  hideLabel,
  value,
  onChange,
  placeholder,
  maxLength = 80,
}: FieldBase & {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  maxLength?: number;
}) {
  const meta = useFieldMeta(path, error, hint);
  return (
    <Frame meta={meta} label={label} hint={hint} hideLabel={hideLabel} className={className}>
      <Box invalid={meta.invalid} warn={meta.warnings.length > 0} disabled={disabled}>
        <input
          id={meta.id}
          type="text"
          autoComplete="off"
          maxLength={maxLength}
          disabled={disabled}
          placeholder={placeholder}
          value={value}
          aria-invalid={meta.invalid || undefined}
          aria-describedby={meta.describedBy}
          onChange={(e) => onChange(e.target.value)}
          className={cn(INPUT_BASE, "text-left")}
        />
      </Box>
    </Frame>
  );
}

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export function SelectField({
  label,
  hint,
  path,
  error,
  disabled,
  className,
  hideLabel,
  value,
  onChange,
  options,
  placeholder,
}: FieldBase & {
  value: string;
  onChange: (v: string) => void;
  options: readonly SelectOption[];
  /** Shown as a disabled first option when `value` is "". */
  placeholder?: string;
}) {
  const meta = useFieldMeta(path, error, hint);
  return (
    <Frame meta={meta} label={label} hint={hint} hideLabel={hideLabel} className={className}>
      <Box invalid={meta.invalid} warn={meta.warnings.length > 0} disabled={disabled}>
        <select
          id={meta.id}
          disabled={disabled}
          value={value}
          aria-invalid={meta.invalid || undefined}
          aria-describedby={meta.describedBy}
          onChange={(e) => onChange(e.target.value)}
          className={cn(INPUT_BASE, "cursor-pointer appearance-none pr-6 text-left")}
        >
          {placeholder !== undefined && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {options.map((o) => (
            <option key={o.value} value={o.value} disabled={o.disabled}>
              {o.label}
            </option>
          ))}
        </select>
        <ChevronDown size={14} className="text-ink-3 pointer-events-none absolute right-3" />
      </Box>
    </Frame>
  );
}

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
] as const;

const MONTH_OPTIONS: SelectOption[] = MONTHS.map((m, i) => ({ value: String(i + 1), label: m }));

/** A calendar-month picker that stores 1 to 12. */
export function MonthField(
  props: FieldBase & { value: number; onChange: (month: number) => void },
) {
  const { value, onChange, ...base } = props;
  const known = Number.isInteger(value) && value >= 1 && value <= 12;
  const options = known
    ? MONTH_OPTIONS
    : [{ value: String(value), label: `Invalid (${value})` }, ...MONTH_OPTIONS];
  return (
    <SelectField
      {...base}
      value={String(value)}
      onChange={(v) => onChange(Number(v))}
      options={options}
    />
  );
}

// ───────────────────────────── Segmented ─────────────────────────────

export function SegmentedField<T extends string | number>({
  label,
  hint,
  path,
  error,
  className,
  value,
  onChange,
  options,
}: FieldBase & {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  const meta = useFieldMeta(path, error, hint);
  return (
    <Frame meta={meta} label={label} hint={hint} className={className} htmlFor={false}>
      <div id={meta.id} aria-describedby={meta.describedBy}>
        <Segmented label={label} value={value} onChange={onChange} options={options} />
      </div>
    </Frame>
  );
}

/** A responsive grid of fields. */
export function FieldGrid({
  cols = 2,
  className,
  children,
}: {
  cols?: 2 | 3 | 4;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-1 gap-x-5 gap-y-5 sm:grid-cols-2",
        cols === 3 && "md:grid-cols-3",
        cols === 4 && "lg:grid-cols-4",
        className,
      )}
    >
      {children}
    </div>
  );
}
