import { Button } from "../shared";
import { HeatmapExplanation } from "./HeatmapExplanation";
import type { ChartMode } from "./MeasurementsChart";
import { SessionExplanation } from "./SessionExplanation";
import { TrendExplanation } from "./TrendExplanation";

export function ChartEditor({
  mode,
  draftRangeLabel,
  draftEventLabel,
  isEditing,
  onSaveRange,
  onSaveEvent,
  onDelete,
  onCancel,
  onOpenSessionInfo,
}: {
  mode: ChartMode;
  draftRangeLabel: string;
  draftEventLabel: string;
  isEditing: boolean;
  onSaveRange: () => void;
  onSaveEvent: () => void;
  onDelete: () => void;
  onCancel: () => void;
  onOpenSessionInfo: () => void;
}) {
  return (
    <aside className={`editor-drawer editor-drawer--${mode ?? "closed"}`} aria-hidden={!mode}>
      <div className="editor-drawer__inner">
        {mode && <div className="editor-drawer__toolbar">
          <span>{mode === "trend"
            ? "How trends work?"
            : mode === "sessions"
              ? "How sessions work?"
              : mode === "heatmap"
                ? "How heatmaps work?"
                : (mode === "range" ? draftRangeLabel : draftEventLabel).trim() || "Untitled"}</span>
          <div className="editor-drawer__actions">
            {isEditing && <button type="button" className="editor-drawer__delete" onClick={onDelete}>Delete</button>}
            {(mode === "range" || mode === "event") && <Button type="submit" form={`${mode}-editor-form`} variant="editorPrimary" className="draft-action">Save</Button>}
            <button type="button" className="editor-drawer__close" aria-label="Close editor" onClick={onCancel}>
              <svg viewBox="0 -960 960 960" aria-hidden="true"><path d="M480-424 284-228q-11 11-28 11t-28-11q-11-11-11-28t11-28l196-196-196-196q-11-11-11-28t11-28q11-11 28-11t28 11l196 196 196-196q11-11 28-11t28 11q11 11 11 28t-11 28L536-480l196 196q11 11 11 28t-11 28q-11 11-28 11t-28-11L480-424Z" /></svg>
            </button>
          </div>
        </div>}
        {mode === "range" && <form id="range-editor-form" onSubmit={(event) => { event.preventDefault(); onSaveRange(); }} />}
        {mode === "event" && <form id="event-editor-form" onSubmit={(event) => { event.preventDefault(); onSaveEvent(); }} />}
        {mode === "trend" && <TrendExplanation expanded onOpenSessions={onOpenSessionInfo} />}
        {mode === "sessions" && <SessionExplanation />}
        {mode === "heatmap" && <HeatmapExplanation />}
      </div>
    </aside>
  );
}
