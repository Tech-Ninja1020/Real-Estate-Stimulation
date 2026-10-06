/**
 * Input validation for households and scenario controls. The simulator itself is forgiving
 * (it clamps and warns); validation gives the editor precise, human-readable messages.
 */

import type { Household, Loan, Property, ScenarioConfig } from "./types";

export type IssueSeverity = "error" | "warning";

export interface ValidationIssue {
  severity: IssueSeverity;
  /** Dotted path such as "properties[0].loans[1].rate". */
  path: string;
  message: string;
}

const inRange = (x: number, lo: number, hi: number): boolean =>
  Number.isFinite(x) && x >= lo && x <= hi;

function validateLoan(loan: Loan, path: string, out: ValidationIssue[]): void {
  const err = (field: string, message: string): void => {
    out.push({ severity: "error", path: `${path}.${field}`, message });
  };
  if (!inRange(loan.startMonth, 1, 12)) err("startMonth", "Month must be between 1 and 12.");
  if (!Number.isInteger(loan.startYear)) err("startYear", "Start year must be a whole year.");
  switch (loan.type) {
    case "fixed":
      if (loan.principal <= 0) err("principal", "Principal must be positive.");
      if (!inRange(loan.rate, 0, 0.3)) err("rate", "Rate must be between 0% and 30%.");
      if (!inRange(loan.termYears, 1, 50)) err("termYears", "Term must be 1-50 years.");
      break;
    case "interestOnly":
      if (loan.principal <= 0) err("principal", "Principal must be positive.");
      if (!inRange(loan.rate, 0, 0.3)) err("rate", "Rate must be between 0% and 30%.");
      if (!inRange(loan.termYears, 1, 50)) err("termYears", "Term must be 1-50 years.");
      if (loan.ioYears < 0 || loan.ioYears >= loan.termYears) {
        err("ioYears", "Interest-only years must be shorter than the loan term.");
      }
      break;
    case "arm":
      if (loan.principal <= 0) err("principal", "Principal must be positive.");
      if (!inRange(loan.initialRate, 0, 0.3))
        err("initialRate", "Rate must be between 0% and 30%.");
      if (!inRange(loan.termYears, 1, 50)) err("termYears", "Term must be 1-50 years.");
      if (loan.fixedYears < 1 || loan.fixedYears > loan.termYears) {
        err("fixedYears", "Fixed period must be within the loan term.");
      }
      if (loan.adjustmentCap < 0 || loan.lifetimeCap < 0)
        err("adjustmentCap", "Caps cannot be negative.");
      break;
    case "heloc":
      if (loan.creditLimit <= 0) err("creditLimit", "Credit limit must be positive.");
      if (loan.initialDraw > loan.creditLimit)
        err("initialDraw", "Initial draw exceeds the credit limit.");
      if (!inRange(loan.rate, 0, 0.3)) err("rate", "Rate must be between 0% and 30%.");
      if (loan.drawPeriodYears < 0 || loan.repaymentYears <= 0) {
        err("repaymentYears", "Repayment period must be positive.");
      }
      break;
  }
}

