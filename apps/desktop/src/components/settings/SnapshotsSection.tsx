// Settings → Snapshots: capture the screen and the front app's accessibility
// tree into a new Kode thread (SnapshotDialog).

import { ExternalLink } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { KODE_MODEL_ID } from "@repo/ai/lib/kode";
import { ModelPickerPopover } from "@/components/chat/ModelPickerPopover";
import { KodeModeMenu } from "@/components/chat/KodeModeMenu";
import { Switch } from "@/components/ui/switch";
import { updateSettings, useAppSettings } from "@/lib/app-settings";
import { formatKeys, useBindings } from "@/lib/kode-keybindings";
import { useKodeWorkspace } from "@/lib/kode-workspace";
import { usePlanTier } from "@/hooks/use-plan-tier";
import { toPlan, useKodePickerModels } from "./GeneralSection";
import { Card, Keys, PillButton, Row, Segmented } from "./settings-ui";

const openPane = (pane: "screen" | "accessibility") =>
  void invoke("settings_open_privacy_pane", { pane }).catch(() => {});

export function SnapshotsSection({ onOpenShortcuts }: { onOpenShortcuts: () => void }) {
  const settings = useAppSettings();
  const bindings = useBindings();
  const { openSettings } = useKodeWorkspace();
  const plan = toPlan(usePlanTier());
  const models = useKodePickerModels();
  const keys = bindings["kode.snapshot"];
  const on = settings.snapshotsEnabled;

  return (
    <>
      <Card title="Snapshots">
        <Row
          label="Snapshots"
          description={
            <>
              Capture a window and start a Kode thread with it: the screenshot plus the front app's buttons, fields and
              labels as text, so the agent can read the screen.
              {!on ? <span className="mt-1 block">Turn this on to set up snapshots.</span> : null}
            </>
          }
        >
          <Switch checked={on} onCheckedChange={(checked) => updateSettings({ snapshotsEnabled: checked })} />
        </Row>
      </Card>

      {on ? (
        <>
          <Card title="Capture">
            <Row label="Shortcut" description="Works anywhere in Kode.">
              {keys ? <Keys keys={formatKeys(keys)} /> : <span className="text-label text-muted-foreground">Unbound</span>}
              <PillButton onClick={onOpenShortcuts}>Change</PillButton>
            </Row>
            <Row label="Countdown" description="Time to switch to the app you want before the capture.">
              <Segmented
                value={String(settings.snapshotDelay)}
                options={[
                  { value: "0", label: "None" },
                  { value: "3", label: "3s" },
                  { value: "5", label: "5s" },
                  { value: "10", label: "10s" },
                ]}
                onChange={(value) => updateSettings({ snapshotDelay: Number(value) })}
              />
            </Row>
            <Row
              label="Include accessibility tree"
              description="Sends the front app's interface as text. Lets the agent name exact buttons and fields; makes the first message longer."
            >
              <Switch
                checked={settings.snapshotIncludeTree}
                onCheckedChange={(checked) => updateSettings({ snapshotIncludeTree: checked })}
              />
            </Row>
            <Row
              label="Save screenshot to the project"
              description="Keeps the full-size PNG in the project so the agent can open it again. A smaller copy is always attached."
            >
              <Switch
                checked={settings.snapshotSaveImage}
                onCheckedChange={(checked) => updateSettings({ snapshotSaveImage: checked })}
              />
            </Row>
          </Card>

          <Card title="Snapshot threads">
            <Row label="Model" description="The model a snapshot thread runs on.">
              <ModelPickerPopover
                models={models}
                selectedModelId={settings.snapshotModel ?? KODE_MODEL_ID}
                onSelectModel={(model) => updateSettings({ snapshotModel: model.id })}
                onOpenSettings={() => openSettings("providers")}
                kodePlan={plan}
                side="bottom"
                align="end"
              />
            </Row>
            <Row label="Permissions" description="How much the agent may do in a snapshot thread without asking.">
              <KodeModeMenu
                mode={settings.snapshotMode}
                onModeChange={(mode) => updateSettings({ snapshotMode: mode })}
                side="bottom"
                align="end"
                showStyle={false}
                hint={null}
              />
            </Row>
          </Card>

          <Card title="macOS access">
            <Row label="Screen Recording" description="Needed for the screenshot. macOS asks the first time you capture.">
              <PillButton onClick={() => openPane("screen")}>
                Open
                <ExternalLink size={11} className="opacity-60" />
              </PillButton>
            </Row>
            <Row label="Accessibility" description="Needed to read the front app's buttons and fields.">
              <PillButton onClick={() => openPane("accessibility")}>
                Open
                <ExternalLink size={11} className="opacity-60" />
              </PillButton>
            </Row>
          </Card>
        </>
      ) : null}
    </>
  );
}
