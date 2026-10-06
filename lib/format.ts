import type { Cents, Rate } from "@/engine/types";

const whole = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

/** "$1,234,567" */
export function fmtMoney(cents: Cents, opts: { exact?: boolean } = {}): string {
  const negative = cents < 0;
  const abs = Math.abs(cents);
  const body = opts.exact
    ? `$${new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(abs / 100)}`
    : `$${whole.format(Math.round(abs / 100))}`;
  return negative ? `−${body}` : body;
}

/** "$1.24M", "$850K", "$12,400": for tight spaces and axes. */
export function fmtCompact(cents: Cents): string {
  const dollars = Math.abs(cents) / 100;
  const sign = cents < 0 ? "−" : "";
  if (dollars >= 1_000_000) {
    const m = dollars / 1_000_000;
    return `${sign}$${m >= 100 ? m.toFixed(0) : m >= 10 ? m.toFixed(1) : m.toFixed(2)}M`;
  }
  if (dollars >= 10_000) return `${sign}$${Math.round(dollars / 1_000)}K`;
  if (dollars >= 1_000) return `${sign}$${(dollars / 1_000).toFixed(1)}K`;
  return `${sign}$${Math.round(dollars)}`;
}

export function fmtPercent(rate: Rate, digits = 1): string {
  const v = rate * 100;
  const text = v.toFixed(digits);
  return `${text.startsWith("-") ? "−" + text.slice(1) : text}%`;
}

export function fmtNumber(n: number, digits = 0): string {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(n);
}

/** "+$12,400" / "−$3,100" for deltas. */
export function fmtSigned(cents: Cents): string {
  if (cents === 0) return "$0";
  return `${cents > 0 ? "+" : ""}${fmtMoney(cents)}`;
}
