import { useEffect } from "react";
import { DeviceEventEmitter, Platform } from "react-native";
import * as Device from "expo-device";
import Constants from "expo-constants";
import { useRouter, type Href } from "expo-router";
import { useMutation } from "convex/react";
import { api } from "@repo/convex/convex/_generated/api";
import * as Sentry from "@sentry/react-native";

import {
  isPushEnabled,
  PUSH_PERMISSION_CHANGED_EVENT,
} from "@/lib/push-notifications";

/**
 * Registers this device for push notifications and stores the Expo token in
 * Convex (reminderDelivery fans out to it alongside email/web push). Remote
 * push needs a real device with a development/production build — in Expo Go
 * or a simulator registration quietly no-ops.
 */
export function PushRegistrar() {
  const router = useRouter();
  const saveExpoPushToken = useMutation(api.push.saveExpoPushToken);

  useEffect(() => {
    let cancelled = false;
    let responseSubscription: { remove: () => void } | undefined;

    async function register() {
      try {
        if (!(await isPushEnabled()) || cancelled) return;
        const Notifications = await import("expo-notifications");

        // Show alerts for pushes that arrive while the app is open.
        Notifications.setNotificationHandler({
          handleNotification: async () => ({
            shouldShowBanner: true,
            shouldShowList: true,
            shouldPlaySound: false,
            shouldSetBadge: true,
          }),
        });

        responseSubscription ??=
          Notifications.addNotificationResponseReceivedListener((response) => {
            const url = response.notification.request.content.data?.url;
            if (typeof url === "string" && url.startsWith("/")) {
              router.push(url as Href);
            }
          });

        if (!Device.isDevice) return; // simulators can't receive remote push

        if (Platform.OS === "android") {
          await Notifications.setNotificationChannelAsync("default", {
            name: "Default",
            importance: Notifications.AndroidImportance.DEFAULT,
          });
        }

        const existing = await Notifications.getPermissionsAsync();
        if (existing.status !== "granted" || cancelled) return;

        const projectId =
          Constants.expoConfig?.extra?.eas?.projectId ??
          Constants.easConfig?.projectId;
        const { data: token } = await Notifications.getExpoPushTokenAsync(
          projectId ? { projectId } : undefined,
        );
        if (cancelled || !token) return;

        await saveExpoPushToken({
          token,
          platform: Platform.OS,
          deviceName: Device.deviceName ?? undefined,
        });
      } catch (error) {
        // Expected in Expo Go (no push module) — never block the app on this.
        console.warn("[push] registration skipped:", error);
        if (!__DEV__) {
          Sentry.captureException(error, {
            tags: { subsystem: "push-registration" },
          });
        }
      }
    }

    const timeout = setTimeout(() => void register(), 1200);
    const permissionSubscription = DeviceEventEmitter.addListener(
      PUSH_PERMISSION_CHANGED_EVENT,
      (enabled: boolean) => {
        if (enabled) void register();
      },
    );

    return () => {
      cancelled = true;
      clearTimeout(timeout);
      permissionSubscription.remove();
      responseSubscription?.remove();
    };
  }, [router, saveExpoPushToken]);

  return null;
}