function validateProperty(p: Property, path: string, out: ValidationIssue[]): void {
  const err = (field: string, message: string): void => {
    out.push({ severity: "error", path: `${path}.${field}`, message });
  };
  if (!p.name.trim()) err("name", "Give the property a name.");
  if (p.purchasePrice <= 0) err("purchasePrice", "Purchase price must be positive.");
  if (p.currentValue <= 0) err("currentValue", "Current value must be positive.");
  if (!inRange(p.landValuePct, 0, 0.95))
    err("landValuePct", "Land share must be between 0% and 95%.");
  if (!inRange(p.purchaseMonth, 1, 12)) err("purchaseMonth", "Month must be between 1 and 12.");
  if (!inRange(p.vacancyRate, 0, 1)) err("vacancyRate", "Vacancy must be between 0% and 100%.");
  if (!inRange(p.sellingCostRate, 0, 0.2))
    err("sellingCostRate", "Selling costs must be between 0% and 20%.");
  if (!inRange(p.appreciationRate, -0.2, 0.3))
    err("appreciationRate", "Appreciation must be between -20% and 30%.");
  if (!inRange(p.rentGrowthRate, -0.2, 0.3))
    err("rentGrowthRate", "Rent growth must be between -20% and 30%.");
  p.improvements.forEach((imp, i) => {
    if (!inRange(imp.month, 1, 12))
      err(`improvements[${i}].month`, "Month must be between 1 and 12.");
    if (imp.amount <= 0) err(`improvements[${i}].amount`, "Amount must be positive.");
  });
  p.loans.forEach((loan, i) => validateLoan(loan, `${path}.loans[${i}]`, out));
  if (p.loans.length > 0 && p.currentValue > 0) {
    const principal = p.loans.reduce(
      (t, l) => t + (l.type === "heloc" ? l.creditLimit : l.principal),
      0,
    );
    if (principal > p.currentValue * 1.5) {
      out.push({
        severity: "warning",
        path: `${path}.loans`,
        message: "Original loan amounts are far above the current value. Check the figures.",
      });
    }
  }
}

export function validateHousehold(h: Household): ValidationIssue[] {
  const out: ValidationIssue[] = [];
  if (h.properties.length === 0) {
    out.push({ severity: "error", path: "properties", message: "Add at least one property." });
  }
  const ids = new Set<string>();
  h.properties.forEach((p, i) => {
    if (ids.has(p.id)) {
      out.push({
        severity: "error",
        path: `properties[${i}].id`,
        message: "Duplicate property id.",
      });
    }
    ids.add(p.id);
    validateProperty(p, `properties[${i}]`, out);
  });
  const inv = h.investor;
  if (inv.otherTaxableIncome < 0) {
    out.push({
      severity: "error",
      path: "investor.otherTaxableIncome",
      message: "Income cannot be negative.",
    });
  }
  if (!inRange(inv.stateTaxRate, 0, 0.2)) {
    out.push({
      severity: "error",
      path: "investor.stateTaxRate",
      message: "State rate must be between 0% and 20%.",
    });
  }
  if (!inRange(inv.reinvestmentReturnRate, -0.1, 0.25)) {
    out.push({
      severity: "error",
      path: "investor.reinvestmentReturnRate",
      message: "Reinvestment return must be between -10% and 25%.",
    });
  }
  if (!inRange(inv.discountRate, 0, 0.3)) {
    out.push({
      severity: "error",
      path: "investor.discountRate",
      message: "Discount rate must be between 0% and 30%.",
    });
  }
  return out;
}

export function validateScenarioConfig(h: Household, c: ScenarioConfig): ValidationIssue[] {
  const out: ValidationIssue[] = [];
  const first = h.market.asOfYear + 1;
  const last = h.market.asOfYear + h.investor.horizonYears;
  if (c.sellYear < first || c.sellYear > last - 1) {
    out.push({
      severity: "error",
      path: "sellYear",
      message: `Sale year must be between ${first} and ${last - 1}.`,
    });
  }
  const known = new Set(h.properties.map((p) => p.id));
  for (const id of c.sellPropertyIds) {
    if (!known.has(id))
      out.push({ severity: "error", path: "sellPropertyIds", message: `Unknown property ${id}.` });
  }
  if (c.sellPropertyIds.length === 0) {
    out.push({
      severity: "warning",
      path: "sellPropertyIds",
      message: "No properties selected: Sell and Exchange equal Hold.",
    });
  }
  if (c.identificationDays > 45) {
    out.push({
      severity: "warning",
      path: "identificationDays",
      message: "Identification after day 45 voids the exchange.",
    });
  }
  if (c.closingDays > 180) {
    out.push({
      severity: "warning",
      path: "closingDays",
      message: "Closing after day 180 voids the exchange.",
    });
  }
  return out;
}
