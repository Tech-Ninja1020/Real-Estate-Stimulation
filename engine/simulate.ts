/**
 * Year-by-year simulation of a household under one strategy (Hold, Sell or 1031 Exchange).
 *
 * Time model
 *  - Opening balance sheet is Dec 31 of `market.asOfYear` (row t = 0). Projection year k covers
 *    calendar year `asOfYear + k`, k = 1..horizonYears. All rows are year-end snapshots.
 *  - Sales close on December 31 of the sale year. Properties owned all year earn a full year of
 *    operations; the mid-month convention gives half a month of depreciation in December.
 *  - A 1031 replacement property is owned from the first full month after its closing date.
 *
 * Cash account
 *  - All operating cash flow, capex, HELOC draws, taxes and sale proceeds flow through one cash
 *    account that earns the after-tax reinvestment rate. A negative balance means the investor has
 *    funded shortfalls out of pocket; it is charged the same rate (opportunity cost).
 *
 * Net worth
 *  - netWorthAfterTax   = cash + intermediary funds + Σ(market value − loans)
 *  - netWorthLiquidated = netWorthAfterTax − selling costs − deferred taxes on a hypothetical sale
 */

import { getTaxTable } from "@/data/tax";
import { applyRate, maxCents, powInt, toCents } from "./money";
import type { Cents } from "./money";
import { endOfYear, formatIsoDate } from "./dates";
import {
  allocatePurchaseBasis,
  buildTranchesForProperty,
  midMonthIndex,
  trancheForImprovement,
  yearEndIndex,
} from "./depreciation";
import { applyBootRules, buildExchangeCalendar, buildReplacementLot } from "./exchange";
import type { ExchangeCalendar, RelinquishedLot } from "./exchange";
import { buildLoanSchedule, sumLoanRows } from "./loans";
import {
  adjustedBasisAt,
  classifyGains,
  computeSaleGain,
  computeUnrecapturedSection1250Gain,
  ownDepreciationAt,
} from "./sale";
import type { TaxLot } from "./sale";
import { NO_COMPONENTS, computePortfolioTax, createTaxContext, incrementalTaxOfGains } from "./tax";
import type { TaxContext } from "./tax";
import type {
  CapitalImprovement,
  ExchangeStrategy,
  ExchangeSummary,
  GainClassification,
  Household,
  HoldingStatus,
  HorizonSummary,
  LiquidationDetail,
  Loan,
  LoanSchedule,
  OperatingExpense,
  PortfolioTaxComponents,
  PortfolioTaxResult,
  Property,
  PropertyTimeline,
  PropertyYearRow,
  ReplacementAssumptions,
  SaleGainResult,
  SaleSummary,
  SaleTaxBreakdown,
  ScenarioConfig,
  ScenarioResults,
  SimulationOptions,
  Strategy,
  StrategyResult,
  StrategySet,
  TimelineEvent,
  Year,
  YearRow,
} from "./types";

// ───────────────────────────── Caches shared across runs ─────────────────────────────

/** Inputs that do not depend on the strategy or market shocks; reused across Monte Carlo paths. */
export interface SimulationCache {
  taxContexts: Map<Year, TaxContext>;
  baselineTax: Map<Year, PortfolioTaxResult>;
  loanSchedules: Map<string, LoanSchedule[]>;
}

export function createSimulationCache(household: Household): SimulationCache {
  const { market, investor } = household;
  const table = getTaxTable(market.taxTableYear);
  const end = market.asOfYear + investor.horizonYears;
  const taxContexts = new Map<Year, TaxContext>();
  const baselineTax = new Map<Year, PortfolioTaxResult>();
  for (let y = market.asOfYear; y <= end; y++) {
    const ctx = createTaxContext(table, investor, market, y);
    taxContexts.set(y, ctx);
    baselineTax.set(y, computePortfolioTax(ctx, NO_COMPONENTS));
  }
  const loanSchedules = new Map<string, LoanSchedule[]>();
  for (const p of household.properties) {
    loanSchedules.set(
      p.id,
      p.loans.map((l) => buildLoanSchedule(l, market, end)),
    );
  }
  return { taxContexts, baselineTax, loanSchedules };
}

// ───────────────────────────── Holdings ─────────────────────────────

interface Holding {
  id: string;
  name: string;
  origin: "original" | "replacement";
  /** First calendar position (year, month) of ownership; originals are owned before the as-of date. */
  ownedFromYear: Year;
  ownedFromMonth: number;
  soldYear: Year | null;
  // economics (annual amounts valid for the NEXT year to be simulated)
  value: Cents;
  rent: Cents;
  fixedOpex: Cents;
  propertyTax: Cents;
  insurance: Cents;
  operating: OperatingExpense;
  vacancyRate: number;
  appreciationRate: number;
  rentGrowthRate: number;
  expenseGrowthRate: number;
  sellingCostRate: number;
  futureImprovements: CapitalImprovement[];
  lot: TaxLot;
  loanSchedules: LoanSchedule[];
  rows: PropertyYearRow[];
  /** Replacement only: price at acquisition (value path starts there). */
  acquisitionPrice: Cents | null;
}

