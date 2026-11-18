import type { FC } from "react";
import type { SvgProps } from "react-native-svg";

import GitHubDark from "@/assets/connectors/GitHub_dark.svg";
import GitHubLight from "@/assets/connectors/GitHub_light.svg";
import VercelDark from "@/assets/connectors/Vercel_dark.svg";
import VercelLight from "@/assets/connectors/Vercel_light.svg";
import GmailLogo from "@/assets/connectors/gmail.svg";
import GoogleCalendarLogo from "@/assets/connectors/google-calendar.svg";
import GoogleDriveLogo from "@/assets/connectors/google-drive.svg";
import GoogleSheetsLogo from "@/assets/connectors/google-sheets.svg";
import NotionLogo from "@/assets/connectors/notion.svg";
import TodoistLogo from "@/assets/connectors/todoist.svg";

import { useTheme } from "@/components/theme-provider";

// Mirrors apps/web connector-catalog.ts — same SVG brand marks, copied into
// assets/connectors. Themed logos (GitHub/Vercel) swap with the color scheme.
export type ConnectorDef = {
  provider: string;
  name: string;
  description: string;
  logo: { kind: "single"; src: FC<SvgProps> } | { kind: "themed"; light: FC<SvgProps>; dark: FC<SvgProps> };
  available: boolean;
};

export const CONNECTOR_CATALOG: ConnectorDef[] = [
  { provider: "github", name: "GitHub", description: "Read your repositories and issues in chat.", logo: { kind: "themed", light: GitHubLight, dark: GitHubDark }, available: true },
  { provider: "gmail", name: "Gmail", description: "Search and summarize your email.", logo: { kind: "single", src: GmailLogo }, available: true },
  { provider: "google_calendar", name: "Google Calendar", description: "Create events and check your schedule.", logo: { kind: "single", src: GoogleCalendarLogo }, available: true },
  { provider: "google_drive", name: "Google Drive", description: "Read and reference files from your Drive.", logo: { kind: "single", src: GoogleDriveLogo }, available: true },
  { provider: "notion", name: "Notion", description: "Search and read your Notion pages.", logo: { kind: "single", src: NotionLogo }, available: true },
  { provider: "vercel", name: "Vercel", description: "Check deployments and project status.", logo: { kind: "themed", light: VercelLight, dark: VercelDark }, available: true },
  { provider: "todoist", name: "Todoist", description: "Manage your Todoist tasks from chat.", logo: { kind: "single", src: TodoistLogo }, available: true },
  { provider: "google_sheets", name: "Google Sheets", description: "Read, create and update spreadsheets from chat.", logo: { kind: "single", src: GoogleSheetsLogo }, available: true },
];

export function ConnectorLogo({
  def,
  size = 28,
}: {
  def: ConnectorDef;
  size?: number;
}) {
  const { isDark } = useTheme();
  const LogoComponent =
    def.logo.kind === "single" ? def.logo.src : isDark ? def.logo.dark : def.logo.light;
  return <LogoComponent width={size} height={size} />;
}

export function connectorDef(provider: string): ConnectorDef | undefined {
  return CONNECTOR_CATALOG.find((def) => def.provider === provider);
}
