import { after } from "next/server";

// Shared Vercel AI Gateway passthrough for the desktop app's model routes.
//
// The gateway's OpenAI-style SSE stream is split in two: one copy goes to the
// client untouched, the other is read on the server until the end so the final
// usage chunk is always seen, even if the user stops the reply or closes the
// app mid-stream. The upstream request is NOT tied to the client connection,
// so a cancelled reply is still billed for what the provider generated.

export const GATEWAY_CHAT_URL =
	(process.env.AI_GATEWAY_OPENAI_BASE_URL ?? "https://ai-gateway.vercel.sh/v1") +
	"/chat/completions";

export type OpenAIUsage = {
	prompt_tokens?: number;
	completion_tokens?: number;
	prompt_tokens_details?: { cached_tokens?: number } | null;
};

export function gatewayKey(): string | null {
	return (
		process.env.VERCEL_AI_GATEWAY_API_KEY ??
		process.env.AI_GATEWAY_API_KEY ??
		process.env.AI_GATEWAY_TOKEN ??
		null
	);
}

export function jsonError(
	status: number,
	code: string,
	message: string,
	extra?: Record<string, unknown>,
): Response {
	return Response.json({ error: { code, message, ...extra } }, { status });
}

/** Read an SSE stream to the end and return the last usage object seen. */
async function readUsage(stream: ReadableStream<Uint8Array>): Promise<OpenAIUsage | null> {
	const reader = stream.getReader();
	const decoder = new TextDecoder();
	let buffer = "";
	let usage: OpenAIUsage | null = null;
	const scan = () => {
		let newline = buffer.indexOf("\n");
		while (newline !== -1) {
			const line = buffer.slice(0, newline).trim();
			buffer = buffer.slice(newline + 1);
			if (line.startsWith("data:")) {
				const data = line.slice(5).trim();
				if (data && data !== "[DONE]") {
					try {
						const parsed = JSON.parse(data) as { usage?: OpenAIUsage | null };
						if (parsed.usage) usage = parsed.usage;
					} catch {
						// Non-JSON keep-alive or partial line.
					}
				}
			}
			newline = buffer.indexOf("\n");
		}
	};
	try {
		for (;;) {
			const { done, value } = await reader.read();
			if (done) break;
			buffer += decoder.decode(value, { stream: true });
			scan();
		}
		buffer += decoder.decode();
		buffer += "\n";
		scan();
	} catch (error) {
		console.error("[gateway-stream] usage stream ended early", error);
	}
	return usage;
}

/**
 * Forward a chat completion to the gateway and stream it back. `onUsage` runs
 * after the response finishes (or the client disconnects) with the real usage.
 */
export async function proxyGatewayChat({
	body,
	onUsage,
	logTag,
}: {
	body: Record<string, unknown>;
	onUsage?: (usage: OpenAIUsage) => Promise<void>;
	logTag: string;
}): Promise<Response> {
	const key = gatewayKey();
	if (!key) return jsonError(500, "misconfigured", "Models are not configured on the server.");

	const isStream = body.stream !== false;
	const upstream = await fetch(GATEWAY_CHAT_URL, {
		method: "POST",
		headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
		body: JSON.stringify(
			isStream ? { ...body, stream: true, stream_options: { include_usage: true } } : body,
		),
	});

	if (!upstream.ok || !upstream.body) {
		const text = await upstream.text().catch(() => "");
		console.error(`[${logTag}] gateway error`, upstream.status, text.slice(0, 500));
		return jsonError(
			upstream.status || 502,
			"upstream_error",
			"The model provider returned an error. Try again.",
			{ status: upstream.status },
		);
	}

	const record = async (usage: OpenAIUsage | null) => {
		if (!usage || !onUsage) return;
		try {
			await onUsage(usage);
		} catch (error) {
			console.error(`[${logTag}] failed to record usage`, error);
		}
	};

	if (!isStream) {
		const json = (await upstream.json()) as { usage?: OpenAIUsage };
		await record(json.usage ?? null);
		return Response.json(json);
	}

	const [toClient, toMeter] = upstream.body.tee();
	after(async () => {
		await record(await readUsage(toMeter));
	});

	return new Response(toClient, {
		status: 200,
		headers: {
			"Content-Type": "text/event-stream; charset=utf-8",
			"Cache-Control": "no-cache, no-transform",
			Connection: "keep-alive",
		},
	});
}