function createOriginalHolding(p: Property, asOfYear: Year, schedules: LoanSchedule[]): Holding {
  const allTranches = buildTranchesForProperty(p);
  const inService = allTranches.filter((t) => t.placedInServiceYear <= asOfYear);
  const { land } = allocatePurchaseBasis(p);
  const opex: Cents = p.operating.kind === "fixed" ? p.operating.annual : 0;
  return {
    id: p.id,
    name: p.name,
    origin: "original",
    ownedFromYear: p.purchaseYear,
    ownedFromMonth: p.purchaseMonth,
    soldYear: null,
    value: p.currentValue,
    rent: p.annualRent,
    fixedOpex: opex,
    propertyTax: p.propertyTax,
    insurance: p.insurance,
    operating: p.operating,
    vacancyRate: p.vacancyRate,
    appreciationRate: p.appreciationRate,
    rentGrowthRate: p.rentGrowthRate,
    expenseGrowthRate: p.expenseGrowthRate,
    sellingCostRate: p.sellingCostRate,
    futureImprovements: p.improvements.filter((i) => i.year > asOfYear),
    lot: { landBasis: land, tranches: inService, carriedDepreciation: 0 },
    loanSchedules: schedules,
    rows: [],
    acquisitionPrice: null,
  };
}

function monthsOwnedIn(h: Holding, year: Year): number {
  if (h.soldYear !== null && year > h.soldYear) return 0;
  if (year < h.ownedFromYear) return 0;
  if (year === h.ownedFromYear && h.origin === "replacement") return 12 - h.ownedFromMonth + 1;
  return 12;
}

function isOwnedAtYearEnd(h: Holding, year: Year): boolean {
  return monthsOwnedIn(h, year) > 0 && (h.soldYear === null || h.soldYear > year);
}

// ───────────────────────────── Strategy helpers ─────────────────────────────

/** Resolve a strategy against the horizon; returns the (clamped) years and any warnings. */
function resolveStrategy(
  household: Household,
  strategy: Strategy,
  warnings: string[],
): { sellYear: Year | null; ids: Set<string> } {
  const first = household.market.asOfYear + 1;
  const last = household.market.asOfYear + household.investor.horizonYears;
  if (strategy.kind === "hold") return { sellYear: null, ids: new Set() };
  const latest = strategy.kind === "exchange" ? last - 1 : last;
  const clamped = Math.min(latest, Math.max(first, strategy.sellYear));
  if (clamped !== strategy.sellYear) {
    warnings.push(
      `Sale year ${strategy.sellYear} is outside the allowed range; using ${clamped} instead.`,
    );
  }
  const known = new Set(household.properties.map((p) => p.id));
  const ids = new Set(strategy.propertyIds.filter((id) => known.has(id)));
  return { sellYear: clamped, ids };
}

function sum(values: readonly number[]): number {
  let t = 0;
  for (const v of values) t += v;
  return t;
}

// ───────────────────────────── Core simulation ─────────────────────────────

