import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
} from "react";
import {
  aggregateMeasurementSessions,
  parseMeasurementsCsv,
  type Eye,
  type Measurement,
  type MeasurementView,
  type SessionAggregation,
} from "../measurements";
import {
  formatDateInput,
  formatTimeInput,
  parseDateTimeBoundary,
} from "../../shared/lib/wallClock";
import {
  ComparisonExpressionEditor,
  NOW_COMPARISON_ANNOTATION_ID,
  parseComparisonExpression,
  resolveComparisonSegments,
  type ComparisonCatalog,
  type ComparisonValuePreview,
} from "../comparison";
import {
  annotationLabelError,
  normalizePeriodEdges,
  periodPalette,
  type EditablePeriod,
  type PointAnnotation,
  type TreatmentPeriod,
} from "../annotations";
import {
  ComparisonDiurnalChart,
  binDiurnalSessions,
  diurnalYAxisScale,
} from "../charts/diurnal";
import { ImportConfirmationDialog, ImportPanel } from "../data-import";
import {
  ChartEditor,
  MeasurementsChart,
  type ChartAnnotationPreview,
  type ChartMode,
  type TimeDomain,
} from "../charts/chronological";
import { SiteFooter } from "../../shared/layout/SiteFooter";
import {
  deserializeWorkspace,
  deserializeReport,
  REPORT_FILE_EXTENSION,
  serializeReport,
  serializeWorkspace,
  WORKSPACE_STORAGE_KEY,
  type Workspace,
} from "./workspaceStorage";
import { SiteHeader } from "../../shared/layout/SiteHeader";
import { useToast } from "../../app/toast/ToastProvider";

const NO_MEASUREMENTS: Measurement[] = [];

type PendingImport =
  | { kind: "measurements"; measurements: Measurement[]; fileName: string }
  | { kind: "report"; workspace: Workspace; fileName: string };

function emptyDraftPeriod(): EditablePeriod {
  return {
    label: "",
    start: "",
    startTime: "00:00",
    end: "",
    endTime: "23:59",
    openEnded: false,
  };
}

function wallClockTimestamp(time = Date.now()): number {
  const date = new Date(time);
  return Date.UTC(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    date.getHours(),
    date.getMinutes(),
    date.getSeconds(),
    date.getMilliseconds(),
  );
}

