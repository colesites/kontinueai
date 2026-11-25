// Settings → Remote control: run Kode on this computer from your phone or the
// web app, from anywhere (lib/kode-remote-host.tsx, convex/kodeRemote.ts).

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { QRCodeSVG } from "qrcode.react";
import { Check, Copy, Laptop, Monitor, Smartphone, Trash2 } from "lucide-react";
import { deviceSeenLabel, isDeviceOnline, KODE_REMOTE_MODES } from "@repo/core/kode-remote";
import { Switch } from "@/components/ui/switch";
import { updateSettings, useAppSettings } from "@/lib/app-settings";
import { remoteApi } from "@/lib/convex-api";
import { useComputerName } from "@/lib/kode-remote-host";
import { deviceId } from "@/lib/kode-webhooks";
import { Card, openExternal, PillButton, Row, Tag } from "./settings-ui";

const WEB_APP = (import.meta.env.VITE_WEB_APP_URL as string | undefined) || "https://chat.kontinueai.com";

/** Ticks so "Online" / "Seen 2m ago" stays current. */
function useNow(ms = 15_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), ms);
    return () => window.clearInterval(timer);
  }, [ms]);
  return now;
}

export function RemoteControlSection() {
  const settings = useAppSettings();
  const name = useComputerName();
  const id = useMemo(() => deviceId(), []);
  const devices = useQuery(remoteApi.kodeRemote.listDevices, {});
  const forget = useMutation(remoteApi.kodeRemote.forgetDevice);
  const now = useNow();
  const [nameDraft, setNameDraft] = useState(settings.remoteDeviceName);
  const [copied, setCopied] = useState(false);

  const self = devices?.find((device) => device.deviceId === id);
  const others = (devices ?? []).filter((device) => device.deviceId !== id);
  const online = settings.remoteControl && isDeviceOnline(self?.lastSeenAt, now);
  const link = `${WEB_APP.replace(/\/$/, "")}/kode/${encodeURIComponent(id)}`;

  const copy = () => {
    void navigator.clipboard.writeText(link).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1_500);
    });
  };

  const input =
    "kontinue-3d h-8 w-56 rounded-full bg-transparent px-3.5 text-body outline-none placeholder:text-muted-foreground/60";

  return (
    <div className="space-y-2">
      <p className="px-1 pb-4 text-label leading-relaxed text-muted-foreground">
        Start and steer Kode threads on this computer from the Kontinue app on your phone or from the web, wherever you
        are. Kode keeps running here, so your files, keys, agents and tools never leave this computer. Your phone only
        sends messages and approvals.
      </p>

      <Card>
        <Row
          label="Remote control"
          badge={settings.remoteControl ? <Tag tone={online ? "green" : "amber"}>{online ? "Online" : "Connecting"}</Tag> : null}
          description="Let your phone and the web app run Kode on this computer while it's on and Kode is open."
        >
          <Switch checked={settings.remoteControl} onCheckedChange={(checked) => updateSettings({ remoteControl: checked })} />
        </Row>
        <Row label="Computer name" description="How this computer shows up on your other devices.">
          <input
            value={nameDraft}
            onChange={(event) => setNameDraft(event.target.value)}
            onBlur={() => updateSettings({ remoteDeviceName: nameDraft.trim() })}
            onKeyDown={(event) => {
              if (event.key === "Enter") (event.target as HTMLInputElement).blur();
            }}
            placeholder={name}
            maxLength={60}
            className={input}
          />
        </Row>
      </Card>

      {settings.remoteControl ? (
        <Card title="Connect your phone">
          <div className="flex items-center gap-6 px-5 py-5">
            <div className="shrink-0 rounded-2xl bg-white p-3">
              <QRCodeSVG value={link} size={132} level="M" marginSize={0} />
            </div>
            <div className="min-w-0 space-y-2.5">
              <p className="flex items-center gap-2 text-body font-medium text-foreground/90">
                <Smartphone size={14} className="text-purple-500" />
                Scan with your phone's camera
              </p>
              <p className="text-label leading-relaxed text-muted-foreground">
                It opens {name} in Kontinue on the web. In the Kontinue app, open Kode from the sidebar and pick {name}.
                Sign in with the same account you use here.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <PillButton onClick={copy}>
                  {copied ? <Check size={13} /> : <Copy size={13} />}
                  {copied ? "Copied" : "Copy link"}
                </PillButton>
                <PillButton onClick={() => openExternal(link)}>Open in browser</PillButton>
              </div>
            </div>
          </div>
        </Card>
      ) : null}

      <Card title="How it works">
        <Row
          label="Works from anywhere"
          description="This computer and your phone both connect out to Kontinue. No port forwarding, VPN or same Wi-Fi needed."
        />
        <Row
          label="Keep this computer on"
          description="Kode has to be open and the computer online. While a thread runs with remote control on, Kode keeps the computer awake."
        />
        <Row
          label="Safe from your phone"
          description={`Remote messages run in ${KODE_REMOTE_MODES.map((mode) => mode.label).join(", ")} mode. Commands and edits still ask first, and the request shows on your phone.`}
        />
        <Row
          label="Notifications"
          description="Your phone gets a notification when Kode needs your OK, asks a question, or finishes a thread you started from it."
        />
      </Card>

      {others.length > 0 ? (
        <Card title="Your other computers">
          {others.map((device) => (
            <Row
              key={device.deviceId}
              label={
                <span className="flex items-center gap-2">
                  {device.platform === "macos" ? <Laptop size={14} /> : <Monitor size={14} />}
                  {device.name}
                </span>
              }
              badge={<Tag tone={device.enabled && isDeviceOnline(device.lastSeenAt, now) ? "green" : "neutral"}>{device.enabled ? deviceSeenLabel(device.lastSeenAt, now) : "Off"}</Tag>}
              description={device.appVersion ? `Kode ${device.appVersion}` : undefined}
            >
              <PillButton tone="danger" onClick={() => void forget({ deviceId: device.deviceId })} title="Remove from remote control">
                <Trash2 size={13} />
                Remove
              </PillButton>
            </Row>
          ))}
        </Card>
      ) : null}
    </div>
  );
}
