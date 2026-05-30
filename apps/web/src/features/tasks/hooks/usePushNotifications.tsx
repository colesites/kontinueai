"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useMutation } from "convex/react";
import { api } from "@repo/convex/convex/_generated/api";

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

// VAPID public keys are base64url; the PushManager wants a Uint8Array.
function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(normalized);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}

export type PushState =
  | "unsupported"
  | "default"
  | "granted"
  | "denied"
  | "subscribed";

export interface PushNotificationsValue {
  supported: boolean;
  state: PushState;
  busy: boolean;
  subscribe: () => Promise<void>;
  unsubscribe: () => Promise<void>;
}

const PushNotificationsContext = createContext<PushNotificationsValue | null>(
  null,
);

// The actual subscription/permission logic. Lives once in the provider so every
// consumer (sidebar bell, Tasks toggle, banner) shares a single source of truth
// and stays in sync.
function usePushNotificationsState(): PushNotificationsValue {
  const savePushSubscription = useMutation(api.push.savePushSubscription);
  const deletePushSubscription = useMutation(api.push.deletePushSubscription);

  const [state, setState] = useState<PushState>("default");
  const [busy, setBusy] = useState(false);

  const supported =
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window &&
    !!VAPID_PUBLIC_KEY;

  // Reflect the current subscription/permission state on mount.
  useEffect(() => {
    if (!supported) {
      setState("unsupported");
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const reg = await navigator.serviceWorker.getRegistration();
        const existing = await reg?.pushManager.getSubscription();
        if (cancelled) return;
        if (existing) setState("subscribed");
        else setState(Notification.permission as PushState);
      } catch {
        if (!cancelled) setState(Notification.permission as PushState);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [supported]);

  const subscribe = useCallback(async () => {
    if (!supported || !VAPID_PUBLIC_KEY) return;
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission as PushState);
        return;
      }
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(
          VAPID_PUBLIC_KEY,
        ) as BufferSource,
      });

      const json = sub.toJSON();
      if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
        throw new Error("Incomplete push subscription");
      }
      await savePushSubscription({
        endpoint: json.endpoint,
        p256dh: json.keys.p256dh,
        auth: json.keys.auth,
        userAgent:
          typeof navigator !== "undefined" ? navigator.userAgent : undefined,
      });
      setState("subscribed");
    } finally {
      setBusy(false);
    }
  }, [supported, savePushSubscription]);

  const unsubscribe = useCallback(async () => {
    if (!supported) return;
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await deletePushSubscription({ endpoint: sub.endpoint });
        await sub.unsubscribe();
      }
      setState(Notification.permission as PushState);
    } finally {
      setBusy(false);
    }
  }, [supported, deletePushSubscription]);

  return { supported, state, busy, subscribe, unsubscribe };
}

export function PushNotificationsProvider({
  children,
}: {
  children: ReactNode;
}) {
  const value = usePushNotificationsState();
  return (
    <PushNotificationsContext.Provider value={value}>
      {children}
    </PushNotificationsContext.Provider>
  );
}

// A benign no-op value for consumers rendered outside the provider. Returning
// this (instead of throwing) means a missing provider degrades gracefully —
// the bell/toggle just look "unsupported" rather than crashing the whole app.
const NOOP_PUSH: PushNotificationsValue = {
  supported: false,
  state: "unsupported",
  busy: false,
  subscribe: async () => {},
  unsubscribe: async () => {},
};

export function usePushNotifications(): PushNotificationsValue {
  return useContext(PushNotificationsContext) ?? NOOP_PUSH;
}
