"use client";

import { useEffect, useRef, useState } from "react";
import { ASSUMPTIONS } from "@/data/assumptions";
import type { Assumption, AssumptionKind } from "@/data/assumptions";
import { cn } from "@/lib/cn";
import { AnchorIcon, ApproxIcon, CheckCircleIcon, InfoIcon, ShieldIcon, WarnIcon } from "./icons";
import { TaxTablesSection } from "./TaxTablesSection";

const KIND: Record<AssumptionKind, { label: string; blurb: string; badge: string }> = {
  modeled: {
    label: "Modeled",
    blurb: "The engine computes this rule explicitly.",
    badge: "bg-accent-soft text-accent",
  },
  simplification: {
    label: "Simplification",
    blurb: "A deliberate shortcut that keeps the model readable.",
    badge: "border border-line bg-surface-2 text-ink-2",
  },
  "not-modeled": {
    label: "Not modeled",
    blurb: "Out of scope. Can change a real decision.",
    badge: "bg-amber-soft text-amber",
  },
};

function KindIcon({ kind, size = 14 }: { kind: AssumptionKind; size?: number }) {
  if (kind === "modeled") return <CheckCircleIcon size={size} />;
  if (kind === "simplification") return <ApproxIcon size={size} />;
  return <WarnIcon size={size} />;
}

function KindBadge({ kind }: { kind: AssumptionKind }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold",
        KIND[kind].badge,
      )}
    >
      <KindIcon kind={kind} size={13} />
      {KIND[kind].label}
    </span>
  );
}

/** Plain statements of why each excluded rule can change a real decision, matched by the start of the item text. */
const WHY: { match: string; why: string }[] = [
  {
    match: "Passive activity",
    why: "Suspended losses shrink the tax shield credited to rental income, so Hold can look better here than it would in practice.",
  },
  {
    match: "Alternative Minimum",
    why: "A large gain or large deductions can trigger it and add tax this model never shows.",
  },
  {
    match: "Section 121",
    why: "A former home can exclude part of its gain, which would make Sell much cheaper than shown.",
  },
  {
    match: "Installment",
    why: "Spreading a gain over several years can defer tax and keep income out of higher brackets, narrowing Sell's disadvantage.",
  },
  {
    match: "Cost segregation",
    why: "Faster depreciation lifts early cash flow but also raises the recapture bill at sale.",
  },
  {
    match: "Section 1031 multi",
    why: "Real exchanges are bound by identification and structure rules that can limit which replacement options exist.",
  },
  {
    match: "Delaware",
    why: "These are alternative deferral or exit routes an advisor may prefer to a plain exchange.",
  },
  {
    match: "Estate and gift",
    why: "A step-up here only erases income tax; a large estate can still owe estate tax.",
  },
  {
    match: "State-specific",
    why: "Some states do not follow federal 1031 treatment or add transfer taxes, changing what each path really costs.",
  },
  {
    match: "Itemised",
    why: "A large sale can push income into higher Medicare premium bands and phase out other deductions.",
  },
  {
    match: "Property tax",
    why: "These costs can erode returns on Hold or a replacement property by more than the model shows.",
  },
];

function whyFor(item: string): string | undefined {
  return WHY.find((w) => item.startsWith(w.match))?.why;
}

const DETERMINISM = [
  "Every amount is an integer number of cents; there is no floating-point money.",
  "No clock and no unseeded randomness anywhere in the engine. Monte Carlo uses a seed you can see and change.",
  "Same inputs always produce identical outputs, so a shared link reproduces the exact view.",
  "Golden-file tests lock every sample household, so any change to a result is deliberate and visible.",
];

const SECTION_IDS = [...ASSUMPTIONS.map((a) => a.id), "tax-tables", "determinism"];
const TOC: { id: string; label: string; kind?: AssumptionKind }[] = [
  ...ASSUMPTIONS.map((a) => ({ id: a.id, label: a.title, kind: a.kind })),
  { id: "tax-tables", label: "Versioned tax tables" },
  { id: "determinism", label: "How the engine stays deterministic" },
];

