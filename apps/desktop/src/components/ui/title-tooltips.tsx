// Styled tooltips for every control that has a `title`. Mounted once: rather
// than wrapping ~190 buttons, it listens for hover and keyboard focus, moves
// the element's title aside so macOS doesn't also draw its slow yellow one,
// and shows the text in the app's own style after a short delay.

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const SHOW_DELAY_MS = 450;
/** After one tooltip has shown, the next one appears at once. */
const WARM_MS = 600;
const GAP = 6;
const EDGE = 8;

type Tip = { text: string; rect: DOMRect };

function claimTitle(el: HTMLElement): string {
  const title = el.getAttribute("title");
  if (title) {
    el.dataset.tooltip = title;
    el.removeAttribute("title");
    // The title was the control's only name for icon buttons.
    if (!el.getAttribute("aria-label") && !el.textContent?.trim()) el.setAttribute("aria-label", title);
  }
  return el.dataset.tooltip ?? "";
}

export function TitleTooltips() {
  const [tip, setTip] = useState<Tip | null>(null);
  const [position, setPosition] = useState<{ left: number; top: number; forTip: Tip } | null>(null);
  const bubble = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let timer: number | undefined;
    let current: HTMLElement | null = null;
    let lastHidden = 0;

    const hide = () => {
      window.clearTimeout(timer);
      if (current) lastHidden = Date.now();
      current = null;
      setTip(null);
    };

    const show = (el: HTMLElement) => {
      if (el === current) return;
      const text = claimTitle(el);
      window.clearTimeout(timer);
      current = el;
      if (!text) {
        setTip(null);
        return;
      }
      const open = () => {
        if (current === el && el.isConnected) setTip({ text, rect: el.getBoundingClientRect() });
      };
      if (Date.now() - lastHidden < WARM_MS) open();
      else timer = window.setTimeout(open, SHOW_DELAY_MS);
    };

    const target = (event: Event) =>
      (event.target as Element | null)?.closest?.<HTMLElement>("[title], [data-tooltip]") ?? null;

    const onOver = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      const el = target(event);
      if (el) show(el);
      else if (current) hide();
    };
    const onFocus = (event: FocusEvent) => {
      const el = target(event);
      // Keyboard focus only: a click also focuses, and shouldn't pop a tooltip.
      if (el && el.matches(":focus-visible")) show(el);
    };

    document.addEventListener("pointerover", onOver);
    document.addEventListener("focusin", onFocus);
    document.addEventListener("focusout", hide);
    document.addEventListener("pointerdown", hide, true);
    document.addEventListener("keydown", hide, true);
    document.addEventListener("scroll", hide, true);
    window.addEventListener("blur", hide);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("pointerover", onOver);
      document.removeEventListener("focusin", onFocus);
      document.removeEventListener("focusout", hide);
      document.removeEventListener("pointerdown", hide, true);
      document.removeEventListener("keydown", hide, true);
      document.removeEventListener("scroll", hide, true);
      window.removeEventListener("blur", hide);
    };
  }, []);

  // Place below the control, or above when there's no room; keep on screen.
  // Runs before paint so a new tip never flashes at the previous spot.
  useLayoutEffect(() => {
    if (!tip || !bubble.current) {
      setPosition(null);
      return;
    }
    const { width, height } = bubble.current.getBoundingClientRect();
    // Positions are in layout pixels; the root may be zoomed (text size).
    const zoom = Number.parseFloat(getComputedStyle(document.documentElement).zoom || "1") || 1;
    const viewW = window.innerWidth / zoom;
    const viewH = window.innerHeight / zoom;
    const r = tip.rect;
    const rect = { left: r.left / zoom, right: r.right / zoom, top: r.top / zoom, bottom: r.bottom / zoom };
    const w = width / zoom;
    const h = height / zoom;
    const left = Math.min(Math.max((rect.left + rect.right) / 2 - w / 2, EDGE), viewW - w - EDGE);
    const below = rect.bottom + GAP;
    const top = below + h + EDGE > viewH ? rect.top - GAP - h : below;
    setPosition({ left, top, forTip: tip });
  }, [tip]);

  if (!tip) return null;
  const placed = position?.forTip === tip;
  return createPortal(
    <div
      key={placed ? "placed" : "measuring"}
      ref={bubble}
      role="tooltip"
      style={placed ? { left: position.left, top: position.top } : { left: 0, top: 0, visibility: "hidden" }}
      className="pointer-events-none fixed z-[100] max-w-[280px] rounded-lg bg-foreground px-2 py-1 text-caption leading-snug text-background shadow-lg animate-in fade-in-0 duration-100"
    >
      {tip.text}
    </div>,
    document.body,
  );
}
