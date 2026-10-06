/**
 * Federal, NIIT and state income tax for a household-year.
 *
 * Stacking order (IRC §1(h)): ordinary taxable income first, then unrecaptured Section 1250 gain
 * (taxed at ordinary rates but capped at 25%), then the remaining long-term capital gain (0/15/20%
 * by taxable-income position). The portfolio's tax is measured INCREMENTALLY: tax with the
 * portfolio minus tax on the investor's other income alone, so wages and their taxes never leak
 * into the strategy comparison.
 */

import { applyRate, maxCents, minCents, powInt, toCents } from "./money";
import type { Cents, Rate } from "./money";
import type {
  FederalTaxResult,
  FilingStatus,
  InvestorProfile,
  MarketAssumptions,
  PortfolioTaxComponents,
  PortfolioTaxResult,
  SaleTaxBreakdown,
  TaxBracket,
  TaxTable,
  Year,
  YearTaxResult,
} from "./types";

// ─────────────────────────── Bracket arithmetic ───────────────────────────

/** Tax on `taxable` cents of ordinary income using progressive brackets. */
export function bracketTax(brackets: readonly TaxBracket[], taxable: Cents): Cents {
  return taxOnSegment(brackets, 0, taxable);
}

/**
 * Tax on the slice of income between `start` and `end` (cents of taxable income), optionally
 * capping each bracket's rate. With `rateCap` = 0.25 this is how unrecaptured §1250 gain is taxed:
 * at the ordinary rate where that is lower than 25%, and at 25% where it would be higher.
 */
export function taxOnSegment(
  brackets: readonly TaxBracket[],
  start: Cents,
  end: Cents,
  rateCap?: Rate,
): Cents {
  if (end <= start) return 0;
  let tax = 0;
  let lower = 0;
  for (const b of brackets) {
    const upper = b.upTo ?? Number.POSITIVE_INFINITY;
    const lo = Math.max(start, lower);
    const hi = Math.min(end, upper);
    if (hi > lo) {
      const rate = rateCap === undefined ? b.rate : Math.min(b.rate, rateCap);
      tax += (hi - lo) * rate;
    }
    lower = upper;
    if (lower >= end) break;
  }
  return toCents(tax);
}

export interface TaxSlice {
  from: Cents;
  to: Cents;
  /** Rate actually applied to this slice (after any cap). */
  rate: Rate;
  /** The statutory bracket rate before any cap. */
  bracketRate: Rate;
  tax: Cents;
}

/** The pieces of `taxOnSegment`, for showing the work in the math drawer. */
export function taxSlices(
  brackets: readonly TaxBracket[],
  start: Cents,
  end: Cents,
  rateCap?: Rate,
): TaxSlice[] {
  const slices: TaxSlice[] = [];
  if (end <= start) return slices;
  let lower = 0;
  for (const b of brackets) {
    const upper = b.upTo ?? Number.POSITIVE_INFINITY;
    const lo = Math.max(start, lower);
    const hi = Math.min(end, upper);
    if (hi > lo) {
      const rate = rateCap === undefined ? b.rate : Math.min(b.rate, rateCap);
      slices.push({ from: lo, to: hi, rate, bracketRate: b.rate, tax: toCents((hi - lo) * rate) });
    }
    lower = upper;
    if (lower >= end) break;
  }
  return slices;
}

/** Long-term capital gain slices across the 0% / 15% / 20% bands for a gain stacked at [start, end]. */
export function longTermGainSlices(
  table: TaxTable,
  status: FilingStatus,
  start: Cents,
  end: Cents,
): TaxSlice[] {
  const bp = table.ltcgBreakpoints[status];
  const bands: { lo: number; hi: number; rate: Rate }[] = [
    { lo: 0, hi: bp.zeroRateTop, rate: table.ltcgRates.zero },
    { lo: bp.zeroRateTop, hi: bp.fifteenRateTop, rate: table.ltcgRates.fifteen },
    { lo: bp.fifteenRateTop, hi: Number.POSITIVE_INFINITY, rate: table.ltcgRates.twenty },
  ];
  const out: TaxSlice[] = [];
  for (const b of bands) {
    const lo = Math.max(start, b.lo);
    const hi = Math.min(end, b.hi);
    if (hi > lo)
      out.push({
        from: lo,
        to: hi,
        rate: b.rate,
        bracketRate: b.rate,
        tax: toCents((hi - lo) * b.rate),
      });
  }
  return out;
}

