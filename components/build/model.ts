/**
 * Pure helpers for the household editor: templates, id generation, structural edits, loan-type
 * translation, extra input checks and path lookups. No React in here, no randomness, no clocks:
 * the same draft always produces the same ids.
 */

import { applyRate, usd } from "@/engine/money";
import type { Cents } from "@/engine/money";
import type {
  ArmLoan,
  CapitalImprovement,
  Household,
  HelocLoan,
  Loan,
  LoanType,
  OperatingExpense,
  Property,
  ScenarioConfig,
} from "@/engine/types";
import type { ValidationIssue } from "@/engine/validate";
import { defaultReplacement } from "@/data/presets/helpers";
import { fmtPercent } from "@/lib/format";

// ───────────────────────────── Ids ─────────────────────────────

/** The smallest `${prefix}-${n}` (n from 1) that is not already taken. */
export function nextId(prefix: string, used: ReadonlySet<string>): string {
  let n = 1;
  while (used.has(`${prefix}-${n}`)) n++;
  return `${prefix}-${n}`;
}

export function usedLoanIds(h: Household): Set<string> {
  const s = new Set<string>();
  for (const p of h.properties) for (const l of p.loans) s.add(l.id);
  return s;
}

export function usedImprovementIds(h: Household): Set<string> {
  const s = new Set<string>();
  for (const p of h.properties) for (const i of p.improvements) s.add(i.id);
  return s;
}

// ───────────────────────────── Templates ─────────────────────────────

export const LOAN_TYPE_LABEL: Record<LoanType, string> = {
  fixed: "Fixed",
  interestOnly: "Interest-only",
  arm: "ARM",
  heloc: "HELOC",
};

export const LOAN_TYPES: readonly LoanType[] = ["fixed", "interestOnly", "arm", "heloc"];

export const FILING_LABEL = {
  single: "Single",
  mfj: "Married filing jointly",
  mfs: "Married filing separately",
  hoh: "Head of household",
} as const;

function defaultLoan(type: LoanType, id: string, label: string, p: Property): Loan {
  const principal = Math.max(usd(1_000), Math.round((p.purchasePrice * 0.7) / 100_000) * 100_000);
  const base = { id, label, startYear: p.purchaseYear, startMonth: p.purchaseMonth };
  switch (type) {
    case "fixed":
      return { ...base, type, principal, rate: 0.0625, termYears: 30 };
    case "interestOnly":
      return { ...base, type, principal, rate: 0.0675, ioYears: 5, termYears: 30 };
    case "arm":
      return {
        ...base,
        type,
        principal,
        initialRate: 0.0575,
        fixedYears: 5,
        termYears: 30,
        adjustmentCap: 0.02,
        lifetimeCap: 0.05,
        margin: 0.0275,
      };
    case "heloc":
      return {
        ...base,
        type,
        creditLimit: usd(100_000),
        rate: 0.0825,
        drawPeriodYears: 10,
        repaymentYears: 20,
        initialDraw: usd(50_000),
        draws: [],
      };
  }
}

export function templateProperty(h: Pick<Household, "market">, id: string, name: string): Property {
  const year = h.market.asOfYear - 8;
  return {
    id,
    name,
    location: "",
    purchaseYear: year,
    purchaseMonth: 6,
    purchasePrice: usd(350_000),
    landValuePct: 0.2,
    closingCosts: usd(7_000),
    improvements: [],
    currentValue: usd(475_000),
    appreciationRate: 0.035,
    annualRent: usd(36_000),
    rentGrowthRate: 0.03,
    vacancyRate: 0.05,
    operating: { kind: "percentOfRent", rate: 0.35 },
    propertyTax: usd(4_800),
    insurance: usd(1_800),
    expenseGrowthRate: 0.03,
    loans: [
      {
        type: "fixed",
        id: "loan-1",
        label: "First mortgage",
        startYear: year,
        startMonth: 6,
        principal: usd(250_000),
        rate: 0.0425,
        termYears: 30,
      },
    ],
    sellingCostRate: 0.06,
  };
}

