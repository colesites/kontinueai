import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@clerk/nextjs/server";
import { fetchAction } from "convex/nextjs";
import { api as convexApi } from "@repo/convex/convex/_generated/api";
import { getOAuthProvider } from "../../lib/oauth-providers";

function appOrigin(req: Request): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;
}

function settled(
  req: Request,
  provider: string,
  status: "connected" | "error",
) {
  const url = new URL("/settings/connectors", appOrigin(req));
  url.searchParams.set("connector", provider);
  url.searchParams.set("status", status);
  return NextResponse.redirect(url);
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ provider: string }> },
) {
  const { provider } = await params;
  const origin = appOrigin(req);

  const { userId, getToken } = await auth();
  if (!userId) {
    return NextResponse.redirect(new URL("/sign-in", origin));
  }

  const config = getOAuthProvider(provider);
  if (!config) return settled(req, provider, "error");

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  const cookieStore = await cookies();
  const cookieName = `oauth_state_${provider}`;
  const expectedState = cookieStore.get(cookieName)?.value;
  cookieStore.delete(cookieName);

  // Surface the OAuth error Todoist (or any provider) sends back rather than
  // silently failing — e.g. access_denied, redirect_uri mismatch.
  const providerError = url.searchParams.get("error");
  if (providerError) {
    console.error(`[oauth ${provider}] provider returned error`, {
      error: providerError,
      description: url.searchParams.get("error_description"),
    });
    return settled(req, provider, "error");
  }

  if (!code || !state || !expectedState || state !== expectedState) {
    console.error(`[oauth ${provider}] state/code validation failed`, {
      hasCode: !!code,
      hasState: !!state,
      hasExpectedState: !!expectedState,
      stateMatches: state === expectedState,
    });
    return settled(req, provider, "error");
  }

  const clientId = process.env[config.clientIdEnv];
  const clientSecret = process.env[config.clientSecretEnv];
  if (!clientId || !clientSecret) {
    console.error(`[oauth ${provider}] missing client credentials env`, {
      clientIdEnv: config.clientIdEnv,
      clientSecretEnv: config.clientSecretEnv,
    });
    return settled(req, provider, "error");
  }

  try {
    const redirectUri = `${origin}/api/connectors/${provider}/callback`;
    const token = await config.exchangeToken({
      clientId,
      clientSecret,
      code,
      redirectUri,
    });
    if (!token) {
      console.error(`[oauth ${provider}] token exchange returned no token`);
      return settled(req, provider, "error");
    }

    const convexToken = (await getToken({ template: "convex" })) ?? undefined;
    if (!convexToken) return settled(req, provider, "error");

    await fetchAction(
      convexApi.connectors.storeOAuthToken,
      {
        provider,
        accessToken: token.accessToken,
        refreshToken: token.refreshToken,
        scopes: token.scopes,
        accountLabel: token.accountLabel,
        tokenExpiresAt: token.tokenExpiresAt,
      },
      { token: convexToken },
    );

    return settled(req, provider, "connected");
  } catch (error) {
    console.error(`[oauth ${provider}] callback error`, error);
    return settled(req, provider, "error");
  }
}
