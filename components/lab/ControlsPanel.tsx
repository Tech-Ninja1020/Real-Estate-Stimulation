"use client";

import { useState, type ReactNode } from "react";
import { Button, Chip, Segmented, SliderField, Toggle } from "@/components/ui/primitives";
import { usd } from "@/engine/money";
import type { HorizonYears, ReplacementDebt } from "@/engine/types";
import { cn } from "@/lib/cn";
import { fmtMoney, fmtPercent } from "@/lib/format";
import { useLoadedScenario } from "@/lib/scenario-store";

type Loaded = NonNullable<ReturnType<typeof useLoadedScenario>>;

function Group({
  title,
  eyebrow,
  children,
  defaultOpen = true,
  aside,
}: {
  title: string;
  eyebrow?: string;
  children: ReactNode;
  defaultOpen?: boolean;
  aside?: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="border-line border-t py-5 first:border-t-0 first:pt-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="mb-3 flex w-full items-center justify-between gap-3 text-left"
      >
        <span>
          {eyebrow && <span className="eyebrow mb-1.5 block">{eyebrow}</span>}
          <span className="display text-ink text-lg">{title}</span>
        </span>
        <span className="flex items-center gap-2">
          {aside}
          <svg
            width="14"
            height="14"
            viewBox="0 0 16 16"
            fill="none"
            aria-hidden="true"
            className={cn("text-ink-3 transition-transform", open && "rotate-180")}
          >
            <path
              d="m4 6 4 4 4-4"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      </button>
      {open && <div className="space-y-5">{children}</div>}
    </section>
  );
}

