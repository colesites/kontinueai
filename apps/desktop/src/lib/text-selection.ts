// Text selection that highlights only the selected text.
//
// macOS's webview (WebKit) fills the empty space between and beside selected
// blocks, so a selection across a few paragraphs paints a big ragged slab. We
// hide the native highlight (globals.css: html.custom-selection ::selection)
// and mirror the selection into a CSS Custom Highlight, which paints text
// only. Copying still uses the real selection. Inputs and textareas keep
// their native highlight because highlights can't reach inside them.

const NAME = "kontinue-selection";

type HighlightLike = { add: (range: Range) => void; clear: () => void };

export function installTextSelectionHighlight() {
  const registry = (globalThis.CSS as unknown as { highlights?: Map<string, HighlightLike> })?.highlights;
  const HighlightCtor = (globalThis as unknown as { Highlight?: new () => HighlightLike }).Highlight;
  if (!registry || !HighlightCtor) return; // Older WebKit: keep the native highlight.

  const highlight = new HighlightCtor();
  registry.set(NAME, highlight);
  document.documentElement.classList.add("custom-selection");

  let frame = 0;
  const sync = () => {
    frame = 0;
    highlight.clear();
    const selection = document.getSelection();
    if (!selection || selection.isCollapsed) return;
    for (let i = 0; i < selection.rangeCount; i++) {
      highlight.add(selection.getRangeAt(i).cloneRange());
    }
  };
  document.addEventListener("selectionchange", () => {
    if (!frame) frame = requestAnimationFrame(sync);
  });
}