export function simulateStrategy(
  household: Household,
  strategy: Strategy,
  options: SimulationOptions & { cache?: SimulationCache } = {},
): StrategyResult {
  const { market, investor } = household;
  const asOf = market.asOfYear;
  const horizon = investor.horizonYears;
  const lastYear = asOf + horizon;
  const cache = options.cache ?? createSimulationCache(household);
  const shocks = options.shocks;
  const warnings: string[] = [];
  const events: TimelineEvent[] = [];

  const { sellYear, ids } = resolveStrategy(household, strategy, warnings);

  // Exchange plumbing
  const exchangeStrategy: ExchangeStrategy | null = strategy.kind === "exchange" ? strategy : null;
  let calendar: ExchangeCalendar | null = null;
  let exchangeCompleted = false;
  if (exchangeStrategy && sellYear !== null) {
    calendar = buildExchangeCalendar(
      sellYear,
      exchangeStrategy.identificationDays,
      exchangeStrategy.closingDays,
    );
    exchangeCompleted = calendar.valid;
    if (!calendar.valid) {
      warnings.push(
        "The 45-day identification or 180-day closing window was missed, so the exchange fails and the sale is fully taxable.",
      );
    }
  }
  const sellsAsTaxable =
    strategy.kind === "sell" || (exchangeStrategy !== null && !exchangeCompleted);

  // Holdings
  const holdings: Holding[] = household.properties.map((p) =>
    createOriginalHolding(p, asOf, cache.loanSchedules.get(p.id) ?? []),
  );

  // Results being assembled
  const years: YearRow[] = [];
  const taxByYear: PortfolioTaxResult[] = [];
  const liquidationByYear: LiquidationDetail[] = [];
  let cash = 0;
  let intermediaryFunds = 0;
  let cumulativeTaxes = 0;
  let saleSummary: SaleSummary | null = null;
  let exchangeSummary: ExchangeSummary | null = null;
  let pendingExchange: {
    relinquished: SaleGainResult[];
    lots: RelinquishedLot[];
    calendar: ExchangeCalendar;
  } | null = null;

  // t = 0 opening row
  {
    const ctx = mustGet(cache.taxContexts, asOf);
    const base = mustGet(cache.baselineTax, asOf);
    taxByYear.push(base);
    const rows = holdings.map((h) => makePropertyRow(h, asOf, 0));
    for (const [i, h] of holdings.entries()) {
      const r = rows[i];
      if (r) h.rows.push(r);
    }
    const liq = hypotheticalLiquidation(ctx, base, NO_COMPONENTS, holdings, asOf, []);
    liquidationByYear.push(liq);
    const equity = sum(rows.map((r) => r.equity));
    years.push(openingYearRow(asOf, rows, equity, liq.deferredTax, liq.sellingCosts));
  }

  for (let k = 1; k <= horizon; k++) {
    const year = asOf + k;
    const ctx = mustGet(cache.taxContexts, year);
    const baseline = mustGet(cache.baselineTax, year);
    const shockA = shocks?.appreciation[k] ?? 0;
    const shockG = shocks?.rentGrowth[k] ?? 0;

    // Replacement acquisition happens at the start of the acquisition year.
    let exchangeCashFlow = 0;
    let bootClassification: GainClassification | null = null;
    if (pendingExchange && exchangeStrategy && pendingExchange.calendar.firstOwnedYear === year) {
      const acquired = acquireReplacement(
        household,
        exchangeStrategy.replacement,
        exchangeStrategy.cashOutAtClosing,
        pendingExchange,
        asOf,
        lastYear,
      );
      holdings.push(acquired.holding);
      exchangeCashFlow += acquired.cashFlow;
      bootClassification = acquired.boot.recognizedClassification;
      intermediaryFunds = 0;
      exchangeSummary = {
        sellYear: sellYear ?? year - 1,
        acquisitionYear: year,
        relinquished: pendingExchange.relinquished,
        boot: acquired.boot,
        timeline: pendingExchange.calendar.timeline,
        bootTax: NO_TAX,
        replacementName: acquired.holding.name,
        carriedDepreciation: acquired.holding.lot.carriedDepreciation,
        completed: true,
      };
      events.push({
        kind: "replacementClosing",
        date: pendingExchange.calendar.timeline.replacementClosing,
        year: Number(pendingExchange.calendar.timeline.replacementClosing.slice(0, 4)),
        label: `Replacement closes: ${acquired.holding.name}`,
        propertyId: acquired.holding.id,
      });
      pendingExchange = null;
    }

    // Capital improvements dated this year join the basis before depreciation is computed.
    let capex = 0;
    for (const h of holdings) {
      if (monthsOwnedIn(h, year) === 0) continue;
      for (const imp of h.futureImprovements.filter((i) => i.year === year)) {
        h.lot.tranches.push(trancheForImprovement(h.id, imp));
        capex += imp.amount;
        events.push({
          kind: "improvement",
          date: formatIsoDate({ year: imp.year, month: imp.month, day: 15 }),
          year: imp.year,
          label: `${h.name}: ${imp.description}`,
          propertyId: h.id,
        });
      }
    }

    const soldHoldings: Holding[] =
      strategy.kind !== "hold" && sellYear === year
        ? holdings.filter((h) => h.origin === "original" && ids.has(h.id) && h.soldYear === null)
        : [];

    // ── Operations, per holding ──
    let totalEgi = 0;
    let totalOpex = 0;
    let totalNoi = 0;
    let totalInterest = 0;
    let totalPrincipal = 0;
    let totalDraws = 0;
    let totalDepreciation = 0;
    let totalTaxableRental = 0;

    const saleResults: SaleGainResult[] = [];
    for (const h of holdings) {
      const months = monthsOwnedIn(h, year);
      const isSoldNow = soldHoldings.includes(h);
      if (months === 0) {
        h.rows.push(emptyRow(h, year, k));
        continue;
      }
      const frac = months / 12;
      const egi = toCents(h.rent * (1 - h.vacancyRate) * frac);
      const opex =
        h.operating.kind === "percentOfRent"
          ? applyRate(egi, h.operating.rate)
          : toCents(h.fixedOpex * frac);
      const tax = toCents(h.propertyTax * frac);
      const ins = toCents(h.insurance * frac);
      const noi = egi - opex - tax - ins;
      const loans = sumLoanRows(h.loanSchedules, year);
      const depEnd = isSoldNow
        ? ownDepreciationAt(h.lot, midMonthIndex(year, 12))
        : ownDepreciationAt(h.lot, yearEndIndex(year));
      const depPrev = ownDepreciationAt(h.lot, yearEndIndex(year - 1));
      const depreciation = depEnd - depPrev;
      const improvementsThisYear = h.futureImprovements.filter((i) => i.year === year);
      const propertyCapex = sum(improvementsThisYear.map((i) => i.amount));
      const valueAdded = sum(improvementsThisYear.map((i) => i.valueAdded ?? 0));

      // Market value at year end
      const growth = Math.max(-0.9, h.appreciationRate + shockA);
      const isAcquisitionYear = h.origin === "replacement" && year === h.ownedFromYear;
      let valueEnd: Cents;
      if (isAcquisitionYear && h.acquisitionPrice !== null) {
        valueEnd = h.acquisitionPrice + toCents(h.acquisitionPrice * growth * frac);
      } else {
        valueEnd = h.value + applyRate(h.value, growth);
      }
      valueEnd += valueAdded;

      totalEgi += egi;
      totalOpex += opex + tax + ins;
      totalNoi += noi;
      totalInterest += loans.interest;
      totalPrincipal += loans.principal;
      totalDraws += loans.draws;
      totalDepreciation += depreciation;
      const taxableRental = noi - loans.interest - depreciation;
      totalTaxableRental += taxableRental;

      let status: HoldingStatus = "owned";
      let marketValue = valueEnd;
      let loanBalance = loans.balance;
      if (isSoldNow) {
        const sale = computeSaleGain({
          propertyId: h.id,
          propertyName: h.name,
          salePrice: valueEnd,
          sellingCostRate: h.sellingCostRate,
          loanPayoff: loans.balance,
          lot: h.lot,
          at: midMonthIndex(year, 12),
        });
        saleResults.push(sale);
        h.soldYear = year;
        status = "sold";
        marketValue = 0;
        loanBalance = 0;
      }

      const atEnd = yearEndIndex(year);
      const accDep = ownDepreciationAt(h.lot, atEnd);
      const adjBasis = adjustedBasisAt(h.lot, atEnd);
      const unreal = liquidationGain(h, valueEnd, loans.balance, year);
      h.rows.push({
        year,
        t: k,
        status,
        monthsOwned: months,
        marketValue,
        loanBalance,
        equity: marketValue - loanBalance,
        effectiveGrossIncome: egi,
        operatingExpenses: opex + tax + ins,
        noi,
        interestPaid: loans.interest,
        principalPaid: loans.principal,
        debtService: loans.interest + loans.principal,
        cashFlowBeforeTax: noi - loans.interest - loans.principal,
        capex: propertyCapex,
        helocDraws: loans.draws,
        depreciation,
        accumulatedDepreciation: accDep,
        adjustedBasis: adjBasis,
        taxableRentalIncome: taxableRental,
        unrealizedGain: status === "sold" ? 0 : unreal.gain,
        recaptureExposure: status === "sold" ? 0 : unreal.recapture,
      });

      // Roll the economics forward to next year.
      h.value = valueEnd;
      h.rent = h.rent + applyRate(h.rent, Math.max(-0.9, h.rentGrowthRate + shockG));
      h.fixedOpex = h.fixedOpex + applyRate(h.fixedOpex, h.expenseGrowthRate);
      h.propertyTax = h.propertyTax + applyRate(h.propertyTax, h.expenseGrowthRate);
      h.insurance = h.insurance + applyRate(h.insurance, h.expenseGrowthRate);
    }

    // ── Sale or exchange events this year ──
    let components: PortfolioTaxComponents = {
      netRentalIncome: totalTaxableRental,
      ordinaryLoss1231: 0,
      unrecaptured1250Gain: 0,
      longTermCapitalGain: 0,
    };
    let saleNetProceeds = 0;
    if (saleResults.length > 0 && sellsAsTaxable) {
      const classification = classifyGains(saleResults);
      components = {
        ...components,
        ordinaryLoss1231: classification.ordinaryLoss1231,
        unrecaptured1250Gain: classification.unrecaptured1250Gain,
        longTermCapitalGain: classification.longTermCapitalGain,
      };
      saleNetProceeds = sum(saleResults.map((s) => s.netProceedsBeforeTax));
      saleSummary = { ...buildSaleSummary(year, saleResults, classification), tax: NO_TAX };
      for (const s of saleResults) {
        events.push({
          kind: "sale",
          date: formatIsoDate(endOfYear(year)),
          year,
          label: `Sell ${s.propertyName}`,
          propertyId: s.propertyId,
        });
      }
    } else if (saleResults.length > 0 && exchangeStrategy && calendar) {
      // Valid exchange: proceeds go to the qualified intermediary; gain is deferred.
      const lots: RelinquishedLot[] = soldHoldings.map((h) => ({
        lot: h.lot,
        at: midMonthIndex(year, 12),
      }));
      pendingExchange = { relinquished: saleResults, lots, calendar };
      const net = sum(saleResults.map((s) => s.netProceedsBeforeTax));
      intermediaryFunds = maxCents(0, net);
      exchangeCashFlow -= maxCents(0, -net);
      for (const s of saleResults) {
        events.push({
          kind: "sale",
          date: formatIsoDate(endOfYear(year)),
          year,
          label: `Exchange out of ${s.propertyName}`,
          propertyId: s.propertyId,
        });
      }
      const t = calendar.timeline;
      events.push(
        {
          kind: "identification",
          date: t.identificationDeadline,
          year: Number(t.identificationDeadline.slice(0, 4)),
          label: "45-day identification deadline",
        },
        {
          kind: "exchangeDeadline",
          date: t.exchangeDeadline,
          year: Number(t.exchangeDeadline.slice(0, 4)),
          label: "180-day closing deadline",
        },
      );
    }

    // Boot recognised in the acquisition year is taxed that year.
    if (bootClassification) {
      components = {
        ...components,
        ordinaryLoss1231: components.ordinaryLoss1231 + bootClassification.ordinaryLoss1231,
        unrecaptured1250Gain:
          components.unrecaptured1250Gain + bootClassification.unrecaptured1250Gain,
        longTermCapitalGain:
          components.longTermCapitalGain + bootClassification.longTermCapitalGain,
      };
    }

    // ── Household tax ──
    const portfolioTax = computePortfolioTax(ctx, components, baseline);
    taxByYear.push(portfolioTax);
    const taxesPaid = portfolioTax.total;
    cumulativeTaxes += taxesPaid;
    if (saleSummary && saleSummary.year === year) {
      saleSummary = {
        ...saleSummary,
        tax: portfolioTax.breakdown,
        netProceedsAfterTax: saleSummary.netProceedsBeforeTax - portfolioTax.taxOnSale,
      };
    }
    if (exchangeSummary && exchangeSummary.acquisitionYear === year) {
      exchangeSummary = { ...exchangeSummary, bootTax: portfolioTax.breakdown };
    }

    // ── Cash account ──
    const cashOpening = cash;
    const investmentReturn = applyRate(cashOpening, investor.reinvestmentReturnRate);
    const cashFlowBeforeTax = totalNoi - totalInterest - totalPrincipal;
    cash =
      cashOpening +
      investmentReturn +
      cashFlowBeforeTax -
      capex +
      totalDraws -
      taxesPaid +
      saleNetProceeds +
      exchangeCashFlow;

    // ── Balance sheet & liquidation ──
    const owned = holdings.filter((h) => isOwnedAtYearEnd(h, year));
    const propertyValue = sum(owned.map((h) => h.value));
    const loanBalance = sum(owned.map((h) => sumLoanRows(h.loanSchedules, year).balance));
    const equity = propertyValue - loanBalance;
    const liquidation = hypotheticalLiquidation(
      ctx,
      portfolioTax,
      components,
      holdings,
      year,
      pendingExchange ? pendingExchange.relinquished : [],
    );
    const netWorthAfterTax = equity + cash + intermediaryFunds;

    liquidationByYear.push(liquidation);
    const accumulated = sum(
      holdings
        .filter((h) => isOwnedAtYearEnd(h, year))
        .map((h) => ownDepreciationAt(h.lot, yearEndIndex(year))),
    );
    const adjustedBasis = sum(
      holdings
        .filter((h) => isOwnedAtYearEnd(h, year))
        .map((h) => adjustedBasisAt(h.lot, yearEndIndex(year))),
    );

    years.push({
      year,
      t: k,
      propertyValue,
      loanBalance,
      equity,
      cashBalance: cash,
      intermediaryFunds,
      effectiveGrossIncome: totalEgi,
      operatingExpenses: totalOpex,
      noi: totalNoi,
      interestPaid: totalInterest,
      principalPaid: totalPrincipal,
      debtService: totalInterest + totalPrincipal,
      cashFlowBeforeTax,
      taxOnOperations: portfolioTax.taxOnOperations,
      cashFlowAfterTax: cashFlowBeforeTax - portfolioTax.taxOnOperations,
      capex,
      helocDraws: totalDraws,
      depreciation: totalDepreciation,
      accumulatedDepreciation: accumulated,
      adjustedBasis,
      taxableRentalIncome: totalTaxableRental,
      taxOnSale: portfolioTax.taxOnSale,
      taxesPaid,
      cumulativeTaxesPaid: cumulativeTaxes,
      deferredTaxLiability: liquidation.deferredTax,
      liquidationSellingCosts: liquidation.sellingCosts,
      cashOpening,
      investmentReturn,
      saleNetProceeds,
      exchangeCashFlow,
      cashClosing: cash,
      netWorthAfterTax,
      netWorthLiquidated: netWorthAfterTax - liquidation.sellingCosts - liquidation.deferredTax,
      netWorthLiquidatedWithStepUp: netWorthAfterTax - liquidation.sellingCosts,
    });
  }

  // Exchange that never completed inside the horizon: should not occur after clamping.
  if (pendingExchange) warnings.push("The replacement property closes after the planning horizon.");

  // Failed exchange: report it as an exchange summary with no replacement.
  if (exchangeStrategy && calendar && !exchangeCompleted && saleSummary) {
    exchangeSummary = failedExchangeSummary(sellYear ?? asOf, calendar, saleSummary);
  }

  collectLoanEvents(household, events);
  events.push({
    kind: "horizon",
    date: formatIsoDate(endOfYear(lastYear)),
    year: lastYear,
    label: `${horizon}-year horizon`,
  });
  for (const h of holdings) for (const s of h.loanSchedules) warnings.push(...s.warnings);

  const last = years[years.length - 1];
  if (!last) throw new Error("simulation produced no rows");
  const properties: PropertyTimeline[] = holdings.map((h) => ({
    id: h.id,
    name: h.name,
    origin: h.origin,
    rows: h.rows,
    loanSchedules: h.loanSchedules,
    tranches: h.lot.tranches,
    landBasis: h.lot.landBasis,
    carriedDepreciation: h.lot.carriedDepreciation,
  }));
  const horizonSummary: HorizonSummary = {
    year: last.year,
    netWorthAfterTax: last.netWorthAfterTax,
    netWorthLiquidated: last.netWorthLiquidated,
    netWorthLiquidatedWithStepUp: last.netWorthLiquidatedWithStepUp,
    presentValueOfLiquidatedNetWorth: toCents(
      last.netWorthLiquidated / powInt(1 + investor.discountRate, horizon),
    ),
    cumulativeTaxesPaid: last.cumulativeTaxesPaid,
    deferredTaxLiability: last.deferredTaxLiability,
    cumulativeCashFlowAfterTax: sum(years.map((y) => y.cashFlowAfterTax)),
    equity: last.equity,
    cashBalance: last.cashBalance,
  };

  return {
    strategy,
    years,
    properties,
    events: events.sort((a, b) => a.date.localeCompare(b.date)),
    sale: saleSummary,
    exchange: exchangeSummary,
    taxByYear,
    liquidationByYear,
    horizon: horizonSummary,
    warnings: [...new Set(warnings)],
  };
}