/** A clean household with sensible defaults and no properties. */
export function blankHousehold(): Household {
  return {
    id: "custom-household",
    name: "My household",
    tagline: "A household built in the workbench.",
    description: "A custom household entered by the advisor.",
    investor: {
      filingStatus: "mfj",
      otherTaxableIncome: usd(120_000),
      stateTaxRate: 0.05,
      horizonYears: 20,
      discountRate: 0.05,
      reinvestmentReturnRate: 0.04,
    },
    market: {
      asOfYear: 2026,
      taxTableYear: 2026,
      inflationRate: 0.025,
      armIndexRate: 0.041,
      armIndexAnnualChange: 0.0025,
    },
    properties: [],
  };
}

/** The default starting point: a blank household with one example rental. */
export function templateHousehold(): Household {
  const h = blankHousehold();
  return { ...h, properties: [templateProperty(h, "property-1", "Primary rental")] };
}

// ───────────────────────────── Structural edits ─────────────────────────────

export function addProperty(h: Household): Household {
  const used = new Set(h.properties.map((p) => p.id));
  const id = nextId("property", used);
  const n = h.properties.length + 1;
  const prop = templateProperty(h, id, `Property ${n}`);
  const loanIds = usedLoanIds(h);
  const loan = prop.loans[0];
  const loans = loan ? [{ ...loan, id: nextId("loan", loanIds) }] : [];
  return { ...h, properties: [...h.properties, { ...prop, loans }] };
}

export function duplicateProperty(h: Household, index: number): Household {
  const src = h.properties[index];
  if (!src) return h;
  const used = new Set(h.properties.map((p) => p.id));
  const loanIds = usedLoanIds(h);
  const impIds = usedImprovementIds(h);
  const copy: Property = structuredClone(src);
  copy.id = nextId("property", used);
  copy.name = `${src.name} (copy)`;
  copy.loans = copy.loans.map((l) => {
    const id = nextId("loan", loanIds);
    loanIds.add(id);
    return { ...l, id };
  });
  copy.improvements = copy.improvements.map((i) => {
    const id = nextId("improvement", impIds);
    impIds.add(id);
    return { ...i, id };
  });
  const properties = [...h.properties];
  properties.splice(index + 1, 0, copy);
  return { ...h, properties };
}

export function removeProperty(h: Household, index: number): Household {
  return { ...h, properties: h.properties.filter((_, i) => i !== index) };
}

export function moveProperty(h: Household, index: number, delta: -1 | 1): Household {
  const to = index + delta;
  if (to < 0 || to >= h.properties.length) return h;
  const properties = [...h.properties];
  const [moved] = properties.splice(index, 1);
  if (!moved) return h;
  properties.splice(to, 0, moved);
  return { ...h, properties };
}

export function patchPropertyAt(h: Household, index: number, next: Property): Household {
  return { ...h, properties: h.properties.map((p, i) => (i === index ? next : p)) };
}

export function addLoan(h: Household, propertyIndex: number, type: LoanType): Household {
  const p = h.properties[propertyIndex];
  if (!p) return h;
  const id = nextId("loan", usedLoanIds(h));
  const label = p.loans.length === 0 ? "First mortgage" : `Loan ${p.loans.length + 1}`;
  return patchPropertyAt(h, propertyIndex, {
    ...p,
    loans: [...p.loans, defaultLoan(type, id, label, p)],
  });
}

export function addImprovement(h: Household, propertyIndex: number): Household {
  const p = h.properties[propertyIndex];
  if (!p) return h;
  const imp: CapitalImprovement = {
    id: nextId("improvement", usedImprovementIds(h)),
    description: "",
    year: h.market.asOfYear - 2,
    month: 6,
    amount: usd(20_000),
    valueAdded: 0,
  };
  return patchPropertyAt(h, propertyIndex, { ...p, improvements: [...p.improvements, imp] });
}

// ───────────────────────────── Loan type translation ─────────────────────────────

const principalOf = (l: Loan): Cents =>
  l.type === "heloc" ? (l.initialDraw > 0 ? l.initialDraw : l.creditLimit) : l.principal;

const rateOf = (l: Loan): number => (l.type === "arm" ? l.initialRate : l.rate);

const termOf = (l: Loan): number =>
  l.type === "heloc" ? l.drawPeriodYears + l.repaymentYears : l.termYears;

