import { useEffect } from "react";
import { useKodeWorkspace } from "@/lib/kode-workspace";
import { getScheduledPrompts, idleFor, useScheduledPrompts } from "@/lib/kode-schedule";
import HomeView from "@/components/view/HomeView";
import CanvasView from "@/components/view/CanvasView";
import TasksView from "@/components/view/TasksView";
import KodeView from "@/components/view/KodeView";
import { useImportSyncDeps } from "@/components/kode/ImportedChatBar";
import { useImportBackgroundSync } from "@/lib/kode-import-sync";
import { useOrchestrationBridge } from "@/lib/kode-orchestration";
import { useImportContextUpload } from "@/lib/kode-import-cloud";
import { useWebhookThreads } from "@/lib/kode-webhooks";
import { usePrWatcher } from "@/lib/kode-pr-watcher";
import { RunNotifications } from "./RunNotifications";
import { GlobalShortcuts } from "./GlobalShortcuts";
import { MenuBridge } from "./MenuBridge";
import { UpdateDialog } from "./UpdateDialog";
import { CommandPalette } from "./CommandPalette";
import { useAutoArchive } from "@/lib/kode-auto-archive";
import { useAutoCleanup } from "@/lib/kode-cleanup";
import { useTaskReminders } from "@/lib/task-reminders";

type ViewLayoutProps = {
  panelOpen: boolean;
  onPanelChange: (open: boolean) => void;
};

const ViewLayout = ({ panelOpen, onPanelChange }: ViewLayoutProps) => {
  const { activeTab, setActiveTab, kodeChats } = useKodeWorkspace();
  const scheduled = useScheduledPrompts();
  // Imported chats stay in sync even when they aren't open (or Kode isn't
  // the active tab), and other agents can reach Kode through its MCP server.
  useImportBackgroundSync(useImportSyncDeps());
  useOrchestrationBridge();
  // Imported chats' context follows you to your other devices.
  useImportContextUpload(kodeChats.map((chat) => chat.id));
  // Webhook events (GitHub, CI, …) start threads.
  useWebhookThreads();
  usePrWatcher();
  useAutoArchive();
  useAutoCleanup();
  // Task reminders show as macOS notifications from any screen.
  useTaskReminders();

  // Scheduled Kode prompts send from the Kode view. If one is due while you're
  // on Home or Canvas and you've stepped away, open Kode so it can go out.
  useEffect(() => {
    if (activeTab === "kode" || scheduled.length === 0) return;
    const check = () => {
      const now = Date.now();
      if (idleFor(now) < 2 * 60_000) return;
      if (getScheduledPrompts().some((item) => item.fireAt <= now)) setActiveTab("kode");
    };
    check();
    const id = window.setInterval(check, 15_000);
    return () => window.clearInterval(id);
  }, [activeTab, scheduled.length, setActiveTab]);

  return (
    <>
      {activeTab === "home" ? (
        <HomeView />
      ) : activeTab === "canvas" ? (
        <CanvasView />
      ) : activeTab === "tasks" ? (
        <TasksView />
      ) : (
        <KodeView panelOpen={panelOpen} onPanelChange={onPanelChange} />
      )}
      <RunNotifications />
      <GlobalShortcuts />
      <MenuBridge />
      <UpdateDialog />
      <CommandPalette />
    </>
  );
};

export default ViewLayout;