const NO_TAX: SaleTaxBreakdown = {
  depreciationRecaptureTax: 0,
  capitalGainsTax: 0,
  netInvestmentIncomeTax: 0,
  stateTax: 0,
  ordinaryLossBenefit: 0,
  total: 0,
};

function mustGet<K, V>(m: Map<K, V>, k: K): V {
  const v = m.get(k);
  if (v === undefined) throw new Error(`missing cache entry ${String(k)}`);
  return v;
}

// ───────────────────────────── Sale / exchange helpers ─────────────────────────────

function buildSaleSummary(
  year: Year,
  sales: SaleGainResult[],
  classification: GainClassification,
): Omit<SaleSummary, "tax"> {
  const totalSalePrice = sum(sales.map((s) => s.salePrice));
  const totalSellingCosts = sum(sales.map((s) => s.sellingCosts));
  const totalLoanPayoff = sum(sales.map((s) => s.loanPayoff));
  const net = sum(sales.map((s) => s.netProceedsBeforeTax));
  return {
    year,
    properties: sales,
    totalSalePrice,
    totalSellingCosts,
    totalLoanPayoff,
    totalGain: classification.netGain,
    classification,
    netProceedsBeforeTax: net,
    netProceedsAfterTax: net,
  };
}

function failedExchangeSummary(
  sellYear: Year,
  calendar: ExchangeCalendar,
  sale: SaleSummary,
): ExchangeSummary {
  const zero = 0;
  return {
    sellYear,
    acquisitionYear: calendar.firstOwnedYear,
    relinquished: sale.properties,
    boot: {
      realizedGain: sale.totalGain,
      debtRelieved: sale.totalLoanPayoff,
      newDebt: zero,
      replacementPrice: zero,
      replacementClosingCosts: zero,
      fundsHeldByIntermediary: zero,
      cashPaidAtRelinquishedClosing: zero,
      additionalCashPaidIn: zero,
      cashApplied: zero,
      cashBoot: sale.netProceedsBeforeTax,
      mortgageBoot: zero,
      totalBoot: sale.netProceedsBeforeTax,
      recognizedGain: sale.totalGain,
      deferredGain: zero,
      replacementBasis: zero,
      replacementBasisCrossCheck: zero,
      recognizedClassification: sale.classification,
    },
    timeline: calendar.timeline,
    bootTax: sale.tax,
    replacementName: "None (exchange failed)",
    carriedDepreciation: zero,
    completed: false,
  };
}

