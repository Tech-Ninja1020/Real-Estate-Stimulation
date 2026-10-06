"use client";

import { motion, useReducedMotion } from "framer-motion";
import { NarrativeText } from "./NarrativeText";
import type { LoadedScenario } from "./types";

/** The engine's narrative paragraphs, one titled section each, with a rail of section numbers. */
export function NarrativeSections({ s }: { s: LoadedScenario }) {
  const reduce = useReducedMotion();
  const paragraphs = s.narrative?.paragraphs ?? [];
  if (paragraphs.length === 0) return null;
  return (
    <section aria-labelledby="narrative-heading" className="summary-narrative-section">
      <h2 id="narrative-heading" className="display text-ink mb-6 text-2xl sm:text-3xl">
        The story in plain English
      </h2>
      <ol className="card divide-line divide-y">
        {paragraphs.map((para, i) => (
          <motion.li
            key={para.id}
            className="grid grid-cols-[2.75rem_1fr] gap-x-3 px-5 py-7 sm:grid-cols-[4.5rem_1fr] sm:gap-x-4 sm:px-8 sm:py-9"
            style={{ breakInside: "avoid" }}
            initial={{ opacity: 0, y: reduce ? 0 : 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: reduce ? 0 : 0.45, delay: reduce ? 0 : 0.06 * i }}
          >
            <span
              aria-hidden="true"
              className="display num text-ink-3 pt-0.5 text-2xl leading-none sm:text-3xl"
            >
              {String(i + 1).padStart(2, "0")}
            </span>
            <div className="min-w-0">
              <h3 className="display text-ink text-xl leading-snug sm:text-[1.5rem]">
                {para.title}
              </h3>
              <p className="text-ink-2 mt-3 max-w-[68ch] text-base leading-[1.75] sm:text-[1.0625rem]">
                <NarrativeText segments={para.segments} />
              </p>
            </div>
          </motion.li>
        ))}
      </ol>
    </section>
  );
}
