import { describe, expect, it } from "@jest/globals";

import {
  detectProvider as webDetectProvider,
  PROVIDER_CONFIG as WEB_PROVIDER_CONFIG,
} from "../../../../packages/utils/src/url-safety";
import {
  detectProvider,
  MODEL_PROVIDER_MAP,
  PROVIDER_CONFIG,
} from "./import-providers";

// Required rather than imported: the web module type-imports `@repo/utils`,
// which this app's tsconfig deliberately doesn't map (Metro can't resolve it).
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { MODEL_PROVIDER_MAP: WEB_MODEL_PROVIDER_MAP } = require("../../../web/src/features/home/lib/model-provider-map") as {
  MODEL_PROVIDER_MAP: Record<string, string>;
};

const SAMPLE_URLS = [
  "https://chatgpt.com/share/abc",
  "https://chat.openai.com/share/abc",
  "https://claude.ai/share/abc",
  "https://share.gemini.google/abc",
  "https://gemini.google.com/share/abc",
  "https://aistudio.google.com/app/prompts/abc",
  "https://g.co/gemini/share/abc",
  "https://t3chat.com/share/abc",
  "https://www.perplexity.ai/search/abc",
  "https://chat.mistral.ai/chat/abc",
  "https://example.com/abc",
  "not a url",
];

describe("import providers stay in sync with @repo/utils", () => {
  it.each(SAMPLE_URLS)("detects %s like web", (url: string) => {
    expect(detectProvider(url)).toBe(webDetectProvider(url));
  });

  it("uses the same provider names and brand colors", () => {
    expect(PROVIDER_CONFIG).toEqual(WEB_PROVIDER_CONFIG);
  });

  it("maps model vendors to the same chat provider", () => {
    expect(MODEL_PROVIDER_MAP).toEqual(WEB_MODEL_PROVIDER_MAP);
  });
});
