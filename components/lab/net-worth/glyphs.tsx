import type { TimelineEventKind } from "@/engine/types";

/** Icon geometry drawn in a 12x12 box centred on the origin, in the current stroke colour. */
export function GlyphShape({ kind }: { kind: TimelineEventKind }) {
  switch (kind) {
    case "purchase":
      return <path d="M-5 1 0 -4 5 1M-3.5 0v4.5h7V0" />;
    case "improvement":
      return <path d="M-4 0h8M0 -4v8" />;
    case "helocDraw":
      return <path d="M0 -4.5v7M-3 0 0 3 3 0" />;
    case "loanPaidOff":
      return <path d="M-4.5 0 -1.5 3 4.5 -3.5" />;
    case "armReset":
      return <path d="M0 -4.5 5 4h-10zM0 -1.2v2.4" />;
    case "ioEnds":
      return <path d="M-5 3.5h4.5v-7H5" />;
    case "sale":
      return <path d="M-3.5 3.5 3.5 -3.5M-1 -3.5h4.5V1" />;
    case "identification":
      return <path d="M-3 5V-5M-3 -4.5h6.5L1.5 -2l2 2.5H-3" />;
    case "exchangeDeadline":
      return (
        <>
          <circle r="4.6" />
          <path d="M0 -2.4V0l2 1.4" />
        </>
      );
    case "replacementClosing":
      return <path d="M-4.5 4.5h9V-.5L0 -4.5l-4.5 4zM-1.8 .4 -.3 2 2.4 -1.2" />;
    case "horizon":
      return <path d="M-5 -3.5 -2 0l-3 3.5M-.5 -3.5 2.5 0l-3 3.5M5.5 -4v8" />;
  }
}

/** A glyph inside a round badge, positioned at (cx, cy). */
export function GlyphBadge({
  kind,
  cx,
  cy,
  color,
  r = 10,
  filled,
}: {
  kind: TimelineEventKind;
  cx: number;
  cy: number;
  color: string;
  r?: number;
  filled?: boolean;
}) {
  return (
    <g transform={`translate(${cx},${cy})`}>
      <circle r={r} fill={filled ? color : "var(--surface)"} stroke={color} strokeWidth={1.5} />
      <g
        transform={`scale(${r / 10})`}
        fill="none"
        stroke={filled ? "var(--surface)" : color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <GlyphShape kind={kind} />
      </g>
    </g>
  );
}
