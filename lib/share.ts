import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from "lz-string";
import { getPreset } from "@/data/presets";
import type { Household, MonteCarloConfig, ScenarioConfig } from "@/engine/types";

/** Everything needed to reproduce a view, serialised into the `?s=` URL parameter. */
export interface SharedState {
  /** Preset id when the household is an unmodified preset; otherwise the full household is embedded. */
  preset?: string;
  household?: Household;
  config: ScenarioConfig;
  stepUp: boolean;
  monteCarlo: { enabled: boolean; config: MonteCarloConfig };
}

export function encodeState(state: SharedState): string {
  return compressToEncodedURIComponent(JSON.stringify(state));
}

export function decodeState(encoded: string): SharedState | null {
  try {
    const json = decompressFromEncodedURIComponent(encoded);
    if (!json) return null;
    const parsed = JSON.parse(json) as SharedState;
    if (!parsed.config || (!parsed.preset && !parsed.household)) return null;
    if (parsed.preset && !getPreset(parsed.preset)) return null;
    return parsed;
  } catch {
    return null;
  }
}
