/**
 * Section 1031 like-kind exchange mechanics for real property.
 *
 * Boot rules (what stays taxable):
 *   cash boot      = exchange cash the investor receives instead of reinvesting
 *   mortgage boot  = debt relieved − (new debt assumed + extra cash paid in)   [floored at 0]
 *   recognised gain = min(realised gain, total boot)       (never negative; losses are not recognised)
 *   deferred gain   = realised gain − recognised gain
 *
 * Replacement basis (two equivalent derivations; both are computed and must agree):
 *   (a) adjusted basis given up + cash paid in + new debt − debt relieved − cash boot + recognised gain
 *   (b) replacement price + replacement closing costs − deferred gain
 *
 * Carryover depreciation (Treas. Reg. §1.168(i)-6): the exchanged basis keeps depreciating over the
 * REMAINING recovery period of the relinquished property; any extra basis (new money, trade-up)
 * starts a fresh 27.5-year schedule. Depreciation history carries over for recapture purposes.
 */

import { maxCents, minCents, toCents } from "./money";
import type { Cents } from "./money";
import { addDays, endOfYear, formatIsoDate, monthIndex, fromMonthIndex } from "./dates";
import {
  RESIDENTIAL_LIFE_HALF_MONTHS,
  accruedHalfMonths,
  accumulatedDepreciationAt,
  midMonthIndex,
} from "./depreciation";
import { classifyNetGain, computeUnrecapturedSection1250Gain, depreciationTakenAt } from "./sale";
import type { TaxLot } from "./sale";
import type {
  BootResult,
  DepreciationTranche,
  ExchangeTimeline,
  SaleGainResult,
  Year,
} from "./types";
import type { Rate } from "./money";

export const IDENTIFICATION_WINDOW_DAYS = 45;
export const EXCHANGE_WINDOW_DAYS = 180;

export interface ExchangeCalendar {
  timeline: ExchangeTimeline;
  /** First month (a full month after closing) the replacement is owned. */
  firstOwnedYear: Year;
  firstOwnedMonth: number;
  /** Both windows respected: the exchange is valid. */
  valid: boolean;
}

/**
 * Lay out the 45-day identification and 180-day exchange windows. The relinquished property closes
 * on December 31 of `sellYear`; both clocks start that day (day 0).
 */
export function buildExchangeCalendar(
  sellYear: Year,
  identificationDays: number,
  closingDays: number,
): ExchangeCalendar {
  const start = endOfYear(sellYear);
  const closing = addDays(start, closingDays);
  const firstOwned = fromMonthIndex(monthIndex(closing.year, closing.month) + 1);
  const identificationWithinWindow =
    identificationDays >= 0 && identificationDays <= IDENTIFICATION_WINDOW_DAYS;
  const closingWithinWindow =
    closingDays <= EXCHANGE_WINDOW_DAYS && closingDays >= identificationDays;
  return {
    timeline: {
      relinquishedClosing: formatIsoDate(start),
      identificationDeadline: formatIsoDate(addDays(start, IDENTIFICATION_WINDOW_DAYS)),
      exchangeDeadline: formatIsoDate(addDays(start, EXCHANGE_WINDOW_DAYS)),
      identificationDate: formatIsoDate(addDays(start, identificationDays)),
      replacementClosing: formatIsoDate(closing),
      replacementFirstOwnedMonth: `${firstOwned.year}-${String(firstOwned.month).padStart(2, "0")}`,
      identificationWithinWindow,
      closingWithinWindow,
    },
    firstOwnedYear: firstOwned.year,
    firstOwnedMonth: firstOwned.month,
    valid: identificationWithinWindow && closingWithinWindow,
  };
}

export interface BootInputs {
  relinquished: readonly SaleGainResult[];
  replacementPrice: Cents;
  replacementClosingCosts: Cents;
  newDebt: Cents;
  /** Cash the investor chooses to take out of the intermediary account. */
  cashOutAtClosing: Cents;
}

