import type { Cents, Rate } from "./money";

export type { Cents, Rate };
export type Year = number;
/** Calendar month, 1 (January) to 12 (December). */
export type Month = number;

// ───────────────────────────── Investor & market ─────────────────────────────

export type FilingStatus = "single" | "mfj" | "mfs" | "hoh";

export type HorizonYears = 5 | 10 | 20 | 30;

export interface InvestorProfile {
  filingStatus: FilingStatus;
  /** Annual ordinary income that is NOT from this portfolio (wages, pension...), today's dollars. */
  otherTaxableIncome: Cents;
  /** Flat state income tax rate applied to net rental income and recognised gains. */
  stateTaxRate: Rate;
  horizonYears: HorizonYears;
  /** Rate used to discount horizon net worth to present value. */
  discountRate: Rate;
  /** After-tax annual return earned on cash and on reinvested sale proceeds. */
  reinvestmentReturnRate: Rate;
}

export interface MarketAssumptions {
  /** "Today": opening balance sheet is as of Dec 31 of this year; projections start the next year. */
  asOfYear: Year;
  /** Which versioned tax table to use (see /data/tax). */
  taxTableYear: number;
  /** Inflation applied to bracket thresholds, standard deduction and other income. */
  inflationRate: Rate;
  /** ARM index (for example SOFR) at `asOfYear`. */
  armIndexRate: Rate;
  /** Annual drift of the ARM index after `asOfYear`. */
  armIndexAnnualChange: Rate;
}

// ───────────────────────────── Loans ─────────────────────────────

interface LoanBase {
  id: string;
  label: string;
  /** Origination year/month. First payment is due at the end of the origination month. */
  startYear: Year;
  startMonth: Month;
}

export interface FixedLoan extends LoanBase {
  type: "fixed";
  principal: Cents;
  rate: Rate;
  termYears: number;
}

export interface InterestOnlyLoan extends LoanBase {
  type: "interestOnly";
  principal: Cents;
  rate: Rate;
  /** Years of interest-only payments, after which the loan amortises over the remaining term. */
  ioYears: number;
  /** Total term including the interest-only period. */
  termYears: number;
}

export interface ArmLoan extends LoanBase {
  type: "arm";
  principal: Cents;
  initialRate: Rate;
  /** Years the initial rate is fixed. Afterwards the rate resets every 12 months. */
  fixedYears: number;
  termYears: number;
  /** Max change per annual reset (e.g. 0.02). */
  adjustmentCap: Rate;
  /** Max total increase over the initial rate (e.g. 0.05). */
  lifetimeCap: Rate;
  /** Margin added to the index at each reset. */
  margin: Rate;
}

export interface HelocDraw {
  year: Year;
  month: Month;
  amount: Cents;
}

export interface HelocLoan extends LoanBase {
  type: "heloc";
  /** Maximum outstanding balance. */
  creditLimit: Cents;
  rate: Rate;
  /** Interest-only draw period. */
  drawPeriodYears: number;
  /** Amortising repayment period that follows the draw period. */
  repaymentYears: number;
  /** Drawn at origination. */
  initialDraw: Cents;
  draws: HelocDraw[];
}

export type Loan = FixedLoan | InterestOnlyLoan | ArmLoan | HelocLoan;
export type LoanType = Loan["type"];

// ───────────────────────────── Property ─────────────────────────────

export interface CapitalImprovement {
  id: string;
  description: string;
  year: Year;
  month: Month;
  amount: Cents;
  /** Market value the improvement adds immediately (forced appreciation). Defaults to 0. */
  valueAdded?: Cents;
}

export type OperatingExpense =
  { kind: "percentOfRent"; rate: Rate } | { kind: "fixed"; annual: Cents };

export interface Property {
  id: string;
  name: string;
  location: string;
  purchaseYear: Year;
  purchaseMonth: Month;
  purchasePrice: Cents;
  /** Share of the purchase price (and of capitalised closing costs) allocated to land. */
  landValuePct: Rate;
  /** Closing costs capitalised into basis. */
  closingCosts: Cents;
  improvements: CapitalImprovement[];
  /** Market value at the as-of date. */
  currentValue: Cents;
  appreciationRate: Rate;
  /** Gross annual scheduled rent at the as-of date. */
  annualRent: Cents;
  rentGrowthRate: Rate;
  vacancyRate: Rate;
  operating: OperatingExpense;
  /** Annual property tax at the as-of date. */
  propertyTax: Cents;
  /** Annual insurance at the as-of date. */
  insurance: Cents;
  /** Growth of fixed costs (tax, insurance, fixed opex). */
  expenseGrowthRate: Rate;
  loans: Loan[];
  /** Agent fees and closing costs on sale, as a share of the sale price. */
  sellingCostRate: Rate;
}

