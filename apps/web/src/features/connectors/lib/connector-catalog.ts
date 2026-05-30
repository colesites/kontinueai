export type ConnectorStatus = "available" | "coming_soon";

// A logo is either a single theme-agnostic SVG (multicolor brand marks) or a
// pair that swaps with the color scheme. `light`/`dark` name the *mode* the
// asset is shown in: light-mode shows the dark-inked mark, dark-mode the white.
export type ConnectorLogo =
  | { kind: "single"; src: string }
  | { kind: "themed"; light: string; dark: string };

export type ConnectorDef = {
  provider: string;
  name: string;
  description: string;
  logo: ConnectorLogo;
  status: ConnectorStatus;
  // Path that kicks off the OAuth flow (only for available connectors).
  startPath?: string;
};

const BASE = "/connectors";

// The catalog of connectors shown in the UI. GitHub is the live reference;
// the rest are scaffolded for the upcoming connectors slice.
export const CONNECTORS: ConnectorDef[] = [
  {
    provider: "github",
    name: "GitHub",
    description: "Read your repositories and issues in chat.",
    logo: {
      kind: "themed",
      light: `${BASE}/GitHub_light.svg`,
      dark: `${BASE}/GitHub_dark.svg`,
    },
    status: "available",
    startPath: "/api/connectors/github/start",
  },
  {
    provider: "gmail",
    name: "Gmail",
    description: "Search and summarize your email.",
    logo: { kind: "single", src: `${BASE}/gmail.svg` },
    status: "available",
    startPath: "/api/connectors/gmail/start",
  },
  {
    provider: "google_calendar",
    name: "Google Calendar",
    description: "Create events and check your schedule.",
    logo: { kind: "single", src: `${BASE}/google-calendar.svg` },
    status: "available",
    startPath: "/api/connectors/google_calendar/start",
  },
  {
    provider: "google_drive",
    name: "Google Drive",
    description: "Read and reference files from your Drive.",
    logo: { kind: "single", src: `${BASE}/google-drive.svg` },
    status: "available",
    startPath: "/api/connectors/google_drive/start",
  },
  {
    provider: "google_sheets",
    name: "Google Sheets",
    description: "Read and update your spreadsheets.",
    logo: { kind: "single", src: `${BASE}/google-sheets.svg` },
    status: "coming_soon",
  },
  {
    provider: "notion",
    name: "Notion",
    description: "Search and read your Notion pages.",
    logo: { kind: "single", src: `${BASE}/notion.svg` },
    status: "available",
    startPath: "/api/connectors/notion/start",
  },
  {
    provider: "vercel",
    name: "Vercel",
    description: "Check deployments and project status.",
    logo: {
      kind: "themed",
      light: `${BASE}/Vercel_light.svg`,
      dark: `${BASE}/Vercel_dark.svg`,
    },
    status: "available",
    startPath: "/api/connectors/vercel/start",
  },
  {
    provider: "todoist",
    name: "Todoist",
    description: "Sync tasks with Todoist.",
    logo: { kind: "single", src: `${BASE}/todoist.svg` },
    status: "available",
    startPath: "/api/connectors/todoist/start",
  },
];
