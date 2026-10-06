import type { TraceValue } from "@/engine/explain";
import { fmtMoney, fmtNumber, fmtPercent } from "@/lib/format";

export function traceValueText(v: TraceValue): string {
  switch (v.kind) {
    case "money":
      return fmtMoney(v.cents, { exact: v.exact });
    case "percent":
      return fmtPercent(v.value, v.digits ?? 1);
    case "number":
      return `${fmtNumber(v.value, v.digits ?? 0)}${v.unit ? ` ${v.unit}` : ""}`;
    case "year":
      return String(v.value);
    case "text":
      return v.text;
  }
}

export function TraceValueView({ value, className }: { value: TraceValue; className?: string }) {
  return <span className={`num ${className ?? ""}`}>{traceValueText(value)}</span>;
}