export interface Household {
  id: string;
  name: string;
  tagline: string;
  description: string;
  investor: InvestorProfile;
  market: MarketAssumptions;
  properties: Property[];
}

// ───────────────────────────── Strategies ─────────────────────────────

export type ReplacementDebt =
  { kind: "matchRelinquished" } | { kind: "ltv"; ltv: Rate } | { kind: "amount"; amount: Cents };

export interface ReplacementAssumptions {
  name: string;
  /** Replacement price as a multiple of the gross sale price of the relinquished property(ies). */
  priceMultiple: number;
  closingCostRate: Rate;
  landValuePct: Rate;
  debt: ReplacementDebt;
  loanRate: Rate;
  loanTermYears: number;
  /** Gross annual rent as a share of price. */
  grossRentYield: Rate;
  rentGrowthRate: Rate;
  vacancyRate: Rate;
  /** Operating expenses as a share of rent. */
  opexRateOfRent: Rate;
  /** Property tax and insurance as a share of price. */
  propertyTaxRate: Rate;
  insuranceRate: Rate;
  expenseGrowthRate: Rate;
  appreciationRate: Rate;
  sellingCostRate: Rate;
}

export interface HoldStrategy {
  kind: "hold";
}

export interface SellStrategy {
  kind: "sell";
  /** Sale closes on December 31 of this year. */
  sellYear: Year;
  propertyIds: string[];
}

export interface ExchangeStrategy {
  kind: "exchange";
  sellYear: Year;
  propertyIds: string[];
  replacement: ReplacementAssumptions;
  /** Cash deliberately withdrawn from the intermediary at closing. Taxable boot. */
  cashOutAtClosing: Cents;
  /** Day (after the relinquished closing) on which the replacement is identified. Max 45. */
  identificationDays: number;
  /** Day (after the relinquished closing) on which the replacement closes. Max 180. */
  closingDays: number;
}

export type Strategy = HoldStrategy | SellStrategy | ExchangeStrategy;
export type StrategyKind = Strategy["kind"];

export const STRATEGY_KINDS: readonly StrategyKind[] = ["hold", "sell", "exchange"];

/** Everything the Scenario Lab controls; turned into three strategies by `buildStrategies`. */
export interface ScenarioConfig {
  sellYear: Year;
  sellPropertyIds: string[];
  replacement: ReplacementAssumptions;
  cashOutAtClosing: Cents;
  identificationDays: number;
  closingDays: number;
}

export interface StrategySet {
  hold: HoldStrategy;
  sell: SellStrategy;
  exchange: ExchangeStrategy;
}

// ───────────────────────────── Monte Carlo ─────────────────────────────

export interface MonteCarloConfig {
  seed: number;
  paths: number;
  /** Std deviation of the annual appreciation shock. */
  appreciationVolatility: Rate;
  /** Std deviation of the annual rent-growth shock. */
  rentGrowthVolatility: Rate;
  /** Correlation between the two shocks. */
  correlation: number;
}

/** Additive shocks to growth rates, indexed by projection year k (index 0 unused). */
export interface MarketShocks {
  appreciation: readonly number[];
  rentGrowth: readonly number[];
}

// ───────────────────────────── Tax ─────────────────────────────

export interface TaxBracket {
  /** Upper bound of this bracket in cents of taxable income, or null for the top bracket. */
  upTo: Cents | null;
  rate: Rate;
}

export interface TaxTable {
  taxYear: number;
  /** Where the numbers come from; shown in the assumptions page. */
  source: string;
  ordinaryBrackets: Record<FilingStatus, TaxBracket[]>;
  standardDeduction: Record<FilingStatus, Cents>;
  /** Top of the 0% and 15% long-term capital gain brackets, in taxable income. */
  ltcgBreakpoints: Record<FilingStatus, { zeroRateTop: Cents; fifteenRateTop: Cents }>;
  ltcgRates: { zero: Rate; fifteen: Rate; twenty: Rate };
  niit: { rate: Rate; magiThreshold: Record<FilingStatus, Cents> };
  /** Maximum rate on unrecaptured Section 1250 gain. */
  unrecaptured1250MaxRate: Rate;
}

