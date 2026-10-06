"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { PRESETS } from "@/data/presets";
import type { Household, LoanType, Property, ScenarioConfig } from "@/engine/types";
import { validateHousehold } from "@/engine/validate";
import type { ValidationIssue } from "@/engine/validate";
import { Button, Skeleton } from "@/components/ui/primitives";
import { useScenario } from "@/lib/scenario-store";
import { cn } from "@/lib/cn";
import { FieldIssuesProvider, SelectField } from "./fields";
import { IssuesPanel } from "./IssuesPanel";
import {
  addImprovement,
  addLoan,
  addProperty,
  blankHousehold,
  clearSavedDraft,
  deriveConfig,
  duplicateProperty,
  extraIssues,
  fieldDomId,
  groupIssuesByPath,
  moveProperty,
  patchPropertyAt,
  propertyIndexOfPath,
  readSavedDraft,
  removeProperty,
  sectionOfPath,
  templateHousehold,
  totalValue,
  writeSavedDraft,
} from "./model";
import type { Section } from "./model";
import { PropertyCard } from "./PropertyCard";
import { StepRail } from "./Rail";
import type { RailItem } from "./Rail";
import { InvestorFields, MarketFields, StepSection } from "./Sections";
import { RUN_SWEEP_MS, Snapshot, SummaryBar, computePreview } from "./Summary";
import { HomeIcon, PlusIcon, ResetIcon } from "./ui";

// ───────────────────────────── Types ─────────────────────────────

/** Everything needed to put the editor back exactly as it was. */
interface Snap {
  draft: Household;
  baseline: string;
  swapped: boolean;
  cfg: ScenarioConfig | null;
}

interface Notice {
  key: number;
  message: string;
  actionLabel: string;
  onAction: () => void;
}

interface PendingReplace {
  next: Household;
  label: string;
  cfg: ScenarioConfig | null;
}

const SECTIONS: readonly Section[] = ["investor", "market", "properties"];

const hasErrors = (issues: readonly ValidationIssue[]): boolean =>
  issues.some((i) => i.severity === "error");

function allIssues(h: Household): ValidationIssue[] {
  return [...validateHousehold(h), ...extraIssues(h)];
}

// ───────────────────────────── Entry ─────────────────────────────

export function BuildWorkbench() {
  const { status, household, config } = useScenario();
  // Until the store has read the URL we cannot tell "edit" from "build": show a quiet skeleton.
  if (status === "loading") return <BuildSkeleton />;
  return <Editor household={household} config={config} />;
}

function BuildSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading the workbench" className="space-y-6">
      <Skeleton className="h-4 w-40" />
      <Skeleton className="h-12 w-96 max-w-full" />
      <Skeleton className="h-4 w-[30rem] max-w-full" />
      <Skeleton className="h-72" />
    </div>
  );
}

// ───────────────────────────── Editor ─────────────────────────────

