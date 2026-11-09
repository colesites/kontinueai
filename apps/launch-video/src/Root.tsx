import { Composition } from "remotion";
import { Film } from "./Film";
import { shots } from "./shots";
import { FPS } from "./theme";

const durationInFrames = shots.reduce((sum, s) => sum + Math.round(s.seconds * FPS), 0);

export const Root: React.FC = () => (
	<>
		<Composition id="NeverStop" component={Film} durationInFrames={durationInFrames} fps={FPS} width={1920} height={1080} />
		<Composition id="NeverStopVertical" component={Film} durationInFrames={durationInFrames} fps={FPS} width={1080} height={1920} />
	</>
);
