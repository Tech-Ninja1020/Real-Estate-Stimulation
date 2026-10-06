/**
 * Plain-English summary of a scenario comparison. Entirely template-based and deterministic: the
 * same engine outputs always produce the same words. Every number is a "figure" segment that can
 * carry a TraceRef, so the UI can make each one click through to its math.
 */

import { formatIsoLong, formatPercent } from "./format";
import type { Cents, Rate } from "./money";
import type { TraceContext, TraceRef } from "./explain";
import type { MonteCarloResult, StrategyKind, StrategyResult } from "./types";

export type NarrativeSegment =
  | { kind: "text"; text: string }
  | { kind: "money"; cents: Cents; ref?: TraceRef }
  | { kind: "percent"; value: Rate; digits?: number };

export interface NarrativeParagraph {
  id: string;
  title: string;
  segments: NarrativeSegment[];
}

export interface Narrative {
  headline: NarrativeSegment[];
  winner: StrategyKind | "tie";
  ranking: { strategy: StrategyKind; netWorth: Cents }[];
  paragraphs: NarrativeParagraph[];
  caveats: string[];
}

export interface NarrativeOptions {
  /** Assume a step-up in basis at death wipes out deferred taxes. */
  stepUp: boolean;
  monteCarlo?: MonteCarloResult | null;
}

const LABEL: Record<StrategyKind, string> = {
  hold: "Holding",
  sell: "Selling",
  exchange: "A 1031 exchange",
};
const NAME: Record<StrategyKind, string> = {
  hold: "Hold",
  sell: "Sell",
  exchange: "1031 Exchange",
};

const t = (text: string): NarrativeSegment => ({ kind: "text", text });
const m = (cents: Cents, ref?: TraceRef): NarrativeSegment => ({ kind: "money", cents, ref });
const p = (value: Rate, digits = 1): NarrativeSegment => ({ kind: "percent", value, digits });

function horizonNetWorth(r: StrategyResult, stepUp: boolean): Cents {
  return stepUp ? r.horizon.netWorthLiquidatedWithStepUp : r.horizon.netWorthLiquidated;
}

function listNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}

