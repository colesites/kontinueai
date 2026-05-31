"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";
import { cn } from "@repo/ui/lib/utils";
import type { MentionItem } from "../hooks/use-connector-mentions";

export type MentionInputHandle = {
  insertMention: (item: MentionItem) => void;
  clear: () => void;
  focus: () => void;
};

type MentionMatch = { node: Text; atOffset: number; caret: number; query: string };

type Props = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  // Reports the in-progress "@query" at the caret, or null when there's none.
  onMentionQueryChange: (query: string | null) => void;
  placeholder: string;
  disabled?: boolean;
  className?: string;
};

// Serialize the contenteditable into plain text the model reads. Chips become
// "@provider" tokens; non-breaking spaces collapse back to regular spaces.
function serialize(root: HTMLElement): string {
  let out = "";
  const NBSP = String.fromCharCode(160);
  root.childNodes.forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      out += (node.textContent ?? "").split(NBSP).join(" ");
    } else if (node instanceof HTMLElement) {
      if (node.dataset.provider) out += `@${node.dataset.provider} `;
      else if (node.tagName === "BR") out += "\n";
      else out += (node.textContent ?? "").split(NBSP).join(" ");
    }
  });
  return out;
}

// Find an in-progress "@token" immediately before a collapsed caret that sits
// inside `root`. Returns the text node + offsets so we can splice a chip in.
function findMentionAtCaret(root: HTMLElement): MentionMatch | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || !sel.isCollapsed) return null;
  const node = sel.anchorNode;
  if (!node || node.nodeType !== Node.TEXT_NODE) return null;
  if (!root.contains(node)) return null;
  const caret = sel.anchorOffset;
  const before = (node.textContent ?? "").slice(0, caret);
  const m = before.match(/(^|\s)@(\w*)$/);
  if (!m) return null;
  const query = m[2] ?? "";
  const atOffset = caret - query.length - 1; // index of '@'
  return { node: node as Text, atOffset, caret, query };
}

function buildChip(item: MentionItem): HTMLElement {
  const chip = document.createElement("span");
  chip.dataset.provider = item.provider;
  chip.contentEditable = "false";
  chip.className =
    "mx-0.5 inline-flex select-none items-center gap-1 rounded-md bg-foreground/10 px-1.5 py-0.5 align-middle text-[0.9em] leading-none ring-1 ring-foreground/10";

  const addImg = (src: string, extra: string) => {
    const img = document.createElement("img");
    img.src = src;
    img.alt = item.name;
    img.width = 14;
    img.height = 14;
    img.className = extra;
    chip.appendChild(img);
  };
  if (item.logo.kind === "single") {
    addImg(item.logo.src, "shrink-0");
  } else {
    addImg(item.logo.light, "shrink-0 dark:hidden");
    addImg(item.logo.dark, "hidden shrink-0 dark:block");
  }
  const label = document.createElement("span");
  label.textContent = item.name;
  chip.appendChild(label);
  return chip;
}

function placeCaret(node: Node, offset: number) {
  const range = document.createRange();
  range.setStart(node, offset);
  range.collapse(true);
  const sel = window.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(range);
}

export const MentionInput = forwardRef<MentionInputHandle, Props>(
  (
    { value, onChange, onSubmit, onMentionQueryChange, placeholder, disabled, className },
    ref,
  ) => {
    const rootRef = useRef<HTMLDivElement>(null);
    // Tracks the last value we emitted, so the controlled `value` effect can tell
    // an external change (speech input) from our own typing and avoid clobbering.
    const lastValue = useRef("");

    const updateEmpty = useCallback(() => {
      const root = rootRef.current;
      if (!root) return;
      const empty = root.textContent?.length === 0 && !root.querySelector("[data-provider]");
      root.dataset.empty = empty ? "true" : "false";
    }, []);

    const emit = useCallback(() => {
      const root = rootRef.current;
      if (!root) return;
      const text = serialize(root);
      lastValue.current = text;
      updateEmpty();
      onChange(text);
    }, [onChange, updateEmpty]);

    const insertMention = useCallback(
      (item: MentionItem) => {
        const root = rootRef.current;
        if (!root) return;
        // Dedupe: one chip per provider.
        if (root.querySelector(`[data-provider="${item.provider}"]`)) {
          onMentionQueryChange(null);
          return;
        }
        const match = findMentionAtCaret(root);
        const chip = buildChip(item);
        if (match) {
          const { node, atOffset, caret } = match;
          const text = node.textContent ?? "";
          const after = text.slice(caret);
          node.textContent = text.slice(0, atOffset);
          node.after(chip);
          const trailing = document.createTextNode(" " + after);
          chip.after(trailing);
          placeCaret(trailing, 1);
        } else {
          root.appendChild(chip);
          const trailing = document.createTextNode(" ");
          chip.after(trailing);
          placeCaret(trailing, 1);
        }
        root.focus();
        emit();
        onMentionQueryChange(null);
      },
      [emit, onMentionQueryChange],
    );

    useImperativeHandle(
      ref,
      () => ({
        insertMention,
        clear: () => {
          const root = rootRef.current;
          if (root) root.textContent = "";
          lastValue.current = "";
          updateEmpty();
          onChange("");
        },
        focus: () => rootRef.current?.focus(),
      }),
      [insertMention, onChange, updateEmpty],
    );

    // Reflect external value changes (e.g. speech-to-text) into the DOM as plain
    // text. Our own edits set lastValue first, so this is a no-op for typing.
    useEffect(() => {
      const root = rootRef.current;
      if (!root) return;
      if (value !== lastValue.current) {
        root.textContent = value;
        lastValue.current = value;
        updateEmpty();
      }
    }, [value, updateEmpty]);

    const handleInput = () => {
      emit();
      const root = rootRef.current;
      const match = root ? findMentionAtCaret(root) : null;
      onMentionQueryChange(match ? match.query : null);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
      if (e.key !== "Enter" || e.shiftKey) return;
      // On touch devices (phones/tablets) the virtual keyboard's Enter/return
      // should insert a newline, NOT send — sending on Enter is a desktop-only
      // convention. Detect a coarse (touch) primary pointer and let the default
      // newline happen there. Also respect IME composition.
      const isTouchPrimary =
        typeof window !== "undefined" &&
        typeof window.matchMedia === "function" &&
        window.matchMedia("(pointer: coarse)").matches;
      if (isTouchPrimary || e.nativeEvent.isComposing) return;
      // Desktop hardware Enter (without Shift) submits — unless the mention menu
      // intercepted it first via the wrapper's capture handler.
      e.preventDefault();
      onSubmit();
    };

    return (
      <div
        ref={rootRef}
        role="textbox"
        aria-multiline="true"
        aria-label={placeholder}
        contentEditable={!disabled}
        suppressContentEditableWarning
        data-empty="true"
        data-placeholder={placeholder}
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        onKeyUp={() => {
          const root = rootRef.current;
          const match = root ? findMentionAtCaret(root) : null;
          onMentionQueryChange(match ? match.query : null);
        }}
        onClick={() => {
          const root = rootRef.current;
          const match = root ? findMentionAtCaret(root) : null;
          onMentionQueryChange(match ? match.query : null);
        }}
        className={cn(
          "max-h-[200px] min-h-[24px] w-full overflow-y-auto whitespace-pre-wrap break-words text-base outline-none",
          "data-[empty=true]:before:pointer-events-none data-[empty=true]:before:text-muted-foreground/60 data-[empty=true]:before:content-[attr(data-placeholder)] dark:data-[empty=true]:before:text-muted-foreground",
          className,
        )}
      />
    );
  },
);
MentionInput.displayName = "MentionInput";
