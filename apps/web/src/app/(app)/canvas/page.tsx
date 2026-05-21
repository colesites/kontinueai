import { CanvasClient } from "../../../features/canvas/components/CanvasClient";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Kontinue AI - Canvas",
};

export default function CanvasPage() {
  return <CanvasClient />;
}
