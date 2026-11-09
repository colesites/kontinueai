import { MBP } from "../three/geometry";
import { fonts } from "../theme";

/** A dark macOS desktop at the MacBook Pro's logical resolution, with the notch. */
export const MacDesktop: React.FC<{ children: React.ReactNode; clock?: string }> = ({ children, clock = "Mon 9:14 AM" }) => (
	<div
		style={{
			position: "relative",
			width: MBP.uiW,
			height: MBP.uiH,
			overflow: "hidden",
			background: "radial-gradient(120% 90% at 70% 20%, #1b1830 0%, #0b0b12 45%, #050507 100%)",
			fontFamily: fonts.body,
			color: "#e9e9ee",
		}}
	>
		{/* Menu bar */}
		<div
			style={{
				position: "absolute",
				inset: "0 0 auto 0",
				height: 34,
				display: "flex",
				alignItems: "center",
				justifyContent: "space-between",
				padding: "0 22px",
				fontSize: 15,
				fontWeight: 500,
				color: "rgba(255,255,255,0.86)",
				background: "rgba(0,0,0,0.25)",
			}}
		>
			<div style={{ display: "flex", gap: 22 }}>
				<span style={{ fontWeight: 700 }}>Terminal</span>
				<span>Shell</span>
				<span>Edit</span>
				<span>View</span>
			</div>
			<div style={{ display: "flex", gap: 18, alignItems: "center" }}>
				<span style={{ opacity: 0.8 }}>100%</span>
				<span>{clock}</span>
			</div>
		</div>
		{/* Notch */}
		<div
			style={{
				position: "absolute",
				top: 0,
				left: "50%",
				width: 196,
				height: 34,
				marginLeft: -98,
				background: "#000",
				borderBottomLeftRadius: 14,
				borderBottomRightRadius: 14,
				zIndex: 10,
			}}
		/>
		{children}
	</div>
);
