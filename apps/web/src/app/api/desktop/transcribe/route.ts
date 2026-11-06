import { getAuthContext } from "../../chat/lib/route-input";
import { GATEWAY_CHAT_URL, gatewayKey, jsonError } from "../../kode/lib/gateway-stream";

// Voice dictation for the desktop chat box: a short WAV clip (base64) in,
// plain text out. Uses a multimodal model through the AI Gateway, since the
// gateway has no OpenAI-style /audio/transcriptions endpoint.

export const maxDuration = 60;

const MODEL = process.env.DICTATION_MODEL ?? "google/gemini-3.8-flash";
// ~60 s of 16 kHz mono 16-bit audio ≈ 1.9 MB (≈ 2.6 MB base64).
const MAX_BASE64_CHARS = 3_500_000;

export async function POST(request: Request) {
	const { userId } = await getAuthContext();
	if (!userId) return jsonError(401, "unauthorized", "Sign in to use dictation.");
	const key = gatewayKey();
	if (!key) return jsonError(500, "misconfigured", "Dictation is not configured on the server.");

	let audio = "";
	try {
		audio = String(((await request.json()) as { audio?: unknown }).audio ?? "");
	} catch {
		// handled below
	}
	if (!audio) return jsonError(400, "bad_request", "No audio received.");
	if (audio.length > MAX_BASE64_CHARS) {
		return jsonError(413, "too_long", "Recordings can be up to 60 seconds.");
	}

	const upstream = await fetch(GATEWAY_CHAT_URL, {
		method: "POST",
		headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
		body: JSON.stringify({
			model: MODEL,
			temperature: 0,
			messages: [
				{
					role: "user",
					content: [
						{
							type: "text",
							text: "Transcribe this audio exactly as spoken. Keep code terms, file names and technical words as written. Reply with only the transcript, no quotes or commentary. If there is no speech, reply with nothing.",
						},
						{ type: "file", file: { filename: "dictation.wav", file_data: `data:audio/wav;base64,${audio}` } },
					],
				},
			],
		}),
	});

	const json = (await upstream.json().catch(() => null)) as {
		choices?: { message?: { content?: string } }[];
		error?: { message?: string };
	} | null;
	if (!upstream.ok || !json) {
		console.error("[desktop/transcribe] gateway error", upstream.status, json?.error?.message);
		return jsonError(502, "transcription_failed", "Couldn't transcribe that. Try again.");
	}
	return Response.json({ text: (json.choices?.[0]?.message?.content ?? "").trim() });
}
