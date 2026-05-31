// Abstraction over connector token access so the SAME chat tools work in two
// contexts: an interactive request (authenticated user session → convexToken)
// and an autonomous agent-task run (no session → owner id + shared secret).

import { fetchAction } from "convex/nextjs";
import { api as convexApi } from "@repo/convex/convex/_generated/api";
import type { Id } from "@repo/convex/convex/_generated/dataModel";

export interface RefreshableToken {
  accessToken: string;
  refreshToken: string | null;
  tokenExpiresAt: number | null;
}

export interface ConnectorTokens {
  getAccessToken(provider: string): Promise<{ accessToken: string } | null>;
  getRefreshableToken(provider: string): Promise<RefreshableToken | null>;
  persistRefreshedToken(
    provider: string,
    accessToken: string,
    tokenExpiresAt?: number,
  ): Promise<void>;
}

// Interactive path — calls the authed Convex actions with the user's token.
export function userConnectorTokens(convexToken: string): ConnectorTokens {
  return {
    getAccessToken: (provider) =>
      fetchAction(
        convexApi.connectors.getAccessToken,
        { provider },
        { token: convexToken },
      ),
    getRefreshableToken: (provider) =>
      fetchAction(
        convexApi.connectors.getRefreshableToken,
        { provider },
        { token: convexToken },
      ),
    persistRefreshedToken: async (provider, accessToken, tokenExpiresAt) => {
      await fetchAction(
        convexApi.connectors.persistRefreshedToken,
        { provider, accessToken, tokenExpiresAt },
        { token: convexToken },
      );
    },
  };
}

// Autonomous path — calls the owner-scoped, secret-guarded Convex actions.
export function ownerConnectorTokens(
  ownerId: string,
  secret: string,
): ConnectorTokens {
  const id = ownerId as Id<"users">;
  return {
    getAccessToken: (provider) =>
      fetchAction(convexApi.connectors.getAccessTokenForOwner, {
        ownerId: id,
        provider,
        secret,
      }),
    getRefreshableToken: (provider) =>
      fetchAction(convexApi.connectors.getRefreshableTokenForOwner, {
        ownerId: id,
        provider,
        secret,
      }),
    persistRefreshedToken: async (provider, accessToken, tokenExpiresAt) => {
      await fetchAction(convexApi.connectors.persistRefreshedTokenForOwner, {
        ownerId: id,
        provider,
        accessToken,
        tokenExpiresAt,
        secret,
      });
    },
  };
}
