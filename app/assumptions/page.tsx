import type { Metadata } from "next";
import { AssumptionsView } from "@/components/summary/AssumptionsView";

export const metadata: Metadata = { title: "Assumptions" };

export default function AssumptionsPage() {
  return <AssumptionsView />;
}