/** The components of one household tax year that come from the portfolio. */
export interface PortfolioTaxComponents {
  /** Net rental income after expenses, interest and depreciation. May be negative. */
  netRentalIncome: Cents;
  /** Net Section 1231 loss treated as an ordinary loss (positive number = loss amount). */
  ordinaryLoss1231: Cents;
  /** Unrecaptured Section 1250 gain (depreciation recapture), taxed at up to 25%. */
  unrecaptured1250Gain: Cents;
  /** Remaining long-term capital gain (0/15/20%). */
  longTermCapitalGain: Cents;
}

export interface FederalTaxResult {
  ordinaryIncome: Cents;
  standardDeduction: Cents;
  taxableOrdinary: Cents;
  unrecaptured1250: Cents;
  longTermGain: Cents;
  taxOnOrdinary: Cents;
  taxOnUnrecaptured1250: Cents;
  taxOnLongTermGain: Cents;
  total: Cents;
}

export interface YearTaxResult {
  year: Year;
  federal: FederalTaxResult;
  niit: Cents;
  state: Cents;
  total: Cents;
  /** Net investment income used for NIIT and the MAGI it was compared against. */
  netInvestmentIncome: Cents;
  magi: Cents;
}

/** Incremental tax attributable to the portfolio, decomposed so each layer can be explained. */
export interface PortfolioTaxResult {
  year: Year;
  baseline: YearTaxResult;
  withOperations: YearTaxResult;
  withAll: YearTaxResult;
  /** Tax on rental operations alone (may be negative when losses shelter other income). */
  taxOnOperations: Cents;
  /** Extra tax caused by recognised gains/losses on top of operations. */
  taxOnSale: Cents;
  breakdown: SaleTaxBreakdown;
  total: Cents;
}

export interface SaleTaxBreakdown {
  /** Tax on unrecaptured Section 1250 gain. */
  depreciationRecaptureTax: Cents;
  /** Tax on the remaining long-term capital gain. */
  capitalGainsTax: Cents;
  netInvestmentIncomeTax: Cents;
  stateTax: Cents;
  /** Tax effect of a net Section 1231 loss (usually negative = a benefit). */
  ordinaryLossBenefit: Cents;
  total: Cents;
}

// ───────────────────────────── Depreciation ─────────────────────────────

export type TrancheKind = "building" | "improvement" | "carryover" | "excess";

export interface DepreciationTranche {
  id: string;
  label: string;
  kind: TrancheKind;
  /** Depreciable basis in cents. */
  basis: Cents;
  placedInServiceYear: Year;
  placedInServiceMonth: Month;
  /** Recovery period in half-months (27.5 years = 660). */
  lifeHalfMonths: number;
}

// ───────────────────────────── Loans (results) ─────────────────────────────

export type LoanPhase =
  | "notStarted"
  | "fixed"
  | "interestOnly"
  | "amortizing"
  | "armFixed"
  | "armAdjusting"
  | "helocDraw"
  | "helocRepay"
  | "paidOff";

export interface LoanYearRow {
  year: Year;
  openingBalance: Cents;
  draws: Cents;
  interest: Cents;
  principal: Cents;
  /** interest + principal */
  payment: Cents;
  closingBalance: Cents;
  /** Rate in force at the end of the year. */
  endRate: Rate;
  phase: LoanPhase;
  /** For ARMs: whether a reset this year was limited by a cap. */
  capHit: "none" | "periodic" | "lifetime";
}

export interface LoanSchedule {
  loanId: string;
  label: string;
  type: LoanType;
  rows: LoanYearRow[];
  warnings: string[];
}

// ───────────────────────────── Sale & exchange (results) ─────────────────────────────

export interface SaleGainResult {
  propertyId: string;
  propertyName: string;
  salePrice: Cents;
  sellingCosts: Cents;
  amountRealized: Cents;
  adjustedBasis: Cents;
  accumulatedDepreciation: Cents;
  /** amount realized − adjusted basis; negative for a loss. */
  totalGain: Cents;
  loanPayoff: Cents;
  netProceedsBeforeTax: Cents;
}

export interface GainClassification {
  netGain: Cents;
  unrecaptured1250Gain: Cents;
  longTermCapitalGain: Cents;
  /** Net Section 1231 loss as a positive number, when netGain < 0. */
  ordinaryLoss1231: Cents;
}

