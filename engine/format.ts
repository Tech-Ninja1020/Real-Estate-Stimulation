/**
 * Locale-independent number formatting used inside math traces and narratives, so the same text is
 * produced on the server, in the browser and in tests. (UI components use richer formatting.)
 */

import type { Cents, Rate } from "./money";

function groupThousands(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** "$1,234,567" (whole dollars) or "$1,234,567.89" with `exactCents`. Negative values use a true minus. */
export function formatUsd(cents: Cents, exactCents = false): string {
  const negative = cents < 0;
  const abs = Math.abs(cents);
  let body: string;
  if (exactCents) {
    const dollars = Math.floor(abs / 100);
    const rem = abs % 100;
    body = `$${groupThousands(dollars)}.${String(rem).padStart(2, "0")}`;
  } else {
    body = `$${groupThousands(Math.round(abs / 100))}`;
  }
  return negative ? `−${body}` : body;
}

/** Compact: $1.2M, $850K, $12,400. */
export function formatUsdCompact(cents: Cents): string {
  const abs = Math.abs(cents) / 100;
  const sign = cents < 0 ? "−" : "";
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(abs >= 10_000_000 ? 1 : 2)}M`;
  if (abs >= 100_000) return `${sign}$${Math.round(abs / 1_000)}K`;
  return `${sign}$${groupThousands(Math.round(abs))}`;
}

export function formatPercent(rate: Rate, digits = 1): string {
  const v = rate * 100;
  const text = Math.abs(v) < 10 ** -digits / 2 ? (0).toFixed(digits) : v.toFixed(digits);
  return `${text.startsWith("-") ? "−" + text.slice(1) : text}%`;
}

export function formatNumber(n: number, digits = 0): string {
  const fixed = Math.abs(n).toFixed(digits);
  const [whole = "0", frac] = fixed.split(".");
  const out = frac ? `${groupThousands(Number(whole))}.${frac}` : groupThousands(Number(whole));
  return n < 0 ? `−${out}` : out;
}

/** "2029-04-30" -> "Apr 30, 2029". */
export function formatIsoLong(iso: string): string {
  const MONTHS = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const [y, m, d] = iso.split("-");
  const month = MONTHS[Number(m) - 1] ?? "";
  return d ? `${month} ${Number(d)}, ${y}` : `${month} ${y}`;
}