export function buildNarrative(ctx: TraceContext, options: NarrativeOptions): Narrative {
  const { household, results } = ctx;
  const years = household.investor.horizonYears;
  const horizonYear = household.market.asOfYear + years;
  const { hold, sell, exchange } = results;
  const stepUp = options.stepUp;

  const ranking = (["hold", "sell", "exchange"] as const)
    .map((strategy) => ({ strategy, netWorth: horizonNetWorth(results[strategy], stepUp) }))
    .sort((a, b) => b.netWorth - a.netWorth);
  const best = ranking[0];
  const second = ranking[1];
  const worst = ranking[2];
  if (!best || !second || !worst) throw new Error("ranking requires three strategies");
  const noSale = sell.sale === null && exchange.exchange === null;
  const tie = best.netWorth === worst.netWorth;
  const winner: StrategyKind | "tie" = tie ? "tie" : best.strategy;
  const nwRef = (strategy: StrategyKind): TraceRef => ({
    kind: "netWorthLiquidated",
    strategy,
    year: horizonYear,
    stepUp,
  });

  const headline: NarrativeSegment[] = noSale
    ? [
        t(
          "No properties are selected for sale, so Hold, Sell and 1031 Exchange are identical. Pick at least one property in the Scenario Lab to compare strategies.",
        ),
      ]
    : [
        t(`${NAME[best.strategy]} comes out ahead after ${years} years: `),
        m(best.netWorth, nwRef(best.strategy)),
        t(` of net worth if liquidated, `),
        m(best.netWorth - second.netWorth),
        t(` more than ${NAME[second.strategy]}`),
        t(second.netWorth === worst.netWorth ? "." : ` and `),
        ...(second.netWorth === worst.netWorth
          ? []
          : [m(best.netWorth - worst.netWorth), t(` more than ${NAME[worst.strategy]}.`)]),
        t(stepUp ? " This assumes a step-up in basis at death." : ""),
      ];

  const paragraphs: NarrativeParagraph[] = [];

  // ── Hold ──
  {
    const first = hold.years[0];
    const last = hold.years[hold.years.length - 1];
    const liq = hold.liquidationByYear[hold.liquidationByYear.length - 1];
    const recapture = liq?.classification.unrecaptured1250Gain ?? 0;
    paragraphs.push({
      id: "hold",
      title: "If you hold everything",
      segments: [
        t(
          `${LABEL.hold} all ${household.properties.length} ${household.properties.length === 1 ? "property" : "properties"} for ${years} years takes equity from `,
        ),
        m(first?.equity ?? 0, {
          kind: "equity",
          strategy: "hold",
          year: household.market.asOfYear,
        }),
        t(" to "),
        m(last?.equity ?? 0, { kind: "equity", strategy: "hold", year: horizonYear }),
        t(", and generates "),
        m(hold.horizon.cumulativeCashFlowAfterTax),
        t(
          " of cumulative after-tax cash flow. The tax bill is postponed, not avoided: selling everything at the horizon would trigger ",
        ),
        m(hold.horizon.deferredTaxLiability, {
          kind: "deferredTax",
          strategy: "hold",
          year: horizonYear,
        }),
        t(", including "),
        m(recapture),
        t(" of depreciation recapture taxed at up to 25%."),
      ],
    });
  }

  // ── Sell ──
  if (sell.sale) {
    const s = sell.sale;
    const names = s.properties.map((x) => x.propertyName);
    const loss = s.totalGain < 0;
    const afterTaxAtHorizon = sell.horizon.cashBalance;
    paragraphs.push({
      id: "sell",
      title: `If you sell in ${s.year}`,
      segments: loss
        ? [
            t(`Selling ${listNames(names)} in ${s.year} for `),
            m(s.totalSalePrice),
            t(" realises a loss of "),
            m(-s.totalGain, { kind: "gainSplit", strategy: "sell" }),
            t(" against adjusted basis. It is treated as an ordinary Section 1231 loss, which "),
            m(-s.tax.total, { kind: "saleTaxTotal", strategy: "sell", year: s.year }),
            t(" reduces your tax. Net proceeds of "),
            m(s.netProceedsAfterTax, { kind: "netProceeds", strategy: "sell" }),
            t(` are reinvested; the account reaches `),
            m(afterTaxAtHorizon),
            t(` by ${horizonYear}.`),
          ]
        : [
            t(`Selling ${listNames(names)} in ${s.year} for `),
            m(s.totalSalePrice),
            t(", less "),
            m(s.totalSellingCosts),
            t(" of selling costs and "),
            m(s.totalLoanPayoff),
            t(" of loan payoff, realises a gain of "),
            m(s.totalGain, { kind: "gainSplit", strategy: "sell" }),
            t(". Of that, "),
            m(s.classification.unrecaptured1250Gain),
            t(" is depreciation recapture taxed at up to 25%. Total tax is "),
            m(s.tax.total, { kind: "saleTaxTotal", strategy: "sell", year: s.year }),
            t(": "),
            m(s.tax.depreciationRecaptureTax, {
              kind: "recaptureTax",
              strategy: "sell",
              year: s.year,
            }),
            t(" recapture, "),
            m(s.tax.capitalGainsTax, { kind: "capitalGainsTax", strategy: "sell", year: s.year }),
            t(" capital gains, "),
            m(s.tax.netInvestmentIncomeTax, { kind: "niit", strategy: "sell", year: s.year }),
            t(" net investment income tax and "),
            m(s.tax.stateTax, { kind: "stateTax", strategy: "sell", year: s.year }),
            t(" state tax. You keep "),
            m(s.netProceedsAfterTax, { kind: "netProceeds", strategy: "sell" }),
            t(", which grows to "),
            m(afterTaxAtHorizon),
            t(
              ` by ${horizonYear} at the ${formatPercent(household.investor.reinvestmentReturnRate)} reinvestment return.`,
            ),
          ],
    });
  }

  // ── Exchange ──
  if (exchange.exchange) {
    const ex = exchange.exchange;
    const b = ex.boot;
    const tl = ex.timeline;
    if (!ex.completed) {
      paragraphs.push({
        id: "exchange",
        title: "If you try a 1031 exchange",
        segments: [
          t(
            `The timeline you set misses a deadline (identify by ${formatIsoLong(tl.identificationDeadline)}, close by ${formatIsoLong(tl.exchangeDeadline)}), so the exchange fails and the sale is taxed in full, exactly like a regular sale. Tighten the day counts in the Scenario Lab to see the deferral.`,
          ),
        ],
      });
    } else {
      const segs: NarrativeSegment[] = [
        t(`Exchanging into ${ex.replacementName} defers `),
        m(b.deferredGain, { kind: "deferredGain" }),
        t(" of the "),
        m(b.realizedGain),
        t(" gain. You must identify the replacement by "),
        t(formatIsoLong(tl.identificationDeadline)),
        t(" and close by "),
        t(formatIsoLong(tl.exchangeDeadline)),
        t("; your timeline closes "),
        t(`${formatIsoLong(tl.replacementClosing)}. The replacement's tax basis is `),
        m(b.replacementBasis, { kind: "replacementBasis" }),
        t(" against a price of "),
        m(b.replacementPrice),
        t(", so the gain travels with it. "),
      ];
      if (b.totalBoot > 0) {
        segs.push(
          t("Because "),
          m(b.totalBoot, { kind: "boot" }),
          t(" of boot is received (cash taken out or debt not replaced), "),
          m(b.recognizedGain),
          t(" of gain is taxable now, costing "),
          m(ex.bootTax.total),
          t(". "),
        );
      } else {
        segs.push(t("No boot is received, so nothing is taxed now. "));
      }
      segs.push(
        t("At the horizon the deferred tax liability is still "),
        m(exchange.horizon.deferredTaxLiability, {
          kind: "deferredTax",
          strategy: "exchange",
          year: horizonYear,
        }),
        t(": an exchange postpones tax, it does not remove it."),
      );
      paragraphs.push({ id: "exchange", title: "If you do a 1031 exchange", segments: segs });
    }
  }

  // ── Step-up ──
  paragraphs.push({
    id: "step-up",
    title: "What if you hold until death",
    segments: [
      t(
        "A step-up in basis resets every property's basis to market value for your heirs, erasing deferred gain and depreciation recapture. Under a step-up the deferred tax of ",
      ),
      m(hold.horizon.deferredTaxLiability),
      t(" under Hold and "),
      m(exchange.horizon.deferredTaxLiability),
      t(
        " under the exchange would be zero, while Sell is unaffected because its tax was already paid. Net worth if liquidated with a step-up would be ",
      ),
      m(hold.horizon.netWorthLiquidatedWithStepUp, {
        kind: "netWorthLiquidated",
        strategy: "hold",
        year: horizonYear,
        stepUp: true,
      }),
      t(" for Hold, "),
      m(sell.horizon.netWorthLiquidatedWithStepUp, {
        kind: "netWorthLiquidated",
        strategy: "sell",
        year: horizonYear,
        stepUp: true,
      }),
      t(" for Sell and "),
      m(exchange.horizon.netWorthLiquidatedWithStepUp, {
        kind: "netWorthLiquidated",
        strategy: "exchange",
        year: horizonYear,
        stepUp: true,
      }),
      t(" for the exchange."),
    ],
  });

  // ── Uncertainty ──
  const mc = options.monteCarlo;
  if (mc) {
    const band = mc.liquidated.hold;
    const last = band.years.length - 1;
    paragraphs.push({
      id: "uncertainty",
      title: "How sure is this?",
      segments: [
        t(
          `Across ${mc.config.paths} simulated markets (seed ${mc.config.seed}), selling beat holding in `,
        ),
        p(mc.probabilityBeatsHold.sell, 0),
        t(" of them and the exchange beat holding in "),
        p(mc.probabilityBeatsHold.exchange, 0),
        t(". Holding's net worth if liquidated ranged from "),
        m(band.p10[last] ?? 0),
        t(" (10th percentile) to "),
        m(band.p90[last] ?? 0),
        t(" (90th percentile)."),
      ],
    });
  }

  // ── Caveats ──
  const caveats: string[] = [
    "This is an educational simulation, not tax, legal or investment advice. Consult a qualified professional before acting.",
    "Passive activity loss limits, AMT, the Section 121 home-sale exclusion, installment sales and cost segregation are not modelled. See the assumptions page.",
    "Annual steps and a December 31 sale simplify timing. Taxes are assumed paid in the year of the sale.",
    "Reinvested proceeds and cash are assumed to earn an after-tax return; no tax drag is applied.",
  ];
  const negative = hold.years.some((y) => y.t > 0 && y.cashFlowBeforeTax < 0);
  if (negative)
    caveats.push(
      "At least one year has negative pre-tax cash flow; the shortfall is funded from your cash account and charged the reinvestment rate as an opportunity cost.",
    );
  if (
    hold.properties.some((pp) =>
      pp.loanSchedules.some((s) => s.rows.some((r) => r.capHit !== "none")),
    )
  ) {
    caveats.push(
      "An adjustable-rate loan resets against its caps. The index path is a simple linear assumption, not a forecast.",
    );
  }
  if (sell.sale && sell.sale.totalGain < 0)
    caveats.push(
      "The sale produces a Section 1231 loss that is assumed to offset ordinary income in full.",
    );
  if (exchange.exchange && !exchange.exchange.completed)
    caveats.push("The exchange timeline misses a deadline, so the deferral shown does not apply.");
  if (exchange.exchange?.completed && exchange.exchange.boot.totalBoot > 0)
    caveats.push(
      "Boot is recognised in the year the replacement closes and taxed as depreciation recapture first (the conservative ordering).",
    );
  if (mc)
    caveats.push(
      "Monte Carlo varies only appreciation and rent growth. It is not a forecast; change the seed to see a different set of market paths.",
    );
  caveats.push(
    `Tax law: ${household.market.taxTableYear} federal brackets indexed for inflation, flat state rate. Verify against current IRS publications.`,
  );

  return { headline, winner, ranking, paragraphs, caveats };
}
