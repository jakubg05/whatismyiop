import {
  useCallback,
  useEffect,
  useRef,
  type FocusEvent,
  type PointerEvent,
  type RefObject,
} from "react";
import { useDismissiblePopover } from "./useDismissiblePopover";

export function useHoverPopover(
  root: RefObject<HTMLElement | null>,
  open: boolean,
  onOpenChange: (open: boolean) => void,
  enabled = true,
) {
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pointerInside = useRef(false);
  useDismissiblePopover(root, enabled && open, () => onOpenChange(false));

  const cancelClose = useCallback(() => {
    if (closeTimer.current === null) return;
    clearTimeout(closeTimer.current);
    closeTimer.current = null;
  }, []);

  useEffect(() => cancelClose, [cancelClose]);

  useEffect(() => {
    if (!enabled) {
      cancelClose();
      onOpenChange(false);
    }
  }, [cancelClose, enabled, onOpenChange]);

  const onPointerEnter = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      if (!enabled || event.pointerType !== "mouse") return;
      pointerInside.current = true;
      cancelClose();
      onOpenChange(true);
    },
    [cancelClose, enabled, onOpenChange],
  );

  const onPointerLeave = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      if (event.pointerType !== "mouse") return;
      pointerInside.current = false;
      cancelClose();
      closeTimer.current = setTimeout(() => onOpenChange(false), 100);
    },
    [cancelClose, onOpenChange],
  );

  const onFocus = useCallback(() => {
    if (!enabled) return;
    cancelClose();
    onOpenChange(true);
  }, [cancelClose, enabled, onOpenChange]);

  const onBlur = useCallback(
    (event: FocusEvent<HTMLElement>) => {
      if (pointerInside.current) return;
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
        onOpenChange(false);
      }
    },
    [onOpenChange],
  );

  return { onPointerEnter, onPointerLeave, onFocus, onBlur };
}
