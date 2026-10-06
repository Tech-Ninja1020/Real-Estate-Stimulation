"use client";

import { useMemo } from "react";
import { CtaBand } from "@/components/landing/CtaBand";
import { Hero } from "@/components/landing/Hero";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { SampleCards } from "@/components/landing/SampleCards";
import { runPresetSims } from "@/components/landing/sims";
import { Trust } from "@/components/landing/Trust";

export default function Home() {
  // Real engine output for every sample household, computed once on the client.
  const sims = useMemo(() => runPresetSims(), []);
  const first = sims[0];
  return (
    <div className="pb-8">
      {first && <Hero sim={first} />}
      <SampleCards sims={sims} />
      <HowItWorks />
      <Trust />
      <CtaBand />
    </div>
  );
}
