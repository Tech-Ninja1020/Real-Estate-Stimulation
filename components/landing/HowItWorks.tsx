"use client";

import { Reveal } from "./Reveal";

const STROKE = { strokeWidth: 1.5, strokeLinecap: "round", strokeLinejoin: "round" } as const;

/** Illustration 1: a household becomes a short stack of property rows. */
function IllustrationHousehold() {
  return (
    <svg
      viewBox="0 0 240 132"
      className="h-auto w-full"
      role="img"
      aria-label="A stack of property cards with a plus button"
    >
      <rect
        x="22"
        y="14"
        width="196"
        height="30"
        rx="9"
        fill="var(--surface)"
        stroke="var(--line-strong)"
      />
      <path d="M38 33v-9l7-5 7 5v9z" fill="none" stroke="var(--accent)" {...STROKE} />
      <rect x="64" y="23" width="64" height="4" rx="2" fill="var(--ink-3)" opacity="0.5" />
      <rect x="64" y="31" width="40" height="3.5" rx="1.75" fill="var(--ink-3)" opacity="0.28" />
      <rect x="170" y="25" width="34" height="8" rx="4" fill="var(--accent-soft)" />
      <rect
        x="22"
        y="52"
        width="196"
        height="30"
        rx="9"
        fill="var(--surface)"
        stroke="var(--line-strong)"
      />
      <path d="M38 71v-9l7-5 7 5v9z" fill="none" stroke="var(--accent)" {...STROKE} />
      <rect x="64" y="61" width="52" height="4" rx="2" fill="var(--ink-3)" opacity="0.5" />
      <rect x="64" y="69" width="70" height="3.5" rx="1.75" fill="var(--ink-3)" opacity="0.28" />
      <rect x="170" y="63" width="34" height="8" rx="4" fill="var(--amber-soft)" />
      <rect
        x="22"
        y="90"
        width="196"
        height="28"
        rx="9"
        fill="none"
        stroke="var(--line-strong)"
        strokeDasharray="4 4"
      />
      <circle cx="120" cy="104" r="8" fill="var(--accent)" />
      <path
        d="M120 100v8M116 104h8"
        stroke="var(--accent-ink)"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Illustration 2: three diverging strategy lines. */
function IllustrationCompare() {
  return (
    <svg
      viewBox="0 0 240 132"
      className="h-auto w-full"
      role="img"
      aria-label="Three diverging lines for Hold, Sell and 1031 Exchange"
    >
      <g stroke="var(--grid)">
        {[24, 52, 80, 108].map((y) => (
          <line key={y} x1="14" x2="226" y1={y} y2={y} />
        ))}
      </g>
      <path
        d="M14 98C60 92 100 74 140 56S200 26 226 18"
        fill="none"
        stroke="var(--c-hold)"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M14 98C50 96 80 98 112 82S190 52 226 44"
        fill="none"
        stroke="var(--c-sell)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray="6 4"
      />
      <path
        d="M14 98C60 94 96 80 130 62S196 34 226 28"
        fill="none"
        stroke="var(--c-exchange)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray="2 3"
      />
      <circle cx="226" cy="18" r="3.5" fill="var(--c-hold)" />
      <circle cx="226" cy="44" r="3.5" fill="var(--c-sell)" />
      <circle cx="226" cy="28" r="3.5" fill="var(--c-exchange)" />
      <line
        x1="112"
        x2="112"
        y1="12"
        y2="116"
        stroke="var(--ink-3)"
        strokeDasharray="2 3"
        opacity="0.6"
      />
    </svg>
  );
}

/** Illustration 3: a figure with a dotted underline opening a formula card. */
function IllustrationMath() {
  return (
    <svg
      viewBox="0 0 240 132"
      className="h-auto w-full"
      role="img"
      aria-label="A figure with a dotted underline opening a formula card"
    >
      <text
        x="22"
        y="40"
        className="display"
        fontSize="26"
        fill="var(--ink)"
        style={{ fontFamily: "var(--font-display), Georgia, serif" }}
      >
        $24,600
      </text>
      <line
        x1="22"
        x2="106"
        y1="47"
        y2="47"
        stroke="var(--accent)"
        strokeWidth="1.5"
        strokeDasharray="1 3"
        strokeLinecap="round"
      />
      <path
        d="M118 52l8 12 3-5 6 9-4 2 2 4-5 1-3-5-5 4z"
        fill="var(--ink)"
        opacity="0.85"
        transform="translate(-20 -4)"
      />
      <rect
        x="64"
        y="62"
        width="158"
        height="58"
        rx="10"
        fill="var(--surface)"
        stroke="var(--line-strong)"
      />
      <rect x="64" y="62" width="4" height="58" rx="2" fill="var(--amber-fill)" />
      <rect x="80" y="74" width="92" height="4" rx="2" fill="var(--ink-3)" opacity="0.55" />
      <rect x="80" y="84" width="124" height="3.5" rx="1.75" fill="var(--ink-3)" opacity="0.28" />
      <rect x="80" y="93" width="110" height="3.5" rx="1.75" fill="var(--ink-3)" opacity="0.28" />
      <rect x="80" y="104" width="46" height="6" rx="3" fill="var(--amber-soft)" />
    </svg>
  );
}

const STEPS = [
  {
    n: "01",
    title: "Load or build a household",
    body: "Pick a sample portfolio or enter your own properties, loans, basis and tax profile.",
    art: <IllustrationHousehold />,
  },
  {
    n: "02",
    title: "Compare Hold, Sell and 1031",
    body: "The Scenario Lab runs all three strategies side by side and shows where the tax lands.",
    art: <IllustrationCompare />,
  },
  {
    n: "03",
    title: "Click any number for its formula",
    body: "Every figure opens a Show-the-math drawer with the inputs, steps and result behind it.",
    art: <IllustrationMath />,
  },
];

export function HowItWorks() {
  return (
    <section aria-labelledby="how-title" className="pt-24 sm:pt-28">
      <Reveal>
        <p className="eyebrow text-accent mb-3">How it works</p>
        <h2
          id="how-title"
          className="display text-ink max-w-2xl text-[clamp(1.9rem,3.6vw,2.75rem)] leading-[1.08]"
        >
          Three steps from a portfolio to a decision
        </h2>
      </Reveal>
      <ol className="mt-10 grid gap-5 md:grid-cols-3">
        {STEPS.map((s, i) => (
          <li key={s.n}>
            <Reveal delay={i * 0.1} className="h-full">
              <div className="card flex h-full flex-col overflow-hidden">
                <div className="border-line border-b bg-[linear-gradient(180deg,var(--surface-2),var(--surface))] px-6 pt-6 pb-4">
                  {s.art}
                </div>
                <div className="flex flex-1 flex-col p-6">
                  <p className="display text-accent num text-sm">{s.n}</p>
                  <h3 className="display text-ink mt-2 text-xl leading-snug">{s.title}</h3>
                  <p className="text-ink-2 mt-2 text-sm leading-relaxed">{s.body}</p>
                </div>
              </div>
            </Reveal>
          </li>
        ))}
      </ol>
    </section>
  );
}
