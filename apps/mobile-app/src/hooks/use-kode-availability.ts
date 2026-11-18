import { useEffect, useState } from "react";
import { useAuth } from "@clerk/expo";
import { resolveKodeComingSoon } from "@repo/core/kode-availability";

import { API_BASE_URL } from "@/lib/chat-api";

function hostOf(url: string): string | null {
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

// Same rule web applies to its own host, used until (or if) the server answers.
const LOCAL_GUESS = resolveKodeComingSoon({
  host: hostOf(API_BASE_URL),
  productionEnabled: process.env.EXPO_PUBLIC_KODE_PRODUCTION_ENABLED,
});

let cached: boolean | null = null;

/**
 * Whether Kode is still "coming soon" on the deployment this app talks to.
 * Asks web's /api/kode/availability (the switch lives in a server env var) so
 * mobile never creates a project the build route would refuse.
 */
export function useKodeComingSoon(): { comingSoon: boolean; resolved: boolean } {
  const { getToken } = useAuth();
  const [value, setValue] = useState<boolean | null>(cached);

  useEffect(() => {
    if (cached !== null) return;
    let active = true;
    void (async () => {
      try {
        const token = await getToken();
        const response = await fetch(`${API_BASE_URL}/api/kode/availability`, {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });
        if (!response.ok) throw new Error(String(response.status));
        const body = (await response.json()) as { comingSoon?: unknown };
        cached = body.comingSoon === true;
      } catch {
        // Older servers don't have the endpoint: fall back to web's own rule.
        cached = LOCAL_GUESS;
      }
      if (active) setValue(cached);
    })();
    return () => {
      active = false;
    };
  }, [getToken]);

  return { comingSoon: value ?? LOCAL_GUESS, resolved: value !== null };
}
