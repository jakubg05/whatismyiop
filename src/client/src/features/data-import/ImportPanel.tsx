import { Link } from "@tanstack/react-router";
import type { DragEventHandler } from "react";
import { GitHubIcon } from "../../shared/ui";
import { ImportActions } from "./ImportActions";

type Props = {
  isDraggingFile: boolean;
  onChooseFile: () => void;
  onContinueWithoutMeasurements: () => void;
  onDragEnter: DragEventHandler<HTMLElement>;
  onDragOver: DragEventHandler<HTMLElement>;
  onDragLeave: DragEventHandler<HTMLElement>;
  onDrop: DragEventHandler<HTMLElement>;
};

export function ImportPanel({
  isDraggingFile,
  onChooseFile,
  onContinueWithoutMeasurements,
  onDragEnter,
  onDragOver,
  onDragLeave,
  onDrop,
}: Props) {
  return (
    <>
      <section
        className={`import-dropzone${isDraggingFile ? " import-dropzone--dragging" : ""}`}
        aria-label="Import IOP measurements"
        onDragEnter={onDragEnter}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        <svg className="import-dropzone__outline" aria-hidden="true">
          <rect
            x="1"
            y="1"
            width="calc(100% - 2px)"
            height="calc(100% - 2px)"
            rx="13"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        <ImportActions
          onChooseFile={onChooseFile}
          onContinueWithoutMeasurements={onContinueWithoutMeasurements}
        />
        <div className="import-dropzone__facts" aria-label="Import details">
          <span>Currently supports iCare HOME2 CSV exports</span>
          <span aria-hidden="true">·</span>
          <a
            href="https://github.com/jakubg05/whatismyiop"
            target="_blank"
            rel="noreferrer"
            aria-label="View source on GitHub"
          >
            <GitHubIcon className="import-dropzone__github" />
            <span>Source on GitHub</span>
          </a>
        </div>
        <p className="import-dropzone__notice">
          Your file is saved in this browser until you clear it. This tool does
          not diagnose conditions or recommend treatment.{" "}
          <Link to="/policy">Privacy</Link> ·{" "}
          <Link to="/disclaimer">Medical disclaimer</Link>
        </p>
      </section>

      <section
        className="import-explainer"
        aria-labelledby="import-explainer-title"
      >
        <h2 id="import-explainer-title">What this tool does</h2>
        <p>
          A home tonometer CSV contains many readings that are hard to follow in
          a spreadsheet. This tool puts them on a chart as individual readings
          or groups them into sessions. You can filter by body position and
          measurement quality, add a trend line, and use the heatmap to see
          pressure patterns and which times of day have fewer measurements.
        </p>
        <p>
          Periods let you show ongoing treatments on the chart, while events
          mark one-time changes or procedures. Use them to compare parts of your
          history or see what happened before and after a change. If you change
          eye-care professionals, you have a chronological record of treatment
          alongside the pressure history.
        </p>
      </section>
    </>
  );
}
