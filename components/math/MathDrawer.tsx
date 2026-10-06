"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { MathTrace, TraceRef } from "@/engine/explain";
import { getAssumption } from "@/data/assumptions";
import { TraceValueView, traceValueText } from "./TraceValueView";

interface Props {
  trace: MathTrace | null;
  depth: number;
  onClose: () => void;
  onBack: () => void;
  onDrill: (ref: TraceRef) => void;
}

function traceAsText(trace: MathTrace): string {
  const lines: string[] = [trace.title + (trace.subtitle ? ` (${trace.subtitle})` : "")];
  lines.push(`Result: ${traceValueText(trace.result)}`, `Formula: ${trace.formula}`, "");
  if (trace.inputs.length) {
    lines.push("Inputs");
    for (const i of trace.inputs) lines.push(`  ${i.label}: ${traceValueText(i.value)}`);
    lines.push("");
  }
  lines.push("Steps");
  trace.steps.forEach((s, n) =>
    lines.push(`  ${n + 1}. ${s.label}: ${s.expression} = ${traceValueText(s.value)}`),
  );
  if (trace.notes.length) lines.push("", ...trace.notes.map((n) => `Note: ${n}`));
  lines.push("", "HoldSellSwap is an educational simulation, not tax or investment advice.");
  return lines.join("\n");
}

