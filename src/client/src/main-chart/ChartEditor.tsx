import type { Eye } from "../analysis";
import { Button, Toggle } from "../shared";
import type { ChartMode } from "./MeasurementsChart";
import { SessionExplanation } from "./SessionExplanation";
import { TrendExplanation } from "./TrendExplanation";
import type { TrendMode } from "./trend";

export function ChartEditor({
  mode,
  draftRangeLabel,
  draftEventLabel,
  isEditing,
  trendMode,
  visibleTrendEyes,
  onSaveRange,
  onSaveEvent,
  onDelete,
  onCancel,
  onToggleTrendEye,
  onTrendModeChange,
  onOpenSessionInfo,
}: {
  mode: ChartMode;
  draftRangeLabel: string;
  draftEventLabel: string;
  isEditing: boolean;
  trendMode: TrendMode;
  visibleTrendEyes: Record<Eye, boolean>;
  onSaveRange: () => void;
  onSaveEvent: () => void;
  onDelete: () => void;
  onCancel: () => void;
  onToggleTrendEye: (eye: Eye) => void;
  onTrendModeChange: (mode: Exclude<TrendMode, "off">) => void;
  onOpenSessionInfo: () => void;
}) {
  return (
    <aside className={`editor-drawer editor-drawer--${mode ?? "closed"}`} aria-hidden={!mode}>
      <div className="editor-drawer__inner">
        {mode && <div className="editor-drawer__toolbar">
          <span>{mode === "trend" ? "Trend" : mode === "sessions" ? "How sessions work?" : (mode === "range" ? draftRangeLabel : draftEventLabel).trim() || "Untitled"}</span>
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
        {mode === "trend" && <div className="trend-settings">
          <section className="trend-settings__section">
            <div className="trend-settings__options" role="group" aria-label="Trend eyes">
              {(["OD", "OS"] as Eye[]).map((eye) => <div key={eye} className="trend-settings__option" onClick={() => onToggleTrendEye(eye)}>
                <span className="trend-settings__option-copy trend-settings__option-copy--eye">
                  <span className={`dot dot--${eye.toLowerCase()}`} aria-hidden="true" />
                  <span><strong>{eye === "OD" ? "Right eye" : "Left eye"}</strong><small>{eye}</small></span>
                </span>
                <Toggle label={`${eye === "OD" ? "Right" : "Left"} eye trend`} checked={visibleTrendEyes[eye]} />
              </div>)}
            </div>
          </section>
          <section className="trend-settings__section">
            <div className="trend-settings__options" role="group" aria-label="Trend type">
              {([
                ["adjusted", "Adjusted", "Accounts for the time of day each session was recorded."],
                ["observed", "Observed", "Shows the trend directly from recorded session values."],
              ] as const).map(([value, label, description]) => <div key={value} className="trend-settings__option" onClick={() => onTrendModeChange(value)}>
                <span className="trend-settings__option-copy"><strong>{label}</strong><small>{description}</small></span>
                <Toggle label={`${label} trend`} checked={trendMode === value} />
              </div>)}
            </div>
          </section>
          <TrendExplanation onOpenSessions={onOpenSessionInfo} />
        </div>}
        {mode === "sessions" && <SessionExplanation />}
      </div>
    </aside>
  );
}