function acquireReplacement(
  household: Household,
  r: ReplacementAssumptions,
  cashOutAtClosing: Cents,
  pending: { relinquished: SaleGainResult[]; lots: RelinquishedLot[]; calendar: ExchangeCalendar },
  asOf: Year,
  lastYear: Year,
): {
  holding: Holding;
  boot: ReturnType<typeof applyBootRules>;
  cashFlow: Cents;
} {
  const cal = pending.calendar;
  const grossPrice = sum(pending.relinquished.map((s) => s.salePrice));
  const price = toCents(grossPrice * r.priceMultiple);
  const closingCosts = applyRate(price, r.closingCostRate);
  const debtRelieved = sum(pending.relinquished.map((s) => s.loanPayoff));
  let newDebt: Cents;
  switch (r.debt.kind) {
    case "matchRelinquished":
      newDebt = debtRelieved;
      break;
    case "ltv":
      newDebt = applyRate(price, r.debt.ltv);
      break;
    case "amount":
      newDebt = r.debt.amount;
      break;
  }
  const boot = applyBootRules({
    relinquished: pending.relinquished,
    replacementPrice: price,
    replacementClosingCosts: closingCosts,
    newDebt,
    cashOutAtClosing,
  });
  const lot = buildReplacementLot({
    relinquished: pending.lots,
    boot,
    replacementLandValuePct: r.landValuePct,
    firstOwnedYear: cal.firstOwnedYear,
    firstOwnedMonth: cal.firstOwnedMonth,
  });

  const loan: Loan = {
    type: "fixed",
    id: "replacement-loan",
    label: "Replacement loan",
    startYear: cal.firstOwnedYear,
    startMonth: cal.firstOwnedMonth,
    principal: boot.newDebt,
    rate: r.loanRate,
    termYears: r.loanTermYears,
  };
  const schedules = boot.newDebt > 0 ? [buildLoanSchedule(loan, household.market, lastYear)] : [];

  const rent = toCents(price * r.grossRentYield);
  const holding: Holding = {
    id: "replacement",
    name: r.name,
    origin: "replacement",
    ownedFromYear: cal.firstOwnedYear,
    ownedFromMonth: cal.firstOwnedMonth,
    soldYear: null,
    value: price,
    rent,
    fixedOpex: 0,
    propertyTax: applyRate(price, r.propertyTaxRate),
    insurance: applyRate(price, r.insuranceRate),
    operating: { kind: "percentOfRent", rate: r.opexRateOfRent },
    vacancyRate: r.vacancyRate,
    appreciationRate: r.appreciationRate,
    rentGrowthRate: r.rentGrowthRate,
    expenseGrowthRate: r.expenseGrowthRate,
    sellingCostRate: r.sellingCostRate,
    futureImprovements: [],
    lot,
    loanSchedules: schedules,
    rows: [],
    acquisitionPrice: price,
  };
  // Pad earlier years so rows align with the timeline.
  for (let y = asOf; y < cal.firstOwnedYear; y++) holding.rows.push(emptyRow(holding, y, y - asOf));

  const cf = boot.cashBoot - (boot.additionalCashPaidIn - boot.cashPaidAtRelinquishedClosing);
  return { holding, boot, cashFlow: cf };
}

