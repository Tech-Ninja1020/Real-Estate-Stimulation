"use client";

import type { NarrativeSegment } from "@/engine/narrative";
import { Money, Pct } from "@/components/math/Fig";

/** Renders engine narrative segments; money and percent figures stay interactive. */
export function NarrativeText({
  segments,
  figureClassName,
}: {
  segments: NarrativeSegment[];
  figureClassName?: string;
}) {
  return (
    <>
      {segments.map((seg, i) => {
        switch (seg.kind) {
          case "text":
            return <span key={i}>{seg.text}</span>;
          case "money":
            return (
              <Money
                key={i}
                cents={seg.cents}
                trace={seg.ref}
                className={figureClassName ?? "text-ink font-semibold"}
              />
            );
          case "percent":
            return (
              <Pct
                key={i}
                rate={seg.value}
                digits={seg.digits ?? 1}
                className={figureClassName ?? "text-ink font-semibold"}
              />
            );
        }
      })}
    </>
  );
}
