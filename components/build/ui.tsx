"use client";

import type { ButtonHTMLAttributes, ReactNode, SVGProps } from "react";
import { cn } from "@/lib/cn";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Svg({ size = 16, children, ...rest }: IconProps & { children: ReactNode }) {
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
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const ErrorIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="8" cy="8" r="6.25" />
    <path d="M8 4.75v3.9M8 11.15v.1" />
  </Svg>
);

export const WarnIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M8 2.2 14.2 13H1.8L8 2.2Z" />
    <path d="M8 6.4v3M8 11.2v.1" />
  </Svg>
);

export const CheckIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="m3.4 8.5 3 3 6.2-6.7" />
  </Svg>
);

export const ChevronDown = (p: IconProps) => (
  <Svg {...p}>
    <path d="m4 6 4 4 4-4" />
  </Svg>
);

export const ArrowUp = (p: IconProps) => (
  <Svg {...p}>
    <path d="M8 13V3.5M3.8 7.2 8 3l4.2 4.2" />
  </Svg>
);

export const ArrowDown = (p: IconProps) => (
  <Svg {...p}>
    <path d="M8 3v9.5M3.8 8.8 8 13l4.2-4.2" />
  </Svg>
);

export const PlusIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M8 3v10M3 8h10" />
  </Svg>
);

export const TrashIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M2.8 4.2h10.4M6.2 4.2V2.8h3.6v1.4M4.2 4.2l.6 8.6c0 .3.3.5.6.5h5.2c.3 0 .6-.2.6-.5l.6-8.6M6.7 7v3.8M9.3 7v3.8" />
  </Svg>
);

export const CopyIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="5.4" y="5.4" width="8" height="8" rx="1.6" />
    <path d="M10.6 5.4V4a1.4 1.4 0 0 0-1.4-1.4H4A1.4 1.4 0 0 0 2.6 4v5.2A1.4 1.4 0 0 0 4 10.6h1.4" />
  </Svg>
);

export const HomeIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M2.2 13.5h11.6M3.6 13.5V7l4.4-3.8L12.4 7v6.5M6.6 13.5v-3.2h2.8v3.2" />
  </Svg>
);

export const ResetIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 8a5 5 0 1 0 1.7-3.8M3 2.8v2.6h2.6" />
  </Svg>
);

export function IconButton({
  label,
  className,
  children,
  tone = "neutral",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  tone?: "neutral" | "danger";
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        "text-ink-3 grid size-8 shrink-0 place-items-center rounded-full border border-transparent transition",
        "hover:bg-surface-2 hover:text-ink disabled:pointer-events-none disabled:opacity-35",
        tone === "danger" && "hover:bg-danger-soft hover:text-danger",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

/** A quiet sub-heading with an optional action on the right, used inside cards. */
export function SubHeading({
  title,
  hint,
  action,
  id,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
  id?: string;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h4 id={id} className="eyebrow">
          {title}
        </h4>
        {hint && <p className="text-ink-3 mt-1.5 text-xs leading-relaxed">{hint}</p>}
      </div>
      {action}
    </div>
  );
}
