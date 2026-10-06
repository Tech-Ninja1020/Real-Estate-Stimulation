/**
 * "Show the math": turns any figure in the UI into a structured, step-by-step trace.
 *
 * A figure is identified by a serialisable `TraceRef`. `resolveTrace` rebuilds the explanation
 * from the engine's own result objects (never from rounded display numbers), so the steps shown
 * always reproduce the figure to the cent. Nothing here does arithmetic the engine did not do:
 * each step either reads a stored intermediate or recomputes it with the same engine function.
 */

import { getTaxTable } from "@/data/tax";
import { formatNumber, formatPercent, formatUsd } from "./format";
import { powInt } from "./money";
import type { Cents, Rate } from "./money";
import {
  accruedHalfMonths,
  accumulatedDepreciationAt,
  midMonthIndex,
  yearEndIndex,
} from "./depreciation";
import { createTaxContext, longTermGainSlices, taxSlices } from "./tax";
import type { TaxContext } from "./tax";
import type {
  Household,
  LoanYearRow,
  PortfolioTaxResult,
  PropertyTimeline,
  PropertyYearRow,
  ScenarioResults,
  StrategyKind,
  StrategyResult,
  Year,
  YearRow,
} from "./types";

// ───────────────────────────── Trace types ─────────────────────────────

export type TraceValue =
  | { kind: "money"; cents: Cents; exact?: boolean }
  | { kind: "percent"; value: Rate; digits?: number }
  | { kind: "number"; value: number; unit?: string; digits?: number }
  | { kind: "year"; value: number }
  | { kind: "text"; text: string };

export interface TraceInput {
  label: string;
  value: TraceValue;
  note?: string;
  /** Drill-down: another figure that explains this input. */
  ref?: TraceRef;
}

export interface TraceStep {
  label: string;
  /** Human-readable arithmetic using the actual numbers. */
  expression: string;
  value: TraceValue;
  ref?: TraceRef;
}

export interface MathTrace {
  id: string;
  title: string;
  subtitle?: string;
  result: TraceValue;
  formula: string;
  inputs: TraceInput[];
  steps: TraceStep[];
  /** Ids from data/assumptions.ts. */
  assumptionIds: string[];
  notes: string[];
}

type Lane = StrategyKind;

/** A serialisable pointer to a figure. */
export type TraceRef =
  | { kind: "netWorthAfterTax"; strategy: Lane; year: Year }
  | { kind: "netWorthLiquidated"; strategy: Lane; year: Year; stepUp?: boolean }
  | { kind: "equity"; strategy: Lane; year: Year }
  | { kind: "deferredTax"; strategy: Lane; year: Year }
  | { kind: "cumulativeTaxes"; strategy: Lane; year: Year }
  | { kind: "cashFlow"; strategy: Lane; year: Year }
  | { kind: "cashAccount"; strategy: Lane; year: Year }
  | { kind: "taxOnOperations"; strategy: Lane; year: Year }
  | { kind: "noi"; strategy: Lane; year: Year; propertyId?: string }
  | { kind: "presentValue"; strategy: Lane }
  | { kind: "saleGain"; strategy: Lane; propertyId: string }
  | { kind: "saleBasis"; strategy: Lane; propertyId: string }
  | { kind: "gainSplit"; strategy: Lane }
  | { kind: "recaptureTax"; strategy: Lane; year: Year }
  | { kind: "capitalGainsTax"; strategy: Lane; year: Year }
  | { kind: "niit"; strategy: Lane; year: Year }
  | { kind: "stateTax"; strategy: Lane; year: Year }
  | { kind: "saleTaxTotal"; strategy: Lane; year: Year }
  | { kind: "netProceeds"; strategy: Lane }
  | { kind: "boot" }
  | { kind: "deferredGain" }
  | { kind: "replacementBasis" }
  | { kind: "adjustedBasis"; strategy: Lane; propertyId: string; year: Year }
  | { kind: "accumulatedDepreciation"; strategy: Lane; propertyId: string; year: Year }
  | { kind: "annualDepreciation"; strategy: Lane; propertyId: string; year: Year }
  | { kind: "recaptureExposure"; strategy: Lane; propertyId: string; year: Year }
  | { kind: "propertyValue"; strategy: Lane; propertyId: string; year: Year }
  | { kind: "loanPayment"; strategy: Lane; propertyId: string; loanId: string; year: Year }
  | {
      kind: "monteCarlo";
      strategy: Lane;
      year: Year;
      percentile: 10 | 50 | 90;
      seed: number;
      paths: number;
      value: Cents;
    };

export interface TraceContext {
  household: Household;
  results: ScenarioResults;
}

// ───────────────────────────── Small builders ─────────────────────────────

const money = (cents: Cents, exact = false): TraceValue => ({ kind: "money", cents, exact });
const percent = (value: Rate, digits = 1): TraceValue => ({ kind: "percent", value, digits });
const num = (value: number, unit?: string, digits = 0): TraceValue => ({
  kind: "number",
  value,
  unit,
  digits,
});
const text = (t: string): TraceValue => ({ kind: "text", text: t });

const usd = (c: Cents): string => formatUsd(c);
const LANE_LABEL: Record<Lane, string> = { hold: "Hold", sell: "Sell", exchange: "1031 Exchange" };

export function laneLabel(lane: Lane): string {
  return LANE_LABEL[lane];
}

function refId(ref: TraceRef): string {
  return JSON.stringify(ref);
}

function lane(ctx: TraceContext, strategy: Lane): StrategyResult {
  return ctx.results[strategy];
}

function row(ctx: TraceContext, strategy: Lane, y: Year): YearRow {
  const r = lane(ctx, strategy).years.find((x) => x.year === y);
  if (!r) throw new RangeError(`No ${strategy} row for ${y}`);
  return r;
}

function timeline(ctx: TraceContext, strategy: Lane, propertyId: string): PropertyTimeline {
  const p = lane(ctx, strategy).properties.find((x) => x.id === propertyId);
  if (!p) throw new RangeError(`No property ${propertyId} in ${strategy}`);
  return p;
}

function propRow(p: PropertyTimeline, y: Year): PropertyYearRow {
  const r = p.rows.find((x) => x.year === y);
  if (!r) throw new RangeError(`No row for ${p.id} in ${y}`);
  return r;
}

function taxContextFor(ctx: TraceContext, y: Year): TaxContext {
  const { household } = ctx;
  return createTaxContext(
    getTaxTable(household.market.taxTableYear),
    household.investor,
    household.market,
    y,
  );
}

function taxResult(ctx: TraceContext, strategy: Lane, y: Year): PortfolioTaxResult {
  const t = lane(ctx, strategy).taxByYear.find((x) => x.year === y);
  if (!t) throw new RangeError(`No tax result for ${strategy} ${y}`);
  return t;
}

function trace(
  ref: TraceRef,
  t: Omit<MathTrace, "id" | "notes"> & { notes?: string[] },
): MathTrace {
  return { id: refId(ref), notes: [], ...t };
}

// ───────────────────────────── Resolver ─────────────────────────────

