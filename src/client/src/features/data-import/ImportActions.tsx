import { useId, useRef, useState } from "react";
import { Button, MaterialSymbol, useDismissiblePopover } from "../../shared/ui";

type Props = {
  onChooseFile: () => void;
  onChooseMeasurements: () => void;
  onChooseReport: () => void;
  onContinueWithoutMeasurements: () => void;
};

export function ImportActions({
  onChooseFile,
  onChooseMeasurements,
  onChooseReport,
  onContinueWithoutMeasurements,
}: Props) {
  const root = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const [open, setOpen] = useState(false);

  useDismissiblePopover(root, open, () => setOpen(false));

  return (
    <div
      ref={root}
      className={`import-actions${open ? " import-actions--open" : ""}`}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => {
        if (!root.current?.contains(document.activeElement)) setOpen(false);
      }}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null))
          setOpen(false);
      }}
    >
      <div className="import-actions__split">
        <Button
          className="import-actions__choose"
          variant="primary"
          onFocus={() => setOpen(true)}
          onClick={onChooseFile}
        >
          <MaterialSymbol name="file_upload" />
          <span>Choose file</span>
        </Button>
        <button
          type="button"
          className="import-actions__toggle"
          aria-label="Show more import options"
          aria-expanded={open}
          aria-controls={menuId}
          onClick={() => setOpen((current) => !current)}
        >
          <MaterialSymbol name="expand_more" />
        </button>
      </div>
      {open && (
        <div id={menuId} className="import-actions__menu">
          <button type="button" onClick={() => {
            setOpen(false);
            onChooseMeasurements();
          }}>
            <MaterialSymbol name="file_upload" />
            <span>Import iCare CSV</span>
          </button>
          <button type="button" onClick={() => {
            setOpen(false);
            onChooseReport();
          }}>
            <img
              className="import-actions__report-logo"
              src="/whatismyiop_mark_black.svg"
              alt=""
            />
            <span>Open WhatIsMyIOP report</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onContinueWithoutMeasurements();
            }}
          >
            <MaterialSymbol name="file_upload_off" />
            <span>Start empty</span>
          </button>
        </div>
      )}
    </div>
  );
}