// ───────────────────────────── Liquidation ─────────────────────────────

function liquidationGain(
  h: Holding,
  value: Cents,
  loanBalance: Cents,
  year: Year,
): { gain: Cents; recapture: Cents; costs: Cents } {
  const sale = computeSaleGain({
    propertyId: h.id,
    propertyName: h.name,
    salePrice: value,
    sellingCostRate: h.sellingCostRate,
    loanPayoff: loanBalance,
    lot: h.lot,
    at: midMonthIndex(year, 12),
  });
  return {
    gain: sale.totalGain,
    recapture: computeUnrecapturedSection1250Gain(sale.totalGain, sale.accumulatedDepreciation),
    costs: sale.sellingCosts,
  };
}

/**
 * Tax and selling costs if every property still owned at `year` end were sold on Dec 31. The gain
 * is stacked on top of the year's actual income so brackets, NIIT and state tax all reflect it.
 */
function hypotheticalLiquidation(
  ctx: TaxContext,
  actual: PortfolioTaxResult,
  components: PortfolioTaxComponents,
  holdings: readonly Holding[],
  year: Year,
  pendingExchangeSales: readonly SaleGainResult[],
): LiquidationDetail {
  const sales: SaleGainResult[] = [];
  for (const h of holdings) {
    if (!isOwnedAtYearEnd(h, year)) continue;
    sales.push(
      computeSaleGain({
        propertyId: h.id,
        propertyName: h.name,
        salePrice: h.value,
        sellingCostRate: h.sellingCostRate,
        loanPayoff: sumLoanRows(h.loanSchedules, year).balance,
        lot: h.lot,
        at: midMonthIndex(year, 12),
      }),
    );
  }
  // Gain deferred in an exchange that has not yet closed on its replacement is still owed if the
  // intermediary funds were cashed out; its selling costs were already paid at the sale.
  const classification = classifyGains([...sales, ...pendingExchangeSales]);
  const tax = incrementalTaxOfGains(ctx, components, classification, actual);
  return {
    year,
    sales,
    pendingExchangeSales: [...pendingExchangeSales],
    classification,
    tax,
    sellingCosts: sum(sales.map((s) => s.sellingCosts)),
    deferredTax: tax.total,
  };
}