export function resolveTrace(ref: TraceRef, ctx: TraceContext): MathTrace {
  switch (ref.kind) {
    case "netWorthAfterTax":
      return traceNetWorthAfterTax(ref, ctx);
    case "netWorthLiquidated":
      return traceNetWorthLiquidated(ref, ctx);
    case "equity":
      return traceEquity(ref, ctx);
    case "deferredTax":
      return traceDeferredTax(ref, ctx);
    case "cumulativeTaxes":
      return traceCumulativeTaxes(ref, ctx);
    case "cashFlow":
      return traceCashFlow(ref, ctx);
    case "cashAccount":
      return traceCashAccount(ref, ctx);
    case "taxOnOperations":
      return traceTaxOnOperations(ref, ctx);
    case "noi":
      return traceNoi(ref, ctx);
    case "presentValue":
      return tracePresentValue(ref, ctx);
    case "saleGain":
      return traceSaleGain(ref, ctx);
    case "saleBasis":
      return traceSaleBasis(ref, ctx);
    case "gainSplit":
      return traceGainSplit(ref, ctx);
    case "recaptureTax":
      return traceRecaptureTax(ref, ctx);
    case "capitalGainsTax":
      return traceCapitalGainsTax(ref, ctx);
    case "niit":
      return traceNiit(ref, ctx);
    case "stateTax":
      return traceStateTax(ref, ctx);
    case "saleTaxTotal":
      return traceSaleTaxTotal(ref, ctx);
    case "netProceeds":
      return traceNetProceeds(ref, ctx);
    case "boot":
      return traceBoot(ref, ctx);
    case "deferredGain":
      return traceDeferredGain(ref, ctx);
    case "replacementBasis":
      return traceReplacementBasis(ref, ctx);
    case "adjustedBasis":
      return traceAdjustedBasis(ref, ctx);
    case "accumulatedDepreciation":
      return traceAccumulatedDepreciation(ref, ctx);
    case "annualDepreciation":
      return traceAnnualDepreciation(ref, ctx);
    case "recaptureExposure":
      return traceRecaptureExposure(ref, ctx);
    case "propertyValue":
      return tracePropertyValue(ref, ctx);
    case "loanPayment":
      return traceLoanPayment(ref, ctx);
    case "monteCarlo":
      return traceMonteCarlo(ref);
  }
}

// ───────────────────────────── Net worth ─────────────────────────────

function traceNetWorthAfterTax(
  ref: Extract<TraceRef, { kind: "netWorthAfterTax" }>,
  ctx: TraceContext,
): MathTrace {
  const r = row(ctx, ref.strategy, ref.year);
  return trace(ref, {
    title: "After-tax net worth",
    subtitle: `${LANE_LABEL[ref.strategy]}, end of ${ref.year}`,
    result: money(r.netWorthAfterTax),
    formula:
      "After-tax net worth = cash + intermediary funds + (property market value − loan balances)",
    inputs: [
      { label: "Property market value", value: money(r.propertyValue) },
      { label: "Loan balances", value: money(r.loanBalance) },
      {
        label: "Cash account",
        value: money(r.cashBalance),
        ref: { kind: "cashAccount", strategy: ref.strategy, year: ref.year },
      },
      { label: "Funds held by 1031 intermediary", value: money(r.intermediaryFunds) },
    ],
    steps: [
      {
        label: "Equity",
        expression: `${usd(r.propertyValue)} − ${usd(r.loanBalance)}`,
        value: money(r.equity),
        ref: { kind: "equity", strategy: ref.strategy, year: ref.year },
      },
      {
        label: "Add cash and intermediary funds",
        expression: `${usd(r.equity)} + ${usd(r.cashBalance)} + ${usd(r.intermediaryFunds)}`,
        value: money(r.netWorthAfterTax),
      },
    ],
    assumptionIds: ["net-worth", "cash-account"],
    notes: [
      "Taxes already paid are out of the cash account. Taxes you would still owe on a sale are NOT deducted here; see net worth if liquidated.",
    ],
  });
}

function traceNetWorthLiquidated(
  ref: Extract<TraceRef, { kind: "netWorthLiquidated" }>,
  ctx: TraceContext,
): MathTrace {
  const r = row(ctx, ref.strategy, ref.year);
  const stepUp = ref.stepUp === true;
  const deferred = stepUp ? 0 : r.deferredTaxLiability;
  const result = stepUp ? r.netWorthLiquidatedWithStepUp : r.netWorthLiquidated;
  return trace(ref, {
    title: stepUp ? "Net worth if liquidated, with step-up at death" : "Net worth if liquidated",
    subtitle: `${LANE_LABEL[ref.strategy]}, end of ${ref.year}`,
    result: money(result),
    formula: "Net worth if liquidated = after-tax net worth − selling costs − deferred taxes",
    inputs: [
      {
        label: "After-tax net worth",
        value: money(r.netWorthAfterTax),
        ref: { kind: "netWorthAfterTax", strategy: ref.strategy, year: ref.year },
      },
      { label: "Selling costs on remaining properties", value: money(r.liquidationSellingCosts) },
      {
        label: stepUp ? "Deferred taxes (erased by step-up)" : "Deferred taxes",
        value: money(r.deferredTaxLiability),
        ref: { kind: "deferredTax", strategy: ref.strategy, year: ref.year },
      },
    ],
    steps: [
      {
        label: "Subtract selling costs",
        expression: `${usd(r.netWorthAfterTax)} − ${usd(r.liquidationSellingCosts)}`,
        value: money(r.netWorthAfterTax - r.liquidationSellingCosts),
      },
      {
        label: stepUp
          ? "Deferred taxes are zero after a step-up in basis"
          : "Subtract deferred taxes",
        expression: `${usd(r.netWorthAfterTax - r.liquidationSellingCosts)} − ${usd(deferred)}`,
        value: money(result),
      },
    ],
    assumptionIds: stepUp ? ["net-worth", "step-up"] : ["net-worth"],
    notes: stepUp
      ? [
          "Heirs receive a basis equal to fair market value, so deferred gain and depreciation recapture disappear. Selling costs still apply if they sell.",
        ]
      : [],
  });
}

function traceEquity(ref: Extract<TraceRef, { kind: "equity" }>, ctx: TraceContext): MathTrace {
  const r = row(ctx, ref.strategy, ref.year);
  return trace(ref, {
    title: "Equity",
    subtitle: `${LANE_LABEL[ref.strategy]}, end of ${ref.year}`,
    result: money(r.equity),
    formula: "Equity = property market value − loan balances",
    inputs: [
      { label: "Property market value", value: money(r.propertyValue) },
      { label: "Loan balances", value: money(r.loanBalance) },
    ],
    steps: [
      {
        label: "Subtract debt",
        expression: `${usd(r.propertyValue)} − ${usd(r.loanBalance)}`,
        value: money(r.equity),
      },
    ],
    assumptionIds: ["net-worth", "appreciation", "loans"],
  });
}

function traceCashAccount(
  ref: Extract<TraceRef, { kind: "cashAccount" }>,
  ctx: TraceContext,
): MathTrace {
  const r = row(ctx, ref.strategy, ref.year);
  const steps: TraceStep[] = [
    { label: "Opening balance", expression: usd(r.cashOpening), value: money(r.cashOpening) },
    {
      label: "Return on opening balance",
      expression: `${usd(r.cashOpening)} × reinvestment rate`,
      value: money(r.investmentReturn),
    },
    {
      label: "Cash flow before tax",
      expression: `${usd(r.noi)} NOI − ${usd(r.debtService)} debt service`,
      value: money(r.cashFlowBeforeTax),
      ref: { kind: "cashFlow", strategy: ref.strategy, year: ref.year },
    },
    { label: "Capital improvements", expression: `− ${usd(r.capex)}`, value: money(-r.capex) },
    { label: "HELOC draws", expression: `+ ${usd(r.helocDraws)}`, value: money(r.helocDraws) },
    {
      label: "Taxes paid (net of any benefit)",
      expression: `− ${usd(r.taxesPaid)}`,
      value: money(-r.taxesPaid),
      ref: { kind: "cumulativeTaxes", strategy: ref.strategy, year: ref.year },
    },
    {
      label: "Sale proceeds before tax",
      expression: `+ ${usd(r.saleNetProceeds)}`,
      value: money(r.saleNetProceeds),
    },
    {
      label: "Exchange cash in/out",
      expression: `+ ${usd(r.exchangeCashFlow)}`,
      value: money(r.exchangeCashFlow),
    },
    { label: "Closing balance", expression: "Sum of the lines above", value: money(r.cashClosing) },
  ];
  return trace(ref, {
    title: "Cash account",
    subtitle: `${LANE_LABEL[ref.strategy]}, ${ref.year}`,
    result: money(r.cashClosing),
    formula:
      "Closing cash = opening + return + cash flow − improvements + HELOC draws − taxes + sale proceeds + exchange cash",
    inputs: [],
    steps,
    assumptionIds: ["cash-account"],
    notes: [
      "A negative balance means you funded shortfalls out of pocket; it is charged the same rate as an opportunity cost.",
    ],
  });
}

