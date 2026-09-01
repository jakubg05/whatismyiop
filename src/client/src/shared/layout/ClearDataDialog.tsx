import { useRef, useState } from "react";
import { Button } from "../ui";

const CLEAR_DATA_CONFIRMATION = "confirm";

export function ClearDataDialog({ onConfirm }: { onConfirm: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [confirmation, setConfirmation] = useState("");
  const confirmed =
    confirmation.trim().toLowerCase() === CLEAR_DATA_CONFIRMATION;

  function close() {
    dialog.current?.close();
  }

  function clearData() {
    if (!confirmed) return;
    onConfirm();
    close();
  }

  return (
    <>
      <Button
        type="button"
        variant="quiet"
        className="clear-button"
        onClick={() => dialog.current?.showModal()}
      >
        Clear data
      </Button>
      <dialog
        ref={dialog}
        className="clear-data-dialog"
        aria-labelledby="clear-data-dialog-title"
        aria-describedby="clear-data-dialog-description"
        onClose={() => setConfirmation("")}
      >
        <form
          className="clear-data-dialog__form"
          onSubmit={(event) => {
            event.preventDefault();
            clearData();
          }}
        >
          <div className="clear-data-dialog__copy">
            <h2 id="clear-data-dialog-title">Clear all local data</h2>
            <p id="clear-data-dialog-description">
              This permanently removes your measurements, periods, and annotations
              from this browser.
            </p>
          </div>
          <label htmlFor="clear-data-confirmation">
            Type <strong>{CLEAR_DATA_CONFIRMATION}</strong> to confirm
          </label>
          <input
            id="clear-data-confirmation"
            type="text"
            value={confirmation}
            autoComplete="off"
            spellCheck={false}
            autoFocus
            onChange={(event) => setConfirmation(event.target.value)}
          />
          <div className="clear-data-dialog__actions">
            <Button type="button" onClick={close}>
              Cancel
            </Button>
            <Button type="submit" variant="danger" disabled={!confirmed}>
              Clear all data
            </Button>
          </div>
        </form>
      </dialog>
    </>
  );
}
