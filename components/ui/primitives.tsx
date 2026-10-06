"use client";

import Link from "next/link";
import { forwardRef, useId } from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "ghost" | "danger";

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-accent text-[var(--accent-ink)] shadow-soft hover:brightness-110 active:brightness-95 border border-transparent",
  secondary: "bg-surface text-ink border border-line-strong hover:bg-surface-2",
  ghost: "text-ink-2 hover:bg-surface-2 hover:text-ink border border-transparent",
  danger: "bg-danger-soft text-danger border border-transparent hover:brightness-95",
};

const base =
  "inline-flex items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition disabled:pointer-events-none disabled:opacity-50 select-none whitespace-nowrap";

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md" | "lg" }
>(function Button({ variant = "secondary", size = "md", className, ...props }, ref) {
  return (
    <button
      ref={ref}
      className={cn(
        base,
        VARIANTS[variant],
        size === "sm" && "px-3 py-1.5 text-xs",
        size === "lg" && "px-6 py-3 text-base",
        className,
      )}
      {...props}
    />
  );
});

export function ButtonLink({
  href,
  variant = "secondary",
  size = "md",
  className,
  children,
  ...rest
}: {
  href: string;
  variant?: Variant;
  size?: "sm" | "md" | "lg";
  className?: string;
  children: ReactNode;
} & Omit<React.ComponentProps<typeof Link>, "href" | "className" | "children">) {
  return (
    <Link
      href={href}
      className={cn(
        base,
        VARIANTS[variant],
        size === "sm" && "px-3 py-1.5 text-xs",
        size === "lg" && "px-6 py-3 text-base",
        className,
      )}
      {...rest}
    >
      {children}
    </Link>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn("skeleton", className)} />;
}

export function EmptyState({
  title,
  body,
  action,
  icon,
}: {
  title: string;
  body: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="card-raised mx-auto flex max-w-xl flex-col items-center px-8 py-14 text-center">
      <div className="border-line bg-surface-2 text-accent mb-5 grid size-14 place-items-center rounded-2xl border">
        {icon ?? (
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M3 20h18M5 20V10l7-6 7 6v10M10 20v-5h4v5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </div>
      <h2 className="display text-ink text-2xl">{title}</h2>
      <p className="text-ink-2 mt-2 max-w-md text-sm leading-relaxed">{body}</p>
      {action && <div className="mt-6 flex flex-wrap justify-center gap-3">{action}</div>}
    </div>
  );
}

/** Labelled range input with a filled track and a live value readout. */
export function SliderField({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  display,
  hint,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  display: ReactNode;
  hint?: string;
}) {
  const id = useId();
  const fill = max === min ? 0 : ((value - min) / (max - min)) * 100;
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-ink text-sm font-medium">
          {label}
        </label>
        <span className="num text-ink text-sm font-semibold">{display}</span>
      </div>
      <input
        id={id}
        type="range"
        className="slider"
        min={min}
        max={max}
        step={step}
        value={value}
        style={{ ["--fill" as string]: `${fill}%` }}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-valuetext={typeof display === "string" ? display : undefined}
      />
      {hint && <p className="text-ink-3 mt-0.5 text-xs">{hint}</p>}
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: ReactNode;
  description?: ReactNode;
}) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-4">
      <label htmlFor={id} className="min-w-0 cursor-pointer">
        <span className="text-ink block text-sm font-medium">{label}</span>
        {description && (
          <span className="text-ink-3 mt-0.5 block text-xs leading-relaxed">{description}</span>
        )}
      </label>
      <button
        id={id}
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative mt-0.5 h-6 w-10 shrink-0 rounded-full border transition",
          checked ? "bg-accent border-transparent" : "border-line-strong bg-surface-3",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow transition-transform",
            checked && "translate-x-4",
          )}
        />
      </button>
    </div>
  );
}

export function Segmented<T extends string | number>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  label: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="border-line bg-surface-2 inline-flex rounded-full border p-0.5"
    >
      {options.map((o) => (
        <button
          key={String(o.value)}
          role="radio"
          aria-checked={o.value === value}
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded-full px-3 py-1 text-xs font-medium transition",
            o.value === value ? "bg-surface text-ink shadow-soft" : "text-ink-3 hover:text-ink",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Chip({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "accent" | "amber" | "danger";
}) {
  const tones = {
    neutral: "bg-surface-2 text-ink-2 border-line",
    accent: "bg-accent-soft text-accent border-transparent",
    amber: "bg-amber-soft text-amber border-transparent",
    danger: "bg-danger-soft text-danger border-transparent",
  } as const;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium",
        tones[tone],
      )}
    >
      {children}
    </span>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  action,
  children,
}: {
  eyebrow?: string;
  title: ReactNode;
  action?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        {eyebrow && <p className="eyebrow mb-2">{eyebrow}</p>}
        <h2 className="display text-ink text-2xl leading-tight sm:text-3xl">{title}</h2>
        {children && (
          <p className="text-ink-2 mt-1.5 max-w-2xl text-sm leading-relaxed">{children}</p>
        )}
      </div>
      {action}
    </div>
  );
}
