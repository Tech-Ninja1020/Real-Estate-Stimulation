/**
 * Every modelling assumption, in one place. The "Show the math" drawer links to these by id, the
 * /assumptions page renders them, and the README mirrors them. If you change the engine, change
 * the text here.
 */

export type AssumptionKind = "modeled" | "simplification" | "not-modeled";

export interface Assumption {
  id: string;
  title: string;
  kind: AssumptionKind;
  /** One sentence. */
  summary: string;
  /** Detail bullets, in plain English. */
  details: string[];
  /** Citation or reference where relevant. */
  reference?: string;
}

export const ASSUMPTIONS: readonly Assumption[] = [
  {
    id: "time-model",
    title: "Time model and sale timing",
    kind: "simplification",
    summary:
      "The opening balance sheet is Dec 31 of the as-of year. Each projection year is a calendar year and every row is a year-end snapshot.",
    details: [
      "Sales close on December 31 of the chosen year, so the property earns a full year of operations.",
      "Because the 1031 clocks start on December 31, the 45-day and 180-day windows always fall in the following calendar year.",
      "Loans originate at the start of their origination month; the first payment is due at the end of that month.",
      "Taxes on a sale are assumed paid in the year of the sale, not on the following April 15.",
    ],
  },
  {
    id: "depreciation",
    title: "Depreciation: 27.5-year straight line, mid-month",
    kind: "modeled",
    summary:
      "Residential rental buildings are depreciated straight-line over 27.5 years using the mid-month convention. Land is never depreciated.",
    details: [
      "Depreciable basis = (purchase price + capitalised closing costs) x (1 - land share).",
      "Mid-month convention: property placed in service in month m gets (12 - m + 0.5) months of depreciation in year one, and half a month in the month of sale. The engine counts in half-months so this is exact integer arithmetic.",
      "Each capital improvement is depreciated as its own 27.5-year tranche from the month it is placed in service.",
      "Depreciation is computed as 'allowed or allowable': it reduces basis whether or not it was claimed.",
      "No bonus depreciation, Section 179, or cost segregation (see 'What is not modeled').",
    ],
    reference: "IRC §168(c), §168(d)(2); IRS Publication 527",
  },
  {
    id: "adjusted-basis",
    title: "Adjusted basis",
    kind: "modeled",
    summary:
      "Adjusted basis = purchase price + capitalised closing costs + improvements - accumulated depreciation.",
    details: [
      "Land basis is never reduced. Only the building and improvement tranches lose basis as they are depreciated.",
      "Closing costs are capitalised into basis and split between land and building in the same proportion as the purchase price.",
      "Improvements add to basis in the month placed in service and begin depreciating separately.",
    ],
    reference: "IRC §1011, §1016",
  },
  {
    id: "sale-gain",
    title: "Amount realized and total gain",
    kind: "modeled",
    summary:
      "Amount realized = sale price - selling costs. Total gain = amount realized - adjusted basis.",
    details: [
      "Selling costs (agent fees, transfer taxes, closing) are a percentage of the sale price and reduce the amount realized.",
      "Loan payoff does not affect the gain; it affects cash proceeds. Net proceeds = price - selling costs - loan payoff - taxes.",
      "Property sold in the same calendar year as an improvement includes that improvement in basis.",
    ],
    reference: "IRC §1001",
  },
  {
    id: "unrecaptured-1250",
    title: "Depreciation recapture (unrecaptured Section 1250 gain)",
    kind: "modeled",
    summary:
      "The part of a gain equal to depreciation taken is unrecaptured §1250 gain, taxed at your ordinary rate but capped at 25%.",
    details: [
      "Unrecaptured §1250 gain = min(total gain, depreciation taken). The rest of the gain is long-term capital gain.",
      "It is taxed at ordinary rates up to a 25% maximum, so a taxpayer in the 22% bracket pays 22% and one in the 35% bracket pays 25%.",
      "For residential property depreciated straight-line there is no ordinary-income §1250 recapture; 'recapture' in this app means unrecaptured §1250 gain.",
      "When several properties are sold in one year their gains and losses are netted before classification.",
    ],
    reference: "IRC §1(h)(1)(E), §1(h)(6)",
  },
  {
    id: "capital-gains-brackets",
    title: "Long-term capital gains rates (0 / 15 / 20%)",
    kind: "modeled",
    summary:
      "Remaining long-term gain is stacked on top of ordinary income and unrecaptured §1250 gain, and taxed at 0%, 15% or 20% by taxable-income position.",
    details: [
      "Stacking order: ordinary taxable income, then unrecaptured §1250 gain, then long-term gain.",
      "If the standard deduction exceeds ordinary income, the shortfall shelters unrecaptured §1250 gain first, then long-term gain.",
    ],
    reference: "IRC §1(h)(1)",
  },
  {
    id: "niit",
    title: "Net Investment Income Tax (3.8%)",
    kind: "modeled",
    summary:
      "3.8% on the lesser of net investment income and MAGI above $200,000 (single/head of household), $250,000 (joint) or $125,000 (separate).",
    details: [
      "Net rental income and all recognised gains are treated as net investment income (the investor is not a real estate professional).",
      "Other taxable income is treated as non-investment (wages or pension).",
      "NIIT thresholds are set by statute and are not indexed for inflation.",
    ],
    reference: "IRC §1411",
  },
  {
    id: "state-tax",
    title: "State income tax",
    kind: "simplification",
    summary: "A single flat rate is applied to net rental income and to all recognised gains.",
    details: [
      "No state brackets, deductions, or recapture/capital-gain distinctions. Enter your effective state rate.",
      "State tax is not deducted on the federal return (the SALT cap makes this immaterial for most investors).",
    ],
  },
  {
    id: "ordinary-brackets",
    title: "Federal ordinary brackets and the standard deduction",
    kind: "modeled",
    summary:
      "Rental income (net of expenses, interest and depreciation) is taxed at progressive federal brackets after the standard deduction.",
    details: [
      "Bracket tables live in a versioned data file per tax year (data/tax). 2025 and 2026 are included.",
      "The standard deduction is always used; itemised deductions are not modelled.",
    ],
    reference: "IRS Rev. Proc. 2024-40 (2025), Rev. Proc. 2025-32 (2026)",
  },
  {
    id: "bracket-indexation",
    title: "Inflation indexation of future brackets and income",
    kind: "simplification",
    summary:
      "Brackets, the standard deduction and capital-gain breakpoints grow with the inflation assumption after the table year; so does your other taxable income.",
    details: [
      "This keeps your relative position in the brackets stable instead of letting nominal growth push you up the brackets (bracket creep).",
      "NIIT thresholds are NOT indexed, matching the statute.",
    ],
  },
  {
    id: "incremental-tax",
    title: "Taxes are measured incrementally",
    kind: "modeled",
    summary:
      "The tax charged to a strategy is the household's tax with the portfolio minus its tax on other income alone.",
    details: [
      "Wages and their taxes are the same under every strategy, so they are excluded from the comparison.",
      "A rental loss can reduce tax on other income (a negative amount). Passive loss limits are not applied (see 'What is not modeled').",
      "Taxes are layered (operations, then loss, then recapture, then capital gains, then NIIT and state) so every layer can be explained.",
    ],
  },
  {
    id: "section-1231-loss",
    title: "Sale at a loss (Section 1231)",
    kind: "modeled",
    summary:
      "If total gain across properties sold in a year is negative, the net loss is an ordinary Section 1231 loss that reduces ordinary income.",
    details: [
      "A sale below adjusted basis (not below purchase price) is a loss. Depreciation lowers basis, so a property can sell below what you paid and still produce a taxable gain.",
      "The five-year §1231 look-back rule is not modelled.",
    ],
    reference: "IRC §1231",
  },
  {
    id: "exchange-1031",
    title: "Section 1031 like-kind exchange",
    kind: "modeled",
    summary:
      "An exchange defers recognition of the gain when proceeds roll into a replacement property of equal or greater value and debt.",
    details: [
      "Realized gain = recognised gain + deferred gain. Recognised gain = min(realized gain, total boot). Losses are not recognised.",
      "The replacement basis is the carryover basis plus new money: adjusted basis given up + cash paid in + new debt - debt relieved - cash boot + recognised gain. The engine also derives it as price + closing costs - deferred gain and checks they agree.",
      "Qualified intermediary funds are counted in net worth while held, and earn no return until the replacement closes.",
      "Boot is taxed in the year the replacement closes.",
      "Only real property exchanges (post-2017 law); exchange of personal property is not modelled. A single replacement property is modelled.",
    ],
    reference: "IRC §1031; Treas. Reg. §1.1031(d)-2",
  },
  {
    id: "exchange-boot",
    title: "Boot: cash and mortgage",
    kind: "modeled",
    summary:
      "Cash you take out, and net debt relief not offset by new debt or extra cash you pay in, is boot and is taxable.",
    details: [
      "Cash boot = exchange cash received instead of reinvested.",
      "Mortgage boot = debt relieved - (new debt + extra cash paid in), never below zero. Cash paid in can offset debt relief, but debt cannot offset cash received.",
      "Recognised boot is classified as unrecaptured §1250 gain first (up to depreciation taken), then long-term capital gain. This is the conservative ordering.",
    ],
    reference: "Treas. Reg. §1.1031(d)-2",
  },
  {
    id: "exchange-carryover",
    title: "Carryover basis and depreciation after an exchange",
    kind: "modeled",
    summary:
      "Exchanged basis keeps depreciating over the relinquished property's remaining recovery period; new money starts a fresh 27.5-year schedule.",
    details: [
      "This follows the default rule of Treas. Reg. §1.168(i)-6 (no election to restart all basis).",
      "Depreciation already taken carries over for recapture purposes, so a later sale of the replacement still triggers recapture on the earlier depreciation.",
    ],
    reference: "Treas. Reg. §1.168(i)-6",
  },
  {
    id: "exchange-windows",
    title: "45-day and 180-day windows",
    kind: "modeled",
    summary:
      "You must identify replacement property within 45 days and close within 180 days of the sale. Missing either fails the exchange.",
    details: [
      "Day 0 is the December 31 closing of the relinquished property.",
      "If you set a day count beyond a window, the engine treats the exchange as failed and taxes the sale in full, exactly as a taxable sale.",
      "The rule that the 180 days is cut short by the due date of your return (including extensions) does not bind for a December 31 sale. The three-property and 200% identification rules are not modelled.",
    ],
    reference: "IRC §1031(a)(3)",
  },
  {
    id: "step-up",
    title: "Step-up in basis at death",
    kind: "modeled",
    summary:
      "If held until death, heirs receive a basis equal to fair market value, which eliminates deferred gain and depreciation recapture.",
    details: [
      "The toggle zeroes the deferred tax liability. Selling costs are still deducted from 'net worth if liquidated' because an heir who sells still pays them.",
      "Estate and inheritance taxes are not modelled.",
    ],
    reference: "IRC §1014",
  },
  {
    id: "loans",
    title: "Loan mechanics",
    kind: "modeled",
    summary:
      "Fixed, interest-only, adjustable-rate and HELOC loans are amortised monthly and rolled up to calendar years.",
    details: [
      "Interest each month = balance x annual rate / 12, rounded to the cent. The last payment of a loan clears the exact remaining balance.",
      "Interest-only: balance is flat for the IO period, then the loan amortises over the remaining term.",
      "ARM: fixed rate for the initial period, then an annual reset to index + margin, limited by the per-reset cap and the lifetime cap. The payment is recast at each reset. The index follows your starting rate plus a constant annual drift.",
      "HELOC: interest-only during the draw period, amortising during repayment. Draws beyond the credit limit are cut to the available line.",
      "All mortgage interest, including HELOC interest, is treated as deductible rental interest.",
    ],
  },
  {
    id: "operations",
    title: "Operations: rent, vacancy, expenses",
    kind: "modeled",
    summary:
      "Effective gross income = rent x (1 - vacancy). NOI = EGI - operating expenses - property tax - insurance.",
    details: [
      "Year-one rent equals today's in-place rent; it grows at the rent growth rate from year two.",
      "Operating expenses are a percentage of effective income or a fixed amount. Property tax, insurance and fixed costs grow at the expense growth rate.",
      "Property tax does not reassess when value changes.",
      "Capital improvements are a cash outflow in the year they occur and may add an immediate 'value added' amount.",
    ],
  },
  {
    id: "appreciation",
    title: "Appreciation",
    kind: "simplification",
    summary:
      "Each property appreciates at its own constant annual rate. Market value is not interpolated within a year.",
    details: [
      "A replacement property bought mid-year appreciates only for the months it is owned (simple interest within that first partial year).",
    ],
  },
  {
    id: "cash-account",
    title: "Cash account and reinvestment",
    kind: "simplification",
    summary:
      "All cash flows, taxes and sale proceeds run through one account that earns the after-tax reinvestment rate.",
    details: [
      "The reinvestment return is treated as an AFTER-TAX return; no tax drag or tax on liquidating the account is modelled.",
      "A negative balance means you funded shortfalls out of pocket; it is charged the same rate as the opportunity cost of that money.",
      "Cash flows arrive at year end, so they do not earn interest in the year they occur.",
      "The account starts at zero: your other savings are not part of the comparison.",
    ],
  },
  {
    id: "net-worth",
    title: "After-tax net worth and net worth if liquidated",
    kind: "modeled",
    summary:
      "After-tax net worth = cash + intermediary funds + (market value - loans). Net worth if liquidated also subtracts selling costs and deferred taxes.",
    details: [
      "The two measures differ so strategies are compared fairly: Sell has already paid its taxes and costs, Hold has not.",
      "Deferred tax is the extra tax if every remaining property were sold on December 31 of that year, stacked on top of that year's actual income (brackets, NIIT and state tax included).",
      "During an exchange, gain in a replacement not yet purchased still counts as deferred tax.",
    ],
  },
  {
    id: "discounting",
    title: "Present value",
    kind: "modeled",
    summary: "Present value = horizon net worth if liquidated / (1 + discount rate)^years.",
    details: [
      "Every strategy is compared at the same date, so discounting scales all of them equally. It is shown to put the numbers in today's dollars.",
    ],
  },
  {
    id: "monte-carlo",
    title: "Monte Carlo uncertainty",
    kind: "modeled",
    summary:
      "Each path adds a random shock to annual appreciation and rent growth, drawn from a seeded generator, and reruns all three strategies.",
    details: [
      "Shocks are normal with mean zero, correlated between appreciation and rent growth. Volatility and correlation are editable.",
      "The same shocks hit all three strategies on a path, so differences reflect the strategy, not luck.",
      "The seed is shown and editable. The same seed always gives the same bands.",
      "Interest rates, vacancy, expenses and tax law are not randomised.",
    ],
  },
  {
    id: "not-modeled",
    title: "What is NOT modeled",
    kind: "not-modeled",
    summary:
      "Several real-world rules are out of scope. Each can materially change a real decision.",
    details: [
      "Passive activity loss limits (§469): rental losses are assumed to offset other income in full. In reality, above about $150,000 of income the losses are usually suspended.",
      "Alternative Minimum Tax (AMT).",
      "Section 121 primary-residence exclusion (for example, a former home converted to a rental).",
      "Installment sales (§453) and seller financing.",
      "Cost segregation, bonus depreciation, Section 179 and QBI (§199A) deductions.",
      "Section 1031 multi-property identification rules, reverse and improvement exchanges, and DSTs.",
      "Delaware statutory trusts, opportunity zones, and charitable remainder trusts.",
      "Estate and gift taxes; step-up is only a toggle on deferred income tax.",
      "State-specific rules, local transfer taxes, and state conformity to §1031.",
      "Itemised deductions, other income sources that change with the sale, and Social Security or Medicare (IRMAA) effects.",
      "Property tax reassessment, insurance shocks, and loan prepayment penalties.",
    ],
  },
] as const;

export function getAssumption(id: string): Assumption | undefined {
  return ASSUMPTIONS.find((a) => a.id === id);
}

export const ASSUMPTION_IDS: readonly string[] = ASSUMPTIONS.map((a) => a.id);
