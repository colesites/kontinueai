import { expect, test } from "bun:test";
import {
  addAnnotation,
  annotationTitle,
  formatAnnotations,
  takeAnnotations,
} from "./kode-annotations";

test("annotations format for the prompt and clear on take", () => {
  addAnnotation({ kind: "text", source: "File src/app.ts", quote: "const a = 1;\nconst b = 2;", note: "rename these" });
  addAnnotation({
    kind: "element",
    url: "http://localhost:3000/",
    selector: "main > button.cta",
    label: 'button.cta "Sign up"',
    html: '<button class="cta">Sign up</button>',
    note: "make it purple",
  });
  const taken = takeAnnotations();
  expect(taken).toHaveLength(2);
  expect(takeAnnotations()).toHaveLength(0);

  const text = formatAnnotations(taken);
  expect(text).toContain("1. File src/app.ts:\n> const a = 1;\n> const b = 2;\nNote: rename these");
  expect(text).toContain("2. Element on http://localhost:3000/\nSelector: main > button.cta");
  expect(text).toContain("Note: make it purple");
  expect(formatAnnotations([])).toBe("");
  expect(annotationTitle(taken[1])).toBe('button.cta "Sign up"');
});