function AssumptionSection({ a, flash }: { a: Assumption; flash: boolean }) {
  const risk = a.kind === "not-modeled";
  return (
    <section
      id={a.id}
      aria-labelledby={`${a.id}-title`}
      className={cn(
        "assumption-section group scroll-mt-28 rounded-2xl p-6 sm:p-8",
        risk
          ? "bg-amber-soft border border-[color-mix(in_srgb,var(--amber)_45%,transparent)]"
          : "card",
        flash && "is-flash",
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <KindBadge kind={a.kind} />
        {a.reference && (
          <span className="border-line bg-surface text-ink-2 inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs">
            <span className="eyebrow !text-[0.625rem]">Ref</span>
            <span className="num">{a.reference}</span>
          </span>
        )}
      </div>
      <h2
        id={`${a.id}-title`}
        className="display text-ink mt-4 flex items-start gap-2 text-2xl leading-snug sm:text-[1.75rem]"
      >
        <span>{a.title}</span>
        <a
          href={`#${a.id}`}
          aria-label={`Link to ${a.title}`}
          className="text-ink-3 hover:text-accent mt-1.5 shrink-0 rounded p-1 opacity-60 transition group-hover:opacity-100 hover:opacity-100 focus-visible:opacity-100 print:hidden"
        >
          <AnchorIcon size={16} />
        </a>
      </h2>
      <p className="text-ink mt-3 max-w-[64ch] text-[1.0625rem] leading-relaxed">{a.summary}</p>

      {risk ? (
        <ul className="mt-6 grid gap-3 md:grid-cols-2">
          {a.details.map((d) => {
            const why = whyFor(d);
            return (
              <li key={d} className="border-line bg-surface rounded-xl border p-4">
                <p className="text-ink flex gap-2.5 text-[0.9375rem] leading-relaxed">
                  <WarnIcon size={15} className="text-amber mt-[0.3rem] shrink-0" />
                  <span>{d}</span>
                </p>
                {why && (
                  <p className="border-line text-ink-2 mt-2.5 border-t pt-2.5 text-[0.8125rem] leading-relaxed">
                    <span className="text-amber mr-1.5 font-semibold">Why it matters</span>
                    {why}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <ul className="mt-5 max-w-[68ch] space-y-3">
          {a.details.map((d) => (
            <li key={d} className="text-ink-2 flex gap-3 text-[0.9375rem] leading-relaxed">
              <span
                aria-hidden="true"
                className={cn(
                  "mt-[0.6rem] size-1.5 shrink-0 rounded-full",
                  a.kind === "modeled" ? "bg-accent" : "bg-ink-3",
                )}
              />
              <span>{d}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function AssumptionsView() {
  const [active, setActive] = useState<string>(SECTION_IDS[0] ?? "");
  const [flashId, setFlashId] = useState<string | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Scroll to and briefly highlight the section named in the URL hash, on load and on change.
  useEffect(() => {
    const goToHash = () => {
      const id = decodeURIComponent(window.location.hash.slice(1));
      if (!id) return;
      const el = document.getElementById(id);
      if (!el) return;
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
      setActive(id);
      setFlashId(id);
      if (flashTimer.current) clearTimeout(flashTimer.current);
      flashTimer.current = setTimeout(() => setFlashId(null), 1900);
    };
    const first = setTimeout(goToHash, 80);
    window.addEventListener("hashchange", goToHash);
    return () => {
      clearTimeout(first);
      window.removeEventListener("hashchange", goToHash);
      if (flashTimer.current) clearTimeout(flashTimer.current);
    };
  }, []);

  // Highlight the section in view.
  useEffect(() => {
    const visible = new Set<string>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) visible.add(e.target.id);
          else visible.delete(e.target.id);
        }
        const first = SECTION_IDS.find((id) => visible.has(id));
        if (first) setActive(first);
      },
      { rootMargin: "-110px 0px -62% 0px" },
    );
    for (const id of SECTION_IDS) {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, []);

  // Keep the active TOC entry visible in the horizontal scroller (tablet).
  const tocRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const nav = tocRef.current;
    if (!nav || nav.scrollWidth <= nav.clientWidth + 2) return;
    const link = nav.querySelector<HTMLElement>(`[data-toc="${active}"]`);
    if (link) nav.scrollTo({ left: Math.max(0, link.offsetLeft - 24), behavior: "auto" });
  }, [active]);

  const counts = ASSUMPTIONS.reduce<Record<AssumptionKind, number>>(
    (acc, a) => ({ ...acc, [a.kind]: acc[a.kind] + 1 }),
    { modeled: 0, simplification: 0, "not-modeled": 0 },
  );
  const notModeled = ASSUMPTIONS.filter((a) => a.kind === "not-modeled");

  return (
    <div className="mx-auto max-w-6xl">
      <style>{`
        @keyframes assumption-flash {
          0% { box-shadow: 0 0 0 3px var(--accent), 0 0 0 10px var(--accent-soft); }
          100% { box-shadow: 0 0 0 0 transparent, 0 0 0 0 transparent; }
        }
        .assumption-section.is-flash { animation: assumption-flash 1.8s ease-out 1; }
        @media (prefers-reduced-motion: reduce) {
          .assumption-section.is-flash { animation: none; outline: 3px solid var(--accent); outline-offset: 3px; }
        }
        @media print { .assumption-section { break-inside: avoid; } }
      `}</style>

      <header className="max-w-3xl">
        <p className="eyebrow mb-3">Assumptions</p>
        <h1 className="display text-ink text-[2.25rem] leading-[1.08] sm:text-5xl">Assumptions</h1>
        <p className="display text-ink-2 mt-4 text-xl leading-snug sm:text-2xl">
          Every simplification and every rule we do not model, in one place.
        </p>
        <ul className="mt-7 flex flex-wrap gap-x-5 gap-y-3">
          {(Object.keys(KIND) as AssumptionKind[]).map((k) => (
            <li key={k} className="text-ink-2 flex items-center gap-2.5 text-sm">
              <KindBadge kind={k} />
              <span className="num text-ink font-medium">{counts[k]}</span>
              <span className="hidden sm:inline">{KIND[k].blurb}</span>
            </li>
          ))}
        </ul>
      </header>

      <div className="mt-10 grid gap-x-12 gap-y-6 lg:grid-cols-[15.5rem_minmax(0,1fr)]">
        <nav
          ref={tocRef}
          aria-label="On this page"
          className={cn(
            "no-print border-line sticky top-16 z-30 -mx-4 flex gap-1 overflow-x-auto border-b bg-[color-mix(in_srgb,var(--bg)_88%,transparent)] px-4 py-2 backdrop-blur-xl",
            "sm:-mx-6 sm:px-6",
            "lg:top-24 lg:mx-0 lg:max-h-[calc(100dvh-8rem)] lg:flex-col lg:gap-0.5 lg:self-start lg:overflow-y-auto lg:border-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none",
          )}
        >
          <p className="eyebrow mb-2 hidden px-3 lg:block">On this page</p>
          {TOC.map((t) => {
            const on = active === t.id;
            return (
              <a
                key={t.id}
                href={`#${t.id}`}
                data-toc={t.id}
                aria-current={on ? "location" : undefined}
                className={cn(
                  "flex shrink-0 items-start gap-2 rounded-lg px-3 py-1.5 text-[0.8125rem] leading-snug whitespace-nowrap transition lg:whitespace-normal",
                  on
                    ? "bg-surface-2 text-ink shadow-soft font-medium"
                    : "text-ink-3 hover:text-ink",
                  t.kind === "not-modeled" && !on && "text-amber",
                )}
              >
                {t.kind ? (
                  <span
                    className={cn(
                      "mt-[0.1rem] shrink-0",
                      t.kind === "not-modeled"
                        ? "text-amber"
                        : t.kind === "modeled"
                          ? "text-accent"
                          : "text-ink-3",
                    )}
                  >
                    <KindIcon kind={t.kind} size={13} />
                  </span>
                ) : (
                  <span className="text-ink-3 mt-[0.1rem] shrink-0">
                    <InfoIcon size={13} />
                  </span>
                )}
                {t.label}
              </a>
            );
          })}
        </nav>

        <div className="min-w-0 space-y-6">
          {notModeled.length > 0 && (
            <p className="text-ink-2 max-w-[64ch] text-sm leading-relaxed">
              Start with{" "}
              {notModeled.map((a, i) => (
                <span key={a.id}>
                  {i > 0 && ", "}
                  <a
                    href={`#${a.id}`}
                    className="text-amber font-medium underline decoration-dotted underline-offset-4"
                  >
                    {a.title}
                  </a>
                </span>
              ))}
              : those are the rules most likely to change a real decision.
            </p>
          )}
          {ASSUMPTIONS.map((a) => (
            <AssumptionSection key={a.id} a={a} flash={flashId === a.id} />
          ))}

          <TaxTablesSection flash={flashId === "tax-tables"} />

          <section
            id="determinism"
            aria-labelledby="determinism-title"
            className={cn(
              "assumption-section card scroll-mt-28 p-6 sm:p-8",
              flashId === "determinism" && "is-flash",
            )}
          >
            <p className="eyebrow">Reproducibility</p>
            <h2 id="determinism-title" className="display text-ink mt-3 text-2xl sm:text-[1.75rem]">
              How the engine stays deterministic
            </h2>
            <ul className="mt-5 grid max-w-[70ch] gap-3">
              {DETERMINISM.map((d) => (
                <li key={d} className="text-ink-2 flex gap-3 text-[0.9375rem] leading-relaxed">
                  <CheckCircleIcon size={16} className="text-accent mt-[0.2rem] shrink-0" />
                  <span>{d}</span>
                </li>
              ))}
            </ul>
          </section>

          <aside aria-label="Disclaimer" className="card-raised flex items-start gap-4 p-6 sm:p-8">
            <span className="border-line bg-surface-2 text-ink-2 grid size-11 shrink-0 place-items-center rounded-xl border">
              <ShieldIcon size={20} />
            </span>
            <div>
              <p className="display text-ink text-xl leading-snug sm:text-2xl">
                Educational simulation, not tax or investment advice.
              </p>
              <p className="text-ink-2 mt-2 max-w-[68ch] text-sm leading-relaxed">
                Everything on this page describes what the model does, not what the law requires of
                you. Consult a qualified tax professional before acting on any result.
              </p>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