/** Switch a loan to another type, carrying over id, label, start, principal, rate and term. */
export function convertLoan(loan: Loan, type: LoanType): Loan {
  if (loan.type === type) return loan;
  const base = {
    id: loan.id,
    label: loan.label,
    startYear: loan.startYear,
    startMonth: loan.startMonth,
  };
  const principal = principalOf(loan);
  const rate = rateOf(loan);
  const term = Math.max(1, termOf(loan));
  switch (type) {
    case "fixed":
      return { ...base, type, principal, rate, termYears: term };
    case "interestOnly":
      return {
        ...base,
        type,
        principal,
        rate,
        termYears: term,
        ioYears: Math.min(5, Math.max(0, term - 1)),
      };
    case "arm": {
      const arm: ArmLoan = {
        ...base,
        type,
        principal,
        initialRate: rate,
        termYears: term,
        fixedYears: Math.min(5, term),
        adjustmentCap: 0.02,
        lifetimeCap: 0.05,
        margin: 0.0275,
      };
      return arm;
    }
    case "heloc": {
      const drawPeriodYears = Math.min(10, Math.max(0, term - 1));
      const heloc: HelocLoan = {
        ...base,
        type,
        creditLimit: principal,
        rate,
        drawPeriodYears,
        repaymentYears: Math.max(1, term - drawPeriodYears),
        initialDraw: principal,
        draws: [],
      };
      return heloc;
    }
  }
}

// ───────────────────────────── Operating expense toggle ─────────────────────────────

/** Switch between "% of rent" and "fixed $/yr" while keeping the same expense level. */
export function convertOperating(p: Property, kind: OperatingExpense["kind"]): OperatingExpense {
  if (p.operating.kind === kind) return p.operating;
  if (kind === "fixed") {
    return {
      kind: "fixed",
      annual: applyRate(p.annualRent, p.operating.kind === "percentOfRent" ? p.operating.rate : 0),
    };
  }
  const annual = p.operating.kind === "fixed" ? p.operating.annual : 0;
  const rate = p.annualRent > 0 ? Math.round((annual / p.annualRent) * 10_000) / 10_000 : 0.35;
  return { kind: "percentOfRent", rate: Math.min(1, Math.max(0, rate)) };
}

// ───────────────────────────── Scenario config ─────────────────────────────

/** Build the Scenario Lab config for a draft, reusing a base config when there is one. */
export function deriveConfig(draft: Household, base: ScenarioConfig | null): ScenarioConfig {
  const first = draft.market.asOfYear + 1;
  const last = draft.market.asOfYear + draft.investor.horizonYears - 1;
  const clampYear = (y: number): number => Math.min(last, Math.max(first, y));
  const ids = new Set(draft.properties.map((p) => p.id));
  const firstId = draft.properties[0]?.id;
  if (base) {
    const kept = base.sellPropertyIds.filter((id) => ids.has(id));
    const sellPropertyIds =
      kept.length === 0 && base.sellPropertyIds.length > 0 && firstId ? [firstId] : kept;
    return { ...base, sellYear: clampYear(base.sellYear), sellPropertyIds };
  }
  return {
    sellYear: clampYear(draft.market.asOfYear + 3),
    sellPropertyIds: firstId ? [firstId] : [],
    replacement: defaultReplacement("Replacement property"),
    cashOutAtClosing: 0,
    identificationDays: 30,
    closingDays: 120,
  };
}

// ───────────────────────────── Extra validation ─────────────────────────────

const isInt = (x: number): boolean => Number.isInteger(x);

