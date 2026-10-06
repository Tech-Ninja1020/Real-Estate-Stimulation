"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import type { Section } from "./model";
import { CheckIcon } from "./ui";

export interface RailItem {
  id: Section;
  label: string;
  detail: string;
  errors: number;
}

function Badge({ n, errors, active }: { n: number; errors: number; active: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "num grid size-7 shrink-0 place-items-center rounded-full border text-xs font-semibold transition",
        errors > 0
          ? "border-danger bg-danger-soft text-danger"
          : active
            ? "border-accent bg-accent text-[var(--accent-ink)]"
            : "border-line-strong bg-surface text-ink-3",
      )}
    >
      {errors > 0 ? "!" : active ? n : <CheckIcon size={13} />}
    </span>
  );
}

function srStatus(errors: number): ReactNode {
  return (
    <span className="sr-only">
      {errors > 0 ? `, ${errors} ${errors === 1 ? "error" : "errors"}` : ", complete"}
    </span>
  );
}

/** The step rail: vertical on wide screens, a horizontal pill bar below. */
export function StepRail({
  items,
  active,
  variant,
}: {
  items: RailItem[];
  active: Section;
  variant: "vertical" | "horizontal";
}) {
  if (variant === "horizontal") {
    return (
      <nav
        aria-label="Workbench sections"
        className="no-print border-line sticky top-16 z-20 -mx-4 border-b bg-[color-mix(in_srgb,var(--bg)_85%,transparent)] px-4 py-2.5 backdrop-blur-xl sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8 xl:hidden"
      >
        <ol className="flex items-center gap-2 overflow-x-auto">
          {items.map((it, i) => (
            <li key={it.id}>
              <a
                href={`#build-${it.id}`}
                aria-current={active === it.id ? "step" : undefined}
                className={cn(
                  "flex items-center gap-2 rounded-full border py-1 pr-3.5 pl-1 text-sm whitespace-nowrap transition",
                  active === it.id
                    ? "border-line-strong bg-surface text-ink shadow-soft font-medium"
                    : "text-ink-3 hover:text-ink border-transparent",
                )}
              >
                <Badge n={i + 1} errors={it.errors} active={active === it.id} />
                {it.label}
                {srStatus(it.errors)}
              </a>
            </li>
          ))}
        </ol>
      </nav>
    );
  }
  return (
    <nav aria-label="Workbench sections">
      <ol className="relative space-y-1">
        <span
          aria-hidden="true"
          className="bg-line-strong absolute top-5 bottom-5 left-[1.4rem] w-px"
        />
        {items.map((it, i) => (
          <li key={it.id} className="relative">
            <a
              href={`#build-${it.id}`}
              aria-current={active === it.id ? "step" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-xl px-2.5 py-2.5 transition",
                active === it.id ? "bg-surface shadow-soft" : "hover:bg-surface-2/70",
              )}
            >
              <Badge n={i + 1} errors={it.errors} active={active === it.id} />
              <span className="min-w-0">
                <span
                  className={cn(
                    "block text-sm font-medium",
                    active === it.id ? "text-ink" : "text-ink-2",
                  )}
                >
                  {it.label}
                  {srStatus(it.errors)}
                </span>
                <span className="text-ink-3 mt-0.5 block truncate text-xs">{it.detail}</span>
              </span>
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