/** Apply the boot rules for an exchange of one or more properties into a single replacement. */
export function applyBootRules(input: BootInputs): BootResult {
  const realizedGain = sum(input.relinquished.map((s) => s.totalGain));
  const adjustedBasisGivenUp = sum(input.relinquished.map((s) => s.adjustedBasis));
  const debtRelieved = sum(input.relinquished.map((s) => s.loanPayoff));
  const netProceeds = sum(input.relinquished.map((s) => s.netProceedsBeforeTax));
  const depreciationCapacity = sum(
    input.relinquished.map((s) =>
      computeUnrecapturedSection1250Gain(s.totalGain, s.accumulatedDepreciation),
    ),
  );

  const fundsHeldByIntermediary = maxCents(0, netProceeds);
  const cashPaidAtRelinquishedClosing = maxCents(0, -netProceeds);

  const price = input.replacementPrice;
  const closingCosts = input.replacementClosingCosts;
  const newDebt = minCents(input.newDebt, price + closingCosts);
  const cashOut = minCents(maxCents(0, input.cashOutAtClosing), fundsHeldByIntermediary);

  const cashNeeded = price + closingCosts - newDebt;
  const cashAvailable = fundsHeldByIntermediary - cashOut;
  const cashApplied = minCents(cashAvailable, cashNeeded);
  const extraCashFromInvestor = cashNeeded - cashApplied;
  const additionalCashPaidIn = cashPaidAtRelinquishedClosing + extraCashFromInvestor;

  const cashBoot = fundsHeldByIntermediary - cashApplied;
  const mortgageBoot = maxCents(0, debtRelieved - newDebt - additionalCashPaidIn);
  const totalBoot = cashBoot + mortgageBoot;

  const recognizedGain = maxCents(0, minCents(realizedGain, totalBoot));
  const deferredGain = realizedGain - recognizedGain;

  const replacementBasis =
    adjustedBasisGivenUp +
    additionalCashPaidIn +
    newDebt -
    debtRelieved -
    cashBoot +
    recognizedGain;
  const replacementBasisCrossCheck = price + closingCosts - deferredGain;

  return {
    realizedGain,
    debtRelieved,
    newDebt,
    replacementPrice: price,
    replacementClosingCosts: closingCosts,
    fundsHeldByIntermediary,
    cashPaidAtRelinquishedClosing,
    additionalCashPaidIn,
    cashApplied,
    cashBoot,
    mortgageBoot,
    totalBoot,
    recognizedGain,
    deferredGain,
    replacementBasis,
    replacementBasisCrossCheck,
    recognizedClassification: classifyNetGain(recognizedGain, depreciationCapacity),
  };
}

function sum(values: readonly number[]): number {
  let t = 0;
  for (const v of values) t += v;
  return t;
}

export interface RelinquishedLot {
  lot: TaxLot;
  /** Half-month index at which the property was disposed of. */
  at: number;
}

export interface ReplacementLotInputs {
  relinquished: readonly RelinquishedLot[];
  boot: BootResult;
  replacementLandValuePct: Rate;
  firstOwnedYear: Year;
  firstOwnedMonth: number;
}

/**
 * Build the replacement property's tax lot: carryover tranches (remaining basis over the remaining
 * recovery period), a fresh tranche for any excess basis, and land as the exact residual so that
 * land + tranches equals the replacement basis to the cent.
 */
export function buildReplacementLot(input: ReplacementLotInputs): TaxLot {
  const { boot } = input;
  let adjustedGivenUp = 0;
  let carried = 0;
  for (const r of input.relinquished) {
    for (const t of r.lot.tranches) {
      if (midMonthIndex(t.placedInServiceYear, t.placedInServiceMonth) <= r.at) {
        adjustedGivenUp += t.basis - accumulatedDepreciationAt(t, r.at);
      }
    }
    adjustedGivenUp += r.lot.landBasis;
    carried += depreciationTakenAt(r.lot, r.at);
  }

  const scale = adjustedGivenUp > 0 ? Math.min(1, boot.replacementBasis / adjustedGivenUp) : 1;
  const tranches: DepreciationTranche[] = [];
  let index = 0;
  for (const r of input.relinquished) {
    for (const t of r.lot.tranches) {
      if (midMonthIndex(t.placedInServiceYear, t.placedInServiceMonth) > r.at) continue;
      const remainingBasis = t.basis - accumulatedDepreciationAt(t, r.at);
      const remainingLife = t.lifeHalfMonths - accruedHalfMonths(t, r.at);
      if (remainingBasis <= 0 || remainingLife <= 0) continue;
      tranches.push({
        id: `replacement:carryover:${index++}`,
        label: `Carryover of ${t.label}`,
        kind: "carryover",
        basis: toCents(remainingBasis * scale),
        placedInServiceYear: input.firstOwnedYear,
        placedInServiceMonth: input.firstOwnedMonth,
        lifeHalfMonths: remainingLife,
      });
    }
  }

  // Excess basis (new money / trade-up) is whatever exceeds the exchanged basis.
  const excess = scale < 1 ? 0 : maxCents(0, boot.replacementBasis - adjustedGivenUp);
  if (excess > 0) {
    const building = toCents(excess * (1 - input.replacementLandValuePct));
    if (building > 0) {
      tranches.push({
        id: "replacement:excess",
        label: "New-money basis (price above exchanged basis)",
        kind: "excess",
        basis: building,
        placedInServiceYear: input.firstOwnedYear,
        placedInServiceMonth: input.firstOwnedMonth,
        lifeHalfMonths: RESIDENTIAL_LIFE_HALF_MONTHS,
      });
    }
  }
  const trancheTotal = sum(tranches.map((t) => t.basis));
  const landBasis = boot.replacementBasis - trancheTotal;

  // Recognised recapture is "used up" first and no longer carries forward.
  const carriedDepreciation = maxCents(
    0,
    carried - boot.recognizedClassification.unrecaptured1250Gain,
  );
  return { landBasis, tranches, carriedDepreciation };
}
