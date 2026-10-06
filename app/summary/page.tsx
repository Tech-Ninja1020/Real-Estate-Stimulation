import type { Metadata } from "next";
import { SummaryView } from "@/components/summary/SummaryView";

export const metadata: Metadata = { title: "Summary" };

export default function SummaryPage() {
  return <SummaryView />;
}