export function MathDrawer({ trace, depth, onClose, onBack, onDrill }: Props) {
  const open = trace !== null;
  const reduce = useReducedMotion();
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (open) {
      returnFocus.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      const t = setTimeout(() => closeRef.current?.focus(), 30);
      return () => clearTimeout(t);
    }
    returnFocus.current?.focus?.();
    return undefined;
  }, [open]);

  // Escape closes the drawer no matter where focus is (drilling down replaces the focused button).
  useEffect(() => {
    if (!open) return;
    const onEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onEscape);
    return () => window.removeEventListener("keydown", onEscape);
  }, [open, onClose]);

  // Keep focus inside the panel when the trace changes (drill-down / back).
  const traceId = trace?.id;
  useEffect(() => {
    if (!traceId) return;
    const t = setTimeout(() => {
      if (!panelRef.current?.contains(document.activeElement)) closeRef.current?.focus();
    }, 30);
    return () => clearTimeout(t);
  }, [traceId]);

  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key !== "Tab" || !panelRef.current) return;
    const focusables = panelRef.current.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (!first || !last) return;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }, []);

  const copy = async () => {
    if (!trace) return;
    try {
      await navigator.clipboard.writeText(traceAsText(trace));
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard unavailable: ignore */
    }
  };

  return (
    <AnimatePresence>
      {trace && (
        <motion.div
          key="math-root"
          className="no-print fixed inset-0 z-50"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduce ? 0 : 0.18 }}
          onKeyDown={onKeyDown}
        >
          <button
            aria-label="Close the math panel"
            tabIndex={-1}
            className="absolute inset-0 cursor-default bg-[color-mix(in_srgb,var(--bg)_55%,transparent)] backdrop-blur-[3px]"
            onClick={onClose}
          />
          <motion.aside
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label={`Show the math: ${trace.title}`}
            initial={{ x: reduce ? 0 : 48, opacity: reduce ? 1 : 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: reduce ? 0 : 48, opacity: 0 }}
            transition={{ type: "spring", stiffness: 380, damping: 38, mass: 0.9 }}
            className="border-line bg-surface shadow-pop absolute inset-y-0 right-0 flex w-full max-w-[30rem] flex-col border-l"
          >
            <header className="border-line flex items-start gap-3 border-b px-5 pt-4 pb-4">
              {depth > 1 && (
                <button
                  onClick={onBack}
                  className="border-line text-ink-2 hover:bg-surface-2 mt-0.5 grid size-8 shrink-0 place-items-center rounded-full border transition"
                  aria-label="Back to the previous figure"
                >
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <path
                      d="M10 3 5 8l5 5"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
              )}
              <div className="min-w-0 flex-1">
                <p className="eyebrow !text-accent mb-1.5 flex items-center gap-1.5">
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <path
                      d="M3 13V6m5 7V3m5 10V8"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                    />
                  </svg>
                  Show the math
                </p>
                <h2 className="display text-ink text-xl leading-tight">{trace.title}</h2>
                {trace.subtitle && <p className="text-ink-3 mt-0.5 text-sm">{trace.subtitle}</p>}
              </div>
              <button
                ref={closeRef}
                onClick={onClose}
                className="border-line text-ink-2 hover:bg-surface-2 grid size-8 shrink-0 place-items-center rounded-full border transition"
                aria-label="Close"
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path
                    d="m4 4 8 8M12 4l-8 8"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </header>

            <div className="flex-1 overflow-y-auto px-5 py-5">
              <div className="border-line bg-surface-2 mb-5 rounded-xl border p-4">
                <p className="eyebrow mb-2">Result</p>
                <p className="display text-ink text-4xl leading-none">
                  <TraceValueView value={trace.result} />
                </p>
              </div>

              <section className="mb-6">
                <p className="eyebrow mb-2">Formula</p>
                <p className="border-line bg-surface text-ink rounded-lg border px-3.5 py-3 font-mono text-[0.8125rem] leading-relaxed">
                  {trace.formula}
                </p>
              </section>

              {trace.inputs.length > 0 && (
                <section className="mb-6">
                  <p className="eyebrow mb-2">Inputs</p>
                  <ul className="divide-line border-line divide-y rounded-lg border">
                    {trace.inputs.map((input, i) => (
                      <li
                        key={i}
                        className="flex items-baseline justify-between gap-4 px-3.5 py-2.5 text-sm"
                      >
                        <span className="text-ink-2">
                          {input.label}
                          {input.note && (
                            <span className="text-ink-3 mt-0.5 block text-xs">{input.note}</span>
                          )}
                        </span>
                        {input.ref ? (
                          <button
                            onClick={() => onDrill(input.ref as TraceRef)}
                            className="fig num text-ink shrink-0 font-medium"
                            title="Show the math for this input"
                          >
                            {traceValueText(input.value)}
                          </button>
                        ) : (
                          <span className="num text-ink shrink-0 font-medium">
                            {traceValueText(input.value)}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              <section className="mb-6">
                <p className="eyebrow mb-3">Step by step</p>
                <ol className="relative space-y-0">
                  {trace.steps.map((step, i) => {
                    const last = i === trace.steps.length - 1;
                    return (
                      <li key={i} className="relative flex gap-3 pb-4 last:pb-0">
                        {!last && (
                          <span
                            aria-hidden="true"
                            className="bg-line absolute top-6 bottom-0 left-[11px] w-px"
                          />
                        )}
                        <span
                          className={`num z-10 grid size-[23px] shrink-0 place-items-center rounded-full border text-[11px] font-semibold ${last ? "border-accent bg-accent text-[var(--accent-ink)]" : "border-line-strong bg-surface text-ink-2"}`}
                        >
                          {i + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline justify-between gap-3">
                            <p className="text-ink text-sm font-medium">{step.label}</p>
                            {step.ref ? (
                              <button
                                onClick={() => onDrill(step.ref as TraceRef)}
                                className="fig num text-ink shrink-0 text-sm font-semibold"
                                title="Show the math for this step"
                              >
                                {traceValueText(step.value)}
                              </button>
                            ) : (
                              <span className="num text-ink shrink-0 text-sm font-semibold">
                                {traceValueText(step.value)}
                              </span>
                            )}
                          </div>
                          <p className="num text-ink-3 mt-0.5 font-mono text-xs leading-relaxed break-words">
                            {step.expression}
                          </p>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </section>

              {trace.notes.length > 0 && (
                <section className="bg-amber-soft mb-6 rounded-lg border border-[color-mix(in_srgb,var(--amber)_35%,transparent)] p-3.5">
                  <p className="eyebrow !text-amber mb-1.5">Worth knowing</p>
                  <ul className="text-ink-2 space-y-1.5 text-sm leading-relaxed">
                    {trace.notes.map((n, i) => (
                      <li key={i}>{n}</li>
                    ))}
                  </ul>
                </section>
              )}

              {trace.assumptionIds.length > 0 && (
                <section>
                  <p className="eyebrow mb-2">Assumptions behind this number</p>
                  <ul className="flex flex-wrap gap-2">
                    {trace.assumptionIds.map((id) => {
                      const a = getAssumption(id);
                      if (!a) return null;
                      return (
                        <li key={id}>
                          <Link
                            href={`/assumptions#${id}`}
                            onClick={onClose}
                            className="border-line text-ink-2 hover:border-accent hover:text-ink inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition"
                          >
                            {a.title}
                            <svg
                              width="10"
                              height="10"
                              viewBox="0 0 16 16"
                              fill="none"
                              aria-hidden="true"
                            >
                              <path
                                d="M6 3h7v7M13 3 4 12"
                                stroke="currentColor"
                                strokeWidth="1.6"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              )}
            </div>

            <footer className="border-line flex items-center justify-between gap-3 border-t px-5 py-3">
              <p className="text-ink-3 text-xs">Educational simulation, not tax advice.</p>
              <button
                onClick={copy}
                className="border-line text-ink-2 hover:bg-surface-2 rounded-full border px-3.5 py-1.5 text-xs font-medium transition"
                aria-live="polite"
              >
                {copied ? "Copied" : "Copy as text"}
              </button>
            </footer>
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
