/**
 * Loan amortisation for the four supported loan types: fixed, interest-only, ARM and HELOC.
 *
 * Schedules are generated month by month (payment at the end of each month, interest = balance x
 * rate / 12 rounded to the cent) and rolled up into calendar-year rows. The last payment of any
 * amortising block clears the exact remaining balance, so rounding can never leave a residue.
 */

import { applyRate, clamp, maxCents, powInt, toCents } from "./money";
import type { Cents, Rate } from "./money";
import { fromMonthIndex, monthIndex } from "./dates";
import type {
  ArmLoan,
  FixedLoan,
  HelocLoan,
  InterestOnlyLoan,
  Loan,
  LoanPhase,
  LoanSchedule,
  LoanYearRow,
  MarketAssumptions,
  Year,
} from "./types";

interface MonthRecord {
  year: Year;
  month: number;
  opening: Cents;
  draw: Cents;
  interest: Cents;
  principal: Cents;
  closing: Cents;
  rate: Rate;
  phase: LoanPhase;
  capHit: "none" | "periodic" | "lifetime";
}

/** Level monthly payment that amortises `balance` over `months` at `annualRate`. */
export function levelPayment(balance: Cents, annualRate: Rate, months: number): Cents {
  if (balance <= 0) return 0;
  if (months <= 1) return balance + applyRate(balance, annualRate / 12);
  const i = annualRate / 12;
  const growth = powInt(1 + i, months);
  // A zero (or so small it vanishes in floating point) rate amortises in equal principal slices.
  if (annualRate <= 0 || !(growth > 1)) return toCents(balance / months);
  return toCents((balance * i * growth) / (growth - 1));
}

/** The ARM index at a given calendar year: starts at the as-of rate and drifts linearly. */
export function armIndexForYear(market: MarketAssumptions, year: Year): Rate {
  const yearsAfter = Math.max(0, year - market.asOfYear);
  return Math.max(0, market.armIndexRate + market.armIndexAnnualChange * yearsAfter);
}

class MonthLedger {
  readonly records: MonthRecord[] = [];
  balance: Cents;
  /** Months elapsed since origination (0 before the first payment). */
  elapsed = 0;
  private readonly startIndex: number;

  constructor(
    startYear: Year,
    startMonth: number,
    openingBalance: Cents,
    private readonly lastIndex: number,
  ) {
    this.balance = openingBalance;
    this.startIndex = monthIndex(startYear, startMonth);
  }

  /** Calendar position of the month about to be recorded. */
  next(): { year: Year; month: number; index: number } {
    const index = this.startIndex + this.elapsed;
    return { ...fromMonthIndex(index), index };
  }

  get done(): boolean {
    return this.next().index > this.lastIndex;
  }

  push(r: Omit<MonthRecord, "year" | "month" | "opening" | "closing">): void {
    const { year, month } = this.next();
    const opening = this.balance;
    const closing = opening + r.draw - r.principal;
    this.records.push({ ...r, year, month, opening, closing });
    this.balance = closing;
    this.elapsed += 1;
  }
}

/**
 * Run `runMonths` months of a level-payment block. The payment is sized to amortise the current
 * balance over `remainingMonths` at `rate`; the final month of the whole loan clears the balance.
 */
function runAmortizingBlock(
  ledger: MonthLedger,
  rate: Rate,
  runMonths: number,
  remainingMonths: number,
  phase: LoanPhase,
  capHit: MonthRecord["capHit"] = "none",
): void {
  const payment = levelPayment(ledger.balance, rate, remainingMonths);
  for (let j = 0; j < runMonths; j++) {
    if (ledger.done) return;
    const monthsLeft = remainingMonths - j;
    const interest = applyRate(ledger.balance, rate / 12);
    const principal =
      monthsLeft <= 1 ? ledger.balance : Math.min(ledger.balance, payment - interest);
    ledger.push({ draw: 0, interest, principal, rate, phase, capHit });
  }
}

function generateFixed(loan: FixedLoan, lastIndex: number): MonthRecord[] {
  const ledger = new MonthLedger(loan.startYear, loan.startMonth, loan.principal, lastIndex);
  const total = Math.round(loan.termYears * 12);
  runAmortizingBlock(ledger, loan.rate, total, total, "fixed");
  return ledger.records;
}

