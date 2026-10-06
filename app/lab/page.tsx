"use client";

import { useEffect, useState } from "react";
import { ScenarioGate } from "@/components/ScenarioGate";
import { ControlsPanel } from "@/components/lab/ControlsPanel";
import { LaneCards } from "@/components/lab/LaneCards";
import { SaleDollarBar } from "@/components/lab/SaleDollarBar";
import { NetWorthChart } from "@/components/lab/NetWorthChart";
import { TaxComparisonChart } from "@/components/lab/TaxComparisonChart";
import { TimelineStrip } from "@/components/lab/TimelineStrip";
import { WaterfallChart } from "@/components/lab/WaterfallChart";
import { Toggle } from "@/components/ui/primitives";
import { fmtMoney } from "@/lib/format";
import { STRATEGY_COLOR, STRATEGY_LABEL, STRATEGY_ORDER } from "@/lib/strategy";
import { useLoadedScenario } from "@/lib/scenario-store";

type Loaded = NonNullable<ReturnType<typeof useLoadedScenario>>;

function Verdict({ scenario }: { scenario: Loaded }) {
  const { results, year, stepUp } = scenario;
  const values = STRATEGY_ORDER.map((k) => {
    const row =
      results[k].years.find((y) => y.year === year) ??
      results[k].years[results[k].years.length - 1];
    return { k, v: row ? (stepUp ? row.netWorthLiquidatedWithStepUp : row.netWorthLiquidated) : 0 };
  }).sort((a, b) => b.v - a.v);
  const [first, second] = values;
  if (!first || !second) return null;
  const tie = first.v === (values[2]?.v ?? first.v);
  return (
    <p className="text-ink-2 text-sm" aria-live="polite">
      {tie ? (
        <>Nothing is selected to sell, so all three strategies are the same.</>
      ) : (
        <>
          At {year}, <strong className="text-ink font-semibold">{STRATEGY_LABEL[first.k]}</strong>{" "}
          leads by{" "}
          <span className="num text-ink font-semibold">{fmtMoney(first.v - second.v)}</span> over{" "}
          {STRATEGY_LABEL[second.k]}
          {stepUp ? ", assuming a step-up in basis at death" : ""}.
        </>
      )}
    </p>
  );
}

function Lab({ scenario }: { scenario: Loaded }) {
  const [metric, setMetric] = useState<"liquidated" | "afterTax">("liquidated");
  const {
    household,
    config,
    results,
    year,
    horizonYear,
    stepUp,
    mc,
    monteCarlo,
    setScrubYear,
    setStepUp,
  } = scenario;

  // Tint the page's ambient glow with the colour of whichever strategy leads at the scrubber year.
  const leader = (() => {
    const rows = STRATEGY_ORDER.map((k) => {
      const row =
        results[k].years.find((y) => y.year === year) ??
        results[k].years[results[k].years.length - 1];
      return {
        k,
        v: row ? (stepUp ? row.netWorthLiquidatedWithStepUp : row.netWorthLiquidated) : 0,
      };
    }).sort((a, b) => b.v - a.v);
    const top = rows[0];
    const bottom = rows[rows.length - 1];
    return top && bottom && top.v !== bottom.v ? top.k : null;
  })();
  useEffect(() => {
    const root = document.documentElement;
    const color = leader ? STRATEGY_COLOR[leader] : "var(--accent)";
    root.style.setProperty("--bg-glow-1", `color-mix(in srgb, ${color} 16%, transparent)`);
    return () => {
      root.style.removeProperty("--bg-glow-1");
    };
  }, [leader]);

  return (
    <div>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
        <div className="min-w-0">
          <p className="eyebrow mb-2.5">Scenario Lab</p>
          <h1 className="display text-ink text-3xl leading-tight sm:text-4xl">{household.name}</h1>
          <div className="mt-2">
            <Verdict scenario={scenario} />
          </div>
        </div>
        <div className="card w-full max-w-md px-4 py-3.5 sm:w-auto">
          <Toggle
            checked={stepUp}
            onChange={setStepUp}
            label="What if held until death?"
            description="A step-up in basis erases deferred tax. It changes the Hold vs Sell comparison dramatically."
          />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[21.5rem_minmax(0,1fr)] xl:grid-cols-[23rem_minmax(0,1fr)]">
        <ControlsPanel scenario={scenario} />

        <div className="min-w-0 space-y-6">
          <LaneCards results={results} year={year} horizonYear={horizonYear} stepUp={stepUp} />

          <NetWorthChart
            results={results}
            mc={mc}
            showBands={monteCarlo.enabled}
            metric={metric}
            onMetricChange={setMetric}
            stepUp={stepUp}
            year={year}
            onYearChange={setScrubYear}
            asOfYear={household.market.asOfYear}
            horizonYear={horizonYear}
            sellYear={config.sellYear}
          />

          <SaleDollarBar sale={results.sell.sale} />

          <div className="grid gap-6 2xl:grid-cols-2">
            <WaterfallChart sale={results.sell.sale} strategy="sell" />
            <TaxComparisonChart results={results} stepUp={stepUp} />
          </div>

          <TimelineStrip
            results={results}
            asOfYear={household.market.asOfYear}
            horizonYear={horizonYear}
            year={year}
            onYearChange={setScrubYear}
          />
        </div>
      </div>
    </div>
  );
}

export default function LabPage() {
  return <ScenarioGate>{(scenario) => <Lab scenario={scenario} />}</ScenarioGate>;
}
