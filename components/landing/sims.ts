import { PRESETS } from "@/data/presets";
import type { Preset } from "@/data/presets";
import { buildStrategies, simulateScenario } from "@/engine/simulate";
import type { ScenarioResults } from "@/engine/types";

export interface PresetSim {
  preset: Preset;
  results: ScenarioResults;
}

/** Runs the real engine for every sample household (client-side, a few milliseconds each). */
export function runPresetSims(): PresetSim[] {
  return PRESETS.map((preset) => ({
    preset,
    results: simulateScenario(preset.household, buildStrategies(preset.scenario)),
  }));
}