// ───────────────────────────── Row builders ─────────────────────────────

function makePropertyRow(h: Holding, year: Year, t: number): PropertyYearRow {
  const atEnd = yearEndIndex(year);
  const loan = sumLoanRows(h.loanSchedules, year).balance;
  const unreal = liquidationGain(h, h.value, loan, year);
  return {
    year,
    t,
    status: "owned",
    monthsOwned: 12,
    marketValue: h.value,
    loanBalance: loan,
    equity: h.value - loan,
    effectiveGrossIncome: 0,
    operatingExpenses: 0,
    noi: 0,
    interestPaid: 0,
    principalPaid: 0,
    debtService: 0,
    cashFlowBeforeTax: 0,
    capex: 0,
    helocDraws: 0,
    depreciation: 0,
    accumulatedDepreciation: ownDepreciationAt(h.lot, atEnd),
    adjustedBasis: adjustedBasisAt(h.lot, atEnd),
    taxableRentalIncome: 0,
    unrealizedGain: unreal.gain,
    recaptureExposure: unreal.recapture,
  };
}

function emptyRow(h: Holding, year: Year, t: number): PropertyYearRow {
  const sold = h.soldYear !== null && year > h.soldYear;
  return {
    year,
    t,
    status: sold ? "sold" : "pending",
    monthsOwned: 0,
    marketValue: 0,
    loanBalance: 0,
    equity: 0,
    effectiveGrossIncome: 0,
    operatingExpenses: 0,
    noi: 0,
    interestPaid: 0,
    principalPaid: 0,
    debtService: 0,
    cashFlowBeforeTax: 0,
    capex: 0,
    helocDraws: 0,
    depreciation: 0,
    accumulatedDepreciation: 0,
    adjustedBasis: 0,
    taxableRentalIncome: 0,
    unrealizedGain: 0,
    recaptureExposure: 0,
  };
}

