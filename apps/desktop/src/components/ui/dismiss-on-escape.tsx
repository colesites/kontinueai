// For the older hand-built overlays that aren't on ui/dialog yet: close on
// Escape, unless a menu or popover inside the overlay is open (that Escape
// belongs to it).

import { useEffect } from "react";

export function DismissOnEscape({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      if (document.querySelector("[data-radix-popper-content-wrapper]")) return;
      event.stopPropagation();
      onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);
  return null;
}
