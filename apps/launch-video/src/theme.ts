import { loadFont as loadDisplay } from "@remotion/google-fonts/BricolageGrotesque";
import { loadFont as loadBody } from "@remotion/google-fonts/HankenGrotesk";
import { loadFont as loadMono } from "@remotion/google-fonts/JetBrainsMono";

// Same type and colors as apps/marketing (globals.css + layout.tsx).
export const fonts = {
	display: loadDisplay("normal", { weights: ["500", "600", "700"], subsets: ["latin"] }).fontFamily,
	body: loadBody("normal", { weights: ["400", "500", "600"], subsets: ["latin"] }).fontFamily,
	mono: loadMono("normal", { weights: ["400", "500"], subsets: ["latin"] }).fontFamily,
};

export const colors = {
	ink: "oklch(0.19 0.006 60)",
	paper: "oklch(0.985 0.0035 95)",
	night: "#050505",
	muted: "oklch(0.505 0.008 65)",
	brand: "oklch(0.53 0.245 295)",
	brandSoft: "oklch(0.72 0.17 295)",
};

export const FPS = 24;
