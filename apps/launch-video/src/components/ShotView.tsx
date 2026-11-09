import { EndCard } from "../scenes/EndCard";
import type { Shot } from "../shots";
import { Slate } from "./Slate";

// Built shots. Each one gets added here as it's made; the rest show a slate.
const built: Record<string, React.FC> = {
	"5C": EndCard,
};

export const ShotView: React.FC<{ shot: Shot; index: number }> = ({ shot, index }) => {
	const Built = built[shot.id];
	if (Built) return <Built />;
	return <Slate shot={shot} index={index} />;
};
