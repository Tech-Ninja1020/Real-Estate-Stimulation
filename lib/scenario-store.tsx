"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { getPreset } from "@/data/presets";
import { DEFAULT_MONTE_CARLO, createMonteCarloRun } from "@/engine/montecarlo";
import { buildNarrative } from "@/engine/narrative";
import type { Narrative } from "@/engine/narrative";
import { buildStrategies, simulateScenario } from "@/engine/simulate";
import type { TraceContext } from "@/engine/explain";
import { validateHousehold, validateScenarioConfig } from "@/engine/validate";
import type { ValidationIssue } from "@/engine/validate";
import type {
  Household,
  InvestorProfile,
  MonteCarloConfig,
  MonteCarloResult,
  ReplacementAssumptions,
  ScenarioConfig,
  ScenarioResults,
  StrategySet,
  Year,
} from "@/engine/types";
import { decodeState, encodeState } from "./share";
import type { SharedState } from "./share";

// ───────────────────────────── State ─────────────────────────────

interface LoadedState {
  household: Household;
  /** Set while the household is an unmodified preset (keeps share links short). */
  presetId: string | null;
  config: ScenarioConfig;
  stepUp: boolean;
  monteCarlo: { enabled: boolean; config: MonteCarloConfig };
  /** Year the scrubber is parked on; null means the horizon. */
  scrubYear: Year | null;
}

type Status = "loading" | "empty" | "ready";

interface State {
  status: Status;
  data: LoadedState | null;
}

type Action =
  | { type: "hydrate"; data: LoadedState | null }
  | { type: "loadPreset"; id: string }
  | { type: "loadCustom"; household: Household; config: ScenarioConfig }
  | { type: "patchConfig"; patch: Partial<ScenarioConfig> }
  | { type: "patchReplacement"; patch: Partial<ReplacementAssumptions> }
  | { type: "toggleSellProperty"; id: string }
  | { type: "setStepUp"; value: boolean }
  | {
      type: "setMonteCarlo";
      patch: Partial<{ enabled: boolean; config: Partial<MonteCarloConfig> }>;
    }
  | { type: "setScrub"; year: Year | null }
  | { type: "setHousehold"; household: Household }
  | { type: "patchInvestor"; patch: Partial<InvestorProfile> }
  | { type: "clear" };

function loadPresetData(id: string): LoadedState | null {
  const preset = getPreset(id);
  if (!preset) return null;
  return {
    household: preset.household,
    presetId: preset.meta.id,
    config: preset.scenario,
    stepUp: false,
    monteCarlo: { enabled: false, config: DEFAULT_MONTE_CARLO },
    scrubYear: null,
  };
}

function clampConfig(household: Household, config: ScenarioConfig): ScenarioConfig {
  const first = household.market.asOfYear + 1;
  const last = household.market.asOfYear + household.investor.horizonYears - 1;
  const ids = new Set(household.properties.map((p) => p.id));
  return {
    ...config,
    sellYear: Math.min(last, Math.max(first, config.sellYear)),
    sellPropertyIds: config.sellPropertyIds.filter((id) => ids.has(id)),
  };
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "hydrate":
      return action.data ? { status: "ready", data: action.data } : { status: "empty", data: null };
    case "loadPreset": {
      const data = loadPresetData(action.id);
      return data ? { status: "ready", data } : state;
    }
    case "loadCustom":
      return {
        status: "ready",
        data: {
          household: action.household,
          presetId: null,
          config: clampConfig(action.household, action.config),
          stepUp: false,
          monteCarlo: { enabled: false, config: DEFAULT_MONTE_CARLO },
          scrubYear: null,
        },
      };
    case "clear":
      return { status: "empty", data: null };
    default:
      break;
  }
  const data = state.data;
  if (!data) return state;
  switch (action.type) {
    case "patchConfig":
      return {
        ...state,
        data: { ...data, config: clampConfig(data.household, { ...data.config, ...action.patch }) },
      };
    case "patchReplacement":
      return {
        ...state,
        data: {
          ...data,
          config: { ...data.config, replacement: { ...data.config.replacement, ...action.patch } },
        },
      };
    case "toggleSellProperty": {
      const has = data.config.sellPropertyIds.includes(action.id);
      const ids = has
        ? data.config.sellPropertyIds.filter((x) => x !== action.id)
        : [...data.config.sellPropertyIds, action.id];
      return { ...state, data: { ...data, config: { ...data.config, sellPropertyIds: ids } } };
    }
    case "setStepUp":
      return { ...state, data: { ...data, stepUp: action.value } };
    case "setMonteCarlo":
      return {
        ...state,
        data: {
          ...data,
          monteCarlo: {
            enabled: action.patch.enabled ?? data.monteCarlo.enabled,
            config: { ...data.monteCarlo.config, ...(action.patch.config ?? {}) },
          },
        },
      };
    case "setScrub":
      return { ...state, data: { ...data, scrubYear: action.year } };
    case "patchInvestor": {
      const household: Household = {
        ...data.household,
        investor: { ...data.household.investor, ...action.patch },
      };
      return {
        ...state,
        data: { ...data, household, presetId: null, config: clampConfig(household, data.config) },
      };
    }
    case "setHousehold": {
      const household = action.household;
      return {
        ...state,
        data: {
          ...data,
          household,
          presetId: null,
          config: clampConfig(household, data.config),
        },
      };
    }
    default:
      return state;
  }
}