export function AnalysisWorkspacePage() {
  const fileInput = useRef<HTMLInputElement>(null);
  const measurementFileInput = useRef<HTMLInputElement>(null);
  const reportFileInput = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);
  const [comparisonText, setComparisonText] = useState("");
  const { showToast } = useToast();
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [pendingImport, setPendingImport] = useState<PendingImport | null>(null);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [visibleEyes, setVisibleEyes] = useState<Record<Eye, boolean>>({
    OD: true,
    OS: true,
  });
  const [diurnalEye, setDiurnalEye] = useState<Eye>("OD");
  const [diurnalMeasurementView, setDiurnalMeasurementView] =
    useState<MeasurementView>("sessions");
  const [diurnalSessionAggregation, setDiurnalSessionAggregation] =
    useState<SessionAggregation>("median");
  const [targetEnabled, setTargetEnabled] = useState(false);
  const [targetValue, setTargetValue] = useState(21);
  const changeTargetValue = useCallback((value: number) => {
    if (!Number.isFinite(value)) return;
    setTargetValue(Math.min(100, Math.max(0.1, value)));
  }, []);
  const [mode, setMode] = useState<ChartMode>(null);
  const [now, setNow] = useState(() => wallClockTimestamp());
  const [comparisonValuePreview, setComparisonValuePreview] =
    useState<ComparisonValuePreview | null>(null);
  const [draftPeriod, setDraftPeriod] =
    useState<EditablePeriod>(emptyDraftPeriod);
  const [draftAnnotation, setDraftAnnotation] = useState({
    label: "",
    date: "",
    clock: "",
  });
  const [draftLabelError, setDraftLabelError] = useState<{
    kind: "period" | "annotation";
    message: string;
  } | null>(null);
  const [editingPeriodId, setEditingPeriodId] = useState<string | null>(null);
  const [editingAnnotationId, setEditingAnnotationId] = useState<string | null>(null);

  const workspaceActive = workspace !== null;
  const measurements = workspace?.measurements ?? NO_MEASUREMENTS;
  const periods = workspace?.periods ?? [];
  const annotations = workspace?.annotations ?? [];
  const updatePeriods = useCallback(
    (update: (current: TreatmentPeriod[]) => TreatmentPeriod[]) => {
      setWorkspace((current) =>
        current ? { ...current, periods: update(current.periods) } : current,
      );
    },
    [],
  );
  const updateAnnotations = useCallback(
    (update: (current: PointAnnotation[]) => PointAnnotation[]) => {
      setWorkspace((current) =>
        current ? { ...current, annotations: update(current.annotations) } : current,
      );
    },
    [],
  );
  const resetEditor = useCallback(() => {
    setMode(null);
    setDraftPeriod(emptyDraftPeriod());
    setDraftAnnotation({ label: "", date: "", clock: "" });
    setEditingPeriodId(null);
    setEditingAnnotationId(null);
    setDraftLabelError(null);
  }, []);
  const diurnalObservations = useMemo(
    () =>
      diurnalMeasurementView === "raw"
        ? measurements
        : aggregateMeasurementSessions(measurements, diurnalSessionAggregation),
    [diurnalMeasurementView, diurnalSessionAggregation, measurements],
  );
  const fullDomainStart = measurements[0]?.time ?? now - 30 * 86_400_000;
  const fullDomainEnd = measurements.at(-1)?.time ?? now;
  const chartFullDomain = useMemo<TimeDomain>(
    () => [fullDomainStart, fullDomainEnd],
    [fullDomainEnd, fullDomainStart],
  );
  const [chartDomain, setChartDomain] = useState<TimeDomain>(chartFullDomain);
  const [minimumIop, maximumIop] = useMemo(() => {
    let minimum = Number.POSITIVE_INFINITY;
    let maximum = Number.NEGATIVE_INFINITY;
    for (const measurement of measurements) {
      minimum = Math.min(minimum, measurement.iop);
      maximum = Math.max(maximum, measurement.iop);
    }
    return Number.isFinite(minimum)
      ? [Math.floor(minimum - 2), Math.ceil(maximum + 2)]
      : [5, 35];
  }, [measurements]);
  const today = formatDateInput(now);
  const currentTime = formatTimeInput(now);
  const comparisonCatalog = useMemo<ComparisonCatalog>(
    () => ({ periods, annotations, now }),
    [annotations, now, periods],
  );
  const comparisonExpression = useMemo(
    () => parseComparisonExpression(comparisonText, comparisonCatalog),
    [comparisonCatalog, comparisonText],
  );
  const comparisonPeriods = useMemo(
    () =>
      resolveComparisonSegments(
        comparisonExpression.segments,
        comparisonCatalog,
        fullDomainStart,
        fullDomainEnd,
        now,
      ),
    [
      comparisonCatalog,
      comparisonExpression.segments,
      fullDomainEnd,
      fullDomainStart,
      now,
    ],
  );
  const comparisonMode = comparisonExpression.segments.length > 0;
  const chartAnnotationPreview = useMemo<ChartAnnotationPreview | null>(() => {
    if (comparisonValuePreview?.kind === "period") {
      const paletteIndex = periods.findIndex(
        (item) => item.label === comparisonValuePreview.label,
      );
      return paletteIndex >= 0
        ? { kind: "period", value: periods[paletteIndex], paletteIndex }
        : null;
    }
    if (comparisonValuePreview?.kind === "annotation") {
      if (comparisonValuePreview.label === "now") {
        return {
          kind: "annotation",
          value: { id: NOW_COMPARISON_ANNOTATION_ID, label: "now", time: now },
          paletteIndex: annotations.length,
        };
      }
      const paletteIndex = annotations.findIndex(
        (item) => item.label === comparisonValuePreview.label,
      );
      return paletteIndex >= 0
        ? { kind: "annotation", value: annotations[paletteIndex], paletteIndex }
        : null;
    }
    return null;
  }, [comparisonValuePreview, annotations, now, periods]);
  const diurnalSeries = useMemo(
    () =>
      comparisonPeriods.map((period, index) => {
        const effectiveEnd = period.openEnded ? today : period.end;
        const effectiveEndTime = period.openEnded
          ? currentTime
          : period.endTime;
        return {
          id: period.id,
          name: period.label,
          color: periodPalette(index).stroke,
          data: binDiurnalSessions(
            diurnalObservations,
            diurnalEye,
            period,
            effectiveEnd,
            effectiveEndTime,
            period.openEnded ? now : undefined,
          ),
        };
      }),
    [
      comparisonPeriods,
      currentTime,
      diurnalEye,
      diurnalObservations,
      now,
      today,
    ],
  );
  const diurnalScale = useMemo(() => {
    const observationSets = [
      measurements,
      aggregateMeasurementSessions(measurements, "median"),
      aggregateMeasurementSessions(measurements, "average"),
    ];
    const points = observationSets.flatMap((observations) =>
      (["OS", "OD"] as const).flatMap((eye) =>
        comparisonPeriods.flatMap((period) => {
          const effectiveEnd = period.openEnded ? today : period.end;
          const effectiveEndTime = period.openEnded
            ? currentTime
            : period.endTime;
          return binDiurnalSessions(
            observations,
            eye,
            period,
            effectiveEnd,
            effectiveEndTime,
            period.openEnded ? now : undefined,
          );
        }),
      ),
    );
    return diurnalYAxisScale(points, targetEnabled ? targetValue : undefined);
  }, [
    comparisonPeriods,
    currentTime,
    measurements,
    now,
    targetEnabled,
    targetValue,
    today,
  ]);
  useEffect(() => {
    const timer = window.setInterval(
      () => setNow(wallClockTimestamp()),
      60_000,
    );
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    setChartDomain(chartFullDomain);
  }, [chartFullDomain, measurements]);

  useEffect(() => {
    if (!comparisonMode || (mode !== "period" && mode !== "annotation")) return;
    resetEditor();
  }, [comparisonMode, mode, resetEditor]);

  useEffect(() => {
    const saved = window.localStorage.getItem(WORKSPACE_STORAGE_KEY);
    if (!saved) return;
    try {
      setWorkspace(deserializeWorkspace(saved));
    } catch {
      showToast("Saved browser data could not be restored.", "error");
    }
  }, [showToast]);

  useEffect(() => {
    if (!workspace) return;
    try {
      window.localStorage.setItem(
        WORKSPACE_STORAGE_KEY,
        serializeWorkspace(workspace),
      );
    } catch {
      showToast("The browser could not save this data locally.", "error");
    }
  }, [showToast, workspace]);

  function finishImport(nextWorkspace: Workspace, message: string) {
    setWorkspace(nextWorkspace);
    setPendingImport(null);
    setComparisonText("");
    resetEditor();
    showToast(message, "info");
  }

  function applyImport(next: PendingImport) {
    if (next.kind === "report") {
      finishImport(next.workspace, `Opened ${next.fileName}`);
      return;
    }
    finishImport(
      {
        measurements: next.measurements,
        periods: workspace?.periods ?? [],
        annotations: workspace?.annotations ?? [],
      },
      `Imported ${next.measurements.length.toLocaleString()} measurements.`,
    );
  }

  async function loadFile(file: File) {
    try {
      const text = await file.text();
      const next: PendingImport = text.trimStart().startsWith("{")
        ? { kind: "report", workspace: deserializeReport(text), fileName: file.name }
        : { kind: "measurements", measurements: parseMeasurementsCsv(text), fileName: file.name };
      const needsConfirmation = next.kind === "report"
        ? workspace !== null
        : measurements.length > 0;
      if (needsConfirmation) setPendingImport(next);
      else applyImport(next);
    } catch (reason) {
      showToast(
        reason instanceof Error
          ? reason.message
          : "Could not read this file.",
        "warning",
      );
    }
  }

  useEffect(() => {
    if (workspaceActive) return;
    function handlePaste(event: ClipboardEvent) {
      const target = event.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        (target instanceof HTMLElement && target.isContentEditable)
      ) return;
      const files = Array.from(event.clipboardData?.files ?? []);
      if (files.length === 0) return;
      event.preventDefault();
      if (files.length !== 1) {
        showToast("Paste one file at a time.", "warning");
        return;
      }
      void loadFile(files[0]);
    }
    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  });

  function clearStoredData() {
    window.localStorage.removeItem(WORKSPACE_STORAGE_KEY);
    setWorkspace(null);
    setComparisonText("");
    resetEditor();
  }

  function continueWithoutMeasurements() {
    setWorkspace({
      measurements: [],
      periods: [],
      annotations: [],
    });
    setComparisonText("");
    resetEditor();
  }

  function generateReport() {
    if (!workspace) return;
    const now = new Date();
    const localDate = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, "0"),
      String(now.getDate()).padStart(2, "0"),
    ].join("-");
    const blob = new Blob([serializeReport(workspace, now)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `report-${localDate}${REPORT_FILE_EXTENSION}`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function savePeriod() {
    const orderedPeriod = normalizePeriodEdges(draftPeriod, now);
    const effectiveEnd = orderedPeriod.openEnded ? today : orderedPeriod.end;
    const effectiveEndTime = orderedPeriod.openEnded
      ? currentTime
      : orderedPeriod.endTime;
    const label = orderedPeriod.label.trim();
    if (!label) {
      const message = "Enter a period name in the label on the chart.";
      setDraftLabelError({ kind: "period", message });
      showToast(message, "warning");
      return;
    }
    if (!orderedPeriod.start || !effectiveEnd) {
      showToast("Choose a start and end date for the period.", "warning");
      return;
    }
    const startBoundary = parseDateTimeBoundary(
      orderedPeriod.start,
      orderedPeriod.startTime,
    );
    const endBoundary = parseDateTimeBoundary(
      effectiveEnd,
      effectiveEndTime,
      "end",
    );
    if (
      startBoundary === null ||
      endBoundary === null ||
      startBoundary > endBoundary
    ) {
      showToast("The period start must be before its end.", "warning");
      return;
    }
    const labelError = annotationLabelError(
      label,
      "period",
      comparisonCatalog,
      editingPeriodId ?? undefined,
    );
    if (labelError) {
      setDraftLabelError({ kind: "period", message: labelError });
      showToast(labelError, "warning");
      return;
    }
    const saved = {
      ...orderedPeriod,
      end: orderedPeriod.openEnded ? "" : effectiveEnd,
      endTime: orderedPeriod.openEnded ? "" : effectiveEndTime,
      label,
    };
    if (editingPeriodId) {
      updatePeriods((current) =>
        current.map((period) =>
          period.id === editingPeriodId ? { ...saved, id: period.id } : period,
        ),
      );
    } else {
      const id = crypto.randomUUID();
      updatePeriods((current) => [...current, { ...saved, id }]);
    }
    resetEditor();
  }

  function annotationTimestamp(source = draftAnnotation): number | null {
    return parseDateTimeBoundary(source.date, source.clock);
  }

  function saveAnnotation() {
    const time = annotationTimestamp();
    const label = draftAnnotation.label.trim();
    if (!label) {
      const message = "Enter an annotation name in the label on the chart.";
      setDraftLabelError({ kind: "annotation", message });
      showToast(message, "warning");
      return;
    }
    if (time === null) {
      showToast("Choose a date and time for the annotation.", "warning");
      return;
    }
    const labelError = annotationLabelError(
      label,
      "annotation",
      comparisonCatalog,
      editingAnnotationId ?? undefined,
    );
    if (labelError) {
      setDraftLabelError({ kind: "annotation", message: labelError });
      showToast(labelError, "warning");
      return;
    }
    if (editingAnnotationId) {
      const nextAnnotation = { id: editingAnnotationId, label, time };
      updateAnnotations((current) =>
        current.map((annotation) =>
          annotation.id === editingAnnotationId ? nextAnnotation : annotation,
        ),
      );
    } else {
      updateAnnotations((current) => [
        ...current,
        { id: crypto.randomUUID(), label, time },
      ]);
    }
    resetEditor();
  }

  function deleteDraft() {
    if (editingPeriodId) {
      updatePeriods((current) =>
        current.filter((period) => period.id !== editingPeriodId),
      );
    }
    if (editingAnnotationId) {
      updateAnnotations((current) =>
        current.filter((annotation) => annotation.id !== editingAnnotationId),
      );
    }
    resetEditor();
  }

  function handleDragEnter(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    dragDepth.current += 1;
    setIsDraggingFile(true);
  }

  function handleDragOver(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  }

  function handleDragLeave(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setIsDraggingFile(false);
  }

  function handleDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    dragDepth.current = 0;
    setIsDraggingFile(false);
    const files = Array.from(event.dataTransfer.files);
    if (files.length !== 1) {
      if (files.length > 1) showToast("Drop one file at a time.", "warning");
      return;
    }
    void loadFile(files[0]);
  }

  const setDraftAnnotationTime = useCallback((time: number) => {
    setDraftAnnotation((current) => ({
      ...current,
      date: formatDateInput(time),
      clock: formatTimeInput(time),
    }));
  }, []);

  const selectPeriod = useCallback(
    (period: Omit<EditablePeriod, "label">) => {
      resetEditor();
      setDraftPeriod({ label: "", ...period });
      setMode("period");
    },
    [resetEditor],
  );

  const selectAnnotation = useCallback(
    (time: number) => {
      resetEditor();
      setDraftAnnotationTime(time);
      setMode("annotation");
    },
    [resetEditor, setDraftAnnotationTime],
  );

  const editPeriod = useCallback(
    (period: TreatmentPeriod) => {
      resetEditor();
      setDraftPeriod({
        label: period.label,
        start: period.start,
        startTime: period.startTime,
        end: period.end,
        endTime: period.endTime,
        openEnded: period.openEnded,
      });
      setEditingPeriodId(period.id);
      setMode("period");
    },
    [resetEditor],
  );

  const editAnnotation = useCallback(
    (annotation: PointAnnotation) => {
      resetEditor();
      setDraftAnnotation({
        label: annotation.label,
        date: formatDateInput(annotation.time),
        clock: formatTimeInput(annotation.time),
      });
      setEditingAnnotationId(annotation.id);
      setMode("annotation");
    },
    [resetEditor],
  );

  const toggleEye = useCallback((eye: Eye) => {
    setVisibleEyes((current) => ({ ...current, [eye]: !current[eye] }));
  }, []);
  const openInfo = useCallback(
    (nextMode: Exclude<ChartMode, "period" | "annotation" | null>) => {
      resetEditor();
      setMode(nextMode);
    },
    [resetEditor],
  );
  const openTrendInfo = useCallback(() => openInfo("trend"), [openInfo]);
  const openSessionInfo = useCallback(() => openInfo("sessions"), [openInfo]);
  const openHeatmapInfo = useCallback(() => openInfo("heatmap"), [openInfo]);
  const chartYDomain = useMemo(
    () =>
      [
        targetEnabled
          ? Math.min(minimumIop, Math.floor(targetValue - 2))
          : minimumIop,
        targetEnabled
          ? Math.max(maximumIop, Math.ceil(targetValue + 2))
          : maximumIop,
      ] as [number, number],
    [maximumIop, minimumIop, targetEnabled, targetValue],
  );
  const activeDraftLabelError =
    (mode === "period" || mode === "annotation") && draftLabelError?.kind === mode
      ? draftLabelError.message
      : null;
  const showComparisonBlockedToast = useCallback(() => {
    showToast(
      "Clear the search expressions before creating or editing periods and annotations.",
      "warning",
    );
  }, [showToast]);

  return (
    <main>
      <input
        ref={fileInput}
        hidden
        type="file"
        accept={`.csv,${REPORT_FILE_EXTENSION}`}
        onClick={(event) => {
          event.currentTarget.value = "";
        }}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void loadFile(file);
        }}
      />
      <input
        ref={measurementFileInput}
        hidden
        type="file"
        accept=".csv,text/csv"
        onClick={(event) => { event.currentTarget.value = ""; }}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void loadFile(file);
        }}
      />
      <input
        ref={reportFileInput}
        hidden
        type="file"
        accept={REPORT_FILE_EXTENSION}
        onClick={(event) => { event.currentTarget.value = ""; }}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void loadFile(file);
        }}
      />

      {pendingImport?.kind === "measurements" && (
        <ImportConfirmationDialog
          kind="measurements"
          currentCount={measurements.length}
          nextCount={pendingImport.measurements.length}
          onCancel={() => setPendingImport(null)}
          onConfirm={() => applyImport(pendingImport)}
        />
      )}
      {pendingImport?.kind === "report" && (
        <ImportConfirmationDialog
          kind="report"
          onCancel={() => setPendingImport(null)}
          onConfirm={() => applyImport(pendingImport)}
        />
      )}

      <div
        className={`analysis-shell ${mode ? "analysis-shell--editor-open" : ""}`}
      >
        <div className="analysis-main">
          <SiteHeader />

          {!workspaceActive && (
            <ImportPanel
              isDraggingFile={isDraggingFile}
              onChooseFile={() => fileInput.current?.click()}
              onChooseMeasurements={() => measurementFileInput.current?.click()}
              onChooseReport={() => reportFileInput.current?.click()}
              onContinueWithoutMeasurements={continueWithoutMeasurements}
              onDragEnter={handleDragEnter}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            />
          )}

          {workspaceActive && (
            <div className="comparison-overlay">
              <ComparisonExpressionEditor
                catalog={comparisonCatalog}
                value={comparisonText}
                onChange={setComparisonText}
                onPreviewChange={setComparisonValuePreview}
              />
            </div>
          )}

          <div
            className={`chronological-workspace${!workspaceActive ? " chronological-workspace--inactive" : ""}`}
            inert={!workspaceActive}
            aria-hidden={!workspaceActive}
          >
          <MeasurementsChart
            measurements={measurements}
            visibleEyes={visibleEyes}
            onToggleEye={toggleEye}
            onOpenTrendInfo={openTrendInfo}
            onOpenSessionInfo={openSessionInfo}
            onOpenHeatmapInfo={openHeatmapInfo}
            periods={periods}
            annotations={annotations}
            comparisonPeriods={comparisonPeriods}
            comparisonMode={comparisonMode}
            annotationPreview={chartAnnotationPreview}
            onComparisonBlocked={showComparisonBlockedToast}
            mode={mode}
            onSelectPeriod={selectPeriod}
            onSelectAnnotation={selectAnnotation}
            onEditPeriod={editPeriod}
            onEditAnnotation={editAnnotation}
            onCancelEdit={resetEditor}
            draftPeriod={draftPeriod}
            draftPeriodLabel={draftPeriod.label}
            draftLabelError={activeDraftLabelError}
            setDraftPeriod={(value) => {
              setDraftLabelError(null);
              setDraftPeriod(value);
            }}
            draftAnnotationLabel={draftAnnotation.label}
            onDraftAnnotationLabel={(label) => {
              setDraftLabelError(null);
              setDraftAnnotation((value) => ({ ...value, label }));
            }}
            draftAnnotationTime={annotationTimestamp(draftAnnotation)}
            onDraftAnnotationTime={setDraftAnnotationTime}
            today={today}
            presentTime={now}
            domain={chartDomain}
            onDomainChange={setChartDomain}
            fullDomain={chartFullDomain}
            yDomain={chartYDomain}
            targetEnabled={targetEnabled}
            targetValue={targetValue}
            onTargetEnabledChange={setTargetEnabled}
            onTargetValueChange={changeTargetValue}
          />
          </div>

          <section className="comparison-workspace">
            <section className="diurnal-section">
              <ComparisonDiurnalChart
                series={diurnalSeries}
                yScale={diurnalScale}
                targetEnabled={targetEnabled}
                targetValue={targetValue}
                onTargetEnabledChange={setTargetEnabled}
                onTargetValueChange={changeTargetValue}
                eye={diurnalEye}
                onEyeChange={setDiurnalEye}
                measurementView={diurnalMeasurementView}
                sessionAggregation={diurnalSessionAggregation}
                onMeasurementViewChange={setDiurnalMeasurementView}
                onSessionAggregationChange={setDiurnalSessionAggregation}
                onOpenSessionInfo={openSessionInfo}
                inactive={
                  !workspaceActive
                    ? {
                        title: "Import measurements to view diurnal patterns.",
                        description:
                          "The diurnal chart will summarize readings by time of day.",
                      }
                    : !comparisonMode
                      ? {
                          title:
                            "Add a comparison segment to view diurnal patterns.",
                          description:
                            "You can create comparison segments using the search box at the top of the screen.",
                        }
                      : undefined
                }
              />
            </section>
          </section>

          <SiteFooter
            variant="full"
            workspaceActive={workspaceActive}
            measurementCount={measurements.length}
            firstMeasurementTime={measurements[0]?.time}
            lastMeasurementTime={measurements.at(-1)?.time}
            onChooseFile={() => fileInput.current?.click()}
            onGenerateReport={generateReport}
            onClearData={clearStoredData}
          />
        </div>

        <ChartEditor
          mode={mode}
          draftPeriodLabel={draftPeriod.label}
          draftAnnotationLabel={draftAnnotation.label}
          labelError={activeDraftLabelError}
          isEditing={Boolean(editingPeriodId || editingAnnotationId)}
          onSavePeriod={savePeriod}
          onSaveAnnotation={saveAnnotation}
          onDelete={deleteDraft}
          onCancel={resetEditor}
          onOpenSessionInfo={openSessionInfo}
          onOpenTrendInfo={openTrendInfo}
          onOpenHeatmapInfo={openHeatmapInfo}
        />
      </div>
    </main>
  );
}