function WindowStatus({ ok, label }: { ok: boolean; label: string }) {
  return (
    <p
      className={cn(
        "mt-1 flex items-center gap-1.5 text-xs font-medium",
        ok ? "text-accent" : "text-amber",
      )}
    >
      {ok ? (
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path
            d="m3.5 8.5 3 3 6-7"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ) : (
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path
            d="M8 2 1.5 13.5h13L8 2Zm0 4.5v3.2m0 1.9v.1"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
      {label}
    </p>
  );
}

export function ControlsPanel({ scenario }: { scenario: Loaded }) {
  const {
    household,
    config,
    results,
    patchConfig,
    patchReplacement,
    toggleSellProperty,
    patchInvestor,
    monteCarlo,
    setMonteCarlo,
    mc,
    presetId,
    loadPreset,
  } = scenario;

  const firstSell = household.market.asOfYear + 1;
  const lastSell = household.market.asOfYear + household.investor.horizonYears - 1;
  const rep = config.replacement;
  const repDebt = rep.debt;
  const netProceeds = results.sell.sale?.netProceedsBeforeTax ?? 0;
  const cashOutMax = Math.max(100_000, Math.ceil(Math.max(0, netProceeds) / 100 / 10_000) * 10_000);
  const idOk = config.identificationDays <= 45;
  const closeOk = config.closingDays <= 180 && config.closingDays >= config.identificationDays;

  const setDebt = (debt: ReplacementDebt) => patchReplacement({ debt });

  return (
    <aside
      aria-label="Scenario controls"
      className="card-raised p-5 sm:p-6 lg:sticky lg:top-24 lg:max-h-[calc(100dvh-7rem)] lg:overflow-y-auto"
    >
      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
          <p className="eyebrow mb-1.5">Scenario controls</p>
          <p className="text-ink-3 text-xs">Every change recalculates instantly.</p>
        </div>
        {presetId && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => loadPreset(presetId)}
            title="Restore this household's starting controls"
          >
            Reset
          </Button>
        )}
      </div>

      <Group title="What to sell" eyebrow="Properties">
        <ul className="space-y-2">
          {household.properties.map((p) => {
            const selected = config.sellPropertyIds.includes(p.id);
            const row0 = results.hold.properties.find((x) => x.id === p.id)?.rows[0];
            return (
              <li key={p.id}>
                <label
                  className={cn(
                    "flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition",
                    selected ? "border-accent bg-accent-soft" : "border-line hover:bg-surface-2",
                  )}
                >
                  <input
                    type="checkbox"
                    className="mt-1 size-4 shrink-0 accent-[var(--accent)]"
                    checked={selected}
                    onChange={() => toggleSellProperty(p.id)}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="text-ink block truncate text-sm font-medium">{p.name}</span>
                    <span className="text-ink-3 mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs">
                      <span className="num">{fmtMoney(row0?.marketValue ?? 0)} value</span>
                      {row0 && row0.recaptureExposure > 0 && (
                        <span className="num text-amber">
                          {fmtMoney(row0.recaptureExposure)} recapture
                        </span>
                      )}
                      {row0 && row0.unrealizedGain < 0 && (
                        <span className="text-amber">sells at a loss</span>
                      )}
                    </span>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
        <p className="text-ink-3 text-xs">
          {config.sellPropertyIds.length === 0
            ? "Nothing selected: Sell and 1031 Exchange are identical to Hold."
            : `Selling ${config.sellPropertyIds.length} of ${household.properties.length} properties.`}
        </p>
      </Group>

      <Group title="When and how" eyebrow="Sale">
        <SliderField
          label="Sell year"
          value={config.sellYear}
          min={firstSell}
          max={lastSell}
          onChange={(v) => patchConfig({ sellYear: v })}
          display={String(config.sellYear)}
          hint="Closes December 31 of this year."
        />
        <SliderField
          label="Reinvestment return"
          value={Math.round(household.investor.reinvestmentReturnRate * 1000) / 10}
          min={0}
          max={10}
          step={0.1}
          onChange={(v) => patchInvestor({ reinvestmentReturnRate: v / 100 })}
          display={fmtPercent(household.investor.reinvestmentReturnRate)}
          hint="After-tax annual return on cash and sale proceeds."
        />
        <div>
          <p className="text-ink mb-2 text-sm font-medium">Planning horizon</p>
          <Segmented<HorizonYears>
            label="Planning horizon"
            value={household.investor.horizonYears}
            onChange={(v) => patchInvestor({ horizonYears: v })}
            options={[5, 10, 20, 30].map((y) => ({ value: y as HorizonYears, label: `${y} yrs` }))}
          />
        </div>
      </Group>

      <Group title="1031 exchange" eyebrow="Replacement property" defaultOpen>
        <SliderField
          label="Trade-up multiple"
          value={rep.priceMultiple}
          min={0.5}
          max={2}
          step={0.05}
          onChange={(v) => patchReplacement({ priceMultiple: Math.round(v * 100) / 100 })}
          display={`${rep.priceMultiple.toFixed(2)}× sale price`}
          hint="Replacement price as a multiple of the gross sale price. Below 1× creates taxable boot."
        />
        <div>
          <p className="text-ink mb-2 text-sm font-medium">Replacement debt</p>
          <Segmented<"matchRelinquished" | "ltv">
            label="Replacement debt"
            value={repDebt.kind === "ltv" ? "ltv" : "matchRelinquished"}
            onChange={(k) =>
              setDebt(k === "ltv" ? { kind: "ltv", ltv: 0.5 } : { kind: "matchRelinquished" })
            }
            options={[
              { value: "matchRelinquished", label: "Match old debt" },
              { value: "ltv", label: "Set LTV" },
            ]}
          />
          {repDebt.kind === "ltv" && (
            <div className="mt-3">
              <SliderField
                label="Loan-to-value"
                value={Math.round(repDebt.ltv * 100)}
                min={0}
                max={80}
                step={1}
                onChange={(v) => setDebt({ kind: "ltv", ltv: v / 100 })}
                display={`${Math.round(repDebt.ltv * 100)}%`}
              />
            </div>
          )}
        </div>
        <SliderField
          label="Cash taken out at closing"
          value={Math.round(config.cashOutAtClosing / 100 / 5_000) * 5_000}
          min={0}
          max={cashOutMax}
          step={5_000}
          onChange={(v) => patchConfig({ cashOutAtClosing: usd(v) })}
          display={fmtMoney(config.cashOutAtClosing)}
          hint="Cash you keep is boot, and it is taxable."
        />
        <div>
          <SliderField
            label="Identify replacement by day"
            value={config.identificationDays}
            min={0}
            max={60}
            onChange={(v) => patchConfig({ identificationDays: v })}
            display={`day ${config.identificationDays}`}
          />
          <WindowStatus
            ok={idOk}
            label={idOk ? "Within the 45-day window" : "Past day 45: the exchange fails"}
          />
        </div>
        <div>
          <SliderField
            label="Close on replacement by day"
            value={config.closingDays}
            min={0}
            max={210}
            onChange={(v) => patchConfig({ closingDays: v })}
            display={`day ${config.closingDays}`}
          />
          <WindowStatus
            ok={closeOk}
            label={
              closeOk
                ? "Within the 180-day window"
                : config.closingDays > 180
                  ? "Past day 180: the exchange fails"
                  : "Closing before identification is invalid"
            }
          />
        </div>
      </Group>

      <Group title="Replacement assumptions" eyebrow="Economics" defaultOpen={false}>
        <SliderField
          label="Gross rent yield"
          value={Math.round(rep.grossRentYield * 1000) / 10}
          min={4}
          max={12}
          step={0.1}
          onChange={(v) => patchReplacement({ grossRentYield: v / 100 })}
          display={fmtPercent(rep.grossRentYield)}
        />
        <SliderField
          label="Appreciation"
          value={Math.round(rep.appreciationRate * 1000) / 10}
          min={0}
          max={8}
          step={0.1}
          onChange={(v) => patchReplacement({ appreciationRate: v / 100 })}
          display={fmtPercent(rep.appreciationRate)}
        />
        <SliderField
          label="Rent growth"
          value={Math.round(rep.rentGrowthRate * 1000) / 10}
          min={0}
          max={8}
          step={0.1}
          onChange={(v) => patchReplacement({ rentGrowthRate: v / 100 })}
          display={fmtPercent(rep.rentGrowthRate)}
        />
        <SliderField
          label="Loan rate"
          value={Math.round(rep.loanRate * 1000) / 10}
          min={2}
          max={10}
          step={0.05}
          onChange={(v) => patchReplacement({ loanRate: Math.round(v * 10) / 1000 })}
          display={fmtPercent(rep.loanRate, 2)}
        />
        <SliderField
          label="Operating expenses"
          value={Math.round(rep.opexRateOfRent * 100)}
          min={15}
          max={55}
          step={1}
          onChange={(v) => patchReplacement({ opexRateOfRent: v / 100 })}
          display={`${Math.round(rep.opexRateOfRent * 100)}% of rent`}
        />
      </Group>

      <Group
        title="Uncertainty"
        eyebrow="Monte Carlo"
        defaultOpen={monteCarlo.enabled}
        aside={monteCarlo.enabled ? <Chip tone="accent">On</Chip> : undefined}
      >
        <Toggle
          checked={monteCarlo.enabled}
          onChange={(v) => setMonteCarlo({ enabled: v })}
          label="Show percentile bands"
          description="Re-runs every strategy under hundreds of random markets (10th / 50th / 90th percentile)."
        />
        {monteCarlo.enabled && (
          <>
            <div>
              <label htmlFor="mc-seed" className="text-ink mb-1.5 block text-sm font-medium">
                Random seed
              </label>
              <div className="flex gap-2">
                <input
                  id="mc-seed"
                  inputMode="numeric"
                  className="num border-line-strong bg-surface text-ink focus:border-accent w-full rounded-lg border px-3 py-2 text-sm"
                  value={monteCarlo.config.seed}
                  onChange={(e) => {
                    const n = Math.floor(Number(e.target.value.replace(/[^0-9]/g, "")));
                    if (Number.isFinite(n))
                      setMonteCarlo({ config: { seed: Math.min(n, 4_294_967_295) } });
                  }}
                />
                <Button
                  size="sm"
                  onClick={() =>
                    setMonteCarlo({
                      config: {
                        seed: (monteCarlo.config.seed * 1_103_515_245 + 12_345) % 1_000_000_000,
                      },
                    })
                  }
                >
                  New seed
                </Button>
              </div>
              <p className="text-ink-3 mt-1 text-xs">
                The same seed always draws the same markets.
              </p>
            </div>
            <div>
              <p className="text-ink mb-2 text-sm font-medium">Simulated markets</p>
              <Segmented<number>
                label="Simulated markets"
                value={monteCarlo.config.paths}
                onChange={(v) => setMonteCarlo({ config: { paths: v } })}
                options={[100, 200, 500].map((v) => ({ value: v, label: String(v) }))}
              />
            </div>
            <SliderField
              label="Appreciation volatility"
              value={Math.round(monteCarlo.config.appreciationVolatility * 1000) / 10}
              min={1}
              max={12}
              step={0.5}
              onChange={(v) => setMonteCarlo({ config: { appreciationVolatility: v / 100 } })}
              display={fmtPercent(monteCarlo.config.appreciationVolatility)}
              hint="Std. deviation of the yearly appreciation shock."
            />
            <SliderField
              label="Rent-growth volatility"
              value={Math.round(monteCarlo.config.rentGrowthVolatility * 1000) / 10}
              min={0}
              max={5}
              step={0.1}
              onChange={(v) => setMonteCarlo({ config: { rentGrowthVolatility: v / 100 } })}
              display={fmtPercent(monteCarlo.config.rentGrowthVolatility)}
            />
            {mc.status === "running" && (
              <p className="text-ink-3 text-xs" aria-live="polite">
                Simulating markets… {Math.round(mc.progress * 100)}%
              </p>
            )}
          </>
        )}
      </Group>
    </aside>
  );
}
