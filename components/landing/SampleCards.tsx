"use client";

import { AnimatePresence, motion, useInView, useReducedMotion } from "framer-motion";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Money, Num } from "@/components/math/Fig";
import { Chip } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";
import { useScenario } from "@/lib/scenario-store";
import { Reveal } from "./Reveal";
import { Sparkline } from "./Sparkline";
import type { PresetSim } from "./sims";

const LOAD_MS = 750;
const LOAD_MS_REDUCED = 200;

/** Counts up from zero the first time it scrolls into view. */
function useSeen(): [React.RefObject<HTMLElement | null>, 0 | 1] {
  const ref = useRef<HTMLElement>(null);
  const seen = useInView(ref, { once: true, margin: "0px 0px -10% 0px" });
  return [ref, seen ? 1 : 0];
}

function Stat({
  label,
  children,
  tone = "neutral",
  hint,
}: {
  label: string;
  children: React.ReactNode;
  tone?: "neutral" | "amber";
  hint?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border px-3.5 py-3",
        tone === "amber" ? "bg-amber-soft border-transparent" : "border-line bg-surface/60",
      )}
    >
      <dt
        className={cn(
          "text-[0.6875rem] font-medium tracking-wide",
          tone === "amber" ? "text-amber" : "text-ink-3",
        )}
      >
        {label}
      </dt>
      <dd
        className={cn(
          "display mt-1 text-[1.4rem] leading-none",
          tone === "amber" ? "text-amber" : "text-ink",
        )}
      >
        {children}
      </dd>
      {hint && (
        <p
          className={cn(
            "mt-1.5 text-[0.6875rem]",
            tone === "amber" ? "text-amber/80" : "text-ink-3",
          )}
        >
          {hint}
        </p>
      )}
    </div>
  );
}

