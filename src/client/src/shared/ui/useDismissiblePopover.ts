import { useEffect, useRef, type RefObject } from "react";

export function useDismissiblePopover(
  root: RefObject<HTMLElement | null>,
  open: boolean,
  onDismiss: () => void,
) {
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  useEffect(() => {
    if (!open) return;

    function dismissOutside(event: PointerEvent) {
      if (!root.current?.contains(event.target as Node)) onDismissRef.current();
    }

    function dismissOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onDismissRef.current();
    }

    document.addEventListener("pointerdown", dismissOutside);
    window.addEventListener("keydown", dismissOnEscape);
    return () => {
      document.removeEventListener("pointerdown", dismissOutside);
      window.removeEventListener("keydown", dismissOnEscape);
    };
  }, [open, root]);
}
