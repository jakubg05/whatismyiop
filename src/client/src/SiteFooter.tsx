import { Link } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { Button } from "./shared";

const CLEAR_DATA_CONFIRMATION = "confirm";

type SiteFooterProps = {
  variant?: "full" | "compact";
  fileName?: string;
  measurementCount?: number;
  onChooseFile?: () => void;
  onClearData?: () => void;
};

export function SiteFooter({
  variant = "compact",
  fileName,
  measurementCount = 0,
  onChooseFile,
  onClearData,
}: SiteFooterProps) {
  const hasLocalData = variant === "full" && Boolean(fileName);
  const clearDialog = useRef<HTMLDialogElement>(null);
  const [clearConfirmation, setClearConfirmation] = useState("");
  const clearConfirmed = clearConfirmation.trim().toLowerCase() === CLEAR_DATA_CONFIRMATION;

  function closeClearDialog() {
    clearDialog.current?.close();
  }

  function confirmClearData() {
    if (!clearConfirmed || !onClearData) return;
    onClearData();
    closeClearDialog();
  }

  return (
    <footer className={`site-footer site-footer--${variant}`}>
      <div className="site-footer__inner">
        <section className="site-footer__about">
          <div className="site-footer__brand">
            <img src="/whatismyiop_mark_black.svg" alt="" />
            <strong>WhatIsMyIop.com</strong>
          </div>
          {variant === "full" && <p>WhatIsMyIOP.com helps people using home tonometers organise and visualise their measurements for clearer review and discussion with an eye-care professional.</p>}
          <a className="site-footer__github" href="https://github.com/jakubg05/whatismyiop" target="_blank" rel="noreferrer">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.75a9.5 9.5 0 0 0-3 18.51c.48.09.65-.2.65-.46v-1.67c-2.67.58-3.23-1.13-3.23-1.13-.44-1.1-1.07-1.4-1.07-1.4-.87-.6.07-.58.07-.58.96.07 1.47.99 1.47.99.86 1.47 2.25 1.05 2.8.8.09-.62.34-1.05.61-1.29-2.13-.24-4.37-1.07-4.37-4.7 0-1.04.37-1.89.99-2.55-.1-.24-.43-1.21.09-2.52 0 0 .8-.26 2.61.97A9.1 9.1 0 0 1 12 7.42a9 9 0 0 1 2.38.32c1.81-1.23 2.61-.97 2.61-.97.52 1.31.19 2.28.09 2.52.62.66.99 1.51.99 2.55 0 3.64-2.24 4.45-4.38 4.69.35.3.65.88.65 1.77v2.5c0 .26.18.56.66.46A9.5 9.5 0 0 0 12 2.75Z" /></svg>
            <span>Source on GitHub</span>
          </a>
        </section>

        {variant === "full" && <section className="site-footer__privacy">
          <h2>Stored in your browser</h2>
          <p>Your CSV, periods, and events stay in this browser. WhatIsMyIOP does not upload them or require an account.</p>
        </section>}

        {hasLocalData && <section className="site-footer__data">
          <h2>Your local data</h2>
          <div className="site-footer__file">
            <strong>{fileName}</strong>
            <span>{measurementCount > 0 ? `${measurementCount.toLocaleString()} measurements stored locally` : "Treatment history stored locally"}</span>
          </div>
          <div className="site-footer__actions">
            {onChooseFile && <Button variant="secondary" onClick={onChooseFile}>Update measurements</Button>}
            {onClearData && <Button
              variant="quiet"
              className="clear-button"
              onClick={() => clearDialog.current?.showModal()}
            >Clear data</Button>}
          </div>
        </section>}

        {onClearData && <dialog
          ref={clearDialog}
          className="clear-data-dialog"
          aria-labelledby="clear-data-dialog-title"
          aria-describedby="clear-data-dialog-description"
          onClose={() => {
            setClearConfirmation("");
          }}
        >
          <form className="clear-data-dialog__form" onSubmit={(event) => {
            event.preventDefault();
            confirmClearData();
          }}>
            <div className="clear-data-dialog__copy">
              <h2 id="clear-data-dialog-title">Clear all local data</h2>
              <p id="clear-data-dialog-description">This permanently removes your measurements, periods, and events from this browser.</p>
            </div>
            <label htmlFor="clear-data-confirmation">Type <strong>{CLEAR_DATA_CONFIRMATION}</strong> to confirm</label>
            <input
              id="clear-data-confirmation"
              type="text"
              value={clearConfirmation}
              autoComplete="off"
              spellCheck={false}
              autoFocus
              onChange={(event) => setClearConfirmation(event.target.value)}
            />
            <div className="clear-data-dialog__actions">
              <Button type="button" variant="secondary" onClick={closeClearDialog}>Cancel</Button>
              <Button type="submit" variant="danger" disabled={!clearConfirmed}>Clear all data</Button>
            </div>
          </form>
        </dialog>}

        <div className="site-footer__bottom">
          <nav className="site-footer__legal" aria-label="Legal information">
            <Link to="/policy">Privacy</Link>
            <Link to="/terms">Terms</Link>
            <Link to="/disclaimer">Medical disclaimer</Link>
          </nav>
          <span className="site-footer__status">Copyright © 2026 WhatIsMyIop.com</span>
        </div>
      </div>
    </footer>
  );
}
