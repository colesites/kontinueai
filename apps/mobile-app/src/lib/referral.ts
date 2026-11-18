import * as SecureStore from "expo-secure-store";

/**
 * Pending referral code, the native stand-in for web's `kontinue_ref` cookie.
 * Captured from an invite deep link or the sign-up form, sent once with the
 * first user sync (when attribution happens), then cleared.
 */
const STORAGE_KEY = "kontinue.pending-referral";

/** Same shape web's /invite/[code] route and ensureReferralCode use. */
export function normalizeReferralCode(raw: string): string {
  return raw
    .replace(/[^a-zA-Z0-9]/g, "")
    .toUpperCase()
    .slice(0, 16);
}

export async function savePendingReferralCode(raw: string): Promise<void> {
  const code = normalizeReferralCode(raw);
  if (!code) return;
  await SecureStore.setItemAsync(STORAGE_KEY, code).catch(() => {});
}

export async function readPendingReferralCode(): Promise<string | undefined> {
  try {
    return (await SecureStore.getItemAsync(STORAGE_KEY)) || undefined;
  } catch {
    return undefined;
  }
}

export async function clearPendingReferralCode(): Promise<void> {
  await SecureStore.deleteItemAsync(STORAGE_KEY).catch(() => {});
}
