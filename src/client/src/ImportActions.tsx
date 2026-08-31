import { useEffect, useRef, useState } from "react";
import { Button } from "./shared";

type Props = {
  onChooseFile: () => void;
  onContinueWithoutMeasurements: () => void;
};

export function ImportActions({ onChooseFile, onContinueWithoutMeasurements }: Props) {
  const root = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    function closeOutside(event: PointerEvent) {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", closeOutside);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return <div
    ref={root}
    className={`import-actions${open ? " import-actions--open" : ""}`}
    onMouseEnter={() => setOpen(true)}
    onMouseLeave={() => {
      if (!root.current?.contains(document.activeElement)) setOpen(false);
    }}
    onFocusCapture={() => setOpen(true)}
    onBlurCapture={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
    }}
  >
    <div className="import-actions__split">
      <Button className="import-actions__choose" variant="primary" onClick={onChooseFile}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5M5 14v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4" /></svg>
        <span>Choose CSV export</span>
      </Button>
      <span className="import-actions__toggle" aria-hidden="true">
        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4" /></svg>
      </span>
    </div>
    {open && <div className="import-actions__menu" role="menu">
      <button type="button" role="menuitem" onClick={() => {
        setOpen(false);
        onContinueWithoutMeasurements();
      }}>
        <svg viewBox="0 -960 960 960" aria-hidden="true"><path d="M200-200v80q-33 0-56.5-23.5T120-200h80Zm-80-80v-80h80v80h-80Zm0-160v-80h80v80h-80Zm0-160v-80h80v80h-80Zm80-160h-80q0-33 23.5-56.5T200-840v80Zm80 640v-80h80v80h-80Zm0-640v-80h80v80h-80Zm160 640v-80h80v80h-80Zm0-640v-80h80v80h-80Zm160 640v-80h80v80h-80Zm0-640v-80h80v80h-80Zm160 560h80q0 33-23.5 56.5T760-120v-80Zm0-80v-80h80v80h-80Zm0-160v-80h80v80h-80Zm0-160v-80h80v80h-80Zm0-160v-80q33 0 56.5 23.5T840-760h-80Z" /></svg>
        <span>Start without a CSV</span>
      </button>
    </div>}
  </div>;
}