export interface BootResult {
  /** Realised gain across the relinquished properties (negative = loss). */
  realizedGain: Cents;
  /** Debt on the relinquished properties paid off at closing. */
  debtRelieved: Cents;
  /** Debt placed on the replacement. */
  newDebt: Cents;
  replacementPrice: Cents;
  replacementClosingCosts: Cents;
  /** Net proceeds the qualified intermediary holds after selling costs and loan payoff. */
  fundsHeldByIntermediary: Cents;
  /** Cash the investor had to bring at the relinquished closing (loan payoff exceeded price). */
  cashPaidAtRelinquishedClosing: Cents;
  /** Additional cash the investor paid into the replacement purchase. */
  additionalCashPaidIn: Cents;
  /** Intermediary cash applied to buy the replacement. */
  cashApplied: Cents;
  cashBoot: Cents;
  /** Debt relief not replaced by new debt or added cash. */
  mortgageBoot: Cents;
  totalBoot: Cents;
  recognizedGain: Cents;
  deferredGain: Cents;
  /** Basis of the replacement: carryover plus any new money. */
  replacementBasis: Cents;
  /** Same figure derived the second way (price + costs − deferred gain). Must equal `replacementBasis`. */
  replacementBasisCrossCheck: Cents;
  /** How much of the recognised gain is unrecaptured Section 1250 gain / long-term gain. */
  recognizedClassification: GainClassification;
}

export interface ExchangeTimeline {
  relinquishedClosing: string;
  identificationDeadline: string;
  exchangeDeadline: string;
  identificationDate: string;
  replacementClosing: string;
  /** First month of ownership (a full month after closing), as "YYYY-MM". */
  replacementFirstOwnedMonth: string;
  identificationWithinWindow: boolean;
  closingWithinWindow: boolean;
}

export interface ExchangeSummary {
  sellYear: Year;
  acquisitionYear: Year;
  relinquished: SaleGainResult[];
  boot: BootResult;
  timeline: ExchangeTimeline;
  /** Tax paid on recognised boot, by layer. */
  bootTax: SaleTaxBreakdown;
  replacementName: string;
  /** Unrecaptured 1250 depreciation history carried into the replacement. */
  carriedDepreciation: Cents;
  completed: boolean;
}

export interface SaleSummary {
  year: Year;
  properties: SaleGainResult[];
  totalSalePrice: Cents;
  totalSellingCosts: Cents;
  totalLoanPayoff: Cents;
  totalGain: Cents;
  classification: GainClassification;
  tax: SaleTaxBreakdown;
  netProceedsBeforeTax: Cents;
  /** price − costs − payoff − taxes */
  netProceedsAfterTax: Cents;
}

// ───────────────────────────── Simulation (results) ─────────────────────────────

export type HoldingStatus = "pending" | "owned" | "sold";

export interface PropertyYearRow {
  year: Year;
  /** Projection index: 0 = opening snapshot. */
  t: number;
  status: HoldingStatus;
  monthsOwned: number;
  marketValue: Cents;
  loanBalance: Cents;
  equity: Cents;
  effectiveGrossIncome: Cents;
  operatingExpenses: Cents;
  noi: Cents;
  interestPaid: Cents;
  principalPaid: Cents;
  debtService: Cents;
  cashFlowBeforeTax: Cents;
  capex: Cents;
  helocDraws: Cents;
  depreciation: Cents;
  accumulatedDepreciation: Cents;
  adjustedBasis: Cents;
  taxableRentalIncome: Cents;
  /** Gain if sold at year end, before tax. */
  unrealizedGain: Cents;
  /** Unrecaptured Section 1250 gain if sold at year end. */
  recaptureExposure: Cents;
}

export interface PropertyTimeline {
  id: string;
  name: string;
  /** "original" properties come from the household; "replacement" is acquired in an exchange. */
  origin: "original" | "replacement";
  rows: PropertyYearRow[];
  loanSchedules: LoanSchedule[];
  tranches: DepreciationTranche[];
  /** Land basis (never depreciated). */
  landBasis: Cents;
  /** Depreciation inherited through a 1031 exchange that still counts toward recapture. */
  carriedDepreciation: Cents;
}

