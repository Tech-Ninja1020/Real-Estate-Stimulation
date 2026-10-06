import { usd } from "@/engine/money";
import type { TaxBracket, TaxTable } from "@/engine/types";

/** Build a bracket list from the upper bounds of the first six brackets (the 37% bracket is open). */
function brackets(uppers: [number, number, number, number, number, number]): TaxBracket[] {
  const rates = [0.1, 0.12, 0.22, 0.24, 0.32, 0.35];
  const out: TaxBracket[] = uppers.map((u, i) => ({ upTo: usd(u), rate: rates[i] ?? 0.35 }));
  out.push({ upTo: null, rate: 0.37 });
  return out;
}

/**
 * Tax year 2026 parameters (IRS Rev. Proc. 2025-32, as amended by the 2025 reconciliation act).
 * Keep numbers in whole dollars here; update this one file each January.
 * VERIFY against the IRS publication before relying on these figures.
 */
export const TAX_TABLE_2026: TaxTable = {
  taxYear: 2026,
  source: "IRS Rev. Proc. 2025-32 (tax year 2026 inflation adjustments)",
  ordinaryBrackets: {
    single: brackets([12_400, 50_400, 105_700, 201_775, 256_225, 640_600]),
    mfj: brackets([24_800, 100_800, 211_400, 403_550, 512_450, 768_700]),
    mfs: brackets([12_400, 50_400, 105_700, 201_775, 256_225, 384_350]),
    hoh: brackets([17_700, 67_450, 105_700, 201_750, 256_200, 640_600]),
  },
  standardDeduction: {
    single: usd(16_100),
    mfj: usd(32_200),
    mfs: usd(16_100),
    hoh: usd(24_150),
  },
  ltcgBreakpoints: {
    single: { zeroRateTop: usd(49_450), fifteenRateTop: usd(545_500) },
    mfj: { zeroRateTop: usd(98_900), fifteenRateTop: usd(613_700) },
    mfs: { zeroRateTop: usd(49_450), fifteenRateTop: usd(306_850) },
    hoh: { zeroRateTop: usd(66_200), fifteenRateTop: usd(579_600) },
  },
  ltcgRates: { zero: 0, fifteen: 0.15, twenty: 0.2 },
  niit: {
    rate: 0.038,
    // Statutory thresholds: not indexed for inflation.
    magiThreshold: {
      single: usd(200_000),
      mfj: usd(250_000),
      mfs: usd(125_000),
      hoh: usd(200_000),
    },
  },
  unrecaptured1250MaxRate: 0.25,
};
