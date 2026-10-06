"use client";

import { useId, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface LegendItem {
  key: string;
  label: string;
  /** CSS colour (usually a var(--...)). */
  color: string;
  /** SVG stroke-dasharray, shown as a secondary (non-colour) encoding. */
  dash?: string;
  /** "line" (default), "area" or "swatch". */
  shape?: "line" | "area" | "swatch";
}

export interface TableData {
  columns: string[];
  rows: (string | number)[][];
  caption?: string;
}

export function Legend({ items, className }: { items: LegendItem[]; className?: string }) {
  return (
    <ul
      className={cn("flex flex-wrap items-center gap-x-4 gap-y-1.5", className)}
      aria-label="Legend"
    >
      {items.map((item) => (
        <li key={item.key} className="text-ink-2 flex items-center gap-2 text-xs">
          <svg width="22" height="10" aria-hidden="true">
            {item.shape === "area" || item.shape === "swatch" ? (
              <rect x="3" y="1" width="16" height="8" rx="2" fill={item.color} />
            ) : (
              <line
                x1="1"
                y1="5"
                x2="21"
                y2="5"
                stroke={item.color}
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeDasharray={item.dash}
              />
            )}
          </svg>
          {item.label}
        </li>
      ))}
    </ul>
  );
}

/**
 * Standard chart chrome: title, optional subtitle, legend (always present for 2+ series),
 * a "View as table" toggle (the accessible, colour-independent alternative) and an actions slot.
 */
export function ChartFrame({
  title,
  subtitle,
  legend,
  table,
  actions,
  children,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  legend?: LegendItem[];
  table?: TableData;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const [showTable, setShowTable] = useState(false);
  const tableId = useId();
  return (
    <section className={cn("card p-5 sm:p-6", className)}>
      <header className="mb-4 flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <h3 className="display text-ink text-xl leading-tight">{title}</h3>
          {subtitle && (
            <p className="text-ink-3 mt-1 max-w-xl text-sm leading-relaxed">{subtitle}</p>
          )}
        </div>
        <div className="no-print flex items-center gap-2">
          {actions}
          {table && (
            <button
              onClick={() => setShowTable((v) => !v)}
              aria-expanded={showTable}
              aria-controls={tableId}
              className="border-line text-ink-2 hover:bg-surface-2 rounded-full border px-3 py-1.5 text-xs font-medium transition"
            >
              {showTable ? "View chart" : "View as table"}
            </button>
          )}
        </div>
      </header>
      {legend && legend.length > 0 && <Legend items={legend} className="mb-3" />}
      <div id={tableId}>{showTable && table ? <ChartTable data={table} /> : children}</div>
    </section>
  );
}

export function ChartTable({ data }: { data: TableData }) {
  return (
    <div className="border-line max-h-96 overflow-auto rounded-lg border">
      <table className="num w-full text-left text-sm">
        {data.caption && <caption className="sr-only">{data.caption}</caption>}
        <thead className="bg-surface-2 text-ink-3 sticky top-0 text-xs">
          <tr>
            {data.columns.map((c, i) => (
              <th
                key={c}
                scope="col"
                className={cn("px-3 py-2 font-medium", i > 0 && "text-right")}
              >
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-line divide-y">
          {data.rows.map((row, r) => (
            <tr key={r}>
              {row.map((cell, i) => (
                <td key={i} className={cn("text-ink px-3 py-1.5", i > 0 && "text-right")}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
