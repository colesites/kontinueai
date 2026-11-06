// Shows scrollbars only while something is scrolling (see the scrollbar rules
// in styles/globals.css). Marks the scrolled element with [data-scrolling] and
// removes the mark once scrolling has been idle for HIDE_DELAY_MS.

const HIDE_DELAY_MS = 900;

export function installScrollbarActivity(): void {
  const timers = new WeakMap<Element, number>();

  document.addEventListener(
    "scroll",
    (event) => {
      const target =
        event.target === document ? document.documentElement : event.target;
      if (!(target instanceof Element)) return;

      if (!target.hasAttribute("data-scrolling")) {
        target.setAttribute("data-scrolling", "");
      }
      window.clearTimeout(timers.get(target));
      timers.set(
        target,
        window.setTimeout(() => target.removeAttribute("data-scrolling"), HIDE_DELAY_MS),
      );
    },
    { capture: true, passive: true },
  );
}