// ───────────────────────────── Context ─────────────────────────────

export type McState =
  | { status: "off" }
  | { status: "running"; progress: number }
  | { status: "done"; result: MonteCarloResult };

export interface ScenarioApi {
  status: Status;
  household: Household | null;
  presetId: string | null;
  config: ScenarioConfig | null;
  stepUp: boolean;
  monteCarlo: { enabled: boolean; config: MonteCarloConfig };
  /** The year every card is showing (scrubber position). */
  year: Year | null;
  horizonYear: Year | null;
  strategies: StrategySet | null;
  results: ScenarioResults | null;
  traceContext: TraceContext | null;
  narrative: Narrative | null;
  mc: McState;
  issues: ValidationIssue[];
  loadPreset: (id: string) => void;
  loadCustom: (household: Household, config: ScenarioConfig) => void;
  patchConfig: (patch: Partial<ScenarioConfig>) => void;
  patchReplacement: (patch: Partial<ReplacementAssumptions>) => void;
  toggleSellProperty: (id: string) => void;
  setStepUp: (value: boolean) => void;
  setMonteCarlo: (patch: Partial<{ enabled: boolean; config: Partial<MonteCarloConfig> }>) => void;
  setScrubYear: (year: Year | null) => void;
  setHousehold: (household: Household) => void;
  patchInvestor: (patch: Partial<InvestorProfile>) => void;
  clear: () => void;
  /** Absolute URL that reproduces this exact view. */
  shareUrl: () => string;
}

const ScenarioContext = createContext<ScenarioApi | null>(null);

export function useScenario(): ScenarioApi {
  const ctx = useContext(ScenarioContext);
  if (!ctx) throw new Error("useScenario must be used inside <ScenarioProvider>");
  return ctx;
}

function toShared(d: LoadedState): SharedState {
  return {
    ...(d.presetId ? { preset: d.presetId } : { household: d.household }),
    config: d.config,
    stepUp: d.stepUp,
    monteCarlo: d.monteCarlo,
  };
}

function fromShared(s: SharedState): LoadedState | null {
  const base = s.preset ? getPreset(s.preset)?.household : s.household;
  if (!base) return null;
  return {
    household: base,
    presetId: s.preset ?? null,
    config: clampConfig(base, s.config),
    stepUp: s.stepUp,
    monteCarlo: {
      enabled: s.monteCarlo.enabled,
      config: { ...DEFAULT_MONTE_CARLO, ...s.monteCarlo.config },
    },
    scrubYear: null,
  };
}

