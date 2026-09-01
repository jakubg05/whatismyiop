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
} from "../features/measurements";
import {
  formatDateInput,
  formatTimeInput,
  parseDateTimeBoundary,
} from "../shared/lib/wallClock";
import {
  ComparisonExpressionEditor,
  NOW_COMPARISON_EVENT_ID,
  parseComparisonExpression,
  resolveComparisonSegments,
  type ComparisonCatalog,
  type ComparisonValuePreview,
} from "../features/comparison";
import {
  annotationLabelError,
  type EditablePeriod,
  type TimelineEvent,
  type TreatmentPeriod,
} from "../features/annotations";
import {
  ComparisonDiurnalChart,
  binDiurnalSessions,
  diurnalYAxisScale,
} from "../features/charts/diurnal";
import { ImportPanel } from "../features/data-import";
import {
  ChartEditor,
  MeasurementsChart,
  normalizePeriodEdges,
  type ChartAnnotationPreview,
  type ChartMode,
  type TimeDomain,
} from "../features/charts/chronological";
import { periodPalette } from "../shared/theme/periodPalette";
import { SiteFooter } from "../shared/layout/SiteFooter";
import {
  deserializeWorkspace,
  serializeWorkspace,
  WORKSPACE_STORAGE_KEY,
  type Workspace,
} from "./workspaceStorage";
import { SiteHeader } from "./layout/SiteHeader";
import { useToast } from "./toast/ToastProvider";

const EMPTY_MEASUREMENTS_CSV = "Date / Time;IOP (OD);IOP (OS)\n";
const NO_MEASUREMENTS: Measurement[] = [];

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

