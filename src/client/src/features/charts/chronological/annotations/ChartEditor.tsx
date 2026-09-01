import { Button, MaterialSymbol } from "../../../../shared/ui";
import { HeatmapExplanation } from "../heatmap/HeatmapExplanation";
import { SessionExplanation } from "../measurements/SessionExplanation";
import { TrendExplanation } from "../trend/TrendExplanation";
import type { ChartMode } from "../chart/MeasurementsChart";

export function ChartEditor({
  mode,
  draftPeriodLabel,
  draftEventLabel,
  labelError,
  isEditing,
  onSavePeriod,
  onSaveEvent,
  onDelete,
  onCancel,
  onOpenSessionInfo,
  onOpenTrendInfo,
  onOpenHeatmapInfo,
}: {
  mode: ChartMode;
  draftPeriodLabel: string;
  draftEventLabel: string;
  labelError: string | null;
  isEditing: boolean;
  onSavePeriod: () => void;
  onSaveEvent: () => void;
  onDelete: () => void;
  onCancel: () => void;
  onOpenSessionInfo: () => void;
  onOpenTrendInfo: () => void;
  onOpenHeatmapInfo: () => void;
}) {
  return (
    <aside
      className={`editor-drawer editor-drawer--${mode === "period" ? "range" : (mode ?? "closed")}`}
      aria-hidden={!mode}
    >
      <div className="editor-drawer__inner">
        {mode && (
          <div className="editor-drawer__toolbar">
            <div className="editor-drawer__heading">
              <span>
                {mode === "trend"
                  ? "How trends work?"
                  : mode === "sessions"
                    ? "How sessions work?"
                    : mode === "heatmap"
                      ? "How heatmaps work?"
                      : (mode === "period"
                          ? draftPeriodLabel
                          : draftEventLabel
                        ).trim() || "Untitled"}
              </span>
              {(mode === "period" || mode === "event") && labelError && (
                <small
                  id="annotation-name-guidance"
                  className="editor-drawer__name-guidance--warning"
                >
                  {labelError}
                </small>
              )}
            </div>
            <div className="editor-drawer__actions">
              {isEditing && (
                <button
                  type="button"
                  className="editor-drawer__delete"
                  onClick={onDelete}
                >
                  Delete
                </button>
              )}
              {(mode === "period" || mode === "event") && (
                <Button
                  type="submit"
                  form={`${mode}-editor-form`}
                  variant="primary"
                  className="draft-action"
                >
                  Save
                </Button>
              )}
              <button
                type="button"
                className="editor-drawer__close"
                aria-label="Close editor"
                onClick={onCancel}
              >
                <MaterialSymbol name="close" />
              </button>
            </div>
          </div>
        )}
        {mode === "period" && (
          <form
            id="period-editor-form"
            onSubmit={(event) => {
              event.preventDefault();
              onSavePeriod();
            }}
          />
        )}
        {mode === "event" && (
          <form
            id="event-editor-form"
            onSubmit={(event) => {
              event.preventDefault();
              onSaveEvent();
            }}
          />
        )}
        {mode === "trend" && (
          <TrendExplanation expanded onOpenSessions={onOpenSessionInfo} />
        )}
        {mode === "sessions" && (
          <SessionExplanation
            onOpenTrendInfo={onOpenTrendInfo}
            onOpenHeatmapInfo={onOpenHeatmapInfo}
          />
        )}
        {mode === "heatmap" && <HeatmapExplanation />}
      </div>
    </aside>
  );
}
