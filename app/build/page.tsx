import type { Metadata } from "next";
import { BuildWorkbench } from "@/components/build/BuildWorkbench";

export const metadata: Metadata = {
  title: "Build your own",
  description:
    "Enter a household from scratch, or edit the one you loaded, with instant validation and a live portfolio snapshot.",
};

export default function BuildPage() {
  return <BuildWorkbench />;
}