/** Marginal ordinary rate at a given amount of taxable income. */
export function marginalRate(brackets: readonly TaxBracket[], taxable: Cents): Rate {
  for (const b of brackets) {
    if (b.upTo === null || taxable < b.upTo) return b.rate;
  }
  return brackets[brackets.length - 1]?.rate ?? 0;
}

// ─────────────────────────── Indexation ───────────────────────────

const roundToWholeDollars = (cents: Cents): Cents => Math.round(cents / 100) * 100;

/**
 * Project a tax table forward by indexing bracket thresholds, the standard deduction and the LTCG
 * breakpoints by `inflation` per year. The NIIT thresholds are set by statute and are NOT indexed.
 */
export function indexTaxTable(table: TaxTable, yearsForward: number, inflation: Rate): TaxTable {
  if (yearsForward <= 0) return table;
  const factor = powInt(1 + inflation, yearsForward);
  const scale = (c: Cents): Cents => roundToWholeDollars(c * factor);
  const statuses: FilingStatus[] = ["single", "mfj", "mfs", "hoh"];
  const ordinaryBrackets = {} as TaxTable["ordinaryBrackets"];
  const standardDeduction = {} as TaxTable["standardDeduction"];
  const ltcgBreakpoints = {} as TaxTable["ltcgBreakpoints"];
  for (const s of statuses) {
    ordinaryBrackets[s] = table.ordinaryBrackets[s].map((b) => ({
      upTo: b.upTo === null ? null : scale(b.upTo),
      rate: b.rate,
    }));
    standardDeduction[s] = scale(table.standardDeduction[s]);
    ltcgBreakpoints[s] = {
      zeroRateTop: scale(table.ltcgBreakpoints[s].zeroRateTop),
      fifteenRateTop: scale(table.ltcgBreakpoints[s].fifteenRateTop),
    };
  }
  return { ...table, ordinaryBrackets, standardDeduction, ltcgBreakpoints };
}

/** Everything needed to compute tax in one calendar year. */
export interface TaxContext {
  year: Year;
  table: TaxTable;
  filingStatus: FilingStatus;
  stateTaxRate: Rate;
  /** The investor's non-portfolio ordinary income in this year (inflated). */
  otherIncome: Cents;
}

export function createTaxContext(
  baseTable: TaxTable,
  investor: InvestorProfile,
  market: MarketAssumptions,
  year: Year,
): TaxContext {
  const table = indexTaxTable(baseTable, year - baseTable.taxYear, market.inflationRate);
  const growth = powInt(1 + market.inflationRate, Math.max(0, year - market.asOfYear));
  return {
    year,
    table,
    filingStatus: investor.filingStatus,
    stateTaxRate: investor.stateTaxRate,
    otherIncome: toCents(investor.otherTaxableIncome * growth),
  };
}

// ─────────────────────────── Federal ───────────────────────────

/**
 * Federal income tax on ordinary income plus two kinds of gain. The standard deduction is applied
 * to ordinary income first; any shortfall (deduction larger than ordinary income) then shelters
 * unrecaptured §1250 gain before long-term gain, as §1(h)(1)(E)(ii) directs.
 */