function openingYearRow(
  asOf: Year,
  rows: readonly PropertyYearRow[],
  equity: Cents,
  deferredTax: Cents,
  sellingCosts: Cents,
): YearRow {
  const value = sum(rows.map((r) => r.marketValue));
  const loan = sum(rows.map((r) => r.loanBalance));
  const accumulated = sum(rows.map((r) => r.accumulatedDepreciation));
  const basis = sum(rows.map((r) => r.adjustedBasis));
  return {
    year: asOf,
    t: 0,
    propertyValue: value,
    loanBalance: loan,
    equity,
    cashBalance: 0,
    intermediaryFunds: 0,
    effectiveGrossIncome: 0,
    operatingExpenses: 0,
    noi: 0,
    interestPaid: 0,
    principalPaid: 0,
    debtService: 0,
    cashFlowBeforeTax: 0,
    taxOnOperations: 0,
    cashFlowAfterTax: 0,
    capex: 0,
    helocDraws: 0,
    depreciation: 0,
    accumulatedDepreciation: accumulated,
    adjustedBasis: basis,
    taxableRentalIncome: 0,
    taxOnSale: 0,
    taxesPaid: 0,
    cumulativeTaxesPaid: 0,
    deferredTaxLiability: deferredTax,
    liquidationSellingCosts: sellingCosts,
    cashOpening: 0,
    investmentReturn: 0,
    saleNetProceeds: 0,
    exchangeCashFlow: 0,
    cashClosing: 0,
    netWorthAfterTax: equity,
    netWorthLiquidated: equity - sellingCosts - deferredTax,
    netWorthLiquidatedWithStepUp: equity - sellingCosts,
  };
}

// ───────────────────────────── Timeline events from loans & purchases ─────────────────────────────

function collectLoanEvents(household: Household, events: TimelineEvent[]): void {
  const asOf = household.market.asOfYear;
  const end = asOf + household.investor.horizonYears;
  for (const p of household.properties) {
    {
      events.push({
        kind: "purchase",
        date: formatIsoDate({ year: p.purchaseYear, month: p.purchaseMonth, day: 1 }),
        year: p.purchaseYear,
        label: `Bought ${p.name}`,
        propertyId: p.id,
      });
    }
    for (const loan of p.loans) {
      if (loan.type === "interestOnly") {
        const y = loan.startYear + loan.ioYears;
        if (y > asOf && y <= end) {
          events.push({
            kind: "ioEnds",
            date: formatIsoDate({ year: y, month: loan.startMonth, day: 1 }),
            year: y,
            label: `${p.name}: interest-only period ends`,
            propertyId: p.id,
          });
        }
      }
      if (loan.type === "arm") {
        const y = loan.startYear + loan.fixedYears;
        if (y > asOf && y <= end) {
          events.push({
            kind: "armReset",
            date: formatIsoDate({ year: y, month: loan.startMonth, day: 1 }),
            year: y,
            label: `${p.name}: ARM begins adjusting`,
            propertyId: p.id,
          });
        }
      }
      if (loan.type === "heloc") {
        for (const d of loan.draws) {
          if (d.year > asOf && d.year <= end) {
            events.push({
              kind: "helocDraw",
              date: formatIsoDate({ year: d.year, month: d.month, day: 15 }),
              year: d.year,
              label: `${p.name}: HELOC draw`,
              propertyId: p.id,
            });
          }
        }
      }
    }
  }
}

// ───────────────────────────── Scenario-level API ─────────────────────────────

/** Turn the Scenario Lab's controls into the three strategies. */
export function buildStrategies(config: ScenarioConfig): StrategySet {
  return {
    hold: { kind: "hold" },
    sell: { kind: "sell", sellYear: config.sellYear, propertyIds: [...config.sellPropertyIds] },
    exchange: {
      kind: "exchange",
      sellYear: config.sellYear,
      propertyIds: [...config.sellPropertyIds],
      replacement: config.replacement,
      cashOutAtClosing: config.cashOutAtClosing,
      identificationDays: config.identificationDays,
      closingDays: config.closingDays,
    },
  };
}

/** Run all three strategies on one household with a shared cache. */
export function simulateScenario(
  household: Household,
  strategies: StrategySet,
  options: SimulationOptions & { cache?: SimulationCache } = {},
): ScenarioResults {
  const cache = options.cache ?? createSimulationCache(household);
  const opts = { ...options, cache };
  return {
    hold: simulateStrategy(household, strategies.hold, opts),
    sell: simulateStrategy(household, strategies.sell, opts),
    exchange: simulateStrategy(household, strategies.exchange, opts),
  };
}
