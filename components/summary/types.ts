import type { useLoadedScenario } from "@/lib/scenario-store";

/** A scenario that is fully loaded (what `<ScenarioGate>` hands to its children). */
export type LoadedScenario = NonNullable<ReturnType<typeof useLoadedScenario>>;
