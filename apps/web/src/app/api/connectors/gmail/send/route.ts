import { NextResponse } from "next/server";
import { getAuthContext } from "../../../chat/lib/route-input";
import { userConnectorTokens } from "../../../chat/lib/connector-tokens";
import { getGoogleAccessToken } from "../../../chat/lib/tools-config";

// RFC 2047 "encoded-word" for header values that may contain non-ASCII (e.g. an
// emoji or accented subject). Gmail rejects raw UTF-8 in headers.
function encodeHeader(value: string): string {
  // eslint-disable-next-line no-control-regex
  if (/^[\x00-\x7F]*$/.test(value)) return value;
  return `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

function base64Url(input: Buffer): string {
  return input
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

// Assemble a minimal RFC 2822 message. The body is base64 (UTF-8) so unicode
// content survives intact.
function buildRawMessage(opts: {
  to: string;
  cc?: string;
  subject: string;
  body: string;
}): string {
  const headers = [
    `To: ${opts.to}`,
    opts.cc ? `Cc: ${opts.cc}` : null,
    `Subject: ${encodeHeader(opts.subject)}`,
    // A real Date header improves deliverability; Gmail fills From & Message-ID.
    `Date: ${new Date().toUTCString()}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
  ].filter(Boolean);
  const encodedBody = Buffer.from(opts.body, "utf8").toString("base64");
  const mime = `${headers.join("\r\n")}\r\n\r\n${encodedBody}`;
  return base64Url(Buffer.from(mime, "utf8"));
}

export async function POST(req: Request) {
  const { userId, getToken } = await getAuthContext();
  if (!userId) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }
  const convexToken = (await getToken?.({ template: "convex" })) ?? null;
  if (!convexToken) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  let body: { to?: string; cc?: string; subject?: string; body?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const to = body.to?.trim();
  const subject = body.subject?.trim() ?? "";
  const text = body.body ?? "";
  if (!to) {
    return NextResponse.json(
      { error: "Add at least one recipient before sending." },
      { status: 400 },
    );
  }

  const tokens = userConnectorTokens(convexToken);
  const token = await getGoogleAccessToken(tokens, "gmail");
  if ("error" in token) {
    // Most common: Gmail not connected, or the send scope wasn't granted yet.
    return NextResponse.json(
      {
        error: token.error,
        needsReconnect: true,
      },
      { status: 409 },
    );
  }

  const raw = buildRawMessage({ to, cc: body.cc?.trim() || undefined, subject, body: text });
  const res = await fetch(
    "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ raw }),
    },
  );

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    // 403 with insufficient scope means Gmail was connected before the send
    // scope existed — the user must reconnect to grant it.
    const needsReconnect =
      res.status === 403 && /insufficient|scope|permission/i.test(detail);
    return NextResponse.json(
      {
        error: needsReconnect
          ? "Kontinue can't send mail yet — reconnect Gmail in Settings → Connectors to grant send access."
          : `Gmail send failed (${res.status}).`,
        needsReconnect,
      },
      { status: needsReconnect ? 409 : 502 },
    );
  }

  const sent = (await res.json()) as { id?: string };
  return NextResponse.json({ ok: true, id: sent.id });
}
