import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@clerk/nextjs/server";
import { getOAuthProvider } from "../../lib/oauth-providers";

function appOrigin(req: Request): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ provider: string }> },
) {
  const { provider } = await params;
  const origin = appOrigin(req);

  const { userId } = await auth();
  if (!userId) {
    return NextResponse.redirect(new URL("/sign-in", origin));
  }

  const config = getOAuthProvider(provider);
  if (!config) {
    return NextResponse.json({ error: "Unknown connector." }, { status: 404 });
  }

  const clientId = process.env[config.clientIdEnv];
  if (!clientId) {
    return NextResponse.json(
      { error: `${provider} connector is not configured.` },
      { status: 503 },
    );
  }

  const state = randomBytes(16).toString("hex");
  const cookieStore = await cookies();
  cookieStore.set(`oauth_state_${provider}`, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });

  const redirectUri = `${origin}/api/connectors/${provider}/callback`;
  return NextResponse.redirect(
    config.buildAuthorizeUrl({ clientId, redirectUri, state }),
  );
}
