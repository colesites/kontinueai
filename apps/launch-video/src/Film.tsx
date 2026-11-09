import { AbsoluteFill, Audio, Series, staticFile } from "remotion";
import { ShotView } from "./components/ShotView";
import assets from "./generated/assets.json";
import { shots } from "./shots";
import { FPS } from "./theme";

// The licensed music track: drop any one file into public/audio/.
const track = (assets as string[]).find((a) => a.startsWith("audio/"));

export const Film: React.FC = () => (
	<AbsoluteFill style={{ background: "#000" }}>
		<Series>
			{shots.map((shot, i) => (
				<Series.Sequence key={shot.id} name={`${shot.id} · ${shot.scene}`} durationInFrames={Math.round(shot.seconds * FPS)}>
					<ShotView shot={shot} index={i} />
				</Series.Sequence>
			))}
		</Series>
		{track ? <Audio src={staticFile(track)} volume={0.6} /> : null}
	</AbsoluteFill>
);