function tracePresentValue(
  ref: Extract<TraceRef, { kind: "presentValue" }>,
  ctx: TraceContext,
): MathTrace {
  const h = lane(ctx, ref.strategy).horizon;
  const rate = ctx.household.investor.discountRate;
  const n = ctx.household.investor.horizonYears;
  const factor = powInt(1 + rate, n);
  return trace(ref, {
    title: "Present value of horizon net worth",
    subtitle: LANE_LABEL[ref.strategy],
    result: money(h.presentValueOfLiquidatedNetWorth),
    formula: "PV = net worth if liquidated at the horizon ÷ (1 + discount rate) ^ years",
    inputs: [
      {
        label: "Net worth if liquidated at the horizon",
        value: money(h.netWorthLiquidated),
        ref: { kind: "netWorthLiquidated", strategy: ref.strategy, year: h.year },
      },
      { label: "Discount rate", value: percent(rate) },
      { label: "Years", value: num(n, "years") },
    ],
    steps: [
      {
        label: "Discount factor",
        expression: `(1 + ${formatPercent(rate)}) ^ ${n}`,
        value: num(factor, "×", 4),
      },
      {
        label: "Divide",
        expression: `${usd(h.netWorthLiquidated)} ÷ ${formatNumber(factor, 4)}`,
        value: money(h.presentValueOfLiquidatedNetWorth),
      },
    ],
    assumptionIds: ["discounting"],
  });
}

// ───────────────────────────── Taxes ─────────────────────────────

function traceDeferredTax(
  ref: Extract<TraceRef, { kind: "deferredTax" }>,
  ctx: TraceContext,
): MathTrace {
  const res = lane(ctx, ref.strategy);
  const t = res.years.find((y) => y.year === ref.year)?.t ?? 0;
  const liq = res.liquidationByYear[t];
  if (!liq) throw new RangeError("missing liquidation detail");
  const steps: TraceStep[] = [];
  for (const s of [...liq.sales, ...liq.pendingExchangeSales]) {
    const pending = liq.pendingExchangeSales.includes(s);
    steps.push({
      label: `${s.propertyName}${pending ? " (exchange not yet closed)" : ""}`,
      expression: `${usd(s.salePrice)} price − ${usd(s.sellingCosts)} costs − ${usd(s.adjustedBasis)} adjusted basis`,
      value: money(s.totalGain),
    });
  }
  const c = liq.classification;
  steps.push(
    {
      label: "Net gain across properties",
      expression: "Sum of gains above",
      value: money(c.netGain),
    },
    {
      label: "Unrecaptured §1250 gain (recapture)",
      expression: "min(net gain, depreciation taken)",
      value: money(c.unrecaptured1250Gain),
    },
    {
      label: "Long-term capital gain",
      expression: `${usd(c.netGain)} − ${usd(c.unrecaptured1250Gain)}`,
      value: money(c.longTermCapitalGain),
    },
  );
  if (c.ordinaryLoss1231 > 0) {
    steps.push({
      label: "Net §1231 loss (ordinary)",
      expression: usd(c.ordinaryLoss1231),
      value: money(c.ordinaryLoss1231),
    });
  }
  steps.push(
    {
      label: "Tax on recapture",
      expression: "Federal tax added by this slice of income",
      value: money(liq.tax.depreciationRecaptureTax),
    },
    {
      label: "Tax on capital gain",
      expression: "Federal tax added by this slice of income",
      value: money(liq.tax.capitalGainsTax),
    },
    {
      label: "Net investment income tax",
      expression: "3.8% of the lesser of NII and MAGI above the threshold",
      value: money(liq.tax.netInvestmentIncomeTax),
    },
    { label: "State tax", expression: "State rate × gain", value: money(liq.tax.stateTax) },
  );
  if (liq.tax.ordinaryLossBenefit !== 0) {
    steps.push({
      label: "Benefit of ordinary loss",
      expression: "Tax saved by the loss",
      value: money(liq.tax.ordinaryLossBenefit),
    });
  }
  steps.push({
    label: "Deferred tax liability",
    expression: "Sum of the tax lines above",
    value: money(liq.deferredTax),
  });
  return trace(ref, {
    title: "Deferred tax liability",
    subtitle: `${LANE_LABEL[ref.strategy]}, if everything were sold Dec 31, ${ref.year}`,
    result: money(liq.deferredTax),
    formula:
      "Deferred tax = incremental tax if every remaining property were sold on Dec 31, stacked on that year's income",
    inputs: [{ label: "Selling costs if sold", value: money(liq.sellingCosts) }],
    steps,
    assumptionIds: [
      "net-worth",
      "unrecaptured-1250",
      "capital-gains-brackets",
      "niit",
      "state-tax",
      "incremental-tax",
    ],
    notes: [
      "The hypothetical sale is stacked on top of the year's actual income, so higher brackets, the 20% rate and NIIT are applied where they would be.",
      "A step-up in basis at death would erase this amount.",
    ],
  });
}

function traceCumulativeTaxes(
  ref: Extract<TraceRef, { kind: "cumulativeTaxes" }>,
  ctx: TraceContext,
): MathTrace {
  const res = lane(ctx, ref.strategy);
  const upto = res.years.filter((y) => y.t >= 1 && y.year <= ref.year);
  let ops = 0;
  let sale = 0;
  for (const y of upto) {
    ops += y.taxOnOperations;
    sale += y.taxOnSale;
  }
  const last = upto[upto.length - 1];
  return trace(ref, {
    title: "Cumulative taxes paid",
    subtitle: `${LANE_LABEL[ref.strategy]}, through ${ref.year}`,
    result: money(last?.cumulativeTaxesPaid ?? 0),
    formula: "Cumulative taxes = Σ (tax on rental operations + tax on sale) for each year",
    inputs: [{ label: "Years included", value: num(upto.length, "years") }],
    steps: [
      {
        label: "Tax on rental operations",
        expression: `Σ over ${upto.length} years`,
        value: money(ops),
      },
      {
        label: "Tax on sales and boot",
        expression: `Σ over ${upto.length} years`,
        value: money(sale),
      },
      { label: "Total", expression: `${usd(ops)} + ${usd(sale)}`, value: money(ops + sale) },
    ],
    assumptionIds: ["incremental-tax", "ordinary-brackets", "unrecaptured-1250"],
    notes: [
      "Each year's tax is the household's tax with the portfolio minus its tax on other income alone. A negative number is a tax benefit from rental losses.",
    ],
  });
}

