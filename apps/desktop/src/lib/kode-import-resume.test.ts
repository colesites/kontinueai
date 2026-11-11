import { describe, expect, test } from "bun:test";
import { openWorkFromSummary, resumeOffer, resumePrompt } from "./kode-import-resume";

const summary = "### Architecture\nBun app.\n### Decisions\n- Keep ids.\n### Open work\n- Finish the export page\n- Fix the flaky test in src/a.test.ts\n";
const limited = [
  { role: "user" as const, content: "Add CSV export" },
  { role: "assistant" as const, content: "Starting." },
  { role: "assistant" as const, content: "You've hit your 5-hour limit ∙ resets 3pm" },
];

describe("openWorkFromSummary", () => {
  test("reads the bullets under Open work", () => {
    expect(openWorkFromSummary(summary)).toEqual(["Finish the export page", "Fix the flaky test in src/a.test.ts"]);
    expect(openWorkFromSummary("### Open work\n- Nothing detected.")).toEqual([]);
    expect(openWorkFromSummary(undefined)).toEqual([]);
  });
});

describe("resumeOffer", () => {
  test("offers to continue a session that stopped on a limit, with what was left", () => {
    expect(resumeOffer({ summary }, limited)?.items).toEqual(["Finish the export page", "Fix the flaky test in src/a.test.ts"]);
  });

  test("falls back to the last request without a summary", () => {
    expect(resumeOffer({}, limited)?.items).toEqual(['Your last request: "Add CSV export"']);
  });

  test("no offer once answered, or when the session didn't stop on a limit", () => {
    expect(resumeOffer({ summary, resumeHandled: true }, limited)).toBeNull();
    expect(resumeOffer({ summary }, [{ role: "user", content: "hi" }, { role: "assistant", content: "Done, all tests pass." }])).toBeNull();
    expect(resumeOffer(null, limited)).toBeNull();
  });

  test("no offer once Kode has replied properly after the limit", () => {
    const continued = [...limited, { role: "user" as const, content: "continue" }, { role: "assistant" as const, content: "x".repeat(500) }];
    expect(resumeOffer({ summary }, continued)).toBeNull();
  });
});

describe("resumePrompt", () => {
  test("lists what is open and warns that the last calls may not have finished", () => {
    const prompt = resumePrompt({ items: ["Finish the export page"] });
    expect(prompt).toContain("- Finish the export page");
    expect(prompt).toContain("check the current state");
  });
});
