import { ConvexError, v } from "convex/values";
import {
  action,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { decryptToken, encryptToken } from "./lib/encryption";

// Providers we know how to connect. Keep in sync with the UI catalog.
const KNOWN_PROVIDERS = [
  "github",
  "notion",
  "vercel",
  "todoist",
  "gmail",
  "google_calendar",
  "google_drive",
] as const;
type Provider = (typeof KNOWN_PROVIDERS)[number];

async function requireUser(ctx: QueryCtx | MutationCtx): Promise<Doc<"users">> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Not authenticated");
  const user = await ctx.db
    .query("users")
    .withIndex("by_clerk_id", (q) => q.eq("clerkUserId", identity.subject))
    .unique();
  if (!user) throw new Error("User not found");
  return user;
}

// Public list — NEVER returns token material, only connection metadata.
export const listConnectors = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const rows = await ctx.db
      .query("connectors")
      .withIndex("by_owner", (q) => q.eq("ownerId", user._id))
      .take(50);
    return rows.map((c) => ({
      _id: c._id,
      provider: c.provider,
      connected: c.connected,
      accountLabel: c.accountLabel,
      scopes: c.scopes,
      tokenExpiresAt: c.tokenExpiresAt,
      lastSyncAt: c.lastSyncAt,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    }));
  },
});

// Disconnect: delete the stored (encrypted) tokens entirely.
export const disconnect = mutation({
  args: { provider: v.string() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const existing = await ctx.db
      .query("connectors")
      .withIndex("by_owner_provider", (q) =>
        q.eq("ownerId", user._id).eq("provider", args.provider),
      )
      .unique();
    if (existing) await ctx.db.delete(existing._id);
    return null;
  },
});

// ── Internal: persist an encrypted connector (called by the connect action) ──
export const upsertEncrypted = internalMutation({
  args: {
    ownerId: v.id("users"),
    provider: v.string(),
    accessTokenEncrypted: v.string(),
    refreshTokenEncrypted: v.optional(v.string()),
    scopes: v.array(v.string()),
    accountLabel: v.optional(v.string()),
    tokenExpiresAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("connectors")
      .withIndex("by_owner_provider", (q) =>
        q.eq("ownerId", args.ownerId).eq("provider", args.provider),
      )
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        accessTokenEncrypted: args.accessTokenEncrypted,
        refreshTokenEncrypted: args.refreshTokenEncrypted,
        scopes: args.scopes,
        accountLabel: args.accountLabel,
        tokenExpiresAt: args.tokenExpiresAt,
        connected: true,
        updatedAt: now,
      });
      return existing._id;
    }

    return await ctx.db.insert("connectors", {
      ownerId: args.ownerId,
      provider: args.provider,
      accessTokenEncrypted: args.accessTokenEncrypted,
      refreshTokenEncrypted: args.refreshTokenEncrypted,
      scopes: args.scopes,
      accountLabel: args.accountLabel,
      tokenExpiresAt: args.tokenExpiresAt,
      connected: true,
      createdAt: now,
      updatedAt: now,
    });
  },
});

// Resolve the current user's id (used by the connect action before encrypting).
export const getUserIdForIdentity = internalQuery({
  args: { clerkUserId: v.string() },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkUserId", args.clerkUserId))
      .unique();
    return user?._id ?? null;
  },
});

// Fetch the stored encrypted access token for a provider (internal use only).
export const getEncryptedToken = internalQuery({
  args: { ownerId: v.id("users"), provider: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("connectors")
      .withIndex("by_owner_provider", (q) =>
        q.eq("ownerId", args.ownerId).eq("provider", args.provider),
      )
      .unique();
    if (!row || !row.connected) return null;
    return {
      accessTokenEncrypted: row.accessTokenEncrypted,
      refreshTokenEncrypted: row.refreshTokenEncrypted ?? null,
      tokenExpiresAt: row.tokenExpiresAt ?? null,
    };
  },
});

// Persist a refreshed access token (e.g. after a Google token refresh). Patches
// only the access token + expiry; the refresh token is left untouched.
export const updateAccessToken = internalMutation({
  args: {
    ownerId: v.id("users"),
    provider: v.string(),
    accessTokenEncrypted: v.string(),
    tokenExpiresAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("connectors")
      .withIndex("by_owner_provider", (q) =>
        q.eq("ownerId", args.ownerId).eq("provider", args.provider),
      )
      .unique();
    if (!row) return;
    await ctx.db.patch(row._id, {
      accessTokenEncrypted: args.accessTokenEncrypted,
      tokenExpiresAt: args.tokenExpiresAt,
      updatedAt: Date.now(),
    });
  },
});