function traceTaxOnOperations(
  ref: Extract<TraceRef, { kind: "taxOnOperations" }>,
  ctx: TraceContext,
): MathTrace {
  const tax = taxResult(ctx, ref.strategy, ref.year);
  const r = row(ctx, ref.strategy, ref.year);
  return trace(ref, {
    title: "Tax on rental operations",
    subtitle: `${LANE_LABEL[ref.strategy]}, ${ref.year}`,
    result: money(tax.taxOnOperations),
    formula:
      "Tax on operations = household tax with net rental income − household tax on other income alone",
    inputs: [
      { label: "Net rental income (after depreciation)", value: money(r.taxableRentalIncome) },
      { label: "Other taxable income", value: money(tax.baseline.federal.ordinaryIncome) },
    ],
    steps: [
      {
        label: "Tax on other income only",
        expression: "Federal + NIIT + state",
        value: money(tax.baseline.total),
      },
      {
        label: "Tax with rental income",
        expression: "Federal + NIIT + state",
        value: money(tax.withOperations.total),
      },
      {
        label: "Difference",
        expression: `${usd(tax.withOperations.total)} − ${usd(tax.baseline.total)}`,
        value: money(tax.taxOnOperations),
      },
    ],
    assumptionIds: ["incremental-tax", "ordinary-brackets", "bracket-indexation", "depreciation"],
    notes:
      r.taxableRentalIncome < 0
        ? [
            "Rental income is negative (depreciation and interest exceed NOI), so the loss lowers tax on other income. Passive loss limits are not modelled.",
          ]
        : [],
  });
}

function saleTaxYear(ctx: TraceContext, strategy: Lane, y: Year): PortfolioTaxResult {
  return taxResult(ctx, strategy, y);
}

function traceRecaptureTax(
  ref: Extract<TraceRef, { kind: "recaptureTax" }>,
  ctx: TraceContext,
): MathTrace {
  const tax = saleTaxYear(ctx, ref.strategy, ref.year);
  const tc = taxContextFor(ctx, ref.year);
  const fed = tax.withAll.federal;
  const brackets = tc.table.ordinaryBrackets[tc.filingStatus];
  const slices = taxSlices(
    brackets,
    fed.taxableOrdinary,
    fed.taxableOrdinary + fed.unrecaptured1250,
    tc.table.unrecaptured1250MaxRate,
  );
  return trace(ref, {
    title: "Tax on depreciation recapture",
    subtitle: `${LANE_LABEL[ref.strategy]}, ${ref.year}: unrecaptured §1250 gain`,
    result: money(tax.breakdown.depreciationRecaptureTax),
    formula: "Each slice of recapture is taxed at the lesser of its ordinary bracket rate and 25%",
    inputs: [
      { label: "Unrecaptured §1250 gain", value: money(fed.unrecaptured1250) },
      {
        label: "Taxable ordinary income before the gain",
        value: money(fed.taxableOrdinary),
        note: "Recapture stacks on top of this.",
      },
      { label: "Maximum rate on recapture", value: percent(tc.table.unrecaptured1250MaxRate, 0) },
    ],
    steps: [
      ...slices.map((s) => ({
        label: `${usd(s.from)} to ${usd(s.to)}`,
        expression: `${usd(s.to - s.from)} × ${formatPercent(s.rate, 0)}${s.rate < s.bracketRate ? ` (bracket ${formatPercent(s.bracketRate, 0)} capped)` : ""}`,
        value: money(s.tax),
      })),
      {
        label: "Tax on recapture",
        expression: "Sum of slices",
        value: money(tax.breakdown.depreciationRecaptureTax),
      },
    ],
    assumptionIds: ["unrecaptured-1250", "ordinary-brackets", "bracket-indexation"],
    notes: ["Brackets shown are the table year's brackets indexed for inflation to this year."],
  });
}

function traceCapitalGainsTax(
  ref: Extract<TraceRef, { kind: "capitalGainsTax" }>,
  ctx: TraceContext,
): MathTrace {
  const tax = saleTaxYear(ctx, ref.strategy, ref.year);
  const tc = taxContextFor(ctx, ref.year);
  const fed = tax.withAll.federal;
  const start = fed.taxableOrdinary + fed.unrecaptured1250;
  const slices = longTermGainSlices(tc.table, tc.filingStatus, start, start + fed.longTermGain);
  return trace(ref, {
    title: "Tax on long-term capital gain",
    subtitle: `${LANE_LABEL[ref.strategy]}, ${ref.year}`,
    result: money(tax.breakdown.capitalGainsTax),
    formula: "Gain stacked above ordinary income and recapture is taxed at 0%, 15% or 20% by band",
    inputs: [
      { label: "Long-term capital gain", value: money(fed.longTermGain) },
      { label: "Income already stacked beneath it", value: money(start) },
    ],
    steps: [
      ...slices.map((s) => ({
        label: `${usd(s.from)} to ${usd(s.to)}`,
        expression: `${usd(s.to - s.from)} × ${formatPercent(s.rate, 0)}`,
        value: money(s.tax),
      })),
      {
        label: "Tax on capital gain",
        expression: "Sum of bands",
        value: money(tax.breakdown.capitalGainsTax),
      },
    ],
    assumptionIds: ["capital-gains-brackets", "bracket-indexation"],
  });
}

function traceNiit(ref: Extract<TraceRef, { kind: "niit" }>, ctx: TraceContext): MathTrace {
  const tax = saleTaxYear(ctx, ref.strategy, ref.year);
  const tc = taxContextFor(ctx, ref.year);
  const threshold = tc.table.niit.magiThreshold[tc.filingStatus];
  const a = tax.withAll;
  const excess = Math.max(0, a.magi - threshold);
  const base = Math.min(Math.max(0, a.netInvestmentIncome), excess);
  return trace(ref, {
    title: "Net Investment Income Tax",
    subtitle: `${LANE_LABEL[ref.strategy]}, ${ref.year}`,
    result: money(tax.breakdown.netInvestmentIncomeTax),
    formula: "NIIT = 3.8% × min(net investment income, MAGI − threshold)",
    inputs: [
      {
        label: "Net investment income",
        value: money(a.netInvestmentIncome),
        note: "Net rental income plus recognised gains.",
      },
      { label: "Modified AGI", value: money(a.magi) },
      { label: "Threshold (not inflation-indexed)", value: money(threshold) },
    ],
    steps: [
      {
        label: "MAGI above threshold",
        expression: `${usd(a.magi)} − ${usd(threshold)}`,
        value: money(excess),
      },
      {
        label: "Taxable base",
        expression: `min(${usd(a.netInvestmentIncome)}, ${usd(excess)})`,
        value: money(base),
      },
      { label: "NIIT on the whole year", expression: `${usd(base)} × 3.8%`, value: money(a.niit) },
      {
        label: "Less NIIT already owed without the sale",
        expression: usd(tax.withOperations.niit),
        value: money(tax.withOperations.niit),
      },
      {
        label: "NIIT caused by the sale",
        expression: "Difference",
        value: money(tax.breakdown.netInvestmentIncomeTax),
      },
    ],
    assumptionIds: ["niit"],
  });
}

