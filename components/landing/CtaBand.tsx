"use client";

import Link from "next/link";
import { useReducedMotion } from "framer-motion";
import { Reveal } from "./Reveal";

export function CtaBand() {
  const reduce = useReducedMotion() ?? false;
  return (
    <section aria-labelledby="cta-title" className="pt-24 pb-6 sm:pt-28">
      <Reveal>
        <div className="card-raised shadow-pop relative isolate overflow-hidden px-6 py-14 text-center sm:px-12 sm:py-16">
          <div
            aria-hidden="true"
            className="absolute inset-x-0 -top-24 -z-10 mx-auto h-72 max-w-2xl rounded-full opacity-80 blur-3xl"
            style={{ background: "radial-gradient(closest-side, var(--bg-glow-1), transparent)" }}
          />
          <h2
            id="cta-title"
            className="display text-ink mx-auto max-w-2xl text-[clamp(2rem,4vw,3rem)] leading-[1.08]"
          >
            Start with a sample household
          </h2>
          <p className="text-ink-2 mx-auto mt-3 max-w-lg text-base leading-relaxed">
            See Hold, Sell and 1031 Exchange side by side in seconds, then open any number to check
            the math.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <a
              href="#samples"
              onClick={(e) => {
                e.preventDefault();
                document
                  .getElementById("samples")
                  ?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
              }}
              className="bg-accent shadow-soft inline-flex items-center justify-center gap-2 rounded-full border border-transparent px-6 py-3 text-base font-medium whitespace-nowrap text-[var(--accent-ink)] transition hover:brightness-110 active:brightness-95"
            >
              Choose a sample
            </a>
            <Link
              href="/build"
              className="border-line-strong bg-surface text-ink hover:bg-surface-2 inline-flex items-center justify-center gap-2 rounded-full border px-6 py-3 text-base font-medium whitespace-nowrap transition"
            >
              Build your own
            </Link>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
