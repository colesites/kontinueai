import * as SecureStore from "expo-secure-store";
import { DeviceEventEmitter } from "react-native";

const PUSH_ENABLED_KEY = "kontinue-push-enabled";
export const PUSH_PERMISSION_CHANGED_EVENT = "kontinue-push-permission-changed";

export async function isPushEnabled(): Promise<boolean> {
  try {
    return (await SecureStore.getItemAsync(PUSH_ENABLED_KEY)) === "true";
  } catch {
    return false;
  }
}

/**
 * Requests notification access from an explicit user action. Keeping native
 * notification initialization behind consent also prevents a broken FCM setup
 * from taking down the authenticated app during its first render.
 */
export async function requestPushPermission(): Promise<boolean> {
  const Notifications = await import("expo-notifications");
  const current = await Notifications.getPermissionsAsync();
  const status =
    current.status === "granted"
      ? current.status
      : (await Notifications.requestPermissionsAsync()).status;
  const enabled = status === "granted";

  try {
    await SecureStore.setItemAsync(PUSH_ENABLED_KEY, String(enabled));
  } catch {
    // Permission is still valid for this session even if preference storage fails.
  }

  DeviceEventEmitter.emit(PUSH_PERMISSION_CHANGED_EVENT, enabled);
  return enabled;
}
