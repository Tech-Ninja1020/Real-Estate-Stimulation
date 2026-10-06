import type { Household, ScenarioConfig } from "@/engine/types";
import type { PresetMeta } from "./helpers";
import {
  ACCIDENTAL_PORTFOLIO,
  ACCIDENTAL_PORTFOLIO_META,
  ACCIDENTAL_PORTFOLIO_SCENARIO,
} from "./accidental-portfolio";
import {
  LEVERAGED_BUILDER,
  LEVERAGED_BUILDER_META,
  LEVERAGED_BUILDER_SCENARIO,
} from "./leveraged-builder";
import {
  RETIRING_LANDLORD,
  RETIRING_LANDLORD_META,
  RETIRING_LANDLORD_SCENARIO,
} from "./retiring-landlord";

export interface Preset {
  meta: PresetMeta;
  household: Household;
  scenario: ScenarioConfig;
}

export const PRESETS: readonly Preset[] = [
  {
    meta: RETIRING_LANDLORD_META,
    household: RETIRING_LANDLORD,
    scenario: RETIRING_LANDLORD_SCENARIO,
  },
  {
    meta: ACCIDENTAL_PORTFOLIO_META,
    household: ACCIDENTAL_PORTFOLIO,
    scenario: ACCIDENTAL_PORTFOLIO_SCENARIO,
  },
  {
    meta: LEVERAGED_BUILDER_META,
    household: LEVERAGED_BUILDER,
    scenario: LEVERAGED_BUILDER_SCENARIO,
  },
];

export function getPreset(id: string): Preset | undefined {
  return PRESETS.find((p) => p.meta.id === id);
}

export type { PresetMeta };
