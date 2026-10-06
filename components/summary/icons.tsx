import type { StrategyKind } from "@/engine/types";
import { STRATEGY_COLOR, STRATEGY_DASH } from "@/lib/strategy";

interface IconProps {
  size?: number;
  className?: string;
}

function Svg({ size = 16, className, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {children}
    </svg>
  );
}

export const LinkIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6.5 9.5a3 3 0 0 0 4.2 0l2-2a3 3 0 0 0-4.2-4.2l-.7.7M9.5 6.5a3 3 0 0 0-4.2 0l-2 2a3 3 0 0 0 4.2 4.2l.7-.7" />
  </Svg>
);

export const PrintIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4.5 6V2.5h7V6M4.5 11.5h-2v-5h11v5h-2M4.5 9.5h7v4h-7z" />
  </Svg>
);

export const CheckCircleIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="8" cy="8" r="6" />
    <path d="m5.5 8.2 1.7 1.7 3.3-3.6" />
  </Svg>
);

export const AwardIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="8" cy="6" r="3.5" />
    <path d="m5.8 8.8-1 4.2L8 11.4l3.2 1.6-1-4.2" />
  </Svg>
);

export const WarnIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M8 2.3 14 13H2z" />
    <path d="M8 6.6v3M8 11.4v.1" />
  </Svg>
);

export const InfoIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="8" cy="8" r="6" />
    <path d="M8 7.4v3.4M8 5.3v.1" />
  </Svg>
);

export const ShieldIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M8 1.8 13 3.6v4c0 3-2.1 5.1-5 6.6-2.9-1.5-5-3.6-5-6.6v-4z" />
    <path d="M8 5.6v3M8 10.6v.1" />
  </Svg>
);

export const ChevronIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="m4.5 6.5 3.5 3.5 3.5-3.5" />
  </Svg>
);

export const AnchorIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6.5 2.5 5.5 13.5M10.5 2.5l-1 11M3 6h10.5M2.5 10H13" />
  </Svg>
);

/** "Approximately equal": a simplification. */
export const ApproxIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 6.2c1.6-1.6 3.2-1.6 5 0s3.4 1.6 5 0M3 10.6c1.6-1.6 3.2-1.6 5 0s3.4 1.6 5 0" />
  </Svg>
);

export const TableIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="2.5" y="3" width="11" height="10" rx="1.5" />
    <path d="M2.5 6.5h11M6.5 6.5V13" />
  </Svg>
);

export const ArrowRightIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 8h10M9 4l4 4-4 4" />
  </Svg>
);

/** Strategy key: a short line in the strategy colour with its dash pattern (a non-colour cue). */
export function StrategyKey({ strategy, width = 30 }: { strategy: StrategyKind; width?: number }) {
  return (
    <svg
      width={width}
      height="10"
      viewBox={`0 0 ${width} 10`}
      aria-hidden="true"
      className="shrink-0"
    >
      <line
        x1="1"
        y1="5"
        x2={width - 1}
        y2="5"
        stroke={STRATEGY_COLOR[strategy]}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray={STRATEGY_DASH[strategy]}
      />
    </svg>
  );
}