function Editor({
  household,
  config,
}: {
  household: Household | null;
  config: ScenarioConfig | null;
}) {
  const router = useRouter();
  const reduce = useReducedMotion();
  const { loadCustom, setHousehold } = useScenario();

  // The editor is "Edit your household" when a household was already loaded on arrival.
  const [editing] = useState(household !== null);
  const [baseId] = useState<string | null>(household?.id ?? null);
  const noticeKey = useRef(0);

  const [init] = useState(() => {
    const fresh = household ? structuredClone(household) : templateHousehold();
    const freshJson = JSON.stringify(fresh);
    const saved = readSavedDraft();
    if (saved && saved.baseId === baseId && JSON.stringify(saved.draft) !== freshJson) {
      return { draft: saved.draft, fresh, freshJson, restored: true };
    }
    return { draft: fresh, fresh, freshJson, restored: false };
  });

  const [draft, setDraft] = useState<Household>(init.draft);
  const [baseline, setBaseline] = useState<string>(
    init.restored ? init.freshJson : JSON.stringify(init.draft),
  );
  // True once the advisor swapped in a sample or a blank household: the loaded config no longer fits.
  const [swapped, setSwapped] = useState(false);
  const [cfgOverride, setCfgOverride] = useState<ScenarioConfig | null>(null);
  const [openIds, setOpenIds] = useState<ReadonlySet<string>>(
    () => new Set(init.draft.properties[0] ? [init.draft.properties[0].id] : []),
  );
  const [notice, setNotice] = useState<Notice | null>(null);
  const [pending, setPending] = useState<PendingReplace | null>(null);
  const [running, setRunning] = useState(false);
  const [active, setActive] = useState<Section>("investor");
  const [focusPath, setFocusPath] = useState<string | null>(null);

  const draftJson = useMemo(() => JSON.stringify(draft), [draft]);
  const dirty = draftJson !== baseline;

  // ── Validation ──
  const issues = useMemo(() => allIssues(draft), [draft]);
  const issuesByPath = useMemo(() => groupIssuesByPath(issues), [issues]);
  const errorCount = useMemo(() => issues.filter((i) => i.severity === "error").length, [issues]);
  const warningCount = issues.length - errorCount;
  const valid = errorCount === 0;

  const perProperty = useMemo(() => {
    const out = draft.properties.map(() => ({ errors: 0, warnings: 0 }));
    for (const i of issues) {
      const idx = propertyIndexOfPath(i.path);
      const slot = idx === null ? undefined : out[idx];
      if (slot) {
        if (i.severity === "error") slot.errors++;
        else slot.warnings++;
      }
    }
    return out;
  }, [issues, draft.properties]);

  const sectionErrors = useMemo(() => {
    const out: Record<Section, number> = { investor: 0, market: 0, properties: 0 };
    for (const i of issues) if (i.severity === "error") out[sectionOfPath(i.path)]++;
    return out;
  }, [issues]);

  // ── Live preview (only for a clean draft) ──
  const deferred = useDeferredValue(draft);
  const preview = useMemo(
    () => (hasErrors(allIssues(deferred)) ? null : computePreview(deferred)),
    [deferred],
  );
  const previewOk = valid && preview !== null;

  // ── Autosave to sessionStorage ──
  useEffect(() => {
    const handle = window.setTimeout(() => {
      writeSavedDraft({ baseId, draft });
    }, 350);
    return () => window.clearTimeout(handle);
  }, [draft, baseId]);

  // ── Notices ──
  const showNotice = useCallback((message: string, actionLabel: string, onAction: () => void) => {
    noticeKey.current += 1;
    setNotice({ key: noticeKey.current, message, actionLabel, onAction });
  }, []);

  useEffect(() => {
    if (!notice) return;
    const handle = window.setTimeout(() => setNotice(null), 9000);
    return () => window.clearTimeout(handle);
  }, [notice]);

  const snap = useCallback(
    (): Snap => ({ draft, baseline, swapped, cfg: cfgOverride }),
    [draft, baseline, swapped, cfgOverride],
  );

  const restore = useCallback((s: Snap) => {
    setDraft(s.draft);
    setBaseline(s.baseline);
    setSwapped(s.swapped);
    setCfgOverride(s.cfg);
    setNotice(null);
  }, []);

  const openedFirst = (h: Household): ReadonlySet<string> =>
    new Set(h.properties[0] ? [h.properties[0].id] : []);

  const applyReplace = (r: PendingReplace): void => {
    const before = snap();
    setDraft(r.next);
    setBaseline(JSON.stringify(r.next));
    setSwapped(true);
    setCfgOverride(r.cfg);
    setOpenIds(openedFirst(r.next));
    setPending(null);
    showNotice(`Loaded ${r.label}.`, "Undo", () => restore(before));
  };

  const requestReplace = (r: PendingReplace): void => {
    if (dirty) setPending(r);
    else applyReplace(r);
  };

  const discardRestored = useCallback((): void => {
    setDraft(init.fresh);
    setBaseline(init.freshJson);
    setOpenIds(new Set(init.fresh.properties[0] ? [init.fresh.properties[0].id] : []));
    setNotice(null);
  }, [init]);

  const announcedRestore = useRef(false);
  useEffect(() => {
    if (init.restored && !announcedRestore.current) {
      announcedRestore.current = true;
      showNotice("Restored your unsaved draft from this session.", "Discard", discardRestored);
    }
  }, [init, showNotice, discardRestored]);

  // ── Property operations ──
  const toggleOpen = (id: string): void =>
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const openProperty = (id: string): void => setOpenIds((prev) => new Set(prev).add(id));

  const onAddProperty = (): void => {
    const next = addProperty(draft);
    const created = next.properties[next.properties.length - 1];
    setDraft(next);
    if (created) {
      openProperty(created.id);
      setFocusPath(`properties[${next.properties.length - 1}].name`);
    }
  };

  const onDuplicate = (index: number): void => {
    const next = duplicateProperty(draft, index);
    const created = next.properties[index + 1];
    setDraft(next);
    if (created) {
      openProperty(created.id);
      setFocusPath(`properties[${index + 1}].name`);
    }
  };

  const onRemove = (index: number): void => {
    const prop = draft.properties[index];
    if (!prop) return;
    const before = snap();
    setDraft(removeProperty(draft, index));
    showNotice(`Removed ${prop.name.trim() || "the property"}.`, "Undo", () => restore(before));
  };

  const onMove = (index: number, delta: -1 | 1): void =>
    setDraft(moveProperty(draft, index, delta));

  // ── Jump to a field from the issues list ──
  const jump = (path: string): void => {
    const idx = propertyIndexOfPath(path);
    const prop = idx === null ? undefined : draft.properties[idx];
    if (prop) openProperty(prop.id);
    setFocusPath(path);
  };

  useEffect(() => {
    if (!focusPath) return;
    let frames = 0;
    let raf = 0;
    const attempt = (): void => {
      const el = document.getElementById(fieldDomId(focusPath));
      if (el) {
        el.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });
        el.focus({ preventScroll: true });
        setFocusPath(null);
        return;
      }
      frames += 1;
      if (frames < 45) {
        raf = requestAnimationFrame(attempt);
      } else {
        document.getElementById(`build-${sectionOfPath(focusPath)}`)?.scrollIntoView({
          behavior: reduce ? "auto" : "smooth",
        });
        setFocusPath(null);
      }
    };
    raf = requestAnimationFrame(attempt);
    return () => cancelAnimationFrame(raf);
  }, [focusPath, reduce]);

  // ── Active section in the rail ──
  useEffect(() => {
    let raf = 0;
    const update = (): void => {
      raf = 0;
      let current: Section = "investor";
      for (const s of SECTIONS) {
        const el = document.getElementById(`build-${s}`);
        if (el && el.getBoundingClientRect().top <= 200) current = s;
      }
      const atBottom =
        window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
      setActive(atBottom ? "properties" : current);
    };
    const onScroll = (): void => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  // ── Run ──
  const timer = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  const run = (mode: "run" | "apply"): void => {
    if (!valid || running) return;
    setRunning(true);
    setNotice(null);
    const finished: Household = { ...structuredClone(draft), name: draft.name.trim() };
    const baseConfig = swapped ? cfgOverride : config;
    timer.current = window.setTimeout(
      () => {
        if (mode === "apply" && editing && !swapped) {
          setHousehold(finished);
        } else {
          loadCustom(finished, deriveConfig(finished, baseConfig));
        }
        clearSavedDraft();
        router.push("/lab");
      },
      reduce ? 0 : RUN_SWEEP_MS,
    );
  };

  // ── Rail ──
  const n = draft.properties.length;
  const railItems: RailItem[] = [
    {
      id: "investor",
      label: "Investor",
      detail: "Filing, income, horizon",
      errors: sectionErrors.investor,
    },
    {
      id: "market",
      label: "Market",
      detail: "Inflation, rates, tax year",
      errors: sectionErrors.market,
    },
    {
      id: "properties",
      label: "Properties",
      detail: n === 0 ? "None yet" : `${n} ${n === 1 ? "property" : "properties"}`,
      errors: sectionErrors.properties,
    },
  ];

  const title = editing ? "Edit your household" : "Build your own";

  const noticeBar: ReactNode = (
    <AnimatePresence>
      {notice && (
        <motion.div
          key={notice.key}
          role="status"
          aria-live="polite"
          initial={reduce ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: reduce ? 0 : 6 }}
          transition={{ duration: reduce ? 0 : 0.22 }}
          className="border-line-strong bg-surface shadow-card flex items-center justify-between gap-4 rounded-xl border px-4 py-2.5"
        >
          <p className="text-ink text-sm">{notice.message}</p>
          <Button
            size="sm"
            onClick={() => {
              notice.onAction();
            }}
          >
            {notice.actionLabel}
          </Button>
        </motion.div>
      )}
    </AnimatePresence>
  );

  return (
    <FieldIssuesProvider issues={issuesByPath}>
      <div className="xl:grid xl:grid-cols-[15.5rem_minmax(0,1fr)] xl:gap-14">
        {/* Rail: wide screens */}
        <div className="no-print hidden xl:block">
          <div className="sticky top-24 space-y-7">
            <StepRail items={railItems} active={active} variant="vertical" />
            <Snapshot preview={preview} valid={previewOk} />
          </div>
        </div>

        <div className="min-w-0">
          <StepRail items={railItems} active={active} variant="horizontal" />

          <header className="pt-8 pb-9 xl:pt-0">
            <p className="eyebrow mb-3">Household workbench</p>
            <h1 className="display text-ink text-4xl leading-[1.05] sm:text-5xl">{title}</h1>
            <p className="text-ink-2 mt-3 max-w-2xl text-[0.95rem] leading-relaxed">
              {editing
                ? `You are editing ${household?.name ?? "the loaded household"}. Every change is checked as you type, and nothing reaches the Scenario Lab until you run the simulation.`
                : "Enter a household from scratch: the investor, the market and each property with its loans. Every change is checked as you type."}
            </p>
            <div className="mt-6 flex flex-wrap items-end gap-3">
              <SelectField
                label="Start from a sample"
                value=""
                placeholder="Choose a sample household"
                onChange={(id) => {
                  const preset = PRESETS.find((p) => p.meta.id === id);
                  if (!preset) return;
                  requestReplace({
                    next: structuredClone(preset.household),
                    label: preset.meta.name,
                    cfg: structuredClone(preset.scenario),
                  });
                }}
                options={PRESETS.map((p) => ({ value: p.meta.id, label: p.meta.name }))}
                className="w-full sm:w-80"
              />
              <Button
                onClick={() =>
                  requestReplace({ next: blankHousehold(), label: "a blank household", cfg: null })
                }
                className="h-10"
              >
                <ResetIcon size={14} />
                Start blank
              </Button>
            </div>

            <AnimatePresence initial={false}>
              {pending && (
                <motion.div
                  key="confirm"
                  role="group"
                  aria-label="Confirm replacing the draft"
                  initial={reduce ? false : { opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: reduce ? 0 : 0.22 }}
                  className="overflow-hidden"
                >
                  <div className="bg-amber-soft mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[color-mix(in_srgb,var(--amber)_40%,var(--line))] px-4 py-3">
                    <p className="text-ink text-sm">
                      Replace your current draft with <strong>{pending.label}</strong>? Your unsaved
                      edits will be lost.
                    </p>
                    <div className="flex gap-2">
                      <Button size="sm" variant="primary" onClick={() => applyReplace(pending)}>
                        Replace draft
                      </Button>
                      <Button size="sm" onClick={() => setPending(null)}>
                        Keep editing
                      </Button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </header>

          <div className="space-y-5">
            <IssuesPanel issues={issues} draft={draft} onJump={jump} />
            <Snapshot preview={preview} valid={previewOk} className="xl:hidden" />
          </div>

          <div className="mt-12 space-y-16">
            <StepSection
              id="investor"
              step={1}
              eyebrow="Investor"
              title="Who is investing"
              lede="Tax filing and the return assumptions that drive every strategy. All amounts are in today's dollars."
            >
              <InvestorFields draft={draft} onChange={setDraft} />
            </StepSection>

            <StepSection
              id="market"
              step={2}
              eyebrow="Market"
              title="The economy around it"
              lede="Where the clock starts, which tax tables apply, and how rates and inflation drift."
            >
              <MarketFields draft={draft} onChange={setDraft} />
            </StepSection>

            <StepSection
              id="properties"
              step={3}
              eyebrow="Properties"
              title="What they own"
              lede="Add each rental with its income, costs, improvements and every loan. Open a card to edit it."
              action={
                n > 0 ? (
                  <Button onClick={onAddProperty}>
                    <PlusIcon size={14} />
                    Add property
                  </Button>
                ) : undefined
              }
            >
              {n === 0 ? (
                <div className="card-raised flex flex-col items-center px-8 py-14 text-center">
                  <div className="border-line bg-surface-2 text-accent mb-5 grid size-14 place-items-center rounded-2xl border">
                    <HomeIcon size={26} />
                  </div>
                  <h3 className="display text-ink text-2xl">No properties yet</h3>
                  <p className="text-ink-2 mt-2 max-w-md text-sm leading-relaxed">
                    A household needs at least one rental to simulate. Start with the one that
                    matters most; you can add the rest afterwards.
                  </p>
                  <Button variant="primary" className="mt-6" onClick={onAddProperty}>
                    <PlusIcon size={14} />
                    Add your first property
                  </Button>
                </div>
              ) : (
                <ol className="space-y-4">
                  {draft.properties.map((p, i) => (
                    <li key={p.id}>
                      <PropertyCard
                        property={p}
                        index={i}
                        count={n}
                        open={openIds.has(p.id)}
                        onToggle={() => toggleOpen(p.id)}
                        onChange={(next: Property) => setDraft((h) => patchPropertyAt(h, i, next))}
                        onDuplicate={() => onDuplicate(i)}
                        onRemove={() => onRemove(i)}
                        onMove={(d) => onMove(i, d)}
                        onAddLoan={(t: LoanType) => setDraft((h) => addLoan(h, i, t))}
                        onAddImprovement={() => setDraft((h) => addImprovement(h, i))}
                        equity={valid ? (preview?.equityByProperty.get(p.id) ?? null) : null}
                        errorCount={perProperty[i]?.errors ?? 0}
                        warningCount={perProperty[i]?.warnings ?? 0}
                      />
                    </li>
                  ))}
                </ol>
              )}
            </StepSection>
          </div>

          <SummaryBar
            propertyCount={n}
            totalValue={totalValue(draft)}
            debt={previewOk && preview ? preview.debt : null}
            errors={errorCount}
            warnings={warningCount}
            running={running}
            onRun={() => run("run")}
            onApply={editing && !swapped ? () => run("apply") : undefined}
            notice={noticeBar}
          />
        </div>
      </div>
      <div className={cn("sr-only")} aria-live="polite">
        {running ? "Preparing the Scenario Lab" : ""}
      </div>
    </FieldIssuesProvider>
  );
}
