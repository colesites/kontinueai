import { expect, test } from "bun:test";
import { attachmentBase64, savedAttachmentsNote } from "./kode-attachments";

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
