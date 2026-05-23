import { describe, expect, test } from "bun:test";
import { parseNormalizedTranscript } from "./firecrawl";

describe("parseNormalizedTranscript", () => {
  test("parses [USER]/[ASSISTANT] format correctly", () => {
    const input = `[USER]:
Hello, how are you?

[ASSISTANT]:
I am doing well! How can I help you today?

[USER]:
Write me a poem.`;

    const { messages } = parseNormalizedTranscript(input);

    expect(messages).toHaveLength(3);

    expect(messages[0]?.role).toBe("user");
    expect(messages[0]?.content).toBe("Hello, how are you?");

    expect(messages[1]?.role).toBe("assistant");
    expect(messages[1]?.content).toBe(
      "I am doing well! How can I help you today?",
    );

    expect(messages[2]?.role).toBe("user");
    expect(messages[2]?.content).toBe("Write me a poem.");
  });

  test("handles code blocks inside messages", () => {
    const input = `[USER]:
Write some code

[ASSISTANT]:
Here is your code:
\`\`\`javascript
console.log("Hello");
\`\`\`
Hope it helps!`;

    const { messages } = parseNormalizedTranscript(input);

    expect(messages).toHaveLength(2);
    expect(messages[1]?.role).toBe("assistant");
    expect(messages[1]?.content).toContain("\`\`\`javascript");
    expect(messages[1]?.content).toContain('console.log("Hello");');
  });

  test("does not split on [USER]/[ASSISTANT] markers inside code blocks", () => {
    const input = `[USER]:
Show me an example

[ASSISTANT]:
Use this format:
\`\`\`md
[USER]:
This is part of code, not a new turn
\`\`\`
Done.`;

    const { messages } = parseNormalizedTranscript(input);

    expect(messages).toHaveLength(2);
    expect(messages[1]?.role).toBe("assistant");
    expect(messages[1]?.content).toContain("[USER]:");
    expect(messages[1]?.content).toContain("not a new turn");
  });

  test("handles robustness: spacing and newlines", () => {
    const input = `
[USER]:
  Trim me please  

[ASSISTANT]:
Okay!
`;
    const { messages } = parseNormalizedTranscript(input);
    expect(messages).toHaveLength(2);
    expect(messages[0]?.content).toBe("Trim me please");
    expect(messages[1]?.content).toBe("Okay!");
  });

  test("ignores broken or empty markers", () => {
    const input = `
Header text ignoring...
[USER]:
Valid content
[BROKEN]:
Ignored
`;
    // The parser expects strict [USER]:\n or [ASSISTANT]:\n
    // If there is extra text at the top, it should be ignored if it's before the first marker.
    const { messages } = parseNormalizedTranscript(input);
    expect(messages).toHaveLength(1);
    expect(messages[0]?.content).toBe("Valid content\n[BROKEN]:\nIgnored");
  });
});
