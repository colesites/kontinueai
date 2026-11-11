import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MessageSquarePlus } from "lucide-react";
import { addAnnotation } from "@/lib/kode-annotations";
import { externalAnnotationTarget } from "@/lib/annotation-sources";

// Select text inside any element marked `data-annotate-source="<where>"` (a
// chat reply, the file editor) and an "Annotate" button appears; the note is
// saved as a composer chip and sent with the next message.

type Pending = { source: string; quote: string; x: number; y: number };

const MAX_QUOTE = 4_000;

function selectionTarget(): Pending | null {
  const selection = document.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return null;
  const quote = selection.toString().trim();
  if (!quote) return null;
  const range = selection.getRangeAt(0);
  const node = range.commonAncestorContainer;
  const element = node instanceof Element ? node : node.parentElement;
  const host = element?.closest<HTMLElement>("[data-annotate-source]");
  if (!host) return null;
  const rect = range.getBoundingClientRect();
  if (!rect.width && !rect.height) return null;
  return {
    source: host.dataset.annotateSource ?? "Selection",
    quote: quote.slice(0, MAX_QUOTE),
    x: Math.min(window.innerWidth - 140, Math.max(12, rect.left + rect.width / 2 - 50)),
    y: Math.max(12, rect.top - 40),
  };
}

export function TextAnnotator() {
  const [pending, setPending] = useState<Pending | null>(null);
  const [writing, setWriting] = useState(false);
  const [note, setNote] = useState("");
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const check = (event: Event) => {
      // Clicks inside the annotator itself shouldn't reset it.
      if (boxRef.current?.contains(event.target as Node)) return;
      // Let the selection settle first.
      requestAnimationFrame(() => {
        setWriting(false);
        setNote("");
        setPending(selectionTarget() ?? externalAnnotationTarget());
      });
    };
    const onScroll = () => {
      if (!writing) setPending(null);
    };
    document.addEventListener("mouseup", check);
    document.addEventListener("keyup", check);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("mouseup", check);
      document.removeEventListener("keyup", check);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [writing]);

  if (!pending) return null;

  const save = () => {
    addAnnotation({ kind: "text", source: pending.source, quote: pending.quote, note: note.trim() });
    setPending(null);
    setWriting(false);
    setNote("");
    document.getSelection()?.removeAllRanges();
  };

  return createPortal(
    <div
      ref={boxRef}
      style={{ left: pending.x, top: pending.y }}
      className="fixed z-[60] text-left"
      onMouseDown={(e) => {
        // Keep the text selected while using the box.
        if (!(e.target instanceof HTMLTextAreaElement)) e.preventDefault();
      }}
    >
      {writing ? (
        <div className="liquid-glass-dropdown w-72 p-2.5">
          <p className="mb-1.5 line-clamp-2 text-caption text-muted-foreground">“{pending.quote}”</p>
          <textarea
            autoFocus
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setPending(null);
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                save();
              }
            }}
            placeholder="What should change here?"
            className="w-full resize-none rounded-[10px] bg-black/[0.04] px-2.5 py-2 text-body outline-none placeholder:text-muted-foreground/60 dark:bg-white/[0.05]"
          />
          <div className="mt-1.5 flex items-center justify-between">
            <span className="text-caption text-muted-foreground">Sent with your next message</span>
            <button
              type="button"
              onClick={save}
              className="kontinue-3d-primary h-7 cursor-pointer rounded-full px-3 text-label font-medium"
            >
              Add note
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setWriting(true)}
          className="kontinue-3d-primary flex h-8 cursor-pointer items-center gap-1.5 rounded-full px-3 text-label font-medium shadow-lg"
        >
          <MessageSquarePlus size={13} />
          Annotate
        </button>
      )}
    </div>,
    document.body,
  );
}
