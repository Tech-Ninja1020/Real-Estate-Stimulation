"use client";

import type { ReactNode } from "react";
import { EmptyState, ButtonLink, Skeleton } from "@/components/ui/primitives";
import { useLoadedScenario } from "@/lib/scenario-store";
import { useScenario } from "@/lib/scenario-store";

type Loaded = NonNullable<ReturnType<typeof useLoadedScenario>>;

/** Renders children only when a household is loaded; otherwise a skeleton or an empty state. */
export function ScenarioGate({ children }: { children: (s: Loaded) => ReactNode }) {
  const { status } = useScenario();
  const loaded = useLoadedScenario();
  if (status === "loading") return <PageSkeleton />;
  if (!loaded) {
    return (
      <EmptyState
        title="No household loaded yet"
        body="Load one of the sample households or build your own to see how a portfolio behaves under Hold, Sell and 1031 Exchange."
        action={
          <>
            <ButtonLink href="/" variant="primary">
              Choose a sample household
            </ButtonLink>
            <ButtonLink href="/build">Build your own</ButtonLink>
          </>
        }
      />
    );
  }
  return <>{children(loaded)}</>;
}

export function PageSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading" className="space-y-6">
      <Skeleton className="h-10 w-72" />
      <Skeleton className="h-4 w-[28rem] max-w-full" />
      <div className="grid gap-4 md:grid-cols-3">
        <Skeleton className="h-36" />
        <Skeleton className="h-36" />
        <Skeleton className="h-36" />
      </div>
      <Skeleton className="h-96" />
    </div>
  );
}
