import { useEffect, useRef } from "react";
import { Button } from "../../shared/ui";

type Props =
  | {
      kind: "measurements";
      currentCount: number;
      nextCount: number;
      onCancel: () => void;
      onConfirm: () => void;
    }
  | {
      kind: "report";
      onCancel: () => void;
      onConfirm: () => void;
    };

export function ImportConfirmationDialog(props: Props) {
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const element = dialog.current;
    if (element && !element.open) element.showModal();
  }, []);

  const measurements = props.kind === "measurements";
  return (
    <dialog
      ref={dialog}
      className="import-confirmation-dialog"
      aria-labelledby="import-confirmation-title"
      aria-describedby="import-confirmation-description"
      onCancel={(event) => {
        event.preventDefault();
        props.onCancel();
      }}
      onClose={props.onCancel}
    >
      <form
        method="dialog"
        className="import-confirmation-dialog__form"
        onSubmit={(event) => {
          event.preventDefault();
          props.onConfirm();
        }}
      >
        <div className="import-confirmation-dialog__copy">
          <h2 id="import-confirmation-title">
            {measurements ? "Update measurements?" : "Open this report?"}
          </h2>
          <p id="import-confirmation-description">
            {measurements
              ? `The selected file contains ${props.nextCount.toLocaleString()} measurements and will update your current ${props.currentCount.toLocaleString()} measurements. Your periods and Annotations will remain unchanged.`
              : "Your current measurements, periods, and Annotations will be replaced."}
          </p>
          {!measurements && <p>Generate a report first if you want to keep the current data.</p>}
        </div>
        <div className="import-confirmation-dialog__actions">
          <Button type="button" onClick={props.onCancel}>Cancel</Button>
          <Button type="submit" variant="danger">
            {measurements ? "Update measurements" : "Open report"}
          </Button>
        </div>
      </form>
    </dialog>
  );
}