function traceStateTax(ref: Extract<TraceRef, { kind: "stateTax" }>, ctx: TraceContext): MathTrace {
  const tax = saleTaxYear(ctx, ref.strategy, ref.year);
  const rate = ctx.household.investor.stateTaxRate;
  return trace(ref, {
    title: "State income tax on the sale",
    subtitle: `${LANE_LABEL[ref.strategy]}, ${ref.year}`,
    result: money(tax.breakdown.stateTax),
    formula: "State tax = flat state rate × recognised gain",
    inputs: [{ label: "State tax rate", value: percent(rate, 2) }],
    steps: [
      {
        label: "Tax on the whole year",
        expression: `${formatPercent(rate, 2)} × ${usd(tax.withAll.federal.ordinaryIncome + tax.withAll.federal.unrecaptured1250 + tax.withAll.federal.longTermGain)}`,
        value: money(tax.withAll.state),
      },
      {
        label: "Less state tax without the sale",
        expression: usd(tax.withOperations.state),
        value: money(tax.withOperations.state),
      },
      {
        label: "State tax caused by the sale",
        expression: "Difference",
        value: money(tax.breakdown.stateTax),
      },
    ],
    assumptionIds: ["state-tax"],
  });
}

function traceSaleTaxTotal(
  ref: Extract<TraceRef, { kind: "saleTaxTotal" }>,
  ctx: TraceContext,
): MathTrace {
  const tax = saleTaxYear(ctx, ref.strategy, ref.year);
  const b = tax.breakdown;
  return trace(ref, {
    title: "Total tax caused by the sale",
    subtitle: `${LANE_LABEL[ref.strategy]}, ${ref.year}`,
    result: money(b.total),
    formula:
      "Sale tax = recapture tax + capital gains tax + NIIT + state tax (− benefit of any ordinary loss)",
    inputs: [],
    steps: [
      {
        label: "Depreciation recapture tax",
        expression: "Up to 25% on unrecaptured §1250 gain",
        value: money(b.depreciationRecaptureTax),
        ref: { kind: "recaptureTax", strategy: ref.strategy, year: ref.year },
      },
      {
        label: "Capital gains tax",
        expression: "0/15/20% on remaining gain",
        value: money(b.capitalGainsTax),
        ref: { kind: "capitalGainsTax", strategy: ref.strategy, year: ref.year },
      },
      {
        label: "Net investment income tax",
        expression: "3.8% above the MAGI threshold",
        value: money(b.netInvestmentIncomeTax),
        ref: { kind: "niit", strategy: ref.strategy, year: ref.year },
      },
      {
        label: "State tax",
        expression: "Flat state rate × gain",
        value: money(b.stateTax),
        ref: { kind: "stateTax", strategy: ref.strategy, year: ref.year },
      },
      ...(b.ordinaryLossBenefit !== 0
        ? [
            {
              label: "Benefit of ordinary (§1231) loss",
              expression: "Tax saved",
              value: money(b.ordinaryLossBenefit),
            },
          ]
        : []),
      { label: "Total", expression: "Sum", value: money(b.total) },
    ],
    assumptionIds: [
      "incremental-tax",
      "unrecaptured-1250",
      "capital-gains-brackets",
      "niit",
      "state-tax",
    ],
  });
}

// ───────────────────────────── Sale ─────────────────────────────

function findSale(ctx: TraceContext, strategy: Lane, propertyId: string) {
  const res = lane(ctx, strategy);
  const list = res.sale?.properties ?? res.exchange?.relinquished ?? [];
  const sale = list.find((s) => s.propertyId === propertyId);
  if (!sale) throw new RangeError(`No sale of ${propertyId} in ${strategy}`);
  return sale;
}

function saleYear(ctx: TraceContext, strategy: Lane): Year {
  const res = lane(ctx, strategy);
  return res.sale?.year ?? res.exchange?.sellYear ?? ctx.household.market.asOfYear;
}

function traceSaleGain(ref: Extract<TraceRef, { kind: "saleGain" }>, ctx: TraceContext): MathTrace {
  const s = findSale(ctx, ref.strategy, ref.propertyId);
  const rate = s.salePrice > 0 ? s.sellingCosts / s.salePrice : 0;
  return trace(ref, {
    title: `Gain on sale of ${s.propertyName}`,
    subtitle: `${LANE_LABEL[ref.strategy]}, ${saleYear(ctx, ref.strategy)}`,
    result: money(s.totalGain),
    formula: "Total gain = (sale price − selling costs) − adjusted basis",
    inputs: [
      { label: "Sale price", value: money(s.salePrice) },
      {
        label: "Selling costs",
        value: money(s.sellingCosts),
        note: `${formatPercent(rate)} of price`,
      },
      {
        label: "Adjusted basis",
        value: money(s.adjustedBasis),
        ref: { kind: "saleBasis", strategy: ref.strategy, propertyId: ref.propertyId },
      },
      { label: "Depreciation taken", value: money(s.accumulatedDepreciation) },
    ],
    steps: [
      {
        label: "Amount realized",
        expression: `${usd(s.salePrice)} − ${usd(s.sellingCosts)}`,
        value: money(s.amountRealized),
      },
      {
        label: "Total gain",
        expression: `${usd(s.amountRealized)} − ${usd(s.adjustedBasis)}`,
        value: money(s.totalGain),
      },
      {
        label: "Of which depreciation recapture",
        expression: `min(${usd(Math.max(0, s.totalGain))}, ${usd(s.accumulatedDepreciation)})`,
        value: money(Math.min(Math.max(0, s.totalGain), s.accumulatedDepreciation)),
      },
    ],
    assumptionIds: ["sale-gain", "adjusted-basis", "unrecaptured-1250", "section-1231-loss"],
    notes:
      s.totalGain < 0
        ? [
            "The sale is below adjusted basis, so this is an ordinary Section 1231 loss. Note depreciation lowers basis: a sale below purchase price can still be a gain.",
          ]
        : [],
  });
}

function traceSaleBasis(
  ref: Extract<TraceRef, { kind: "saleBasis" }>,
  ctx: TraceContext,
): MathTrace {
  const p = timeline(ctx, "hold", ref.propertyId);
  const y = saleYear(ctx, ref.strategy);
  const at = midMonthIndex(y, 12);
  const s = findSale(ctx, ref.strategy, ref.propertyId);
  const inService = p.tranches.filter(
    (t) => midMonthIndex(t.placedInServiceYear, t.placedInServiceMonth) <= at,
  );
  const cost = p.landBasis + inService.reduce((t, x) => t + x.basis, 0);
  const steps: TraceStep[] = [
    { label: "Land (never depreciated)", expression: usd(p.landBasis), value: money(p.landBasis) },
  ];
  for (const t of inService) {
    const acc = accumulatedDepreciationAt(t, at);
    steps.push({
      label: t.label,
      expression: `${usd(t.basis)} − ${usd(acc)} depreciation (${accruedHalfMonths(t, at)} of ${t.lifeHalfMonths} half-months)`,
      value: money(t.basis - acc),
    });
  }
  steps.push({
    label: "Adjusted basis at sale",
    expression: "Land + remaining basis of each tranche",
    value: money(s.adjustedBasis),
  });
  return trace(ref, {
    title: "Adjusted basis at sale",
    subtitle: `${p.name}, December ${y}`,
    result: money(s.adjustedBasis),
    formula: "Adjusted basis = land + building + improvements − accumulated depreciation",
    inputs: [
      {
        label: "Cost basis in service",
        value: money(cost),
        note: "Purchase price + closing costs + improvements",
      },
    ],
    steps,
    assumptionIds: ["adjusted-basis", "depreciation"],
    notes: ["The month of sale gets half a month of depreciation (mid-month convention)."],
  });
}

