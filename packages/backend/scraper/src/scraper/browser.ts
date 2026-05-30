import { chromium, type BrowserContext, type Browser, type Page } from "playwright";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const EXTRA_HEADERS = { "Accept-Language": "en-US,en;q=0.9" };

const VIEWPORT = { width: 1280, height: 800 };
const PROFILE_DIR = new URL("../../.browser-profile/", import.meta.url).pathname;
const CHROME_CHANNEL = Bun.env.BROWSER_CHANNEL?.trim() || "chrome";
const CHROME_EXECUTABLE_PATH = Bun.env.BROWSER_EXECUTABLE_PATH?.trim();
const CDP_ENDPOINT = Bun.env.BROWSER_CDP_URL?.trim();
const USER_DATA_DIR = Bun.env.BROWSER_PROFILE_DIR?.trim() || PROFILE_DIR;

const LAUNCH_ARGS = [
  "--no-sandbox",
  "--disable-setuid-sandbox",
  "--disable-dev-shm-usage",
  "--disable-accelerated-2d-canvas",
  "--disable-gpu",
  "--disable-blink-features=AutomationControlled",
];

const CONTEXT_OPTIONS = {
  headless: Bun.env.HEADLESS !== "false",
  args: LAUNCH_ARGS,
  ignoreDefaultArgs: ["--enable-automation"],
  userAgent: USER_AGENT,
  extraHTTPHeaders: EXTRA_HEADERS,
  viewport: VIEWPORT,
  locale: "en-US",
  timezoneId: "America/New_York",
  colorScheme: "light" as const,
};

class BrowserManager {
  private context: BrowserContext | null = null;
  private cdpBrowser: Browser | null = null;
  private pages: Page[] = [];
  private busyPages = new Set<Page>();
  private maxConcurrent: number;

  constructor(maxConcurrent?: number) {
    this.maxConcurrent = maxConcurrent ?? parseInt(Bun.env.MAX_CONCURRENT_PAGES ?? "3", 10);
  }

  async init(): Promise<void> {
    if (this.context) return;

    if (CDP_ENDPOINT) {
      this.cdpBrowser = await chromium.connectOverCDP(CDP_ENDPOINT);
      const contexts = this.cdpBrowser.contexts();
      this.context = contexts[0] ?? await this.cdpBrowser.newContext({
        userAgent: USER_AGENT,
        extraHTTPHeaders: EXTRA_HEADERS,
        viewport: VIEWPORT,
        locale: "en-US",
        timezoneId: "America/New_York",
        colorScheme: "light",
      });
      await this.installStealthScript();
      return;
    }

    try {
      this.context = await chromium.launchPersistentContext(USER_DATA_DIR, {
        ...CONTEXT_OPTIONS,
        channel: CHROME_CHANNEL,
        executablePath: CHROME_EXECUTABLE_PATH,
      });
    } catch {
      this.context = await chromium.launchPersistentContext(USER_DATA_DIR, {
        ...CONTEXT_OPTIONS,
        executablePath: CHROME_EXECUTABLE_PATH,
      });
    }

    await this.installStealthScript();
  }

  private async installStealthScript(): Promise<void> {
    if (!this.context) return;

    await this.context.addInitScript(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => undefined });
      Object.defineProperty(navigator, "languages", { get: () => ["en-US", "en"] });
      Object.defineProperty(navigator, "platform", { get: () => "Win32" });
      Object.defineProperty(navigator, "hardwareConcurrency", { get: () => 8 });
      Object.defineProperty(navigator, "deviceMemory", { get: () => 8 });
      Object.defineProperty(navigator, "plugins", {
        get: () => [
          { name: "Chrome PDF Plugin" },
          { name: "Chrome PDF Viewer" },
          { name: "Native Client" },
        ],
      });
      Object.defineProperty(navigator, "mimeTypes", {
        get: () => [
          { type: "application/pdf" },
          { type: "text/pdf" },
        ],
      });

      const win = window as Window & { chrome?: Record<string, unknown> };
      if (!win.chrome) {
        win.chrome = { runtime: {} };
      }

      const originalQuery = window.navigator.permissions?.query?.bind(window.navigator.permissions);
      if (originalQuery) {
        window.navigator.permissions.query = ((parameters: PermissionDescriptor) => {
          if (parameters.name === "notifications") {
            return Promise.resolve({
              name: "notifications",
              state: Notification.permission,
              onchange: null,
              addEventListener: () => undefined,
              removeEventListener: () => undefined,
              dispatchEvent: () => true,
            } as unknown as PermissionStatus);
          }
          return originalQuery(parameters);
        }) as typeof window.navigator.permissions.query;
      }

      const getParameter = WebGLRenderingContext.prototype.getParameter;
      WebGLRenderingContext.prototype.getParameter = function patched(param: number) {
        if (param === 37445) return "Intel Inc.";
        if (param === 37446) return "Intel Iris OpenGL Engine";
        return getParameter.call(this, param);
      };
    });
  }

  async acquirePage(): Promise<Page> {
    if (!this.context) {
      throw new Error("Browser not initialized");
    }

    while (this.busyPages.size >= this.maxConcurrent) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    let page = this.pages.pop();

    if (!page) {
      page = await this.context.newPage();
    }

    this.busyPages.add(page);

    return page;
  }

  async releasePage(page: Page): Promise<void> {
    this.busyPages.delete(page);

    if (this.pages.length < this.maxConcurrent) {
      try {
        await page.goto("about:blank");
        this.pages.push(page);
      } catch {
        try {
          await page.close();
        } catch {
          // ignore
        }
      }
    } else {
      try {
        await page.close();
      } catch {
        // ignore
      }
    }
  }

  async close(): Promise<void> {
    for (const page of this.pages) {
      try {
        await page.close();
      } catch {
        // ignore
      }
    }
    this.pages = [];
    this.busyPages.clear();
    if (this.context) {
      await this.context.close();
      this.context = null;
    }
    if (this.cdpBrowser) {
      await this.cdpBrowser.close();
      this.cdpBrowser = null;
    }
  }
}

export const browserManager = new BrowserManager();