function SampleCard({
  sim,
  index,
  disabled,
  onLoad,
}: {
  sim: PresetSim;
  index: number;
  disabled: boolean;
  onLoad: (sim: PresetSim) => void;
}) {
  const { meta, household } = sim.preset;
  const today = sim.results.hold.years[0];
  // k is 0 until the card scrolls into view, then 1: multiplying every stat by it makes the numbers count up.
  const [ref, k] = useSeen();
  if (!today) return null;
  const titleId = `sample-${meta.id}`;

  return (
    <Reveal delay={index * 0.1} className="h-full">
      <motion.article
        ref={ref}
        aria-labelledby={titleId}
        whileHover={{ y: -4 }}
        transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
        className="group border-line shadow-soft focus-within:border-accent @container relative flex h-full flex-col rounded-[1.25rem] border bg-[linear-gradient(180deg,var(--surface),var(--surface-2))] p-6 transition-[border-color,box-shadow] duration-300 hover:border-[color-mix(in_srgb,var(--accent)_55%,var(--line))] hover:shadow-[0_24px_60px_-24px_color-mix(in_srgb,var(--accent)_45%,transparent),var(--shadow-md)] sm:p-7"
      >
        <div className="flex items-center justify-between gap-3">
          <p className="eyebrow">Sample {String(index + 1).padStart(2, "0")}</p>
          <span className="border-line bg-surface text-ink-2 rounded-full border px-2.5 py-1 text-xs font-medium">
            <Num
              value={household.properties.length * k}
              duration={0.9}
              className="text-ink font-semibold"
            />{" "}
            {household.properties.length === 1 ? "property" : "properties"}
          </span>
        </div>

        <div className="mt-1 grid gap-x-9 gap-y-0 @2xl:grid-cols-[1.05fr_1fr]">
          <div>
            <h3 id={titleId} className="display text-ink mt-4 text-[1.75rem] leading-tight">
              {meta.name}
            </h3>
            <p className="text-accent mt-1 text-sm font-medium">{meta.tagline}</p>
            <p className="text-ink-2 mt-3 text-sm leading-relaxed">{meta.situation}</p>

            <ul
              className="mt-4 flex flex-wrap gap-1.5"
              aria-label="What this household demonstrates"
            >
              {meta.highlights.map((h) => (
                <li key={h}>
                  <Chip>{h}</Chip>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <dl className="mt-6 grid grid-cols-2 gap-2.5 @2xl:mt-4">
              <Stat label="Portfolio value">
                <Money cents={today.propertyValue * k} compact duration={1.1} />
              </Stat>
              <Stat label="Equity">
                <Money cents={today.equity * k} compact duration={1.1} />
              </Stat>
              <Stat label="Depreciation taken">
                <Money cents={today.accumulatedDepreciation * k} compact duration={1.1} />
              </Stat>
              <Stat label="Tax if sold today" tone="amber">
                <Money cents={today.deferredTaxLiability * k} compact duration={1.1} />
              </Stat>
            </dl>

            <div className="mt-6">
              <p className="text-ink-3 mb-2 text-[0.6875rem] font-medium tracking-wide">
                Liquidated net worth over the horizon
              </p>
              <Sparkline
                results={sim.results}
                label={`${meta.name}: liquidated net worth over the horizon`}
              />
            </div>
          </div>
        </div>

        <div className="flex-1" />
        <button
          type="button"
          disabled={disabled}
          onClick={() => onLoad(sim)}
          className="bg-accent shadow-soft mt-6 inline-flex w-full items-center justify-center gap-2 rounded-full border border-transparent px-5 py-3 text-sm font-semibold text-[var(--accent-ink)] transition hover:brightness-110 active:brightness-95 disabled:pointer-events-none disabled:opacity-60"
        >
          Load this household
          <svg
            width="15"
            height="15"
            viewBox="0 0 16 16"
            fill="none"
            aria-hidden="true"
            className="transition group-hover:translate-x-0.5"
          >
            <path
              d="M3 8h10M9 4l4 4-4 4"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </motion.article>
    </Reveal>
  );
}

function LoadingOverlay({ name, ms, reduce }: { name: string; ms: number; reduce: boolean }) {
  return (
    <motion.div
      key="overlay"
      role="status"
      aria-live="polite"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: reduce ? 0 : 0.25 }}
      className="fixed inset-0 z-[70] grid place-items-center bg-[color-mix(in_srgb,var(--bg)_78%,transparent)] px-4 backdrop-blur-xl"
    >
      <motion.div
        initial={{ opacity: 0, y: reduce ? 0 : 12, scale: reduce ? 1 : 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: reduce ? 0 : 0.35, ease: [0.22, 1, 0.36, 1] }}
        className="card-raised shadow-pop w-full max-w-md p-7"
      >
        <p className="eyebrow text-accent">Loading</p>
        <p className="display text-ink mt-3 text-2xl">{name}</p>
        <p className="text-ink-2 mt-1 text-sm">Running the simulation…</p>
        <div className="bg-surface-3 mt-6 h-1.5 overflow-hidden rounded-full">
          <motion.div
            className="bg-accent h-full origin-left rounded-full"
            initial={{ scaleX: reduce ? 1 : 0 }}
            animate={{ scaleX: 1 }}
            transition={{ duration: reduce ? 0 : ms / 1000, ease: [0.4, 0, 0.2, 1] }}
          />
        </div>
        <div className="mt-6 space-y-2.5" aria-hidden="true">
          <div className="skeleton h-3 w-11/12" />
          <div className="skeleton h-3 w-3/4" />
          <div className="skeleton h-16 w-full" />
        </div>
      </motion.div>
    </motion.div>
  );
}

export function SampleCards({ sims }: { sims: PresetSim[] }) {
  const router = useRouter();
  const reduce = useReducedMotion() ?? false;
  const { loadPreset } = useScenario();
  const [loading, setLoading] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ms = reduce ? LOAD_MS_REDUCED : LOAD_MS;

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const load = (sim: PresetSim) => {
    if (loading) return;
    setLoading(sim.preset.meta.name);
    loadPreset(sim.preset.meta.id);
    timer.current = setTimeout(() => router.push("/lab"), ms);
  };

  return (
    <section id="samples" aria-labelledby="samples-title" className="scroll-mt-24 pt-24 sm:pt-28">
      <Reveal>
        <p className="eyebrow text-accent mb-3">Sample households</p>
        <h2
          id="samples-title"
          className="display text-ink max-w-2xl text-[clamp(1.9rem,3.6vw,2.75rem)] leading-[1.08]"
        >
          Start from a real-feeling portfolio
        </h2>
        <p className="text-ink-2 mt-3 max-w-2xl text-base leading-relaxed">
          Each household is a full data set: loans, depreciation, improvements and tax profile. The
          figures below are computed by the engine in your browser, right now.
        </p>
      </Reveal>
      <div className="mt-10 grid gap-5 md:grid-cols-1 lg:grid-cols-3">
        {sims.map((sim, i) => (
          <SampleCard
            key={sim.preset.meta.id}
            sim={sim}
            index={i}
            disabled={loading !== null}
            onLoad={load}
          />
        ))}
      </div>
      <AnimatePresence>
        {loading && <LoadingOverlay name={loading} ms={ms} reduce={reduce} />}
      </AnimatePresence>
    </section>
  );
}