function traceGainSplit(
  ref: Extract<TraceRef, { kind: "gainSplit" }>,
  ctx: TraceContext,
): MathTrace {
  const res = lane(ctx, ref.strategy);
  const sale = res.sale;
  if (!sale) throw new RangeError("no sale to explain");
  const c = sale.classification;
  const capacity = sale.properties.reduce(
    (t, p) => t + Math.min(Math.max(0, p.totalGain), p.accumulatedDepreciation),
    0,
  );
  return trace(ref, {
    title: "How the gain splits",
    subtitle: `${LANE_LABEL[ref.strategy]}, ${sale.year}`,
    result: money(c.netGain),
    formula:
      "Net gain = unrecaptured §1250 gain (up to depreciation taken) + long-term capital gain",
    inputs: sale.properties.map((p) => ({
      label: p.propertyName,
      value: money(p.totalGain),
      ref: { kind: "saleGain", strategy: ref.strategy, propertyId: p.propertyId } as TraceRef,
    })),
    steps: [
      {
        label: "Net gain across properties sold",
        expression: "Sum of gains (losses net against gains)",
        value: money(c.netGain),
      },
      {
        label: "Depreciation that could be recaptured",
        expression: "Σ min(gain, depreciation) per property with a gain",
        value: money(capacity),
      },
      {
        label: "Unrecaptured §1250 gain",
        expression: `min(${usd(c.netGain)}, ${usd(capacity)})`,
        value: money(c.unrecaptured1250Gain),
      },
      {
        label: "Long-term capital gain",
        expression: `${usd(c.netGain)} − ${usd(c.unrecaptured1250Gain)}`,
        value: money(c.longTermCapitalGain),
      },
      ...(c.ordinaryLoss1231 > 0
        ? [
            {
              label: "Ordinary §1231 loss",
              expression: usd(c.ordinaryLoss1231),
              value: money(c.ordinaryLoss1231),
            },
          ]
        : []),
    ],
    assumptionIds: ["unrecaptured-1250", "capital-gains-brackets", "section-1231-loss"],
  });
}

function traceNetProceeds(
  ref: Extract<TraceRef, { kind: "netProceeds" }>,
  ctx: TraceContext,
): MathTrace {
  const sale = lane(ctx, ref.strategy).sale;
  if (!sale) throw new RangeError("no sale to explain");
  return trace(ref, {
    title: "Net proceeds after tax",
    subtitle: `${LANE_LABEL[ref.strategy]}, ${sale.year}`,
    result: money(sale.netProceedsAfterTax),
    formula: "Net proceeds = sale price − selling costs − loan payoff − taxes caused by the sale",
    inputs: [],
    steps: [
      {
        label: "Sale price",
        expression: sale.properties.map((p) => usd(p.salePrice)).join(" + "),
        value: money(sale.totalSalePrice),
      },
      {
        label: "Selling costs",
        expression: `− ${usd(sale.totalSellingCosts)}`,
        value: money(-sale.totalSellingCosts),
      },
      {
        label: "Loan payoff",
        expression: `− ${usd(sale.totalLoanPayoff)}`,
        value: money(-sale.totalLoanPayoff),
      },
      { label: "Proceeds before tax", expression: "Sum", value: money(sale.netProceedsBeforeTax) },
      {
        label: "Taxes caused by the sale",
        expression: `− ${usd(sale.tax.total)}`,
        value: money(-sale.tax.total),
        ref: { kind: "saleTaxTotal", strategy: ref.strategy, year: sale.year },
      },
      {
        label: "Net proceeds after tax",
        expression: `${usd(sale.netProceedsBeforeTax)} − ${usd(sale.tax.total)}`,
        value: money(sale.netProceedsAfterTax),
      },
    ],
    assumptionIds: ["sale-gain", "incremental-tax"],
  });
}

// ───────────────────────────── 1031 exchange ─────────────────────────────

function mustExchange(ctx: TraceContext) {
  const ex = ctx.results.exchange.exchange;
  if (!ex) throw new RangeError("no exchange to explain");
  return ex;
}

function traceBoot(ref: Extract<TraceRef, { kind: "boot" }>, ctx: TraceContext): MathTrace {
  const b = mustExchange(ctx).boot;
  return trace(ref, {
    title: "Boot (taxable part of the exchange)",
    subtitle: "1031 Exchange",
    result: money(b.totalBoot),
    formula:
      "Total boot = cash boot + mortgage boot; recognised gain = min(realized gain, total boot)",
    inputs: [
      {
        label: "Funds held by the intermediary",
        value: money(b.fundsHeldByIntermediary),
        note: "Price − selling costs − loan payoff",
      },
      {
        label: "Replacement price + closing costs",
        value: money(b.replacementPrice + b.replacementClosingCosts),
      },
      { label: "New debt on the replacement", value: money(b.newDebt) },
      { label: "Debt relieved on the sale", value: money(b.debtRelieved) },
    ],
    steps: [
      {
        label: "Cash needed beyond new debt",
        expression: `${usd(b.replacementPrice + b.replacementClosingCosts)} − ${usd(b.newDebt)}`,
        value: money(b.replacementPrice + b.replacementClosingCosts - b.newDebt),
      },
      {
        label: "Intermediary cash applied",
        expression: "min(funds available, cash needed)",
        value: money(b.cashApplied),
      },
      {
        label: "Extra cash you pay in",
        expression: "Cash needed − cash applied (+ cash at the sale closing)",
        value: money(b.additionalCashPaidIn),
      },
      {
        label: "Cash boot",
        expression: `${usd(b.fundsHeldByIntermediary)} − ${usd(b.cashApplied)}`,
        value: money(b.cashBoot),
      },
      {
        label: "Mortgage boot",
        expression: `max(0, ${usd(b.debtRelieved)} − ${usd(b.newDebt)} − ${usd(b.additionalCashPaidIn)})`,
        value: money(b.mortgageBoot),
      },
      {
        label: "Total boot",
        expression: `${usd(b.cashBoot)} + ${usd(b.mortgageBoot)}`,
        value: money(b.totalBoot),
      },
      {
        label: "Recognised (taxable) gain",
        expression: `min(${usd(b.realizedGain)}, ${usd(b.totalBoot)})`,
        value: money(b.recognizedGain),
      },
    ],
    assumptionIds: ["exchange-1031", "exchange-boot"],
    notes:
      b.totalBoot > 0
        ? [
            "Boot is taxed in the year the replacement closes, first as unrecaptured §1250 gain up to depreciation taken.",
          ]
        : ["No boot: value, equity and debt were all replaced, so the entire gain is deferred."],
  });
}

function traceDeferredGain(
  ref: Extract<TraceRef, { kind: "deferredGain" }>,
  ctx: TraceContext,
): MathTrace {
  const b = mustExchange(ctx).boot;
  return trace(ref, {
    title: "Deferred gain",
    subtitle: "1031 Exchange",
    result: money(b.deferredGain),
    formula: "Deferred gain = realized gain − recognised gain",
    inputs: [
      { label: "Realized gain on the properties exchanged", value: money(b.realizedGain) },
      { label: "Recognised gain (boot)", value: money(b.recognizedGain), ref: { kind: "boot" } },
    ],
    steps: [
      {
        label: "Deferred gain",
        expression: `${usd(b.realizedGain)} − ${usd(b.recognizedGain)}`,
        value: money(b.deferredGain),
      },
    ],
    assumptionIds: ["exchange-1031"],
    notes: [
      "Deferred, not forgiven: it is built into the replacement property's lower basis and becomes taxable when that property is sold (unless basis is stepped up at death).",
    ],
  });
}