export function ScenarioProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, { status: "loading", data: null } as State);

  // Hydrate from the URL once on the client.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const shared = params.get("s");
    const decoded = shared ? decodeState(shared) : null;
    const presetId = params.get("preset");
    // `?preset=<id>` is a short deep link to a sample household (used by the README and screenshots).
    const data = decoded ? fromShared(decoded) : presetId ? loadPresetData(presetId) : null;
    dispatch({ type: "hydrate", data });
  }, []);

  const data = state.data;
  const strategies = useMemo(() => (data ? buildStrategies(data.config) : null), [data]);

  const results = useMemo(() => {
    if (!data || !strategies) return null;
    return simulateScenario(data.household, strategies);
  }, [data, strategies]);

  const traceContext = useMemo<TraceContext | null>(
    () => (data && results ? { household: data.household, results } : null),
    [data, results],
  );

  // Monte Carlo runs in small chunks so the UI stays responsive; it restarts when inputs change.
  const [mc, setMc] = useState<McState>({ status: "off" });
  const mcEnabled = data?.monteCarlo.enabled ?? false;
  const mcConfig = data?.monteCarlo.config;
  const mcHousehold = data?.household;
  useEffect(() => {
    if (!mcEnabled || !mcHousehold || !strategies || !mcConfig) return;
    let cancelled = false;
    const run = createMonteCarloRun(mcHousehold, strategies, mcConfig);
    let i = 0;
    const CHUNK = 10;
    const tick = () => {
      if (cancelled) return;
      const end = Math.min(mcConfig.paths, i + CHUNK);
      for (; i < end; i++) run.runPath(i);
      if (i >= mcConfig.paths) {
        setMc({ status: "done", result: run.finish() });
      } else {
        setMc({ status: "running", progress: i / mcConfig.paths });
        setTimeout(tick, 0);
      }
    };
    const handle = setTimeout(() => {
      if (cancelled) return;
      setMc({ status: "running", progress: 0 });
      tick();
    }, 120);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [mcEnabled, mcHousehold, strategies, mcConfig]);

  // Hide any stale result while Monte Carlo is switched off.
  const mcView = useMemo<McState>(() => (mcEnabled ? mc : { status: "off" }), [mcEnabled, mc]);
  const mcResult = mcView.status === "done" ? mcView.result : null;
  const narrative = useMemo(
    () =>
      traceContext && data
        ? buildNarrative(traceContext, { stepUp: data.stepUp, monteCarlo: mcResult })
        : null,
    [traceContext, data, mcResult],
  );

  const issues = useMemo<ValidationIssue[]>(
    () =>
      data
        ? [
            ...validateHousehold(data.household),
            ...validateScenarioConfig(data.household, data.config),
          ]
        : [],
    [data],
  );

  // Keep the address bar in sync so every view is a shareable link.
  const dataRef = useRef(data);
  dataRef.current = data;
  useEffect(() => {
    if (state.status === "loading") return;
    const handle = setTimeout(() => {
      const url = new URL(window.location.href);
      if (dataRef.current) url.searchParams.set("s", encodeState(toShared(dataRef.current)));
      else url.searchParams.delete("s");
      window.history.replaceState(window.history.state, "", url.toString());
    }, 250);
    return () => clearTimeout(handle);
  }, [state.status, data]);

  const shareUrl = useCallback(() => {
    const url = new URL(window.location.href);
    url.pathname = "/lab";
    url.hash = "";
    url.search = "";
    if (dataRef.current) url.searchParams.set("s", encodeState(toShared(dataRef.current)));
    return url.toString();
  }, []);

  const horizonYear = data
    ? data.household.market.asOfYear + data.household.investor.horizonYears
    : null;
  const year = data && horizonYear !== null ? (data.scrubYear ?? horizonYear) : null;

  const api = useMemo<ScenarioApi>(
    () => ({
      status: state.status,
      household: data?.household ?? null,
      presetId: data?.presetId ?? null,
      config: data?.config ?? null,
      stepUp: data?.stepUp ?? false,
      monteCarlo: data?.monteCarlo ?? { enabled: false, config: DEFAULT_MONTE_CARLO },
      year,
      horizonYear,
      strategies,
      results,
      traceContext,
      narrative,
      mc: mcView,
      issues,
      loadPreset: (id) => dispatch({ type: "loadPreset", id }),
      loadCustom: (household, config) => dispatch({ type: "loadCustom", household, config }),
      patchConfig: (patch) => dispatch({ type: "patchConfig", patch }),
      patchReplacement: (patch) => dispatch({ type: "patchReplacement", patch }),
      toggleSellProperty: (id) => dispatch({ type: "toggleSellProperty", id }),
      setStepUp: (value) => dispatch({ type: "setStepUp", value }),
      setMonteCarlo: (patch) => dispatch({ type: "setMonteCarlo", patch }),
      setScrubYear: (y) => dispatch({ type: "setScrub", year: y }),
      setHousehold: (household) => dispatch({ type: "setHousehold", household }),
      patchInvestor: (patch) => dispatch({ type: "patchInvestor", patch }),
      clear: () => dispatch({ type: "clear" }),
      shareUrl,
    }),
    [
      state.status,
      data,
      year,
      horizonYear,
      strategies,
      results,
      traceContext,
      narrative,
      mcView,
      issues,
      shareUrl,
    ],
  );

  return <ScenarioContext.Provider value={api}>{children}</ScenarioContext.Provider>;
}

/** Convenience for pages that require a loaded scenario. */
export function useLoadedScenario() {
  const s = useScenario();
  if (
    s.status !== "ready" ||
    !s.household ||
    !s.config ||
    !s.results ||
    !s.traceContext ||
    !s.strategies ||
    s.year === null ||
    s.horizonYear === null
  ) {
    return null;
  }
  return {
    ...s,
    household: s.household,
    config: s.config,
    results: s.results,
    traceContext: s.traceContext,
    strategies: s.strategies,
    year: s.year,
    horizonYear: s.horizonYear,
  };
}