function generateInterestOnly(loan: InterestOnlyLoan, lastIndex: number): MonthRecord[] {
  const ledger = new MonthLedger(loan.startYear, loan.startMonth, loan.principal, lastIndex);
  const total = Math.round(loan.termYears * 12);
  const ioMonths = Math.min(total, Math.round(loan.ioYears * 12));
  for (let j = 0; j < ioMonths && !ledger.done; j++) {
    const interest = applyRate(ledger.balance, loan.rate / 12);
    // An interest-only loan with no amortising period repays its balance as a balloon at maturity.
    const balloon = ioMonths === total && j === ioMonths - 1;
    ledger.push({
      draw: 0,
      interest,
      principal: balloon ? ledger.balance : 0,
      rate: loan.rate,
      phase: "interestOnly",
      capHit: "none",
    });
  }
  const amortMonths = total - ioMonths;
  if (amortMonths > 0)
    runAmortizingBlock(ledger, loan.rate, amortMonths, amortMonths, "amortizing");
  return ledger.records;
}

/** Compute the rate that applies after an ARM reset, reporting whether a cap bit. */
export function resetArmRate(
  loan: Pick<ArmLoan, "initialRate" | "adjustmentCap" | "lifetimeCap" | "margin">,
  previousRate: Rate,
  indexRate: Rate,
): { rate: Rate; capHit: "none" | "periodic" | "lifetime" } {
  const fullyIndexed = indexRate + loan.margin;
  const periodicLow = previousRate - loan.adjustmentCap;
  const periodicHigh = previousRate + loan.adjustmentCap;
  let rate = clamp(fullyIndexed, periodicLow, periodicHigh);
  let capHit: "none" | "periodic" | "lifetime" = rate !== fullyIndexed ? "periodic" : "none";
  const lifetimeHigh = loan.initialRate + loan.lifetimeCap;
  if (rate > lifetimeHigh) {
    rate = lifetimeHigh;
    capHit = "lifetime";
  }
  return { rate: Math.max(0, rate), capHit };
}

function generateArm(loan: ArmLoan, market: MarketAssumptions, lastIndex: number): MonthRecord[] {
  const ledger = new MonthLedger(loan.startYear, loan.startMonth, loan.principal, lastIndex);
  const total = Math.round(loan.termYears * 12);
  const fixedMonths = Math.min(total, Math.round(loan.fixedYears * 12));
  runAmortizingBlock(ledger, loan.initialRate, fixedMonths, total, "armFixed");
  let rate = loan.initialRate;
  while (ledger.elapsed < total && !ledger.done) {
    const remaining = total - ledger.elapsed;
    const resetYear = ledger.next().year;
    const reset = resetArmRate(loan, rate, armIndexForYear(market, resetYear));
    rate = reset.rate;
    runAmortizingBlock(
      ledger,
      rate,
      Math.min(12, remaining),
      remaining,
      "armAdjusting",
      reset.capHit,
    );
  }
  return ledger.records;
}

function generateHeloc(loan: HelocLoan, lastIndex: number, warnings: string[]): MonthRecord[] {
  const ledger = new MonthLedger(loan.startYear, loan.startMonth, 0, lastIndex);
  const drawMonths = Math.round(loan.drawPeriodYears * 12);
  const repayMonths = Math.round(loan.repaymentYears * 12);
  let repayPayment = 0;
  for (let n = 1; n <= drawMonths + repayMonths && !ledger.done; n++) {
    const { year, month } = ledger.next();
    const inDraw = n <= drawMonths;
    let requested = n === 1 ? loan.initialDraw : 0;
    for (const d of loan.draws) {
      if (d.year === year && d.month === month) {
        if (inDraw) requested += d.amount;
        else
          warnings.push(
            `${loan.label}: draw in ${year}-${month} falls after the draw period and is ignored.`,
          );
      }
    }
    const available = maxCents(0, loan.creditLimit - ledger.balance);
    const draw = Math.min(requested, available);
    if (draw < requested) {
      warnings.push(
        `${loan.label}: draw in ${year}-${month} limited to the available credit line.`,
      );
    }
    const balanceAfterDraw = ledger.balance + draw;
    const interest = applyRate(balanceAfterDraw, loan.rate / 12);
    let principal = 0;
    if (!inDraw) {
      if (n === drawMonths + 1)
        repayPayment = levelPayment(balanceAfterDraw, loan.rate, repayMonths);
      const monthsLeft = drawMonths + repayMonths - n + 1;
      principal =
        monthsLeft <= 1 ? balanceAfterDraw : Math.min(balanceAfterDraw, repayPayment - interest);
    }
    ledger.push({
      draw,
      interest,
      principal,
      rate: loan.rate,
      phase: inDraw ? "helocDraw" : "helocRepay",
      capHit: "none",
    });
  }
  return ledger.records;
}

