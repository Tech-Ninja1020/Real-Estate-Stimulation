"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { resolveTrace } from "@/engine/explain";
import type { MathTrace, TraceRef } from "@/engine/explain";
import { useScenario } from "@/lib/scenario-store";
import { MathDrawer } from "./MathDrawer";

interface MathApi {
  /** Open the drawer on a figure. Pass `push: true` to drill down and keep a back stack. */
  open: (ref: TraceRef, opts?: { push?: boolean }) => void;
  close: () => void;
  back: () => void;
  canResolve: boolean;
}

const MathContext = createContext<MathApi | null>(null);

export function useMath(): MathApi {
  const ctx = useContext(MathContext);
  if (!ctx) throw new Error("useMath must be used inside <MathProvider>");
  return ctx;
}

export function MathProvider({ children }: { children: ReactNode }) {
  const { traceContext } = useScenario();
  const [stack, setStack] = useState<TraceRef[]>([]);

  const open = useCallback((ref: TraceRef, opts?: { push?: boolean }) => {
    setStack((s) => (opts?.push ? [...s, ref] : [ref]));
  }, []);
  const close = useCallback(() => setStack([]), []);
  const back = useCallback(() => setStack((s) => s.slice(0, -1)), []);

  const current = stack[stack.length - 1];
  const trace = useMemo<MathTrace | null>(() => {
    if (!current || !traceContext) return null;
    try {
      return resolveTrace(current, traceContext);
    } catch {
      return null;
    }
  }, [current, traceContext]);

  const api = useMemo<MathApi>(
    () => ({ open, close, back, canResolve: traceContext !== null }),
    [open, close, back, traceContext],
  );

  return (
    <MathContext.Provider value={api}>
      {children}
      <MathDrawer
        trace={trace}
        depth={stack.length}
        onClose={close}
        onBack={back}
        onDrill={(ref) => open(ref, { push: true })}
      />
    </MathContext.Provider>
  );
}
