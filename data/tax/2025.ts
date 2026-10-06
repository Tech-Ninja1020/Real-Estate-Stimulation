import { usd } from "@/engine/money";
import type { TaxBracket, TaxTable } from "@/engine/types";

function brackets(uppers: [number, number, number, number, number, number]): TaxBracket[] {
  const rates = [0.1, 0.12, 0.22, 0.24, 0.32, 0.35];
  const out: TaxBracket[] = uppers.map((u, i) => ({ upTo: usd(u), rate: rates[i] ?? 0.35 }));
  out.push({ upTo: null, rate: 0.37 });
  return out;
}

/** Tax year 2025 parameters (IRS Rev. Proc. 2024-40, standard deduction per the 2025 reconciliation act). */
export const TAX_TABLE_2025: TaxTable = {
  taxYear: 2025,
  source: "IRS Rev. Proc. 2024-40 (tax year 2025 inflation adjustments)",
  ordinaryBrackets: {
    single: brackets([11_925, 48_475, 103_350, 197_300, 250_525, 626_350]),
    mfj: brackets([23_850, 96_950, 206_700, 394_600, 501_050, 751_600]),
    mfs: brackets([11_925, 48_475, 103_350, 197_300, 250_525, 375_800]),
    hoh: brackets([17_000, 64_850, 103_350, 197_300, 250_500, 626_350]),
  },
  standardDeduction: {
    single: usd(15_750),
    mfj: usd(31_500),
    mfs: usd(15_750),
    hoh: usd(23_625),
  },
  ltcgBreakpoints: {
    single: { zeroRateTop: usd(48_350), fifteenRateTop: usd(533_400) },
    mfj: { zeroRateTop: usd(96_700), fifteenRateTop: usd(600_050) },
    mfs: { zeroRateTop: usd(48_350), fifteenRateTop: usd(300_000) },
    hoh: { zeroRateTop: usd(64_750), fifteenRateTop: usd(566_700) },
  },
  ltcgRates: { zero: 0, fifteen: 0.15, twenty: 0.2 },
  niit: {
    rate: 0.038,
    magiThreshold: {
      single: usd(200_000),
      mfj: usd(250_000),
      mfs: usd(125_000),
      hoh: usd(200_000),
    },
  },
  unrecaptured1250MaxRate: 0.25,
};