/** Checks the engine validator does not cover. Same shape as `validateHousehold`. */
export function extraIssues(h: Household): ValidationIssue[] {
  const out: ValidationIssue[] = [];
  const err = (path: string, message: string): void => {
    out.push({ severity: "error", path, message });
  };
  const m = h.market;
  if (!isInt(m.asOfYear) || m.asOfYear < 1990 || m.asOfYear > 2100) {
    err("market.asOfYear", "Enter a four-digit year between 1990 and 2100.");
  }
  if (!Number.isFinite(m.inflationRate) || m.inflationRate < -0.05 || m.inflationRate > 0.2) {
    err("market.inflationRate", "Inflation must be between -5% and 20%.");
  }
  if (!Number.isFinite(m.armIndexRate) || m.armIndexRate < 0 || m.armIndexRate > 0.3) {
    err("market.armIndexRate", "Index rate must be between 0% and 30%.");
  }
  if (
    !Number.isFinite(m.armIndexAnnualChange) ||
    m.armIndexAnnualChange < -0.05 ||
    m.armIndexAnnualChange > 0.05
  ) {
    err("market.armIndexAnnualChange", "Annual drift must be between -5% and 5%.");
  }
  if (!h.name.trim()) err("name", "Give the household a name.");
  h.properties.forEach((p, i) => {
    const path = `properties[${i}]`;
    if (!isInt(p.purchaseYear) || p.purchaseYear < 1900 || p.purchaseYear > 2100) {
      err(`${path}.purchaseYear`, "Enter a four-digit year between 1900 and 2100.");
    }
    if (p.annualRent < 0) err(`${path}.annualRent`, "Rent cannot be negative.");
    if (p.operating.kind === "percentOfRent" && !(p.operating.rate >= 0 && p.operating.rate <= 1)) {
      err(`${path}.operating`, "Operating expenses must be between 0% and 100% of rent.");
    }
    if (p.expenseGrowthRate < -0.2 || p.expenseGrowthRate > 0.3) {
      err(`${path}.expenseGrowthRate`, "Expense growth must be between -20% and 30%.");
    }
    p.improvements.forEach((imp, j) => {
      if (!isInt(imp.year) || imp.year < 1900 || imp.year > 2100) {
        err(`${path}.improvements[${j}].year`, "Enter a four-digit year.");
      }
    });
    p.loans.forEach((l, j) => {
      const lp = `${path}.loans[${j}]`;
      if (!l.label.trim()) err(`${lp}.label`, "Give the loan a short label.");
      if (l.type === "arm") {
        if (l.lifetimeCap < l.adjustmentCap) {
          err(`${lp}.lifetimeCap`, "Lifetime cap should be at least the annual cap.");
        }
        if (!inRange(l.margin, 0, 0.2)) err(`${lp}.margin`, "Margin must be between 0% and 20%.");
      }
      if (l.type === "heloc") {
        l.draws.forEach((d, k) => {
          const dp = `${lp}.draws[${k}]`;
          if (!inRange(d.month, 1, 12)) err(`${dp}.month`, "Month must be between 1 and 12.");
          if (!isInt(d.year)) err(`${dp}.year`, "Enter a whole year.");
          if (d.amount <= 0) err(`${dp}.amount`, "Draw amount must be positive.");
        });
      }
    });
  });
  return out;
}

function inRange(x: number, lo: number, hi: number): boolean {
  return Number.isFinite(x) && x >= lo && x <= hi;
}

// ───────────────────────────── Issue lookup & wording ─────────────────────────────

export function groupIssuesByPath(
  issues: readonly ValidationIssue[],
): Map<string, ValidationIssue[]> {
  const map = new Map<string, ValidationIssue[]>();
  for (const issue of issues) {
    const list = map.get(issue.path);
    if (list) list.push(issue);
    else map.set(issue.path, [issue]);
  }
  return map;
}

export type Section = "investor" | "market" | "properties";

export function sectionOfPath(path: string): Section {
  if (path.startsWith("market")) return "market";
  if (path.startsWith("properties")) return "properties";
  return "investor";
}

/** DOM id for the control that edits `path`. */
export function fieldDomId(path: string): string {
  return `f-${path.replace(/[^A-Za-z0-9]+/g, "-").replace(/-$/, "")}`;
}

/** Index of the property a path belongs to, or null. */
export function propertyIndexOfPath(path: string): number | null {
  const m = /^properties\[(\d+)\]/.exec(path);
  return m ? Number(m[1]) : null;
}

const FIELD_LABEL: Record<string, string> = {
  name: "Household name",
  "investor.otherTaxableIncome": "Other taxable income",
  "investor.stateTaxRate": "State tax rate",
  "investor.discountRate": "Discount rate",
  "investor.reinvestmentReturnRate": "Reinvestment return",
  "market.asOfYear": "As-of year",
  "market.inflationRate": "Inflation",
  "market.armIndexRate": "ARM index rate",
  "market.armIndexAnnualChange": "ARM index drift",
  properties: "Properties",
  id: "ID",
  purchasePrice: "Purchase price",
  currentValue: "Current value",
  landValuePct: "Land value",
  purchaseMonth: "Purchase month",
  purchaseYear: "Purchase year",
  vacancyRate: "Vacancy",
  sellingCostRate: "Selling costs",
  appreciationRate: "Appreciation",
  rentGrowthRate: "Rent growth",
  expenseGrowthRate: "Expense growth",
  annualRent: "Annual rent",
  operating: "Operating expenses",
  loans: "Loans",
  startMonth: "Start month",
  startYear: "Start year",
  principal: "Principal",
  rate: "Rate",
  termYears: "Term",
  ioYears: "Interest-only years",
  initialRate: "Initial rate",
  fixedYears: "Fixed period",
  adjustmentCap: "Annual cap",
  lifetimeCap: "Lifetime cap",
  margin: "Margin",
  creditLimit: "Credit limit",
  initialDraw: "Initial draw",
  repaymentYears: "Repayment period",
  label: "Label",
  month: "Month",
  year: "Year",
  amount: "Amount",
};

