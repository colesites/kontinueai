import { useEffect } from "react";
import { Platform } from "react-native";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { useRouter, type Href } from "expo-router";
import { useMutation } from "convex/react";
import { api } from "@repo/convex/convex/_generated/api";

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
    try {
      // Show alerts for pushes that arrive while the app is open.
      Notifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowBanner: true,
          shouldShowList: true,
          shouldPlaySound: false,
          shouldSetBadge: true,
        }),
      });
    } catch (error) {
      console.warn("[push] notification handler skipped:", error);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const timeout = setTimeout(() => {
      void register();
    }, 3000);

    async function register() {
      try {
        if (!Device.isDevice) return; // simulators can't receive remote push

        if (Platform.OS === "android") {
          await Notifications.setNotificationChannelAsync("default", {
            name: "Default",
            importance: Notifications.AndroidImportance.DEFAULT,
          });
        }

        const existing = await Notifications.getPermissionsAsync();
        let status = existing.status;
        if (status !== "granted") {
          const requested = await Notifications.requestPermissionsAsync();
          status = requested.status;
        }
        if (status !== "granted" || cancelled) return;

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
      }
    }

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [saveExpoPushToken]);

  // Tapping a notification deep-links into the screen it points at.
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const url = response.notification.request.content.data?.url;
        if (typeof url === "string" && url.startsWith("/")) {
          router.push(url as Href);
        }
      },
    );
    return () => sub.remove();
  }, [router]);

  return null;
}
