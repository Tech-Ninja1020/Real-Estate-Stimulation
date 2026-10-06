"use client";

import Link from "next/link";
import { Chip } from "@/components/ui/primitives";
import { Reveal } from "./Reveal";

const ICON = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

const PRINCIPLES = [
  {
    title: "Deterministic engine",
    body: "Same inputs, same outputs, to the dollar. Money is integer cents end to end, with no floating-point drift and no hidden randomness.",
    icon: (
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
        <path d="M4 7h16M4 12h16M4 17h10" {...ICON} />
        <path d="M18 15.5l1.6 1.6 2.9-3" {...ICON} />
      </svg>
    ),
  },
  {
    title: "Every number traceable",
    body: "Click any figure to Show the math: its formula, the inputs it used and each step, in plain language.",
    icon: (
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
        <circle cx="11" cy="11" r="6.5" {...ICON} />
        <path d="M16 16l4.5 4.5M8.5 11h5M11 8.5v5" {...ICON} />
      </svg>
    ),
  },
  {
    title: "Recapture is first-class",
    body: "Depreciation recapture is modelled slice by slice at its own rate, carried through exchanges, and shown wherever it bites.",
    icon: (
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
        <path d="M4 19V9M10 19V5M16 19v-7M22 19H2" {...ICON} />
      </svg>
    ),
  },
  {
    title: "Honest about the limits",
    body: "Passive loss limits, AMT, installment sales and more are not modelled. Every simplification is written down.",
    link: { href: "/assumptions", label: "Read what is not modelled" },
    icon: (
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
        <path d="M12 3l9 16H3z" {...ICON} />
        <path d="M12 10v4M12 16.8v.2" {...ICON} />
      </svg>
    ),
  },
];

function MathPreview() {
  return (
    <figure className="m-0">
      <div className="card-raised shadow-pop relative overflow-hidden">
        <div className="border-line flex items-center justify-between gap-3 border-b px-5 py-3.5">
          <div className="text-ink flex items-center gap-2 text-sm font-medium">
            <svg
              viewBox="0 0 24 24"
              width="16"
              height="16"
              aria-hidden="true"
              className="text-accent"
            >
              <path d="M5 4h14v16H5zM8 9h8M8 13h8M8 17h4" {...ICON} />
            </svg>
            Show the math
          </div>
          <Chip tone="accent">Example</Chip>
        </div>
        <div className="p-5 sm:p-6">
          <p className="eyebrow text-amber mb-2">Tax</p>
          <h3 className="display text-ink text-2xl leading-tight">Tax on depreciation recapture</h3>
          <p className="border-line bg-surface-2 text-ink-2 mt-3 rounded-xl border px-4 py-3 text-sm leading-relaxed">
            <span className="text-ink-3 mb-1 block text-[0.6875rem] font-semibold tracking-wide uppercase">
              Formula
            </span>
            Each slice of recapture is taxed at the lesser of its ordinary bracket rate and 25%.
          </p>
          <ol className="mt-4 space-y-2.5">
            <li className="border-line flex items-start justify-between gap-4 rounded-xl border px-4 py-3">
              <div>
                <p className="text-ink text-sm font-medium">Slice 1 in the 24% bracket</p>
                <p className="num text-ink-3 mt-0.5 text-xs">
                  $40,000 × min(24%, 25%) = $40,000 × 24%
                </p>
              </div>
              <p className="display num text-ink shrink-0 text-lg">$9,600</p>
            </li>
            <li className="border-line flex items-start justify-between gap-4 rounded-xl border px-4 py-3">
              <div>
                <p className="text-ink text-sm font-medium">Slice 2 in the 35% bracket</p>
                <p className="num text-ink-3 mt-0.5 text-xs">
                  $60,000 × min(35%, 25%) = $60,000 × 25%
                </p>
              </div>
              <p className="display num text-ink shrink-0 text-lg">$15,000</p>
            </li>
          </ol>
          <div className="bg-amber-soft mt-4 flex items-center justify-between gap-4 rounded-xl px-4 py-3.5">
            <p className="text-amber text-sm font-medium">Tax on recapture</p>
            <p className="display num text-amber text-2xl">$24,600</p>
          </div>
        </div>
      </div>
      <figcaption className="text-ink-3 mt-3 text-center text-xs">
        Illustrative numbers, shown to explain the drawer. Real figures come from your household.
      </figcaption>
    </figure>
  );
}

export function Trust() {
  return (
    <section aria-labelledby="trust-title" className="pt-24 sm:pt-28">
      <Reveal>
        <p className="eyebrow text-accent mb-3">Why you can trust the numbers</p>
        <h2
          id="trust-title"
          className="display text-ink max-w-2xl text-[clamp(1.9rem,3.6vw,2.75rem)] leading-[1.08]"
        >
          Nothing is a black box
        </h2>
      </Reveal>
      <div className="mt-10 grid items-start gap-8 lg:grid-cols-[1.1fr_1fr] lg:gap-12">
        <ul className="grid gap-4 sm:grid-cols-2">
          {PRINCIPLES.map((p, i) => (
            <li key={p.title}>
              <Reveal delay={i * 0.08} className="h-full">
                <div className="card h-full p-5 sm:p-6">
                  <div className="border-line bg-accent-soft text-accent grid size-10 place-items-center rounded-xl border">
                    {p.icon}
                  </div>
                  <h3 className="display text-ink mt-4 text-lg leading-snug">{p.title}</h3>
                  <p className="text-ink-2 mt-2 text-sm leading-relaxed">{p.body}</p>
                  {p.link && (
                    <Link
                      href={p.link.href}
                      className="text-accent mt-3 inline-flex items-center gap-1 text-sm font-medium underline decoration-dotted underline-offset-4 hover:decoration-solid"
                    >
                      {p.link.label}
                      <span aria-hidden="true">→</span>
                    </Link>
                  )}
                </div>
              </Reveal>
            </li>
          ))}
        </ul>
        <Reveal delay={0.15}>
          <MathPreview />
        </Reveal>
      </div>
    </section>
  );
}
