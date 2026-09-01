import { Button, MaterialSymbol, SidebarHeader } from "../../../../shared/ui";
import { HeatmapExplanation } from "../heatmap/HeatmapExplanation";
import { SessionExplanation } from "../measurements/SessionExplanation";
import { TrendExplanation } from "../trend/TrendExplanation";
import type { ChartMode } from "../chart/MeasurementsChart";

export function ChartEditor({
  mode,
  draftPeriodLabel,
  draftAnnotationLabel,
  labelError,
  isEditing,
  onSavePeriod,
  onSaveAnnotation,
  onDelete,
  onCancel,
  onOpenSessionInfo,
  onOpenTrendInfo,
  onOpenHeatmapInfo,
}: {
  mode: ChartMode;
  draftPeriodLabel: string;
  draftAnnotationLabel: string;
  labelError: string | null;
  isEditing: boolean;
  onSavePeriod: () => void;
  onSaveAnnotation: () => void;
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
          <SidebarHeader
            className="editor-drawer__toolbar"
            prominent={
              mode === "trend" || mode === "sessions" || mode === "heatmap"
            }
            title={
              mode === "trend"
                ? "How trends work?"
                : mode === "sessions"
                  ? "How sessions work?"
                  : mode === "heatmap"
                    ? "How heatmaps work?"
                    : (mode === "period"
                        ? draftPeriodLabel
                        : draftAnnotationLabel
                      ).trim() || "Untitled"
            }
            subtitle={
              (mode === "period" || mode === "annotation") && labelError ? (
                <small
                  id="annotation-name-guidance"
                  className="editor-drawer__name-guidance--warning"
                >
                  {labelError}
                </small>
              ) : undefined
            }
            actions={
              <>
                {isEditing && (
                  <button
                    type="button"
                    className="editor-drawer__delete"
                    onClick={onDelete}
                  >
                    Delete
                  </button>
                )}
                {(mode === "period" || mode === "annotation") && (
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
              </>
            }
          />
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
        {mode === "annotation" && (
          <form
            id="annotation-editor-form"
            onSubmit={(event) => {
              event.preventDefault();
              onSaveAnnotation();
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