export function computeFederalTax(
  table: TaxTable,
  status: FilingStatus,
  input: { ordinaryIncome: Cents; unrecaptured1250Gain: Cents; longTermCapitalGain: Cents },
): FederalTaxResult {
  const deduction = table.standardDeduction[status];
  const brackets = table.ordinaryBrackets[status];
  const taxableOrdinary = maxCents(0, input.ordinaryIncome - deduction);
  const shortfall = maxCents(0, deduction - input.ordinaryIncome);
  const u1250 = maxCents(0, input.unrecaptured1250Gain - shortfall);
  const leftover = maxCents(0, shortfall - input.unrecaptured1250Gain);
  const ltcg = maxCents(0, input.longTermCapitalGain - leftover);

  const taxOnOrdinary = bracketTax(brackets, taxableOrdinary);
  const taxOnUnrecaptured1250 = taxOnSegment(
    brackets,
    taxableOrdinary,
    taxableOrdinary + u1250,
    table.unrecaptured1250MaxRate,
  );

  const bp = table.ltcgBreakpoints[status];
  const start = taxableOrdinary + u1250;
  const end = start + ltcg;
  const inZero = overlap(start, end, 0, bp.zeroRateTop);
  const inFifteen = overlap(start, end, bp.zeroRateTop, bp.fifteenRateTop);
  const inTwenty = overlap(start, end, bp.fifteenRateTop, Number.POSITIVE_INFINITY);
  const taxOnLongTermGain = toCents(
    inZero * table.ltcgRates.zero +
      inFifteen * table.ltcgRates.fifteen +
      inTwenty * table.ltcgRates.twenty,
  );

  return {
    ordinaryIncome: input.ordinaryIncome,
    standardDeduction: deduction,
    taxableOrdinary,
    unrecaptured1250: u1250,
    longTermGain: ltcg,
    taxOnOrdinary,
    taxOnUnrecaptured1250,
    taxOnLongTermGain,
    total: taxOnOrdinary + taxOnUnrecaptured1250 + taxOnLongTermGain,
  };
}

function overlap(a0: number, a1: number, b0: number, b1: number): number {
  return Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
}

/** 3.8% Net Investment Income Tax: on the lesser of NII and MAGI above the statutory threshold. */
export function computeNetInvestmentIncomeTax(
  table: TaxTable,
  status: FilingStatus,
  netInvestmentIncome: Cents,
  magi: Cents,
): Cents {
  const excess = maxCents(0, magi - table.niit.magiThreshold[status]);
  return applyRate(minCents(maxCents(0, netInvestmentIncome), excess), table.niit.rate);
}

export function computeStateTax(rate: Rate, base: Cents): Cents {
  return applyRate(maxCents(0, base), rate);
}

// ─────────────────────────── Household year ───────────────────────────

/** Full tax for one household-year given other income plus the portfolio components. */
export function computeYearTax(ctx: TaxContext, components: PortfolioTaxComponents): YearTaxResult {
  const ordinaryIncome = ctx.otherIncome + components.netRentalIncome - components.ordinaryLoss1231;
  const gains = components.unrecaptured1250Gain + components.longTermCapitalGain;
  const federal = computeFederalTax(ctx.table, ctx.filingStatus, {
    ordinaryIncome,
    unrecaptured1250Gain: components.unrecaptured1250Gain,
    longTermCapitalGain: components.longTermCapitalGain,
  });
  const magi = ordinaryIncome + gains;
  const netInvestmentIncome = maxCents(
    0,
    components.netRentalIncome - components.ordinaryLoss1231 + gains,
  );
  const niit = computeNetInvestmentIncomeTax(
    ctx.table,
    ctx.filingStatus,
    netInvestmentIncome,
    magi,
  );
  const state = computeStateTax(ctx.stateTaxRate, ordinaryIncome + gains);
  return {
    year: ctx.year,
    federal,
    niit,
    state,
    total: federal.total + niit + state,
    netInvestmentIncome,
    magi,
  };
}

function isEmptyComponents(c: PortfolioTaxComponents): boolean {
  return (
    c.netRentalIncome === 0 &&
    c.ordinaryLoss1231 === 0 &&
    c.unrecaptured1250Gain === 0 &&
    c.longTermCapitalGain === 0
  );
}

