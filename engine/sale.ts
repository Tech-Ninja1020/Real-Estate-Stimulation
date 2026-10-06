/**
 * Sale mechanics: adjusted basis, realised gain, and the split of gain into unrecaptured
 * Section 1250 gain (depreciation recapture) versus long-term capital gain.
 *
 * Definitions used throughout (see the assumptions page):
 *   adjusted basis   = land + depreciable basis placed in service − accumulated depreciation
 *                    = purchase price + capitalised closing costs + improvements − depreciation
 *   amount realised  = sale price − selling costs
 *   total gain       = amount realised − adjusted basis
 *   unrecaptured §1250 gain = min(gain, depreciation taken)   (taxed at up to 25%)
 *   long-term gain   = gain − unrecaptured §1250 gain          (taxed at 0/15/20%)
 *   gain < 0         = §1231 loss, deducted against ordinary income
 */

import { applyRate, maxCents, minCents } from "./money";
import type { Cents } from "./money";
import { accumulatedDepreciationAt, midMonthIndex } from "./depreciation";
import type { DepreciationTranche, GainClassification, SaleGainResult } from "./types";
import type { Rate } from "./money";

/**
 * The tax-basis side of a holding: land, depreciable tranches, and depreciation history that was
 * inherited through a 1031 exchange (still counts toward unrecaptured §1250 gain).
 */
export interface TaxLot {
  landBasis: Cents;
  tranches: DepreciationTranche[];
  /** Depreciation taken on relinquished property that carries over into this lot. */
  carriedDepreciation: Cents;
}

/** Depreciation taken (carried over + this lot's own) as of half-month index `at`. */
export function depreciationTakenAt(lot: TaxLot, at: number): Cents {
  let total = lot.carriedDepreciation;
  for (const t of lot.tranches) total += accumulatedDepreciationAt(t, at);
  return total;
}

/** Depreciation accumulated on this lot's own tranches only (excludes inherited history). */
export function ownDepreciationAt(lot: TaxLot, at: number): Cents {
  let total = 0;
  for (const t of lot.tranches) total += accumulatedDepreciationAt(t, at);
  return total;
}

/** Cost basis in service at `at`: land plus every tranche placed in service by then. */
export function costBasisAt(lot: TaxLot, at: number): Cents {
  let total = lot.landBasis;
  for (const t of lot.tranches) {
    if (midMonthIndex(t.placedInServiceYear, t.placedInServiceMonth) <= at) total += t.basis;
  }
  return total;
}

/** Adjusted basis = cost basis − accumulated depreciation on this lot's own tranches. */
export function adjustedBasisAt(lot: TaxLot, at: number): Cents {
  return costBasisAt(lot, at) - ownDepreciationAt(lot, at);
}

/** Unrecaptured §1250 gain: the part of a gain attributable to depreciation taken, never more than the gain. */
export function computeUnrecapturedSection1250Gain(
  totalGain: Cents,
  depreciationTaken: Cents,
): Cents {
  return minCents(maxCents(0, totalGain), maxCents(0, depreciationTaken));
}

export interface SaleInputs {
  propertyId: string;
  propertyName: string;
  salePrice: Cents;
  sellingCostRate: Rate;
  loanPayoff: Cents;
  lot: TaxLot;
  /** Half-month index of the sale (use `midMonthIndex(year, month)`). */
  at: number;
}

/** Compute amount realised, adjusted basis and total gain for one property sale. */
export function computeSaleGain(input: SaleInputs): SaleGainResult {
  const sellingCosts = applyRate(input.salePrice, input.sellingCostRate);
  const amountRealized = input.salePrice - sellingCosts;
  const adjustedBasis = adjustedBasisAt(input.lot, input.at);
  const depreciation = depreciationTakenAt(input.lot, input.at);
  return {
    propertyId: input.propertyId,
    propertyName: input.propertyName,
    salePrice: input.salePrice,
    sellingCosts,
    amountRealized,
    adjustedBasis,
    accumulatedDepreciation: depreciation,
    totalGain: amountRealized - adjustedBasis,
    loanPayoff: input.loanPayoff,
    netProceedsBeforeTax: amountRealized - input.loanPayoff,
  };
}

/**
 * Net several same-year property sales (§1231 netting) and classify the result.
 * - Net loss  -> ordinary §1231 loss.
 * - Net gain  -> unrecaptured §1250 gain up to the depreciation behind the gain-producing sales,
 *               limited to the net gain; the remainder is long-term capital gain.
 */
export function classifyGains(sales: readonly SaleGainResult[]): GainClassification {
  let netGain = 0;
  let depreciationCapacity = 0;
  for (const s of sales) {
    netGain += s.totalGain;
    depreciationCapacity += computeUnrecapturedSection1250Gain(
      s.totalGain,
      s.accumulatedDepreciation,
    );
  }
  return classifyNetGain(netGain, depreciationCapacity);
}

/** Classify a net gain given the depreciation capacity that could be recaptured. */
export function classifyNetGain(netGain: Cents, depreciationCapacity: Cents): GainClassification {
  if (netGain <= 0) {
    return {
      netGain,
      unrecaptured1250Gain: 0,
      longTermCapitalGain: 0,
      ordinaryLoss1231: netGain < 0 ? -netGain : 0,
    };
  }
  const unrecaptured = minCents(netGain, maxCents(0, depreciationCapacity));
  return {
    netGain,
    unrecaptured1250Gain: unrecaptured,
    longTermCapitalGain: netGain - unrecaptured,
    ordinaryLoss1231: 0,
  };
}