export default function App() {
  const fileInput = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);
  const [comparisonText, setComparisonText] = useState("");
  const { showToast } = useToast();
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
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
  const [draftEvent, setDraftEvent] = useState({
    label: "",
    date: "",
    clock: "",
  });
  const [draftLabelError, setDraftLabelError] = useState<{
    kind: "period" | "event";
    message: string;
  } | null>(null);
  const [editingPeriodId, setEditingPeriodId] = useState<string | null>(null);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);

  const workspaceActive = workspace !== null;
  const measurements = workspace?.measurements ?? NO_MEASUREMENTS;
  const periods = workspace?.periods ?? [];
  const events = workspace?.events ?? [];
  const updatePeriods = useCallback(
    (update: (current: TreatmentPeriod[]) => TreatmentPeriod[]) => {
      setWorkspace((current) =>
        current ? { ...current, periods: update(current.periods) } : current,
      );
    },
    [],
  );
  const updateEvents = useCallback(
    (update: (current: TimelineEvent[]) => TimelineEvent[]) => {
      setWorkspace((current) =>
        current ? { ...current, events: update(current.events) } : current,
      );
    },
    [],
  );
  const resetEditor = useCallback(() => {
    setMode(null);
    setDraftPeriod(emptyDraftPeriod());
    setDraftEvent({ label: "", date: "", clock: "" });
    setEditingPeriodId(null);
    setEditingEventId(null);
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
    () => ({ periods, events, now }),
    [events, now, periods],
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
    if (comparisonValuePreview?.kind === "event") {
      if (comparisonValuePreview.label === "now") {
        return {
          kind: "event",
          value: { id: NOW_COMPARISON_EVENT_ID, label: "now", time: now },
          paletteIndex: events.length,
        };
      }
      const paletteIndex = events.findIndex(
        (item) => item.label === comparisonValuePreview.label,
      );
      return paletteIndex >= 0
        ? { kind: "event", value: events[paletteIndex], paletteIndex }
        : null;
    }
    return null;
  }, [comparisonValuePreview, events, now, periods]);
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
    if (!comparisonMode || (mode !== "period" && mode !== "event")) return;
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

  async function loadFile(file: File) {
    try {
      const csvText = await file.text();
      const nextMeasurements = parseMeasurementsCsv(csvText);
      setWorkspace((current) => ({
        fileName: file.name,
        csvText,
        measurements: nextMeasurements,
        periods: current?.measurements.length === 0 ? current.periods : [],
        events: current?.measurements.length === 0 ? current.events : [],
      }));
      setComparisonText("");
      resetEditor();
    } catch (reason) {
      showToast(
        reason instanceof Error
          ? reason.message
          : "Could not read this CSV file.",
        "warning",
      );
    }
  }

  function clearStoredData() {
    window.localStorage.removeItem(WORKSPACE_STORAGE_KEY);
    setWorkspace(null);
    setComparisonText("");
    resetEditor();
  }

  function continueWithoutMeasurements() {
    setWorkspace({
      fileName: "Treatment history",
      csvText: EMPTY_MEASUREMENTS_CSV,
      measurements: [],
      periods: [],
      events: [],
    });
    setComparisonText("");
    resetEditor();
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

  function eventTimestamp(source = draftEvent): number | null {
    return parseDateTimeBoundary(source.date, source.clock);
  }

  function saveEvent() {
    const time = eventTimestamp();
    const label = draftEvent.label.trim();
    if (!label) {
      const message = "Enter an event name in the label on the chart.";
      setDraftLabelError({ kind: "event", message });
      showToast(message, "warning");
      return;
    }
    if (time === null) {
      showToast("Choose a date and time for the event.", "warning");
      return;
    }
    const labelError = annotationLabelError(
      label,
      "event",
      comparisonCatalog,
      editingEventId ?? undefined,
    );
    if (labelError) {
      setDraftLabelError({ kind: "event", message: labelError });
      showToast(labelError, "warning");
      return;
    }
    if (editingEventId) {
      const nextEvent = { id: editingEventId, label, time };
      updateEvents((current) =>
        current.map((event) =>
          event.id === editingEventId ? nextEvent : event,
        ),
      );
    } else {
      updateEvents((current) => [
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
    if (editingEventId) {
      updateEvents((current) =>
        current.filter((event) => event.id !== editingEventId),
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
    const file = event.dataTransfer.files[0];
    if (file) void loadFile(file);
  }

  const setDraftEventTime = useCallback((time: number) => {
    setDraftEvent((current) => ({
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

  const selectEvent = useCallback(
    (time: number) => {
      resetEditor();
      setDraftEventTime(time);
      setMode("event");
    },
    [resetEditor, setDraftEventTime],
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

  const editEvent = useCallback(
    (event: TimelineEvent) => {
      resetEditor();
      setDraftEvent({
        label: event.label,
        date: formatDateInput(event.time),
        clock: formatTimeInput(event.time),
      });
      setEditingEventId(event.id);
      setMode("event");
    },
    [resetEditor],
  );

  const toggleEye = useCallback((eye: Eye) => {
    setVisibleEyes((current) => ({ ...current, [eye]: !current[eye] }));
  }, []);
  const openInfo = useCallback(
    (nextMode: Exclude<ChartMode, "period" | "event" | null>) => {
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
    (mode === "period" || mode === "event") && draftLabelError?.kind === mode
      ? draftLabelError.message
      : null;
  const showComparisonBlockedToast = useCallback(() => {
    showToast(
      "Clear the search expressions before creating or editing periods and events.",
      "warning",
    );
  }, [showToast]);

  return (
    <main>
      <input
        ref={fileInput}
        hidden
        type="file"
        accept=".csv,text/csv"
        onClick={(event) => {
          event.currentTarget.value = "";
        }}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void loadFile(file);
        }}
      />

      <div
        className={`analysis-shell ${mode ? "analysis-shell--editor-open" : ""}`}
      >
        <div className="analysis-main">
          <SiteHeader />

          {!workspaceActive && (
            <ImportPanel
              isDraggingFile={isDraggingFile}
              onChooseFile={() => fileInput.current?.click()}
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

          <MeasurementsChart
            measurements={measurements}
            visibleEyes={visibleEyes}
            onToggleEye={toggleEye}
            onOpenTrendInfo={openTrendInfo}
            onOpenSessionInfo={openSessionInfo}
            onOpenHeatmapInfo={openHeatmapInfo}
            periods={periods}
            events={events}
            comparisonPeriods={comparisonPeriods}
            comparisonMode={comparisonMode}
            annotationPreview={chartAnnotationPreview}
            onComparisonBlocked={showComparisonBlockedToast}
            mode={mode}
            onSelectPeriod={selectPeriod}
            onSelectEvent={selectEvent}
            onEditPeriod={editPeriod}
            onEditEvent={editEvent}
            onCancelEdit={resetEditor}
            draftPeriod={draftPeriod}
            draftPeriodLabel={draftPeriod.label}
            draftLabelError={activeDraftLabelError}
            setDraftPeriod={(value) => {
              setDraftLabelError(null);
              setDraftPeriod(value);
            }}
            draftEventLabel={draftEvent.label}
            onDraftEventLabel={(label) => {
              setDraftLabelError(null);
              setDraftEvent((value) => ({ ...value, label }));
            }}
            draftEventTime={eventTimestamp(draftEvent)}
            onDraftEventTime={setDraftEventTime}
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
            fileName={workspace?.fileName ?? ""}
            measurementCount={measurements.length}
            onChooseFile={() => fileInput.current?.click()}
            onClearData={clearStoredData}
          />
        </div>

        <ChartEditor
          mode={mode}
          draftPeriodLabel={draftPeriod.label}
          draftEventLabel={draftEvent.label}
          labelError={activeDraftLabelError}
          isEditing={Boolean(editingPeriodId || editingEventId)}
          onSavePeriod={savePeriod}
          onSaveEvent={saveEvent}
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