function traceReplacementBasis(
  ref: Extract<TraceRef, { kind: "replacementBasis" }>,
  ctx: TraceContext,
): MathTrace {
  const ex = mustExchange(ctx);
  const b = ex.boot;
  const adjustedGivenUp = ex.relinquished.reduce((t, s) => t + s.adjustedBasis, 0);
  return trace(ref, {
    title: "Replacement property basis",
    subtitle: ex.replacementName,
    result: money(b.replacementBasis),
    formula:
      "Basis = adjusted basis given up + cash paid in + new debt − debt relieved − cash boot + recognised gain",
    inputs: [
      { label: "Adjusted basis given up", value: money(adjustedGivenUp) },
      { label: "Cash paid in", value: money(b.additionalCashPaidIn) },
      { label: "New debt", value: money(b.newDebt) },
      { label: "Debt relieved", value: money(b.debtRelieved) },
      { label: "Cash boot", value: money(b.cashBoot) },
      { label: "Recognised gain", value: money(b.recognizedGain) },
    ],
    steps: [
      {
        label: "Method 1: carryover plus new money",
        expression: `${usd(adjustedGivenUp)} + ${usd(b.additionalCashPaidIn)} + ${usd(b.newDebt)} − ${usd(b.debtRelieved)} − ${usd(b.cashBoot)} + ${usd(b.recognizedGain)}`,
        value: money(b.replacementBasis),
      },
      {
        label: "Method 2: price + costs − deferred gain",
        expression: `${usd(b.replacementPrice)} + ${usd(b.replacementClosingCosts)} − ${usd(b.deferredGain)}`,
        value: money(b.replacementBasisCrossCheck),
      },
      {
        label: "Check",
        expression: "Both methods agree to the cent",
        value: text(b.replacementBasis === b.replacementBasisCrossCheck ? "Agree" : "MISMATCH"),
      },
    ],
    assumptionIds: ["exchange-1031", "exchange-carryover"],
    notes: [
      `Depreciation history of ${usd(ex.carriedDepreciation)} carries over, so a later sale still triggers recapture on it.`,
    ],
  });
}

// ───────────────────────────── Property level ─────────────────────────────

function traceAdjustedBasis(
  ref: Extract<TraceRef, { kind: "adjustedBasis" }>,
  ctx: TraceContext,
): MathTrace {
  const p = timeline(ctx, ref.strategy, ref.propertyId);
  const r = propRow(p, ref.year);
  const at = yearEndIndex(ref.year);
  const inService = p.tranches.filter(
    (t) => midMonthIndex(t.placedInServiceYear, t.placedInServiceMonth) <= at,
  );
  const steps: TraceStep[] = [
    { label: "Land (never depreciated)", expression: usd(p.landBasis), value: money(p.landBasis) },
  ];
  for (const t of inService) {
    const acc = accumulatedDepreciationAt(t, at);
    steps.push({
      label: t.label,
      expression: `${usd(t.basis)} − ${usd(acc)}`,
      value: money(t.basis - acc),
    });
  }
  steps.push({ label: "Adjusted basis", expression: "Sum", value: money(r.adjustedBasis) });
  return trace(ref, {
    title: "Adjusted basis",
    subtitle: `${p.name}, end of ${ref.year}`,
    result: money(r.adjustedBasis),
    formula:
      "Adjusted basis = purchase price + closing costs + improvements − accumulated depreciation",
    inputs: [
      {
        label: "Accumulated depreciation",
        value: money(r.accumulatedDepreciation),
        ref: {
          kind: "accumulatedDepreciation",
          strategy: ref.strategy,
          propertyId: ref.propertyId,
          year: ref.year,
        },
      },
    ],
    steps,
    assumptionIds: ["adjusted-basis", "depreciation"],
  });
}

function traceAccumulatedDepreciation(
  ref: Extract<TraceRef, { kind: "accumulatedDepreciation" }>,
  ctx: TraceContext,
): MathTrace {
  const p = timeline(ctx, ref.strategy, ref.propertyId);
  const r = propRow(p, ref.year);
  const at = yearEndIndex(ref.year);
  const steps: TraceStep[] = [];
  for (const t of p.tranches) {
    const half = accruedHalfMonths(t, at);
    if (half === 0) continue;
    steps.push({
      label: t.label,
      expression: `${usd(t.basis)} × ${half} ÷ ${t.lifeHalfMonths} half-months`,
      value: money(accumulatedDepreciationAt(t, at)),
    });
  }
  steps.push({
    label: "Accumulated depreciation",
    expression: "Sum",
    value: money(r.accumulatedDepreciation),
  });
  return trace(ref, {
    title: "Accumulated depreciation",
    subtitle: `${p.name}, end of ${ref.year}`,
    result: money(r.accumulatedDepreciation),
    formula: "For each tranche: depreciable basis × half-months in service ÷ 660 (27.5 years × 24)",
    inputs: [],
    steps,
    assumptionIds: ["depreciation"],
    notes: [
      "Mid-month convention: a tranche placed in service in January earns 23 half-months in year one; one placed in December earns 1.",
    ],
  });
}

function traceAnnualDepreciation(
  ref: Extract<TraceRef, { kind: "annualDepreciation" }>,
  ctx: TraceContext,
): MathTrace {
  const p = timeline(ctx, ref.strategy, ref.propertyId);
  const r = propRow(p, ref.year);
  const endAt = yearEndIndex(ref.year);
  const startAt = yearEndIndex(ref.year - 1);
  const steps: TraceStep[] = [];
  for (const t of p.tranches) {
    const d = accumulatedDepreciationAt(t, endAt) - accumulatedDepreciationAt(t, startAt);
    if (d !== 0)
      steps.push({
        label: t.label,
        expression: `${usd(accumulatedDepreciationAt(t, endAt))} − ${usd(accumulatedDepreciationAt(t, startAt))}`,
        value: money(d),
      });
  }
  steps.push({ label: "Depreciation this year", expression: "Sum", value: money(r.depreciation) });
  return trace(ref, {
    title: "Depreciation deduction",
    subtitle: `${p.name}, ${ref.year}`,
    result: money(r.depreciation),
    formula: "Annual depreciation = accumulated at year end − accumulated at prior year end",
    inputs: [],
    steps,
    assumptionIds: ["depreciation"],
    notes:
      r.monthsOwned < 12 || r.status === "sold"
        ? [
            "In the year of a sale the deduction stops at the mid-point of December (mid-month convention).",
          ]
        : [],
  });
}

function traceRecaptureExposure(
  ref: Extract<TraceRef, { kind: "recaptureExposure" }>,
  ctx: TraceContext,
): MathTrace {
  const p = timeline(ctx, ref.strategy, ref.propertyId);
  const r = propRow(p, ref.year);
  return trace(ref, {
    title: "Depreciation recapture exposure",
    subtitle: `${p.name}, if sold Dec ${ref.year}`,
    result: money(r.recaptureExposure),
    formula: "Exposure = min(gain if sold, depreciation taken)",
    inputs: [
      {
        label: "Gain if sold",
        value: money(r.unrealizedGain),
        note: "Market value − selling costs − adjusted basis",
      },
      {
        label: "Depreciation taken",
        value: money(r.accumulatedDepreciation + p.carriedDepreciation),
        ref: {
          kind: "accumulatedDepreciation",
          strategy: ref.strategy,
          propertyId: ref.propertyId,
          year: ref.year,
        },
      },
    ],
    steps: [
      {
        label: "Recapture exposure",
        expression: `min(${usd(Math.max(0, r.unrealizedGain))}, ${usd(r.accumulatedDepreciation + p.carriedDepreciation)})`,
        value: money(r.recaptureExposure),
      },
      {
        label: "Estimated tax at the 25% maximum",
        expression: `${usd(r.recaptureExposure)} × 25%`,
        value: money(Math.round(r.recaptureExposure * 0.25)),
      },
    ],
    assumptionIds: ["unrecaptured-1250"],
    notes: [
      "The actual rate is the lesser of your bracket rate and 25% for each slice; see a sale for the exact computation.",
    ],
  });
}

