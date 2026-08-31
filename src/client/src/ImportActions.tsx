import { useEffect, useRef, useState } from "react";
import { MaterialSymbol } from "./MaterialSymbol";
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
        <MaterialSymbol name="file_upload" />
        <span>Choose CSV export</span>
      </Button>
      <span className="import-actions__toggle" aria-hidden="true">
        <MaterialSymbol name="expand_more" />
      </span>
    </div>
    {open && <div className="import-actions__menu" role="menu">
      <button type="button" role="menuitem" onClick={() => {
        setOpen(false);
        onContinueWithoutMeasurements();
      }}>
        <MaterialSymbol name="file_upload_off" />
        <span>Start without a CSV</span>
      </button>
    </div>}
  </div>;
}
