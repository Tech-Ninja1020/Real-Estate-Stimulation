"use client";

import { ScenarioGate } from "@/components/ScenarioGate";
import { CaveatsCard, DisclaimerCard } from "./CaveatsCard";
import { HeadlineCard } from "./HeadlineCard";
import { NarrativeSections } from "./NarrativeSections";
import { Scoreboard } from "./Scoreboard";
import { SummaryActions, SummarySwitches } from "./SummaryControls";
import type { LoadedScenario } from "./types";
import { YearTable } from "./YearTable";

const PRINT_CSS = `
@page { margin: 14mm 14mm 16mm; }
@media print {
  html { font-size: 12px; }
  .summary-root { max-width: none !important; }
  .summary-root > :not(:last-child) { margin-block-end: 1.5rem !important; }
  .summary-root, .summary-root * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .summary-root section, .summary-root article, .summary-root aside { break-inside: avoid; }
  .summary-root section.summary-narrative-section { break-inside: auto; }
  .summary-narrative-section > ol { border: 0 !important; break-inside: auto !important; }
  .summary-narrative-section li { break-inside: avoid; }
  .summary-root h2 { break-after: avoid; }
  .summary-root .display { letter-spacing: 0; }
  .summary-year-details::details-content { content-visibility: visible !important; display: block !important; }
  .summary-year-details { break-inside: avoid !important; }
  .summary-root .summary-scoreboard-grid { grid-template-columns: repeat(3, minmax(0, 1fr)) !important; }
  main { padding: 0 !important; }
}
`;

function PrintSettings({ s }: { s: LoadedScenario }) {
  const { household, horizonYear, stepUp, mc } = s;
  const parts = [
    `${household.investor.horizonYears}-year horizon to ${horizonYear}`,
    stepUp ? "Step-up in basis at death: on" : "Step-up in basis: off",
    mc.status === "done"
      ? `Monte Carlo: ${mc.result.config.paths} paths, seed ${mc.result.config.seed}`
      : "Monte Carlo: off",
  ];
  return <p className="text-ink-3 mt-1 text-xs">{parts.join(" · ")}</p>;
}

export function SummaryView() {
  return (
    <ScenarioGate>
      {(s) => (
        <div className="summary-root mx-auto max-w-6xl space-y-10 sm:space-y-14">
          <style>{PRINT_CSS}</style>

          <div className="hidden print:block">
            <p className="display text-ink text-xl">HoldSellSwap summary: {s.household.name}</p>
            <PrintSettings s={s} />
            <hr className="border-line-strong mt-3" />
          </div>

          <header className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0">
              <p className="eyebrow mb-3">Summary</p>
              <h1 className="display text-ink text-[2.25rem] leading-[1.08] sm:text-5xl">
                {s.household.name}
              </h1>
              <p className="text-ink-2 mt-3 max-w-xl text-[0.9375rem] leading-relaxed">
                What happens to this household under Hold, Sell and a 1031 Exchange, in one page you
                can show or print.
              </p>
            </div>
            <SummaryActions s={s} />
          </header>

          <SummarySwitches s={s} />
          <HeadlineCard s={s} />
          <Scoreboard s={s} />
          <NarrativeSections s={s} />
          {s.narrative && <CaveatsCard caveats={s.narrative.caveats} />}
          <YearTable s={s} />
          <DisclaimerCard />

          <p className="text-ink-3 hidden text-xs leading-relaxed print:block">
            HoldSellSwap is an educational simulation, not tax or investment advice. It models
            simplified U.S. federal and flat state tax rules; see the assumptions page for
            everything it leaves out.
          </p>
        </div>
      )}
    </ScenarioGate>
  );
}