/** "Maple Court · Loan 2 · Rate" from "properties[0].loans[1].rate". */
export function describePath(h: Household, path: string): string {
  if (FIELD_LABEL[path]) {
    const prefix = path.startsWith("investor")
      ? "Investor"
      : path.startsWith("market")
        ? "Market"
        : "";
    return prefix ? `${prefix} · ${FIELD_LABEL[path]}` : FIELD_LABEL[path];
  }
  const parts: string[] = [];
  const tokens = path.split(".");
  let prop: Property | undefined;
  for (const token of tokens) {
    const idx = /^(\w+)\[(\d+)\]$/.exec(token);
    if (idx) {
      const key = idx[1] ?? "";
      const n = Number(idx[2]);
      if (key === "properties") {
        prop = h.properties[n];
        parts.push(prop?.name.trim() || `Property ${n + 1}`);
      } else if (key === "loans") {
        parts.push(`Loan ${n + 1}`);
      } else if (key === "improvements") {
        parts.push(`Improvement ${n + 1}`);
      } else if (key === "draws") {
        parts.push(`Draw ${n + 1}`);
      }
    } else {
      parts.push(token === "name" ? "Name" : (FIELD_LABEL[token] ?? token));
    }
  }
  return parts.join(" · ");
}

// ───────────────────────────── Summaries ─────────────────────────────

export function loanChipText(l: Loan): string {
  switch (l.type) {
    case "fixed":
      return `Fixed ${fmtPercent(l.rate, 2)}`;
    case "interestOnly":
      return `Interest-only ${fmtPercent(l.rate, 2)}`;
    case "arm":
      return `ARM ${fmtPercent(l.initialRate, 2)}`;
    case "heloc":
      return `HELOC ${fmtPercent(l.rate, 2)}`;
  }
}

export function totalValue(h: Household): Cents {
  let t = 0;
  for (const p of h.properties) t += Number.isFinite(p.currentValue) ? p.currentValue : 0;
  return t;
}

// ───────────────────────────── Persistence ─────────────────────────────

export const DRAFT_KEY = "hss-build-draft-v1";

export interface SavedDraft {
  baseId: string | null;
  draft: Household;
}

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null;

/** Structural sanity check so a stale or hand-edited session entry can never crash the editor. */
export function looksLikeHousehold(x: unknown): x is Household {
  if (!isObj(x) || !isObj(x.investor) || !isObj(x.market) || !Array.isArray(x.properties)) {
    return false;
  }
  if (typeof x.name !== "string") return false;
  return x.properties.every(
    (p) =>
      isObj(p) &&
      typeof p.id === "string" &&
      typeof p.name === "string" &&
      Array.isArray(p.loans) &&
      Array.isArray(p.improvements) &&
      isObj(p.operating) &&
      p.loans.every(
        (l) =>
          isObj(l) &&
          typeof l.id === "string" &&
          (l.type === "fixed" ||
            l.type === "interestOnly" ||
            l.type === "arm" ||
            (l.type === "heloc" && Array.isArray(l.draws))),
      ),
  );
}

export function readSavedDraft(): SavedDraft | null {
  try {
    const raw = window.sessionStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isObj(parsed) || !looksLikeHousehold(parsed.draft)) return null;
    const baseId = typeof parsed.baseId === "string" ? parsed.baseId : null;
    return { baseId, draft: parsed.draft };
  } catch {
    return null;
  }
}

export function writeSavedDraft(saved: SavedDraft): void {
  try {
    window.sessionStorage.setItem(DRAFT_KEY, JSON.stringify(saved));
  } catch {
    /* storage unavailable: the editor works fine without autosave */
  }
}

export function clearSavedDraft(): void {
  try {
    window.sessionStorage.removeItem(DRAFT_KEY);
  } catch {
    /* ignore */
  }
}
