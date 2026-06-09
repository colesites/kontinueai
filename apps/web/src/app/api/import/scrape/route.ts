import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { SharedLinkSchema, detectProvider } from "@repo/utils/url-safety";

const RequestSchema = z.object({
  url: SharedLinkSchema,
});

type ScraperMessage = {
  id?: string;
  role: "user" | "assistant";
  type: "text" | "code" | "image" | "file";
  content?: string;
  url?: string;
  language?: string;
};

type ScraperResponse = {
  title?: string;
  site?: string;
  messages?: ScraperMessage[];
  error?: string;
  message?: string;
};

const SCRAPER_API_URL =
  process.env.SCRAPER_API_URL?.replace(/\/$/, "") ?? "http://127.0.0.1:4000";

export async function POST(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid URL. Please provide a valid HTTPS shared chat link." },
      { status: 400 },
    );
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  const apiKey =
    process.env.SCRAPER_API_KEY ?? process.env.API_KEY ?? "your_secret_key_here";
  if (apiKey) {
    headers["x-api-key"] = apiKey;
  }
  headers.Origin = process.env.SCRAPER_REQUEST_ORIGIN ?? "http://localhost:3000";

  try {
    const scraperResponse = await fetch(`${SCRAPER_API_URL}/scrape-chat`, {
      method: "POST",
      headers,
      body: JSON.stringify({ url: parsed.data.url }),
      signal: AbortSignal.timeout(90_000),
      cache: "no-store",
    });

    const data = (await scraperResponse.json().catch(() => ({}))) as ScraperResponse;
    if (!scraperResponse.ok) {
      // Surface scraper rejections (e.g. 403 "Origin not allowed", 403 invalid
      // API key) in Vercel logs — otherwise these fail silently.
      console.error("[import/scrape] scraper rejected request", {
        status: scraperResponse.status,
        scraperError: data.error,
        scraperMessage: data.message,
        origin: headers.Origin,
        scraperUrl: SCRAPER_API_URL,
      });
      return NextResponse.json(
        {
          error: data.error ?? "scrape_failed",
          message: data.message ?? "Failed to scrape shared chat.",
        },
        { status: scraperResponse.status },
      );
    }

    const messages = normalizeScraperMessages(data.messages ?? []);
    if (messages.length === 0) {
      return NextResponse.json(
        {
          error: "no_messages_found",
          message:
            "The scraper reached the page but did not extract any chat messages.",
        },
        { status: 422 },
      );
    }

    return NextResponse.json({
      success: true,
      provider: detectProvider(parsed.data.url),
      title: data.title ?? "Imported Chat",
      messages,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to scrape shared chat.";
    return NextResponse.json(
      {
        error: "scraper_unavailable",
        message,
      },
      { status: 503 },
    );
  }
}

// Render a single flattened scraper message to its markdown fragment.
function messageFragment(message: ScraperMessage): string | null {
  if (message.type === "code") {
    const code = message.content?.trim();
    if (!code) return null;
    return `\`\`\`${message.language ?? ""}\n${code}\n\`\`\``;
  }
  if (message.type === "image" && message.url) {
    return `![](${message.url})`;
  }
  if (message.type === "file" && message.url) {
    return `[file](${message.url})`;
  }
  const content = message.content?.trim();
  return content ? content : null;
}

// The scraper flattens each conversation turn into separate typed messages
// (text, code, image, file) sharing an id prefix `msg_<turn>_...`. Regroup them
// by turn so a turn's text and its attachments (images/files/code) stay in one
// message — keeping each image attached to the message it was sent with —
// instead of becoming detached standalone bubbles.
function normalizeScraperMessages(messages: ScraperMessage[]) {
  type Turn = {
    role: "user" | "assistant";
    attachments: string[];
    body: string[];
  };
  const turns: Turn[] = [];
  const byKey = new Map<string, Turn>();

  messages.forEach((message, index) => {
    const fragment = messageFragment(message);
    if (!fragment) return;

    // Fall back to a per-message key if ids are absent so nothing merges wrongly.
    const key = message.id?.match(/^msg_(\d+)_/)?.[1] ?? `idx_${index}`;
    let turn = byKey.get(key);
    if (!turn) {
      turn = { role: message.role, attachments: [], body: [] };
      byKey.set(key, turn);
      turns.push(turn);
    }
    // Attachments (image/file) go above the message text.
    if (message.type === "image" || message.type === "file") {
      turn.attachments.push(fragment);
    } else {
      turn.body.push(fragment);
    }
  });

  return turns.map((turn) => ({
    role: turn.role,
    content: [...turn.attachments, ...turn.body].join("\n\n"),
  }));
}
