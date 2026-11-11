// Settings → General: defaults for new Kode threads (the composer's own model,
// reasoning and mode pickers), chat behaviour, confirmations and About.

import { useEffect, useMemo, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { ExternalLink, Volume2 } from "lucide-react";
import { canUseFastMode, getKodeModelById, KODE_DEFAULT_MODEL_ID, KODE_MODELS, type KodePlan } from "@repo/ai/lib/kode";
import { ModelPickerPopover } from "@/components/chat/ModelPickerPopover";
import { KodeModeMenu } from "@/components/chat/KodeModeMenu";
import { KodeReasoningPopover } from "@/components/chat/KodeReasoningPopover";
import { Switch } from "@/components/ui/switch";
import { DEFAULT_SETTINGS, updateSettings, useAppSettings, type AppSettings } from "@/lib/app-settings";
import { cliPickerModels, useCliStore } from "@/lib/kode-cli";
import { useKodeWorkspace } from "@/lib/kode-workspace";
import { usePlanTier } from "@/hooks/use-plan-tier";
import { Card, openExternal, PillButton, Row, Segmented, Select, Tag, TextField } from "./settings-ui";
import { NOTIFICATION_SOUNDS, playSound } from "@/lib/kode-notify";

const WEBSITE = "https://kontinueai.com";

/** Keys "Restore defaults" on this page puts back. Providers etc. are left alone. */
export const GENERAL_KEYS = [
  "defaultKodeModel",
  "defaultKodeMode",
  "kodeReasoning",
  "kodeContextWindow",
  "kodeFastMode",
  "sendOnEnter",
  "showTurnNavigator",
  "confirmDelete",
  "threadNotifications",
  "inAppNotifications",
  "autoResumeLimited",
  "diffLayout",
  "diffHideWhitespace",
  "diffDefaultCollapsed",
  "notificationSound",
  "notificationSoundName",
  "projectOrder",
  "addProjectDir",
  "confirmUnpin",
  "autoArchiveInactiveDays",
] as const satisfies readonly (keyof AppSettings)[];

export function restoreGeneralDefaults() {
  const patch: Partial<AppSettings> = {};
  for (const key of GENERAL_KEYS) (patch as Record<string, unknown>)[key] = DEFAULT_SETTINGS[key];
  updateSettings(patch);
}

export function toPlan(tier: string): KodePlan {
  return tier === "starter" || tier === "plus" || tier === "pro" || tier === "max" ? tier : "free";
}

/** Kode models plus enabled models from the user's own agents (Providers). */
export function useKodePickerModels() {
  const settings = useAppSettings();
  const cliStore = useCliStore();
  return useMemo(() => [...KODE_MODELS, ...cliPickerModels(settings, cliStore)], [settings, cliStore]);
}

export function GeneralSection() {
  const settings = useAppSettings();
  const { openSettings } = useKodeWorkspace();
  const plan = toPlan(usePlanTier());
  const models = useKodePickerModels();
  const modelId = settings.defaultKodeModel ?? KODE_DEFAULT_MODEL_ID;
  const kodeModel = getKodeModelById(modelId);
  const fastAllowed = kodeModel ? canUseFastMode(kodeModel, plan) : false;

  return (
    <>
      <Card title="New Kode threads">
        <Row
          label="Model"
          description="The model and reasoning new threads start with. Projects can override it in .kode/settings.json."
        >
          <ModelPickerPopover
            models={models}
            selectedModelId={modelId}
            onSelectModel={(model) => updateSettings({ defaultKodeModel: model.id })}
            onOpenSettings={() => openSettings("providers")}
            kodePlan={plan}
            side="bottom"
            align="end"
          />
          {kodeModel ? <KodeReasoningPopover modelId={modelId} side="bottom" /> : null}
        </Row>
        <Row label="Permissions" description="How much the agent may do without asking. ⇧Tab switches it in the composer.">
          <KodeModeMenu
            mode={settings.defaultKodeMode}
            onModeChange={(mode) => updateSettings({ defaultKodeMode: mode })}
            side="bottom"
            align="end"
            showStyle={false}
            hint={null}
          />
        </Row>
        <Row
          label="Fast mode"
          badge={<Tag tone="purple">Pro</Tag>}
          description={
            fastAllowed
              ? "Use the model's faster variant when it has one. Uses more of your plan."
              : kodeModel?.fast
                ? "Available on Pro and Max."
                : "The selected model has no fast variant."
          }
        >
          <Switch
            checked={settings.kodeFastMode && fastAllowed}
            disabled={!fastAllowed}
            onCheckedChange={(checked) => updateSettings({ kodeFastMode: checked })}
          />
        </Row>
      </Card>

      <Card title="Chat">
        <Row
          label="Send messages with"
          description={
            settings.sendOnEnter ? "Enter sends. Shift+Enter adds a new line." : "⌘ Enter sends. Enter adds a new line."
          }
        >
          <Segmented
            value={settings.sendOnEnter ? "enter" : "mod"}
            options={[
              { value: "enter", label: "Enter" },
              { value: "mod", label: "⌘ Enter" },
            ]}
            onChange={(value) => updateSettings({ sendOnEnter: value === "enter" })}
          />
        </Row>
        <Row label="Message navigator" description="The slim rail on the right of a chat that jumps between your messages.">
          <Switch
            checked={settings.showTurnNavigator}
            onCheckedChange={(checked) => updateSettings({ showTurnNavigator: checked })}
          />
        </Row>
      </Card>

      <Card title="Notifications">
        <Row
          label="Thread notifications"
          description="macOS alerts when a Kode thread finishes, fails, hits a usage limit or needs your input."
        >
          <Select
            value={settings.threadNotifications}
            options={[
              { value: "background", label: "When in the background", description: "Only while Kontinue isn't focused" },
              { value: "always", label: "Always" },
              { value: "off", label: "Off" },
            ]}
            onChange={(value) => updateSettings({ threadNotifications: value })}
          />
        </Row>
        <Row label="Sound" description="Play a sound when a thread finishes, fails or needs you, even with alerts off.">
          {settings.notificationSound ? (
            <>
              <Select
                value={settings.notificationSoundName}
                minWidth={120}
                options={NOTIFICATION_SOUNDS.map((name) => ({ value: name, label: name }))}
                onChange={(value) => {
                  updateSettings({ notificationSoundName: value });
                  playSound(value);
                }}
              />
              <PillButton onClick={() => playSound(settings.notificationSoundName)} title="Play">
                <Volume2 size={12} />
              </PillButton>
            </>
          ) : null}
          <Switch
            checked={settings.notificationSound}
            onCheckedChange={(checked) => updateSettings({ notificationSound: checked })}
          />
        </Row>
        <Row label="In-app notifications" description="Show a toast when another thread finishes or needs you while Kontinue is focused.">
          <Switch
            checked={settings.inAppNotifications}
            onCheckedChange={(checked) => updateSettings({ inAppNotifications: checked })}
          />
        </Row>
        <Row
          label="Auto-resume limited threads"
          description="When a thread hits a usage limit with a known reset time, queue the prompt to resend then. See it in Scheduled tasks."
        >
          <Switch
            checked={settings.autoResumeLimited}
            onCheckedChange={(checked) => updateSettings({ autoResumeLimited: checked })}
          />
        </Row>
      </Card>

      <Card title="Diffs">
        <Row label="Hide whitespace changes" description="The Changes panel ignores whitespace-only edits.">
          <Switch
            checked={settings.diffHideWhitespace}
            onCheckedChange={(checked) => updateSettings({ diffHideWhitespace: checked })}
          />
        </Row>
        <Row label="Default diff file state" description="Start with files expanded or collapsed in the Changes panel.">
          <Select
            value={settings.diffDefaultCollapsed ? "collapsed" : "expanded"}
            options={[
              { value: "expanded", label: "Expanded" },
              { value: "collapsed", label: "Collapsed" },
            ]}
            onChange={(value) => updateSettings({ diffDefaultCollapsed: value === "collapsed" })}
          />
        </Row>
        <Row label="Diff layout" description="Stacked or side by side. The toggle in the Changes toolbar changes this too.">
          <Segmented
            value={settings.diffLayout}
            options={[
              { value: "stacked", label: "Stacked" },
              { value: "split", label: "Side by side" },
            ]}
            onChange={(value) => updateSettings({ diffLayout: value })}
          />
        </Row>
      </Card>

      <Card title="Projects and threads">
        <Row label="Project order" description="Order of projects in the sidebar and the command palette.">
          <Select
            value={settings.projectOrder}
            options={[
              { value: "added", label: "Order added" },
              { value: "recent", label: "Recent activity" },
              { value: "name", label: "Name" },
            ]}
            onChange={(value) => updateSettings({ projectOrder: value })}
          />
        </Row>
        <Row label="Add project starts in" description={'Folder the Add project browser opens in. Leave empty for "~/".'}>
          <TextField
            value={settings.addProjectDir}
            onChange={(value) => updateSettings({ addProjectDir: value })}
            placeholder="~/"
            className="w-64 rounded-xl font-mono"
          />
        </Row>
        <Row
          label="Auto-archive inactive threads"
          description="Kode threads with no activity for this long move to Data → Archived. Pinned threads stay."
        >
          <Select
            value={String(settings.autoArchiveInactiveDays)}
            options={[
              { value: "0", label: "Never" },
              { value: "3", label: "After 3 days" },
              { value: "7", label: "After 7 days" },
              { value: "14", label: "After 14 days" },
              { value: "30", label: "After 30 days" },
            ]}
            onChange={(value) => updateSettings({ autoArchiveInactiveDays: Number(value) })}
          />
        </Row>
      </Card>

      <Card title="Confirmations">
        <Row label="Unpin confirmation" description="Ask before unpinning a chat.">
          <Switch checked={settings.confirmUnpin} onCheckedChange={(checked) => updateSettings({ confirmUnpin: checked })} />
        </Row>
        <Row label="Delete confirmation" description="Ask before deleting a chat and its history.">
          <Switch checked={settings.confirmDelete} onCheckedChange={(checked) => updateSettings({ confirmDelete: checked })} />
        </Row>
      </Card>

      <AboutCard />
    </>
  );
}

function AboutCard() {
  const [version, setVersion] = useState<string | null>(null);
  useEffect(() => {
    getVersion()
      .then(setVersion)
      .catch(() => setVersion(null));
  }, []);

  const link = (label: string, url: string) => (
    <PillButton onClick={() => openExternal(url)}>
      {label}
      <ExternalLink size={11} className="opacity-60" />
    </PillButton>
  );

  return (
    <Card title="About">
      <Row
        label="Version"
        badge={version ? <span className="font-mono text-caption font-normal text-muted-foreground">{version}</span> : null}
        description="Kontinue AI for macOS."
      >
        {link("Website", WEBSITE)}
      </Row>
      <Row label="Privacy policy" description="How we handle your data.">
        {link("View policy", `${WEBSITE}/legal/privacy-policy`)}
      </Row>
      <Row label="Terms of service" description="The terms for using Kontinue and Kode.">
        {link("View terms", `${WEBSITE}/legal/terms-of-service`)}
      </Row>
    </Card>
  );
}