function tracePropertyValue(
  ref: Extract<TraceRef, { kind: "propertyValue" }>,
  ctx: TraceContext,
): MathTrace {
  const p = timeline(ctx, ref.strategy, ref.propertyId);
  const r = propRow(p, ref.year);
  const prev = p.rows.find((x) => x.year === ref.year - 1);
  return trace(ref, {
    title: "Market value",
    subtitle: `${p.name}, end of ${ref.year}`,
    result: money(r.marketValue),
    formula:
      "Value this year = last year's value × (1 + appreciation rate) + value added by improvements",
    inputs: [{ label: "Last year's value", value: money(prev?.marketValue ?? 0) }],
    steps: [
      {
        label: "Market value",
        expression: "Compounded at this property's appreciation rate",
        value: money(r.marketValue),
      },
    ],
    assumptionIds: ["appreciation"],
  });
}

function traceNoi(ref: Extract<TraceRef, { kind: "noi" }>, ctx: TraceContext): MathTrace {
  const r = ref.propertyId
    ? propRow(timeline(ctx, ref.strategy, ref.propertyId), ref.year)
    : row(ctx, ref.strategy, ref.year);
  const egi = r.effectiveGrossIncome;
  const opex = r.operatingExpenses;
  return trace(ref, {
    title: "Net operating income",
    subtitle: `${LANE_LABEL[ref.strategy]}, ${ref.year}`,
    result: money(r.noi),
    formula: "NOI = effective gross income − operating expenses − property tax − insurance",
    inputs: [
      { label: "Effective gross income (rent after vacancy)", value: money(egi) },
      { label: "Operating expenses, property tax and insurance", value: money(opex) },
    ],
    steps: [{ label: "NOI", expression: `${usd(egi)} − ${usd(opex)}`, value: money(r.noi) }],
    assumptionIds: ["operations"],
  });
}

function traceCashFlow(ref: Extract<TraceRef, { kind: "cashFlow" }>, ctx: TraceContext): MathTrace {
  const r = row(ctx, ref.strategy, ref.year);
  return trace(ref, {
    title: "Cash flow",
    subtitle: `${LANE_LABEL[ref.strategy]}, ${ref.year}`,
    result: money(r.cashFlowAfterTax),
    formula: "Cash flow after tax = NOI − debt service − tax on rental operations",
    inputs: [
      {
        label: "Net operating income",
        value: money(r.noi),
        ref: { kind: "noi", strategy: ref.strategy, year: ref.year },
      },
      { label: "Interest paid", value: money(r.interestPaid) },
      { label: "Principal paid", value: money(r.principalPaid) },
      {
        label: "Tax on rental operations",
        value: money(r.taxOnOperations),
        ref: { kind: "taxOnOperations", strategy: ref.strategy, year: ref.year },
      },
    ],
    steps: [
      {
        label: "Debt service",
        expression: `${usd(r.interestPaid)} + ${usd(r.principalPaid)}`,
        value: money(r.debtService),
      },
      {
        label: "Cash flow before tax",
        expression: `${usd(r.noi)} − ${usd(r.debtService)}`,
        value: money(r.cashFlowBeforeTax),
      },
      {
        label: "Cash flow after tax",
        expression: `${usd(r.cashFlowBeforeTax)} − ${usd(r.taxOnOperations)}`,
        value: money(r.cashFlowAfterTax),
      },
    ],
    assumptionIds: ["operations", "loans", "incremental-tax"],
    notes:
      r.cashFlowBeforeTax < 0
        ? ["Negative: debt service exceeds NOI. The shortfall is funded from the cash account."]
        : [],
  });
}

// ───────────────────────────── Loans ─────────────────────────────

function traceLoanPayment(
  ref: Extract<TraceRef, { kind: "loanPayment" }>,
  ctx: TraceContext,
): MathTrace {
  const p = timeline(ctx, ref.strategy, ref.propertyId);
  const schedule = p.loanSchedules.find((s) => s.loanId === ref.loanId);
  const lr: LoanYearRow | undefined = schedule?.rows.find((r) => r.year === ref.year);
  if (!schedule || !lr) throw new RangeError("loan row not found");
  const phaseText: Record<LoanYearRow["phase"], string> = {
    notStarted: "Not yet originated",
    fixed: "Fixed-rate amortising",
    interestOnly: "Interest-only period",
    amortizing: "Amortising after the interest-only period",
    armFixed: "ARM initial fixed period",
    armAdjusting: "ARM adjusting annually",
    helocDraw: "HELOC draw period (interest only)",
    helocRepay: "HELOC repayment period",
    paidOff: "Paid off",
  };
  const notes: string[] = [];
  if (lr.capHit === "periodic")
    notes.push(
      "The adjustment cap limited this year's reset: the fully indexed rate was higher than the cap allows.",
    );
  if (lr.capHit === "lifetime") notes.push("The lifetime cap limited the rate this year.");
  return trace(ref, {
    title: `${schedule.label}: ${ref.year}`,
    subtitle: `${p.name}: ${phaseText[lr.phase]}`,
    result: money(lr.payment),
    formula:
      "Payment = interest + principal; interest = balance × rate ÷ 12 each month, rounded to the cent",
    inputs: [
      { label: "Opening balance", value: money(lr.openingBalance) },
      { label: "Rate at year end", value: percent(lr.endRate, 3) },
      { label: "Draws", value: money(lr.draws) },
    ],
    steps: [
      { label: "Interest", expression: "Σ monthly interest", value: money(lr.interest) },
      { label: "Principal", expression: "Σ monthly principal", value: money(lr.principal) },
      {
        label: "Total payments",
        expression: `${usd(lr.interest)} + ${usd(lr.principal)}`,
        value: money(lr.payment),
      },
      {
        label: "Closing balance",
        expression: `${usd(lr.openingBalance)} + ${usd(lr.draws)} − ${usd(lr.principal)}`,
        value: money(lr.closingBalance),
      },
    ],
    assumptionIds: ["loans"],
    notes,
  });
}

function traceMonteCarlo(ref: Extract<TraceRef, { kind: "monteCarlo" }>): MathTrace {
  return trace(ref, {
    title: `${ref.percentile}th percentile net worth`,
    subtitle: `${LANE_LABEL[ref.strategy]}, ${ref.year}`,
    result: money(ref.value),
    formula: `The value below which ${ref.percentile}% of ${ref.paths} simulated market paths fall`,
    inputs: [
      { label: "Random seed", value: num(ref.seed) },
      { label: "Paths", value: num(ref.paths) },
    ],
    steps: [
      {
        label: "Run every path",
        expression:
          "Each path re-runs all three strategies with its own appreciation and rent-growth shocks",
        value: text(`${ref.paths} paths`),
      },
      {
        label: "Sort net worth if liquidated for that year",
        expression: "Ascending order across paths",
        value: text("Sorted"),
      },
      {
        label: `Take the ${ref.percentile}th percentile`,
        expression: "Linear interpolation between the two nearest paths",
        value: money(ref.value),
      },
    ],
    assumptionIds: ["monte-carlo"],
    notes: ["Same seed, same result: change the seed to see a different set of paths."],
  });
}

/** Whether a TraceRef would resolve (used by the UI to decide whether to render a figure as clickable). */
export function canResolveTrace(ref: TraceRef, ctx: TraceContext): boolean {
  try {
    resolveTrace(ref, ctx);
    return true;
  } catch {
    return false;
  }
}
