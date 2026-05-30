// Server-side OAuth provider registry. Each entry knows how to build its
// authorization URL and exchange an auth code for tokens (+ a friendly account
// label). Used by the generic /api/connectors/[provider]/{start,callback} routes.

export type ExchangedToken = {
  accessToken: string;
  refreshToken?: string;
  scopes: string[];
  accountLabel?: string;
  tokenExpiresAt?: number;
};

export type OAuthProvider = {
  provider: string;
  clientIdEnv: string;
  clientSecretEnv: string;
  scopes: string[];
  buildAuthorizeUrl(args: {
    clientId: string;
    redirectUri: string;
    state: string;
  }): string;
  exchangeToken(args: {
    clientId: string;
    clientSecret: string;
    code: string;
    redirectUri: string;
  }): Promise<ExchangedToken | null>;
};

const GITHUB: OAuthProvider = {
  provider: "github",
  clientIdEnv: "GITHUB_CLIENT_ID",
  clientSecretEnv: "GITHUB_CLIENT_SECRET",
  scopes: ["repo", "read:user"],
  buildAuthorizeUrl({ clientId, redirectUri, state }) {
    const u = new URL("https://github.com/login/oauth/authorize");
    u.searchParams.set("client_id", clientId);
    u.searchParams.set("redirect_uri", redirectUri);
    u.searchParams.set("scope", GITHUB.scopes.join(" "));
    u.searchParams.set("state", state);
    return u.toString();
  },
  async exchangeToken({ clientId, clientSecret, code, redirectUri }) {
    const res = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri,
      }),
    });
    // GitHub returns HTTP 200 even on failure, with { error, error_description }
    // (e.g. incorrect_client_credentials, redirect_uri_mismatch). Surface it.
    const json = (await res.json()) as {
      access_token?: string;
      refresh_token?: string;
      scope?: string;
      expires_in?: number;
      error?: string;
      error_description?: string;
    };
    if (!json.access_token) {
      console.error("[oauth github] token exchange returned no access_token", {
        httpStatus: res.status,
        error: json.error,
        description: json.error_description,
      });
      return null;
    }

    let accountLabel: string | undefined;
    try {
      const u = await fetch("https://api.github.com/user", {
        headers: {
          Authorization: `Bearer ${json.access_token}`,
          Accept: "application/vnd.github+json",
        },
      });
      if (u.ok) accountLabel = ((await u.json()) as { login?: string }).login;
    } catch {
      /* label is cosmetic */
    }

    return {
      accessToken: json.access_token,
      refreshToken: json.refresh_token,
      scopes: json.scope ? json.scope.split(",").filter(Boolean) : GITHUB.scopes,
      accountLabel,
      tokenExpiresAt: json.expires_in
        ? Date.now() + json.expires_in * 1000
        : undefined,
    };
  },
};

const NOTION: OAuthProvider = {
  provider: "notion",
  clientIdEnv: "NOTION_CLIENT_ID",
  clientSecretEnv: "NOTION_CLIENT_SECRET",
  scopes: [],
  buildAuthorizeUrl({ clientId, redirectUri, state }) {
    const u = new URL("https://api.notion.com/v1/oauth/authorize");
    u.searchParams.set("client_id", clientId);
    u.searchParams.set("response_type", "code");
    u.searchParams.set("owner", "user");
    u.searchParams.set("redirect_uri", redirectUri);
    u.searchParams.set("state", state);
    return u.toString();
  },
  async exchangeToken({ clientId, clientSecret, code, redirectUri }) {
    const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
    const res = await fetch("https://api.notion.com/v1/oauth/token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
      }),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      access_token?: string;
      workspace_name?: string;
      workspace_id?: string;
      bot_id?: string;
    };
    if (!json.access_token) return null;
    return {
      accessToken: json.access_token,
      scopes: [],
      accountLabel: json.workspace_name,
    };
  },
};

const VERCEL: OAuthProvider = {
  provider: "vercel",
  clientIdEnv: "VERCEL_CLIENT_ID",
  clientSecretEnv: "VERCEL_CLIENT_SECRET",
  scopes: [],
  buildAuthorizeUrl({ clientId, redirectUri, state }) {
    const u = new URL("https://vercel.com/oauth/authorize");
    u.searchParams.set("client_id", clientId);
    u.searchParams.set("redirect_uri", redirectUri);
    u.searchParams.set("state", state);
    return u.toString();
  },
  async exchangeToken({ clientId, clientSecret, code, redirectUri }) {
    const res = await fetch("https://api.vercel.com/v2/oauth/access_token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri,
      }),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      access_token?: string;
      team_id?: string | null;
    };
    if (!json.access_token) return null;

    let accountLabel: string | undefined;
    try {
      const u = await fetch("https://api.vercel.com/v2/user", {
        headers: { Authorization: `Bearer ${json.access_token}` },
      });
      if (u.ok) {
        const user = (await u.json()) as {
          user?: { username?: string; name?: string };
        };
        accountLabel = user.user?.username ?? user.user?.name;
      }
    } catch {
      /* label is cosmetic */
    }

    return { accessToken: json.access_token, scopes: [], accountLabel };
  },
};