export const NO_COMPONENTS: PortfolioTaxComponents = {
  netRentalIncome: 0,
  ordinaryLoss1231: 0,
  unrecaptured1250Gain: 0,
  longTermCapitalGain: 0,
};

/**
 * Tax attributable to the portfolio in a year, layered so every layer can be explained:
 * baseline (other income only) -> + rental operations -> + net §1231 loss -> + unrecaptured §1250
 * gain -> + long-term gain. The layers telescope, so they sum exactly to the total.
 */
export function computePortfolioTax(
  ctx: TaxContext,
  components: PortfolioTaxComponents,
  precomputed?: PortfolioTaxResult,
): PortfolioTaxResult {
  if (precomputed && isEmptyComponents(components)) return precomputed;
  const baseline = precomputed?.baseline ?? computeYearTax(ctx, NO_COMPONENTS);
  const opsOnly: PortfolioTaxComponents = {
    ...NO_COMPONENTS,
    netRentalIncome: components.netRentalIncome,
  };
  const withOperations = computeYearTax(ctx, opsOnly);
  const withLoss = computeYearTax(ctx, {
    ...opsOnly,
    ordinaryLoss1231: components.ordinaryLoss1231,
  });
  const withRecapture = computeYearTax(ctx, {
    ...opsOnly,
    ordinaryLoss1231: components.ordinaryLoss1231,
    unrecaptured1250Gain: components.unrecaptured1250Gain,
  });
  const withAll = computeYearTax(ctx, components);

  const breakdown: SaleTaxBreakdown = {
    ordinaryLossBenefit: withLoss.total - withOperations.total,
    depreciationRecaptureTax: withRecapture.federal.total - withLoss.federal.total,
    capitalGainsTax: withAll.federal.total - withRecapture.federal.total,
    netInvestmentIncomeTax: withAll.niit - withLoss.niit,
    stateTax: withAll.state - withLoss.state,
    total: withAll.total - withOperations.total,
  };

  return {
    year: ctx.year,
    baseline,
    withOperations,
    withAll,
    taxOnOperations: withOperations.total - baseline.total,
    taxOnSale: withAll.total - withOperations.total,
    breakdown,
    total: withAll.total - baseline.total,
  };
}

/**
 * Extra tax caused by adding hypothetical `extra` gains on top of already-realised `base`
 * components in the same year. Used for "tax if liquidated today" figures.
 */
export function incrementalTaxOfGains(
  ctx: TaxContext,
  base: PortfolioTaxComponents,
  extra: Pick<
    PortfolioTaxComponents,
    "ordinaryLoss1231" | "unrecaptured1250Gain" | "longTermCapitalGain"
  >,
  actual?: PortfolioTaxResult,
): SaleTaxBreakdown {
  const before = actual ?? computePortfolioTax(ctx, base);
  const merged: PortfolioTaxComponents = {
    netRentalIncome: base.netRentalIncome,
    ordinaryLoss1231: base.ordinaryLoss1231 + extra.ordinaryLoss1231,
    unrecaptured1250Gain: base.unrecaptured1250Gain + extra.unrecaptured1250Gain,
    longTermCapitalGain: base.longTermCapitalGain + extra.longTermCapitalGain,
  };
  const after = computePortfolioTax(ctx, merged);
  return {
    ordinaryLossBenefit: after.breakdown.ordinaryLossBenefit - before.breakdown.ordinaryLossBenefit,
    depreciationRecaptureTax:
      after.breakdown.depreciationRecaptureTax - before.breakdown.depreciationRecaptureTax,
    capitalGainsTax: after.breakdown.capitalGainsTax - before.breakdown.capitalGainsTax,
    netInvestmentIncomeTax:
      after.breakdown.netInvestmentIncomeTax - before.breakdown.netInvestmentIncomeTax,
    stateTax: after.breakdown.stateTax - before.breakdown.stateTax,
    total: after.taxOnSale - before.taxOnSale,
  };
}
