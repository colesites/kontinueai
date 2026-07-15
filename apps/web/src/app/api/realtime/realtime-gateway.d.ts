export function getRealtimeToken(options: {
	model: string;
	expiresAfterSeconds: number;
}): Promise<{ token: string; url: string }>;
