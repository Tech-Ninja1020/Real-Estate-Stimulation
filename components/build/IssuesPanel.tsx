"use client";

import { useState } from "react";
import type { Household } from "@/engine/types";
import type { ValidationIssue } from "@/engine/validate";
import { cn } from "@/lib/cn";
import { describePath } from "./model";
import { CheckIcon, ChevronDown, ErrorIcon, WarnIcon } from "./ui";

export function issueSummary(errors: number, warnings: number): string {
  if (errors === 0 && warnings === 0) return "No issues. Everything checks out.";
  const parts: string[] = [];
  if (errors > 0) parts.push(`${errors} ${errors === 1 ? "error" : "errors"}`);
  if (warnings > 0) parts.push(`${warnings} ${warnings === 1 ? "warning" : "warnings"}`);
  return parts.join(" and ");
}

export function IssuesPanel({
  issues,
  draft,
  onJump,
}: {
  issues: readonly ValidationIssue[];
  draft: Household;
  onJump: (path: string) => void;
}) {
  const [open, setOpen] = useState(true);
  const errors = issues.filter((i) => i.severity === "error");
  const warnings = issues.filter((i) => i.severity === "warning");
  const sorted = [...errors, ...warnings];
  const clear = sorted.length === 0;

  return (
    <section aria-label="Validation" className="card overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3 sm:px-5">
        <span
          aria-hidden="true"
          className={cn(
            "grid size-7 shrink-0 place-items-center rounded-full",
            clear
              ? "bg-accent-soft text-accent"
              : errors.length > 0
                ? "bg-danger-soft text-danger"
                : "bg-amber-soft text-amber",
          )}
        >
          {clear ? (
            <CheckIcon size={14} />
          ) : errors.length > 0 ? (
            <ErrorIcon size={14} />
          ) : (
            <WarnIcon size={14} />
          )}
        </span>
        <p role="status" aria-live="polite" className="text-ink min-w-0 flex-1 text-sm font-medium">
          {issueSummary(errors.length, warnings.length)}
          {errors.length > 0 && (
            <span className="text-ink-3 ml-2 font-normal">
              The simulation can run once errors are fixed.
            </span>
          )}
        </p>
        {!clear && (
          <button
            type="button"
            aria-expanded={open}
            aria-controls="build-issues-list"
            onClick={() => setOpen((o) => !o)}
            className="text-ink-2 hover:bg-surface-2 hover:text-ink inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition"
          >
            {open ? "Hide" : "Show"} details
            <ChevronDown size={13} className={cn("transition-transform", open && "rotate-180")} />
          </button>
        )}
      </div>
      {!clear && open && (
        <ul id="build-issues-list" className="divide-line border-line divide-y border-t">
          {sorted.map((issue, i) => {
            const isError = issue.severity === "error";
            return (
              <li key={`${issue.path}-${i}`}>
                <button
                  type="button"
                  onClick={() => onJump(issue.path)}
                  className="hover:bg-surface-2 flex w-full items-start gap-3 px-4 py-3 text-left transition sm:px-5"
                >
                  {isError ? (
                    <ErrorIcon size={15} className="text-danger mt-0.5 shrink-0" />
                  ) : (
                    <WarnIcon size={15} className="text-amber mt-0.5 shrink-0" />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="text-ink block text-sm leading-snug">
                      <span className={cn("font-semibold", isError ? "text-danger" : "text-amber")}>
                        {isError ? "Error" : "Warning"}
                      </span>
                      <span className="text-ink-3"> · </span>
                      {issue.message}
                    </span>
                    <span className="text-ink-3 mt-0.5 block truncate text-xs">
                      {describePath(draft, issue.path)}
                    </span>
                  </span>
                  <span className="text-ink-3 mt-0.5 shrink-0 text-xs">Go to field</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
