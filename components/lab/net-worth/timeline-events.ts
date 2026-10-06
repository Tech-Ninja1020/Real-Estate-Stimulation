import type {
  ScenarioResults,
  StrategyKind,
  TimelineEvent,
  TimelineEventKind,
} from "@/engine/types";
import { axisPosition, fmtDate } from "./dates";

export type EventTone = "neutral" | "amber" | "sell" | "exchange" | "ink";

export interface MarkerEvent {
  id: string;
  kind: TimelineEventKind;
  scope: StrategyKind | "shared";
  tone: EventTone;
  year: number;
  /** Position on the year axis (tick = year end). */
  pos: number;
  date: string;
  labels: string[];
}

export const KIND_NAME: Record<TimelineEventKind, string> = {
  purchase: "Purchase",
  improvement: "Improvement",
  sale: "Sale",
  identification: "Identification deadline",
  exchangeDeadline: "Exchange deadline",
  replacementClosing: "Replacement closes",
  helocDraw: "HELOC draw",
  loanPaidOff: "Loan paid off",
  armReset: "ARM reset",
  ioEnds: "Interest-only ends",
  horizon: "Horizon",
};

const HOLD_KINDS: TimelineEventKind[] = [
  "purchase",
  "improvement",
  "ioEnds",
  "armReset",
  "helocDraw",
  "loanPaidOff",
];
const EXCHANGE_KINDS: TimelineEventKind[] = [
  "sale",
  "identification",
  "exchangeDeadline",
  "replacementClosing",
];

function toneFor(kind: TimelineEventKind, scope: MarkerEvent["scope"]): EventTone {
  switch (kind) {
    case "armReset":
    case "ioEnds":
    case "identification":
    case "exchangeDeadline":
      return "amber";
    case "sale":
      return scope === "sell" ? "sell" : "exchange";
    case "replacementClosing":
      return "exchange";
    case "horizon":
      return "ink";
    default:
      return "neutral";
  }
}

export const SCOPE_LABEL: Record<MarkerEvent["scope"], string> = {
  shared: "All strategies",
  hold: "Hold",
  sell: "Sell",
  exchange: "1031 Exchange",
};

/** Gather, filter to the visible range, and de-duplicate the engine's event lists. */
export function collectMarkers(
  results: ScenarioResults,
  asOfYear: number,
  horizonYear: number,
): MarkerEvent[] {
  const byId = new Map<string, MarkerEvent>();
  const add = (e: TimelineEvent, scope: MarkerEvent["scope"]) => {
    if (e.year < asOfYear || e.year > horizonYear) return;
    const id = `${scope}|${e.kind}|${e.date}`;
    const existing = byId.get(id);
    if (existing) {
      if (!existing.labels.includes(e.label)) existing.labels.push(e.label);
      return;
    }
    byId.set(id, {
      id,
      kind: e.kind,
      scope,
      tone: toneFor(e.kind, scope),
      year: e.year,
      pos: Math.max(asOfYear, Math.min(horizonYear, axisPosition(e.date))),
      date: e.date,
      labels: [e.label],
    });
  };
  for (const e of results.hold.events) if (HOLD_KINDS.includes(e.kind)) add(e, "shared");
  for (const e of results.sell.events) if (e.kind === "sale") add(e, "sell");
  for (const e of results.exchange.events) if (EXCHANGE_KINDS.includes(e.kind)) add(e, "exchange");
  const horizon = results.hold.events.find((e) => e.kind === "horizon");
  add(
    horizon ?? {
      kind: "horizon",
      date: `${horizonYear}-12-31`,
      year: horizonYear,
      label: `${horizonYear - asOfYear}-year horizon`,
    },
    "shared",
  );
  return [...byId.values()].sort((a, b) => a.pos - b.pos || a.id.localeCompare(b.id));
}

export function markerTableRows(markers: MarkerEvent[]): (string | number)[][] {
  return markers.map((m) => [fmtDate(m.date), m.labels.join("; "), SCOPE_LABEL[m.scope]]);
}

const SHORT: Record<TimelineEventKind, string> = {
  purchase: "Purchase",
  improvement: "Improvement",
  sale: "Sale",
  identification: "45-day deadline",
  exchangeDeadline: "180-day deadline",
  replacementClosing: "Replacement closes",
  helocDraw: "HELOC draw",
  loanPaidOff: "Loan paid off",
  armReset: "ARM reset",
  ioEnds: "Interest-only ends",
  horizon: "Horizon",
};

/** A short caption drawn next to the marker. */
export function shortLabel(m: MarkerEvent): string {
  if (m.kind === "sale") return m.scope === "sell" ? "Sell" : "Exchange out";
  return SHORT[m.kind];
}
