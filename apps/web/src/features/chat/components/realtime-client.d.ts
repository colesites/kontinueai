export type RealtimeStatus =
	| "disconnected"
	| "connecting"
	| "connected"
	| "error";

export type RealtimeMessage = {
	id: string;
	role: "user" | "assistant" | "system";
	parts: Array<{ type: string; text?: string }>;
};

export function createRealtimeModel(modelId: string): unknown;

export function useRealtime(options: {
	model: unknown;
	api: { token: string };
	sessionConfig: {
		voice: string;
		turnDetection: { type: "server-vad" };
		instructions: string;
	};
	onError?: (error: Error) => void;
}): {
	status: RealtimeStatus;
	messages: RealtimeMessage[];
	isCapturing: boolean;
	isPlaying: boolean;
	connect: () => Promise<void>;
	disconnect: () => void;
	startAudioCapture: (stream: MediaStream) => void;
	stopAudioCapture: () => void;
	stopPlayback: () => void;
	cancelResponse: () => void;
};
