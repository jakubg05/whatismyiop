import { Link } from "@tanstack/react-router";
import type { DragEventHandler } from "react";
import { GitHubIcon } from "../../shared/ui";
import { ImportActions } from "./ImportActions";

type Props = {
  isDraggingFile: boolean;
  onChooseFile: () => void;
  onChooseMeasurements: () => void;
  onChooseReport: () => void;
  onContinueWithoutMeasurements: () => void;
  onDragEnter: DragEventHandler<HTMLElement>;
  onDragOver: DragEventHandler<HTMLElement>;
  onDragLeave: DragEventHandler<HTMLElement>;
  onDrop: DragEventHandler<HTMLElement>;
};

export function ImportPanel({
  isDraggingFile,
  onChooseFile,
  onChooseMeasurements,
  onChooseReport,
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
        aria-label="Import IOP measurements or a WhatIsMyIOP report"
        onDragEnter={onDragEnter}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        <svg className="import-dropzone__outline" aria-hidden="true">
          <rect
            x="0.0625rem"
            y="0.0625rem"
            width="calc(100% - 0.125rem)"
            height="calc(100% - 0.125rem)"
            rx="0.8125rem"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        <ImportActions
          onChooseFile={onChooseFile}
          onChooseMeasurements={onChooseMeasurements}
          onChooseReport={onChooseReport}
          onContinueWithoutMeasurements={onContinueWithoutMeasurements}
        />
        <div className="import-dropzone__facts" aria-label="Import details">
          <span>iCare HOME2 CSV</span>
          <span aria-hidden="true">·</span>
          <span>WhatIsMyIOP report</span>
          <span aria-hidden="true">·</span>
          <span>Drop or paste a file</span>
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
          The imported data is saved in this browser until you clear it. This tool does
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
          Periods let you show ongoing treatments on the chart, while Annotations
          mark one-time changes or procedures. Use them to compare parts of your
          history or see what happened before and after a change. If you change
          eye-care professionals, you have a chronological record of treatment
          alongside the pressure history.
        </p>
      </section>
    </>
  );
}
