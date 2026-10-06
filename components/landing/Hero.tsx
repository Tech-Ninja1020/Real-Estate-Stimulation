"use client";

import { motion, useReducedMotion } from "framer-motion";
import Link from "next/link";
import { useScenario } from "@/lib/scenario-store";
import { cn } from "@/lib/cn";
import { HeroChart } from "./HeroChart";
import type { PresetSim } from "./sims";

const BTN =
  "inline-flex items-center justify-center gap-2 rounded-full px-6 py-3 text-base font-medium transition select-none whitespace-nowrap";

function Arrow({ className }: { className?: string }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <path
        d="M3 8h10M9 4l4 4-4 4"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const TRUST = ["Deterministic engine", "Integer-cent math", "Every figure opens its formula"];

export function Hero({ sim }: { sim: PresetSim }) {
  const reduce = useReducedMotion() ?? false;
  const { status, household } = useScenario();

  const rise = (delay: number) => ({
    initial: { opacity: 0, y: 16 },
    animate: { opacity: 1, y: 0 },
    transition: {
      duration: reduce ? 0 : 0.7,
      delay: reduce ? 0 : delay,
      ease: [0.22, 1, 0.36, 1] as const,
    },
  });

  const scrollToSamples = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    document
      .getElementById("samples")
      ?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  };

  return (
    <section
      aria-labelledby="hero-title"
      className="border-line shadow-card relative isolate overflow-hidden rounded-[1.75rem] border bg-[linear-gradient(160deg,var(--surface),var(--surface-2))]"
    >
      <div
        aria-hidden="true"
        className="absolute -top-40 right-[-10%] -z-10 h-[28rem] w-[40rem] rounded-full opacity-70 blur-3xl"
        style={{ background: "radial-gradient(closest-side, var(--bg-glow-1), transparent)" }}
      />
      <HeroChart results={sim.results} />

      <div className="relative z-10 flex min-h-[36rem] flex-col justify-center px-6 py-16 sm:px-10 sm:py-20 lg:min-h-[40rem] lg:px-16">
        <div className="max-w-3xl">
          {status === "ready" && household && (
            <motion.div {...rise(0)} className="mb-6">
              <Link
                href="/lab"
                className="group border-line-strong bg-surface/70 text-ink-2 hover:border-accent hover:text-ink inline-flex items-center gap-2 rounded-full border py-1.5 pr-3 pl-2 text-xs font-medium backdrop-blur transition"
              >
                <span className="bg-accent size-2 rounded-full" aria-hidden="true" />
                Continue with {household.name}
                <Arrow className="size-3.5 transition group-hover:translate-x-0.5" />
              </Link>
            </motion.div>
          )}
          <motion.p {...rise(0.05)} className="eyebrow text-accent mb-5 flex items-center gap-2">
            <span className="bg-accent h-px w-8" aria-hidden="true" />
            Hold · Sell · 1031 Exchange
          </motion.p>
          <h1 id="hero-title" className="display text-ink">
            <motion.span
              {...rise(0.1)}
              className="block text-[clamp(2.75rem,6.4vw,5rem)] leading-[1.02] font-medium tracking-[-0.025em]"
            >
              Hold, sell, or swap?
            </motion.span>
            <motion.span
              {...rise(0.22)}
              className="text-ink-2 mt-3 block text-[clamp(1.75rem,3.6vw,3rem)] leading-[1.1] font-normal tracking-[-0.02em]"
            >
              See the tax math <em className="text-ink font-normal italic">before</em> you decide.
            </motion.span>
          </h1>
          <motion.p
            {...rise(0.34)}
            className="text-ink-2 mt-6 max-w-xl text-base leading-relaxed sm:text-lg"
          >
            A deterministic simulator that compares Hold, Sell and 1031 Exchange for a rental
            portfolio, with every number traceable to the formula behind it.
          </motion.p>
          <motion.div {...rise(0.44)} className="mt-9 flex flex-wrap items-center gap-3">
            <a
              href="#samples"
              onClick={scrollToSamples}
              className={cn(
                BTN,
                "bg-accent shadow-soft border border-transparent text-[var(--accent-ink)] hover:brightness-110 active:brightness-95",
              )}
            >
              Load a sample household
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path
                  d="M8 3v10M4 9l4 4 4-4"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </a>
            <Link
              href="/build"
              className={cn(
                BTN,
                "border-line-strong bg-surface/80 text-ink hover:bg-surface-2 border backdrop-blur",
              )}
            >
              Build your own
              <Arrow />
            </Link>
          </motion.div>
          <motion.ul
            {...rise(0.54)}
            aria-label="What makes it trustworthy"
            className="text-ink-3 mt-10 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs"
          >
            {TRUST.map((t, i) => (
              <li key={t} className="flex items-center gap-5 leading-none">
                {i > 0 && (
                  <span aria-hidden="true" className="bg-line-strong -ml-0.5 size-1 rounded-full" />
                )}
                <span>{t}</span>
              </li>
            ))}
          </motion.ul>
        </div>
      </div>
    </section>
  );
}