// ── Action: store a freshly-obtained OAuth token (encrypts at rest) ──────────
// Called by the OAuth callback route after exchanging the auth code. The
// plaintext token never touches the database.
export const storeOAuthToken = action({
  args: {
    provider: v.string(),
    accessToken: v.string(),
    refreshToken: v.optional(v.string()),
    scopes: v.array(v.string()),
    accountLabel: v.optional(v.string()),
    tokenExpiresAt: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<{ ok: true }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    if (!KNOWN_PROVIDERS.includes(args.provider as Provider)) {
      throw new ConvexError({
        code: "UNKNOWN_PROVIDER",
        message: `Unsupported connector provider: ${args.provider}`,
      });
    }

    const ownerId: Id<"users"> | null = await ctx.runQuery(
      internal.connectors.getUserIdForIdentity,
      { clerkUserId: identity.subject },
    );
    if (!ownerId) throw new Error("User not found");

    const accessTokenEncrypted = await encryptToken(args.accessToken);
    const refreshTokenEncrypted = args.refreshToken
      ? await encryptToken(args.refreshToken)
      : undefined;

    await ctx.runMutation(internal.connectors.upsertEncrypted, {
      ownerId,
      provider: args.provider,
      accessTokenEncrypted,
      refreshTokenEncrypted,
      scopes: args.scopes,
      accountLabel: args.accountLabel,
      tokenExpiresAt: args.tokenExpiresAt,
    });

    return { ok: true };
  },
});

// ── Action: return a decrypted access token to the authenticated owner ───────
// Used by server-side chat tools that call provider APIs on the user's behalf.
export const getAccessToken = action({
  args: { provider: v.string() },
  handler: async (ctx, args): Promise<{ accessToken: string } | null> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const ownerId: Id<"users"> | null = await ctx.runQuery(
      internal.connectors.getUserIdForIdentity,
      { clerkUserId: identity.subject },
    );
    if (!ownerId) return null;

    const row = await ctx.runQuery(internal.connectors.getEncryptedToken, {
      ownerId,
      provider: args.provider,
    });
    if (!row) return null;

    const accessToken = await decryptToken(row.accessTokenEncrypted);
    return { accessToken };
  },
});

// ── Action: return the full (decrypted) token set for refresh-capable providers
// (Google). Used by server-side chat tools that must refresh an expired access
// token before calling the provider API. Same trust boundary as the OAuth
// callback — only ever returned to the authenticated owner, server-side.
export const getRefreshableToken = action({
  args: { provider: v.string() },
  handler: async (
    ctx,
    args,
  ): Promise<{
    accessToken: string;
    refreshToken: string | null;
    tokenExpiresAt: number | null;
  } | null> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const ownerId: Id<"users"> | null = await ctx.runQuery(
      internal.connectors.getUserIdForIdentity,
      { clerkUserId: identity.subject },
    );
    if (!ownerId) return null;

    const row = await ctx.runQuery(internal.connectors.getEncryptedToken, {
      ownerId,
      provider: args.provider,
    });
    if (!row) return null;

    const accessToken = await decryptToken(row.accessTokenEncrypted);
    const refreshToken = row.refreshTokenEncrypted
      ? await decryptToken(row.refreshTokenEncrypted)
      : null;
    return { accessToken, refreshToken, tokenExpiresAt: row.tokenExpiresAt };
  },
});

// ── Action: persist a freshly-refreshed access token (encrypts at rest) ───────
export const persistRefreshedToken = action({
  args: {
    provider: v.string(),
    accessToken: v.string(),
    tokenExpiresAt: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<{ ok: true } | null> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const ownerId: Id<"users"> | null = await ctx.runQuery(
      internal.connectors.getUserIdForIdentity,
      { clerkUserId: identity.subject },
    );
    if (!ownerId) return null;

    const accessTokenEncrypted = await encryptToken(args.accessToken);
    await ctx.runMutation(internal.connectors.updateAccessToken, {
      ownerId,
      provider: args.provider,
      accessTokenEncrypted,
      tokenExpiresAt: args.tokenExpiresAt,
    });
    return { ok: true };
  },
});
