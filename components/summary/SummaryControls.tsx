"use client";

import { useEffect, useRef, useState } from "react";
import { Button, Toggle } from "@/components/ui/primitives";
import { fmtNumber } from "@/lib/format";
import { CheckCircleIcon, LinkIcon, PrintIcon } from "./icons";
import type { LoadedScenario } from "./types";

/** Copy link + print actions. */
export function SummaryActions({ s }: { s: LoadedScenario }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const copy = async () => {
    const url = s.shareUrl();
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 2200);
    } catch {
      window.prompt("Copy this link", url);
    }
  };

  return (
    <div className="no-print flex flex-wrap items-center gap-2.5">
      <Button onClick={copy} variant="secondary">
        {copied ? <CheckCircleIcon className="text-accent" /> : <LinkIcon />}
        {copied ? "Link copied" : "Copy shareable link"}
      </Button>
      <Button onClick={() => window.print()} variant="primary">
        <PrintIcon />
        Export PDF-style print view
      </Button>
      <span role="status" aria-live="polite" className="sr-only">
        {copied ? "Link copied to clipboard" : ""}
      </span>
    </div>
  );
}

/** Step-up and Monte Carlo switches with Monte Carlo run status. */
export function SummarySwitches({ s }: { s: LoadedScenario }) {
  const { monteCarlo } = s;
  return (
    <section
      aria-label="Summary options"
      className="no-print card grid gap-6 p-5 sm:grid-cols-2 sm:p-6"
    >
      <Toggle
        checked={s.stepUp}
        onChange={s.setStepUp}
        label="What if held until death?"
        description="Assumes a step-up in basis for heirs, which erases the deferred tax still owed under Hold and 1031 Exchange."
      />
      <div>
        <Toggle
          checked={monteCarlo.enabled}
          onChange={(enabled) => s.setMonteCarlo({ enabled })}
          label="Monte Carlo uncertainty"
          description="Re-runs the comparison across many simulated markets and adds an uncertainty paragraph to the narrative."
        />
        <McStatus s={s} />
      </div>
    </section>
  );
}

function McStatus({ s }: { s: LoadedScenario }) {
  const { mc } = s;
  if (mc.status === "off") return null;
  if (mc.status === "running") {
    const pct = Math.round(mc.progress * 100);
    return (
      <div className="mt-3 flex items-center gap-3" role="status" aria-live="polite">
        <div className="bg-surface-3 h-1.5 flex-1 overflow-hidden rounded-full" aria-hidden="true">
          <div
            className="bg-accent h-full rounded-full transition-[width] duration-200"
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="num text-ink-3 text-xs">Running {pct}%</span>
      </div>
    );
  }
  return (
    <p className="num text-ink-2 mt-3 inline-flex items-center gap-1.5 text-xs" role="status">
      <CheckCircleIcon size={13} className="text-accent" />
      Done: {fmtNumber(mc.result.config.paths)} paths, seed {mc.result.config.seed}
    </p>
  );
}