const TODOIST: OAuthProvider = {
  provider: "todoist",
  clientIdEnv: "TODOIST_CLIENT_ID",
  clientSecretEnv: "TODOIST_CLIENT_SECRET",
  // Full read/write so the AI can create and sync tasks in a later pass.
  scopes: ["data:read_write"],
  buildAuthorizeUrl({ clientId, redirectUri, state }) {
    const u = new URL("https://todoist.com/oauth/authorize");
    u.searchParams.set("client_id", clientId);
    u.searchParams.set("scope", TODOIST.scopes.join(","));
    u.searchParams.set("state", state);
    // Todoist derives the redirect from the app's configured URL, but passing it
    // keeps parity with the other providers and future-proofs multi-env setups.
    u.searchParams.set("redirect_uri", redirectUri);
    return u.toString();
  },
  async exchangeToken({ clientId, clientSecret, code, redirectUri }) {
    const res = await fetch("https://todoist.com/oauth/access_token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "<unreadable>");
      console.error("[oauth todoist] token exchange failed", {
        status: res.status,
        body,
      });
      return null;
    }
    const json = (await res.json()) as { access_token?: string };
    if (!json.access_token) {
      console.error("[oauth todoist] token response missing access_token", json);
      return null;
    }

    // Best-effort friendly label via the Sync API user resource.
    let accountLabel: string | undefined;
    try {
      const u = await fetch("https://api.todoist.com/sync/v9/sync", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${json.access_token}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          sync_token: "*",
          resource_types: '["user"]',
        }),
      });
      if (u.ok) {
        const data = (await u.json()) as {
          user?: { full_name?: string; email?: string };
        };
        accountLabel = data.user?.full_name ?? data.user?.email;
      }
    } catch {
      /* label is cosmetic */
    }

    // Todoist access tokens do not expire and there is no refresh token.
    return { accessToken: json.access_token, scopes: TODOIST.scopes, accountLabel };
  },
};

// ── Google ───────────────────────────────────────────────────────────────────
// Gmail, Calendar and Drive are separate connectors but share ONE Google Cloud
// OAuth app (GOOGLE_CLIENT_ID/SECRET). Each requests only the scopes it needs.
// `access_type=offline` + `prompt=consent` are required to receive a refresh
// token (Google access tokens expire after ~1h); the chat tools refresh on the
// fly. openid/email scopes are added for a friendly account label.
const GOOGLE_USERINFO_SCOPES = [
  "openid",
  "https://www.googleapis.com/auth/userinfo.email",
];

function makeGoogleProvider(
  provider: string,
  serviceScopes: string[],
): OAuthProvider {
  const scopes = [...GOOGLE_USERINFO_SCOPES, ...serviceScopes];
  return {
    provider,
    clientIdEnv: "GOOGLE_CLIENT_ID",
    clientSecretEnv: "GOOGLE_CLIENT_SECRET",
    scopes,
    buildAuthorizeUrl({ clientId, redirectUri, state }) {
      const u = new URL("https://accounts.google.com/o/oauth2/v2/auth");
      u.searchParams.set("client_id", clientId);
      u.searchParams.set("redirect_uri", redirectUri);
      u.searchParams.set("response_type", "code");
      u.searchParams.set("scope", scopes.join(" "));
      u.searchParams.set("access_type", "offline");
      u.searchParams.set("prompt", "consent");
      u.searchParams.set("include_granted_scopes", "true");
      u.searchParams.set("state", state);
      return u.toString();
    },
    async exchangeToken({ clientId, clientSecret, code, redirectUri }) {
      const res = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          code,
          redirect_uri: redirectUri,
          grant_type: "authorization_code",
        }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "<unreadable>");
        console.error(`[oauth ${provider}] token exchange failed`, {
          status: res.status,
          body,
        });
        return null;
      }
      const json = (await res.json()) as {
        access_token?: string;
        refresh_token?: string;
        expires_in?: number;
        scope?: string;
      };
      if (!json.access_token) {
        console.error(`[oauth ${provider}] token response missing access_token`);
        return null;
      }

      // Friendly label via the OpenID userinfo endpoint.
      let accountLabel: string | undefined;
      try {
        const u = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
          headers: { Authorization: `Bearer ${json.access_token}` },
        });
        if (u.ok) {
          accountLabel = ((await u.json()) as { email?: string }).email;
        }
      } catch {
        /* label is cosmetic */
      }

      return {
        accessToken: json.access_token,
        refreshToken: json.refresh_token,
        scopes: json.scope ? json.scope.split(" ").filter(Boolean) : scopes,
        accountLabel,
        tokenExpiresAt: json.expires_in
          ? Date.now() + json.expires_in * 1000
          : undefined,
      };
    },
  };
}

const GMAIL = makeGoogleProvider("gmail", [
  "https://www.googleapis.com/auth/gmail.readonly",
]);
const GOOGLE_CALENDAR = makeGoogleProvider("google_calendar", [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.readonly",
]);
const GOOGLE_DRIVE = makeGoogleProvider("google_drive", [
  "https://www.googleapis.com/auth/drive.readonly",
]);

const REGISTRY: Record<string, OAuthProvider> = {
  github: GITHUB,
  notion: NOTION,
  vercel: VERCEL,
  todoist: TODOIST,
  gmail: GMAIL,
  google_calendar: GOOGLE_CALENDAR,
  google_drive: GOOGLE_DRIVE,
};

export function getOAuthProvider(provider: string): OAuthProvider | null {
  return REGISTRY[provider] ?? null;
}