export interface YearRow {
  year: Year;
  t: number;
  // balance sheet
  propertyValue: Cents;
  loanBalance: Cents;
  equity: Cents;
  cashBalance: Cents;
  /** Sale proceeds parked with a qualified intermediary during an exchange. */
  intermediaryFunds: Cents;
  // operations
  effectiveGrossIncome: Cents;
  operatingExpenses: Cents;
  noi: Cents;
  interestPaid: Cents;
  principalPaid: Cents;
  debtService: Cents;
  cashFlowBeforeTax: Cents;
  taxOnOperations: Cents;
  cashFlowAfterTax: Cents;
  capex: Cents;
  helocDraws: Cents;
  // tax basis
  depreciation: Cents;
  accumulatedDepreciation: Cents;
  adjustedBasis: Cents;
  taxableRentalIncome: Cents;
  // taxes
  taxOnSale: Cents;
  taxesPaid: Cents;
  cumulativeTaxesPaid: Cents;
  deferredTaxLiability: Cents;
  /** Selling costs you would pay if everything were sold at this year end. */
  liquidationSellingCosts: Cents;
  // cash account reconciliation
  cashOpening: Cents;
  investmentReturn: Cents;
  saleNetProceeds: Cents;
  exchangeCashFlow: Cents;
  cashClosing: Cents;
  // headline metrics
  /** Cash + equity at market. Taxes paid so far are out; deferred taxes are not. */
  netWorthAfterTax: Cents;
  /** After-tax net worth minus selling costs and deferred taxes: what you would hold if you liquidated. */
  netWorthLiquidated: Cents;
  /** Same, assuming a step-up in basis at death wipes out deferred taxes. */
  netWorthLiquidatedWithStepUp: Cents;
}

export type TimelineEventKind =
  | "purchase"
  | "improvement"
  | "sale"
  | "identification"
  | "exchangeDeadline"
  | "replacementClosing"
  | "helocDraw"
  | "loanPaidOff"
  | "armReset"
  | "ioEnds"
  | "horizon";

export interface TimelineEvent {
  kind: TimelineEventKind;
  /** ISO date (YYYY-MM-DD) for exact placement, or year-only events use YYYY-07-01. */
  date: string;
  year: Year;
  label: string;
  propertyId?: string;
}

export interface HorizonSummary {
  year: Year;
  netWorthAfterTax: Cents;
  netWorthLiquidated: Cents;
  netWorthLiquidatedWithStepUp: Cents;
  presentValueOfLiquidatedNetWorth: Cents;
  cumulativeTaxesPaid: Cents;
  deferredTaxLiability: Cents;
  cumulativeCashFlowAfterTax: Cents;
  equity: Cents;
  cashBalance: Cents;
}

/** The hypothetical "sell everything at this year end" computation behind deferred taxes. */
export interface LiquidationDetail {
  year: Year;
  /** Properties still owned at year end, valued as if sold on Dec 31. */
  sales: SaleGainResult[];
  /** Gain deferred in an exchange whose replacement has not closed yet. */
  pendingExchangeSales: SaleGainResult[];
  classification: GainClassification;
  /** Incremental tax of the hypothetical sale, stacked on the year's actual income. */
  tax: SaleTaxBreakdown;
  sellingCosts: Cents;
  deferredTax: Cents;
}

export interface StrategyResult {
  strategy: Strategy;
  years: YearRow[];
  properties: PropertyTimeline[];
  events: TimelineEvent[];
  sale: SaleSummary | null;
  exchange: ExchangeSummary | null;
  /** Tax layers for each projection year, kept for the math drawer. */
  taxByYear: PortfolioTaxResult[];
  /** Hypothetical liquidation behind each year's deferred tax (index = t). */
  liquidationByYear: LiquidationDetail[];
  horizon: HorizonSummary;
  warnings: string[];
}

export interface Scenario {
  household: Household;
  strategies: StrategySet;
}

export interface ScenarioResults {
  hold: StrategyResult;
  sell: StrategyResult;
  exchange: StrategyResult;
}

export interface SimulationOptions {
  /** Market shocks for Monte Carlo paths. */
  shocks?: MarketShocks;
}

export interface BandSeries {
  years: Year[];
  p10: Cents[];
  p50: Cents[];
  p90: Cents[];
}

export interface MonteCarloResult {
  config: MonteCarloConfig;
  liquidated: Record<StrategyKind, BandSeries>;
  afterTax: Record<StrategyKind, BandSeries>;
  /** Net worth if liquidated, assuming a step-up in basis at death. */
  liquidatedStepUp: Record<StrategyKind, BandSeries>;
  /** Share of paths in which a strategy ends with higher liquidated net worth than Hold. */
  probabilityBeatsHold: { sell: number; exchange: number };
}
