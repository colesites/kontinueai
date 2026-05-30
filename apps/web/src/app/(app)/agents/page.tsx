import type { Metadata } from "next";
import { AgentsClient } from "../../../features/agents/components/AgentsClient";

export const metadata: Metadata = {
  title: "Kontinue AI - Agents",
};

export default function AgentsPage() {
  return <AgentsClient />;
}
