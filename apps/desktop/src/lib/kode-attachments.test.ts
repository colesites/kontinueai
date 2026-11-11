import { describe, expect, test } from "bun:test";
import { attachmentBase64, savedAttachmentsNote, splitUserAttachments } from "./kode-attachments";

test("reads base64 data URLs, plain data URLs and text", () => {
  expect(attachmentBase64({ mediaType: "image/png", url: "data:image/png;base64,iVBORw0KGgo=" })).toBe(
    "iVBORw0KGgo=",
  );
  expect(attachmentBase64({ mediaType: "text/plain", url: "data:text/plain,h%C3%A9llo" })).toBe(
    btoa(String.fromCharCode(...new TextEncoder().encode("héllo"))),
  );
  expect(attachmentBase64({ mediaType: "text/plain", text: "hi" })).toBe("aGk=");
  expect(attachmentBase64({ mediaType: "image/png", url: "blob:abc" })).toBeNull();
});

test("note lists saved paths", () => {
  expect(savedAttachmentsNote([])).toBe("");
  expect(
    savedAttachmentsNote([{ filename: "shot.png", path: ".kode/attachments/1-shot.png", mediaType: "image/png" }]),
  ).toContain("- .kode/attachments/1-shot.png (image/png, attached as \"shot.png\")");
});

describe("splitUserAttachments", () => {
  const image = '```kode-image\n{"path":".kode/attachments/1731-shot.png","mediaType":"image/png","root":"/p"}\n```';

  test("lifts saved images and the attached line out of the text", () => {
    const out = splitUserAttachments(`Check this\n\n[Attached: shot.png, notes.pdf]\n\n${image}`);
    expect(out.text).toBe("Check this");
    expect(out.images.map((i) => i.path)).toEqual([".kode/attachments/1731-shot.png"]);
    // The image is already shown as a thumbnail, so only the other file is listed.
    expect(out.files).toEqual(["notes.pdf"]);
  });

  test("leaves a plain message alone", () => {
    expect(splitUserAttachments("Just text [not attached]")).toEqual({ text: "Just text [not attached]", images: [], files: [] });
  });

  test("an attachment-only message has no text", () => {
    expect(splitUserAttachments(`\n\n[Attached: shot.png]\n\n${image}`).text).toBe("");
  });

  test("keeps a malformed image block in the text", () => {
    const out = splitUserAttachments("Hi\n\n```kode-image\nnot json\n```");
    expect(out.images).toEqual([]);
    expect(out.text).toContain("kode-image");
  });
});

import { attachmentContent } from "./kode-attachments";

describe("attachmentContent", () => {
  test("plain text stays a string", () => {
    expect(attachmentContent("hi", [])).toEqual({ content: "hi", note: "" });
  });

  test("text files go inline and images as image parts", () => {
    const out = attachmentContent("look", [
      { filename: "notes.md", mediaType: "text/markdown", text: "# Notes" },
      { filename: "shot.png", mediaType: "image/png", url: "data:image/png;base64,AAAA" },
    ]);
    expect(out.note).toBe("[Attached: notes.md, shot.png]");
    expect(Array.isArray(out.content)).toBe(true);
    const parts = out.content as { type: string; text?: string; image_url?: { url: string } }[];
    expect(parts[0].text).toContain("--- notes.md ---\n# Notes");
    expect(parts[1].image_url?.url).toBe("data:image/png;base64,AAAA");
  });

  test("very long files are cut", () => {
    const out = attachmentContent("x", [{ filename: "big.txt", mediaType: "text/plain", text: "a".repeat(70_000) }]);
    expect(out.content as string).toContain("…(truncated)");
  });
});
