import { Link } from "@tanstack/react-router";
import { Button, GitHubIcon } from "../ui";
import { ClearDataDialog } from "./ClearDataDialog";

const shortDateFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: "UTC",
  day: "numeric",
  month: "short",
  year: "numeric",
});

type SiteFooterProps =
  | { variant: "compact" }
  | {
      variant: "full";
      workspaceActive: boolean;
      measurementCount: number;
      firstMeasurementTime?: number;
      lastMeasurementTime?: number;
      onChooseFile: () => void;
      onGenerateReport: () => void;
      onClearData: () => void;
    };

export function SiteFooter(props: SiteFooterProps) {
  const full = props.variant === "full";

  return (
    <footer className={`site-footer site-footer--${props.variant}`}>
      <div className="site-footer__inner">
        <section className="site-footer__about">
          <div className="site-footer__brand">
            <img src="/whatismyiop_mark_black.svg" alt="" />
            <strong>WhatIsMyIop.com</strong>
          </div>
          {full && (
            <p>
              WhatIsMyIOP.com helps people using home tonometers organise and
              visualise their measurements for clearer review and discussion
              with an eye-care professional.
            </p>
          )}
          <a
            className="site-footer__github"
            href="https://github.com/jakubg05/whatismyiop"
            target="_blank"
            rel="noreferrer"
          >
            <GitHubIcon />
            <span>Source on GitHub</span>
          </a>
        </section>

        {full && (
          <section className="site-footer__privacy">
            <h2>Stored in your browser</h2>
            <p>
              Your measurements, periods, and Annotations stay in this browser.
              WhatIsMyIOP does not upload them or require an account.
            </p>
          </section>
        )}

        {full && props.workspaceActive && (
          <section className="site-footer__data">
            <h2>Measurement history</h2>
            <div className="site-footer__file">
              <strong>
                {props.measurementCount.toLocaleString()} measurements
              </strong>
              {props.firstMeasurementTime !== undefined && props.lastMeasurementTime !== undefined && (
                <span>
                  {shortDateFormatter.format(props.firstMeasurementTime)} to{" "}
                  {shortDateFormatter.format(props.lastMeasurementTime)}
                </span>
              )}
            </div>
            <div className="site-footer__actions">
              <Button onClick={props.onGenerateReport}>Generate report</Button>
              <Button variant="quiet" onClick={props.onChooseFile}>Import file</Button>
              <ClearDataDialog onConfirm={props.onClearData} />
            </div>
          </section>
        )}

        <div className="site-footer__bottom">
          <nav className="site-footer__legal" aria-label="Legal information">
            <Link to="/policy">Privacy</Link>
            <Link to="/terms">Terms</Link>
            <Link to="/disclaimer">Medical disclaimer</Link>
          </nav>
          <span className="site-footer__status">
            Copyright © {new Date().getFullYear()} WhatIsMyIop.com
          </span>
        </div>
      </div>
    </footer>
  );
}
