import Link from "next/link";
import { ArrowRightIcon, InfoIcon, ShieldIcon } from "./icons";

const AMBER_BORDER = "border-[color-mix(in_srgb,var(--amber)_32%,transparent)]";

export function CaveatsCard({ caveats }: { caveats: string[] }) {
  return (
    <section
      aria-labelledby="caveats-heading"
      className={`rounded-2xl border ${AMBER_BORDER} bg-amber-soft p-6 sm:p-8`}
      style={{ breakInside: "avoid" }}
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow !text-amber">Read before relying on this</p>
          <h2 id="caveats-heading" className="display text-ink mt-2.5 text-2xl sm:text-3xl">
            Key assumptions and caveats
          </h2>
        </div>
        <Link
          href="/assumptions"
          className="no-print text-ink hover:text-accent inline-flex items-center gap-1.5 text-sm font-medium underline decoration-dotted underline-offset-4"
        >
          Read every assumption
          <ArrowRightIcon size={14} />
        </Link>
      </div>
      <ul className="mt-6 grid gap-x-10 gap-y-4 md:grid-cols-2">
        {caveats.map((c) => (
          <li key={c} className="text-ink-2 flex gap-3 text-[0.9375rem] leading-relaxed">
            <InfoIcon size={16} className="text-amber mt-[0.2rem] shrink-0" />
            <span>{c}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function DisclaimerCard() {
  return (
    <aside
      aria-label="Disclaimer"
      className="card-raised flex items-start gap-4 p-6 sm:p-8"
      style={{ breakInside: "avoid" }}
    >
      <span className="border-line bg-surface-2 text-ink-2 grid size-11 shrink-0 place-items-center rounded-xl border">
        <ShieldIcon size={20} />
      </span>
      <div>
        <p className="display text-ink text-xl leading-snug sm:text-2xl">
          Educational simulation, not tax or investment advice.
        </p>
        <p className="text-ink-2 mt-2 max-w-[68ch] text-sm leading-relaxed">
          HoldSellSwap models simplified U.S. federal and flat state tax rules to show how the
          choice between holding, selling and a 1031 exchange can play out. Real outcomes depend on
          facts this tool cannot see. Consult a qualified tax professional before acting.
        </p>
      </div>
    </aside>
  );
}