const CAP_RANK = { none: 0, periodic: 1, lifetime: 2 } as const;

function rollUpToYears(
  loan: Loan,
  records: readonly MonthRecord[],
  throughYear: Year,
): LoanYearRow[] {
  const rows: LoanYearRow[] = [];
  const firstYear = loan.startYear;
  const termOpening = loan.type === "heloc" ? 0 : loan.principal;
  let carryClosing = 0;
  let carryRate = 0;
  for (let year = firstYear; year <= throughYear; year++) {
    const inYear = records.filter((r) => r.year === year);
    if (inYear.length === 0) {
      rows.push({
        year,
        openingBalance: carryClosing,
        draws: 0,
        interest: 0,
        principal: 0,
        payment: 0,
        closingBalance: carryClosing,
        endRate: carryRate,
        phase: carryClosing === 0 ? "paidOff" : "notStarted",
        capHit: "none",
      });
      continue;
    }
    let draws = 0;
    let interest = 0;
    let principal = 0;
    let capHit: LoanYearRow["capHit"] = "none";
    for (const r of inYear) {
      draws += r.draw;
      interest += r.interest;
      principal += r.principal;
      if (CAP_RANK[r.capHit] > CAP_RANK[capHit]) capHit = r.capHit;
    }
    const first = inYear[0];
    const last = inYear[inYear.length - 1];
    if (!first || !last) continue;
    const opening = year === firstYear ? (loan.type === "heloc" ? 0 : termOpening) : first.opening;
    carryClosing = last.closing;
    carryRate = last.rate;
    rows.push({
      year,
      openingBalance: opening,
      draws,
      interest,
      principal,
      payment: interest + principal,
      closingBalance: last.closing,
      endRate: last.rate,
      phase: last.closing === 0 && last.principal > 0 ? "paidOff" : last.phase,
      capHit,
    });
  }
  return rows;
}

/**
 * Build a loan's year-by-year schedule from origination through `throughYear` (December).
 * Years after maturity show a zero balance and the "paidOff" phase.
 */
export function buildLoanSchedule(
  loan: Loan,
  market: MarketAssumptions,
  throughYear: Year,
): LoanSchedule {
  const warnings: string[] = [];
  const lastIndex = monthIndex(throughYear, 12);
  let records: MonthRecord[];
  switch (loan.type) {
    case "fixed":
      records = generateFixed(loan, lastIndex);
      break;
    case "interestOnly":
      records = generateInterestOnly(loan, lastIndex);
      break;
    case "arm":
      records = generateArm(loan, market, lastIndex);
      break;
    case "heloc":
      records = generateHeloc(loan, lastIndex, warnings);
      break;
  }
  return {
    loanId: loan.id,
    label: loan.label,
    type: loan.type,
    rows: rollUpToYears(loan, records, throughYear),
    warnings,
  };
}

/** Row for `year`, or undefined when the loan has not originated yet. */
export function loanRowForYear(schedule: LoanSchedule, year: Year): LoanYearRow | undefined {
  return schedule.rows.find((r) => r.year === year);
}

/** Loan balance at the end of `year` (0 before origination). */
export function loanBalanceAtYearEnd(schedule: LoanSchedule, year: Year): Cents {
  return loanRowForYear(schedule, year)?.closingBalance ?? 0;
}

/** Sum selected fields of every loan's row for a year. */
export function sumLoanRows(
  schedules: readonly LoanSchedule[],
  year: Year,
): { balance: Cents; interest: Cents; principal: Cents; draws: Cents } {
  let balance = 0;
  let interest = 0;
  let principal = 0;
  let draws = 0;
  for (const s of schedules) {
    const row = loanRowForYear(s, year);
    if (!row) continue;
    balance += row.closingBalance;
    interest += row.interest;
    principal += row.principal;
    draws += row.draws;
  }
  return { balance, interest, principal, draws };
}

/** Balance at the end of the year *before* the first projection year, summed across loans. */
export function totalBalanceAtYearEnd(schedules: readonly LoanSchedule[], year: Year): Cents {
  return sumLoanRows(schedules, year).balance;
}
