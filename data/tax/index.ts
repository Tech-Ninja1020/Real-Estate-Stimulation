import type { TaxTable } from "@/engine/types";
import { TAX_TABLE_2025 } from "./2025";
import { TAX_TABLE_2026 } from "./2026";

/** All available tax tables keyed by tax year. Add a new file per year and register it here. */
export const TAX_TABLES: Readonly<Record<number, TaxTable>> = {
  2025: TAX_TABLE_2025,
  2026: TAX_TABLE_2026,
};

export const LATEST_TAX_YEAR = 2026;

export function getTaxTable(taxYear: number): TaxTable {
  const table = TAX_TABLES[taxYear];
  if (!table) {
    throw new RangeError(
      `No tax table for ${taxYear}. Available: ${Object.keys(TAX_TABLES).join(", ")}`,
    );
  }
  return table;
}
