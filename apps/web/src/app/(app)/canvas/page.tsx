import type { Metadata } from "next";
import { CanvasClient } from "../../../features/canvas/components/CanvasClient";

export const metadata: Metadata = {
	title: "Kontinue AI - Canvas",
};

export default function CanvasPage() {
	return <CanvasClient />;
}
