// /kode: Kode on your computer, from your phone. One screen like ChatGPT's
// Codex: the computer as a chip you can switch, its threads, and "Ask Kode"
// at the bottom. A thread opens at /kode/[deviceId]/[chatId].

import { useEffect, useMemo, useState } from "react";
import { KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";
import * as SecureStore from "expo-secure-store";
import { type Href, useRouter } from "expo-router";
import { useMutation, useQuery } from "convex/react";
import { api } from "@repo/convex/convex/_generated/api";
import { deviceSeenLabel, isDeviceOnline } from "@repo/core/kode-remote";
import { Check, ChevronDown, Folder, MessageSquare } from "lucide-react-native";

import { FloatingToolbar, useFloatingToolbarInset } from "@/components/floating-toolbar";
import {
  deviceIcon,
  OnlineDot,
  RemoteComposer,
  remoteError,
  RunBadge,
  useNow,
} from "@/components/kode-remote/remote-shared";
import { Dropdown, DropdownItem, useDropdown } from "@/components/ui/dropdown";
import { Icon } from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { toast } from "@/components/ui/toast";
import { isPushEnabled, requestPushPermission } from "@/lib/push-notifications";

const APP_ICON = require("@/assets/images/kontinue-icon.png");
const DOWNLOAD_URL = "https://kontinueai.com/download";
const COMPUTER_KEY = "kode-remote-computer";
const NO_PROJECT = "__none";

function timeAgo(at: number, now: number): string {
  const minutes = Math.floor((now - at) / 60_000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

/** Centered state with the app icon, like Codex's "Unable to connect". */
function CenterState({ title, body, action }: { title: string; body: string; action?: { label: string; onPress: () => void } }) {
  return (
    <View className="items-center px-8 pt-24">
      <Image source={APP_ICON} style={{ width: 64, height: 64, borderRadius: 16 }} contentFit="cover" />
      <Text className="mt-5 text-center text-[17px] font-semibold text-foreground">{title}</Text>
      <Text className="mt-1.5 text-center text-[14px] leading-5 text-muted-foreground">{body}</Text>
      {action ? (
        <Pressable onPress={action.onPress} className="mt-5 rounded-full px-4 py-2 active:bg-foreground/6">
          <Text className="text-[15px] font-semibold text-foreground">{action.label}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export default function KodeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const toolbarInset = useFloatingToolbarInset();
  const now = useNow();
  const devices = useQuery(api.kodeRemote.listDevices, {});
  const sendPrompt = useMutation(api.kodeRemote.sendPrompt);
  const computerMenu = useDropdown();
  const projectMenu = useDropdown();
  const [picked, setPicked] = useState<string | null>(null);
  const [projectKey, setProjectKey] = useState(NO_PROJECT);

  // The computer you used last, else one that's online.
  useEffect(() => {
    void SecureStore.getItemAsync(COMPUTER_KEY).then((saved) => saved && setPicked(saved)).catch(() => {});
  }, []);
  const device =
    devices?.find((d) => d.deviceId === picked) ??
    devices?.find((d) => d.enabled && isDeviceOnline(d.lastSeenAt, now)) ??
    devices?.[0] ??
    null;
  const pick = (deviceId: string) => {
    setPicked(deviceId);
    setProjectKey(NO_PROJECT);
    void SecureStore.setItemAsync(COMPUTER_KEY, deviceId).catch(() => {});
  };

  const overview = useQuery(api.kodeRemote.deviceOverview, device ? { deviceId: device.deviceId } : "skip");
  const online = Boolean(device?.enabled && isDeviceOnline(device.lastSeenAt, now));

  const groups = useMemo(() => {
    if (!overview) return [];
    const byProject = new Map<string | null, typeof overview.chats>();
    for (const chat of overview.chats) {
      const key = overview.projects.some((p) => p.key === chat.projectKey) ? chat.projectKey : null;
      byProject.set(key, [...(byProject.get(key) ?? []), chat]);
    }
    const rows = overview.projects
      .map((project) => ({ key: project.key, name: project.name, chats: byProject.get(project.key) ?? [] }))
      .filter((group) => group.chats.length > 0);
    const loose = byProject.get(null) ?? [];
    if (loose.length > 0) rows.push({ key: NO_PROJECT, name: "Other threads", chats: loose });
    return rows;
  }, [overview]);

  const openThread = (chatId: string) =>
    device && router.push(`/kode/${encodeURIComponent(device.deviceId)}/${chatId}` as Href);
  const projectName = overview?.projects.find((p) => p.key === projectKey)?.name ?? "No project";

  let body: React.ReactNode;
  if (devices === undefined) {
    body = (
      <View className="gap-3 px-4 pt-4">
        <Skeleton className="h-6 w-40 rounded-full" />
        <Skeleton className="h-12 rounded-xl" />
        <Skeleton className="h-12 rounded-xl" />
      </View>
    );
  } else if (!device) {
    body = (
      <CenterState
        title="Connect your computer"
        body="Open Kode on your Mac or PC, signed in with this account, and turn on Remote control in its sidebar."
        action={{ label: "Get Kode for desktop", onPress: () => void Linking.openURL(DOWNLOAD_URL) }}
      />
    );
  } else if (!device.enabled) {
    body = (
      <CenterState
        title="Remote control is off"
        body={`Turn it on in Kode on ${device.name}: click Remote control in the sidebar.`}
      />
    );
  } else if (!online && (overview?.chats.length ?? 0) === 0) {
    body = (
      <CenterState
        title="Unable to connect"
        body={`${deviceSeenLabel(device.lastSeenAt, now)}. Open Kode on ${device.name} and keep it awake.`}
      />
    );
  } else if (overview === undefined) {
    body = (
      <View className="gap-3 px-4 pt-4">
        <Skeleton className="h-12 rounded-xl" />
        <Skeleton className="h-12 rounded-xl" />
      </View>
    );
  } else if (groups.length === 0) {
    body = <CenterState title={`Kode on ${device.name}`} body="Ask Kode to build, fix or explain something. It runs on your computer." />;
  } else {
    body = (
      <View className="gap-6 px-4 pt-2">
        {groups.map((group) => (
          <View key={group.key}>
            <View className="mb-1 flex-row items-center gap-1.5 px-1">
              <Icon
                as={group.key === NO_PROJECT ? MessageSquare : Folder}
                size={13}
                className={group.key === NO_PROJECT ? "text-muted-foreground" : "text-primary"}
              />
              <Text className="text-[12.5px] font-medium text-muted-foreground">{group.name}</Text>
            </View>
            {group.chats.slice(0, 30).map((chat) => (
              <Pressable
                key={chat.chatId}
                onPress={() => openThread(chat.chatId)}
                className="flex-row items-center gap-2.5 rounded-xl px-2 py-3 active:bg-foreground/5"
              >
                <Text numberOfLines={1} className="flex-1 text-[15px] text-foreground">
                  {chat.title}
                </Text>
                <RunBadge status={chat.status} />
                <Text className="text-[12px] text-muted-foreground">{timeAgo(chat.updatedAt, now)}</Text>
              </Pressable>
            ))}
          </View>
        ))}
      </View>
    );
  }

  return (
    <View className="bg-background" style={{ flex: 1 }}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingTop: toolbarInset, paddingBottom: 24 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {device ? (
            <Pressable
              onPress={devices && devices.length > 1 ? computerMenu.open : undefined}
              className="mx-4 mb-2 flex-row items-center gap-2 self-start rounded-full py-1.5 pr-2 active:opacity-70"
            >
              <OnlineDot online={online} />
              <Icon as={deviceIcon(device.platform)} size={16} className="text-foreground" />
              <Text numberOfLines={1} className="max-w-[240px] text-[15px] font-medium text-foreground">
                {device.name}
              </Text>
              {devices && devices.length > 1 ? <Icon as={ChevronDown} size={14} className="text-muted-foreground" /> : null}
            </Pressable>
          ) : null}
          {body}
        </ScrollView>

        {device?.enabled && overview ? (
          <View className="px-3 pt-2" style={{ paddingBottom: Math.max(insets.bottom, 10) }}>
            <RemoteComposer
              models={overview.device.models}
              defaultModelId={overview.device.defaultModelId}
              placeholder="Ask Kode"
              note={online ? null : `${device.name} is offline. Your message waits up to 10 minutes for it.`}
              leading={
                overview.projects.length > 0 ? (
                  <Pressable
                    onPress={projectMenu.open}
                    className="max-w-[170px] flex-row items-center gap-1.5 rounded-full bg-foreground/5 px-3 py-1.5 active:bg-foreground/10"
                  >
                    <Icon as={Folder} size={13} className="text-primary" />
                    <Text numberOfLines={1} className="shrink text-[12px] text-foreground/85">
                      {projectName}
                    </Text>
                    <Icon as={ChevronDown} size={12} className="text-muted-foreground" />
                  </Pressable>
                ) : null
              }
              onSend={async ({ text, modelId, mode }) => {
                try {
                  const { chatId } = await sendPrompt({
                    deviceId: device.deviceId,
                    projectKey: projectKey === NO_PROJECT ? null : projectKey,
                    text,
                    modelId,
                    mode,
                  });
                  // Ask once, when it matters: Kode will need you for approvals.
                  void isPushEnabled().then((on) => (on ? undefined : requestPushPermission()));
                  openThread(chatId);
                  return true;
                } catch (error) {
                  toast.error("Couldn't send it", { description: remoteError(error, "Please try again.") });
                  return false;
                }
              }}
            />
          </View>
        ) : null}
      </KeyboardAvoidingView>

      <FloatingToolbar />

      <Dropdown visible={computerMenu.visible} anchor={computerMenu.anchor} onClose={computerMenu.close} width={260}>
        {(devices ?? []).map((item) => (
          <DropdownItem
            key={item.deviceId}
            icon={deviceIcon(item.platform)}
            label={`${item.name} · ${item.enabled ? deviceSeenLabel(item.lastSeenAt, now) : "Off"}`}
            active={item.deviceId === device?.deviceId}
            trailing={item.deviceId === device?.deviceId ? <Icon as={Check} size={14} className="text-primary" /> : null}
            onPress={() => {
              pick(item.deviceId);
              computerMenu.close();
            }}
          />
        ))}
      </Dropdown>
      <Dropdown visible={projectMenu.visible} anchor={projectMenu.anchor} onClose={projectMenu.close} width={240}>
        <DropdownItem
          icon={MessageSquare}
          label="No project"
          active={projectKey === NO_PROJECT}
          onPress={() => {
            setProjectKey(NO_PROJECT);
            projectMenu.close();
          }}
        />
        {(overview?.projects ?? []).map((project) => (
          <DropdownItem
            key={project.key}
            icon={Folder}
            label={project.name}
            active={project.key === projectKey}
            onPress={() => {
              setProjectKey(project.key);
              projectMenu.close();
            }}
          />
        ))}
      </Dropdown>
    </View>
  );
}
