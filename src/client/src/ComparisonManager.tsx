import { Fragment, useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import { type ComparisonDirection, parseComparisonQuery } from "./comparison";

type Period = {
  id: string;
  label: string;
  start: string;
  startTime: string;
  end: string;
  endTime: string;
  openEnded: boolean;
};

type ChartEvent = { id: string; label: string; time: number };
type ComparisonTarget = { kind: "event"; event: ChartEvent } | { kind: "period"; period: Period };

type DerivedSelection = {
  kind: "derived";
  id: string;
  target: ComparisonTarget;
  direction: ComparisonDirection;
  days: number | null;
};

type ActiveSelection = DerivedSelection | { kind: "period"; id: string; period: Period };

type Suggestion =
  | { id: string; kind: "duration"; days: number; title: string; detail: string }
  | { id: string; kind: "keyword"; direction: ComparisonDirection; title: string; detail: string }
  | { id: string; kind: "period"; role: "standalone" | "target"; period: Period; direction: ComparisonDirection | null; days: number | null; title: string; detail: string }
  | { id: string; kind: "event"; event: ChartEvent; direction: ComparisonDirection | null; days: number | null; title: string; detail: string };

function displayDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? `${match[3]}.${match[2]}.${match[1]}` : value;
}

function displayEventTime(time: number): string {
  const date = new Date(time);
  return `${String(date.getUTCDate()).padStart(2, "0")}.${String(date.getUTCMonth() + 1).padStart(2, "0")}.${date.getUTCFullYear()} · ${String(date.getUTCHours()).padStart(2, "0")}:${String(date.getUTCMinutes()).padStart(2, "0")}`;
}

function boundedDays(value: number): number {
  return Number.isFinite(value) ? Math.min(3650, Math.max(1, Math.round(value))) : 14;
}

export function ComparisonManager({
  periods,
  events,
  selections,
  colors,
  onSelectPeriod,
  onRemoveSelection,
  onCreateRelativeComparison,
}: {
  periods: Period[];
  events: ChartEvent[];
  selections: ActiveSelection[];
  colors: string[];
  onSelectPeriod: (id: string) => void;
  onRemoveSelection: (id: string) => void;
  onCreateRelativeComparison: (target: ComparisonTarget, direction: ComparisonDirection, days: number | null, replacement?: { id: string; index: number }) => void;
}) {
  const [query, setQuery] = useState("");
  const [draftDays, setDraftDays] = useState<number | null>(null);
  const [draftDirection, setDraftDirection] = useState<ComparisonDirection | null>(null);
  const [draftTarget, setDraftTarget] = useState<ComparisonTarget | null>(null);
  const [draftReplacement, setDraftReplacement] = useState<{ id: string; index: number } | null>(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const parsed = parseComparisonQuery(query);
  const selectedPeriodIds = selections.flatMap((selection) => selection.kind === "period" ? [selection.id] : []);
  const selectionCount = selections.length;
  const hasDraft = draftDays !== null || draftDirection !== null || draftTarget !== null;
  const atLimit = selectionCount >= colors.length && draftReplacement === null;

  const suggestions = useMemo(() => {
    const value = query.trim().toLowerCase();
    const results: Suggestion[] = [];
    const duration = /^(?:range:\s*)?(\d+)\s*d(?:ays?)?$/i.exec(value);
    const wholePhrase = !hasDraft && parsed.direction !== null && parsed.subject.length > 0;

    if (duration && draftDays === null) {
      const days = boundedDays(Number(duration[1]));
      results.push({ id: `duration:${days}`, kind: "duration", days, title: `${days}d`, detail: "Set the comparison range" });
    }

    if (draftDirection === null && !wholePhrase) {
      for (const direction of ["before", "after"] as ComparisonDirection[]) {
        if (!value || direction.startsWith(value)) {
          results.push({ id: `keyword:${direction}`, kind: "keyword", direction, title: `${direction}:`, detail: "Choose an annotation or saved period" });
        }
      }
    }

    const availablePeriods = !hasDraft && !wholePhrase
      ? periods.filter((period) => !selectedPeriodIds.includes(period.id) && (!value || period.label.toLowerCase().includes(value)))
      : [];
    const exactPeriods = availablePeriods.filter((period) => period.label.toLowerCase() === value);
    const otherPeriods = availablePeriods.filter((period) => period.label.toLowerCase() !== value);
    for (const period of [...exactPeriods, ...otherPeriods]) {
      results.push({
        id: `period:${period.id}`,
        kind: "period",
        role: "standalone",
        period,
        direction: null,
        days: null,
        title: period.label,
        detail: `${displayDate(period.start)} – ${period.openEnded ? "Present" : displayDate(period.end)}`,
      });
    }

    if (draftTarget === null && !duration) {
      const targetQuery = wholePhrase ? parsed.subject.toLowerCase() : value;
      const effectiveDirection = wholePhrase ? parsed.direction : draftDirection;
      const effectiveDays = wholePhrase ? (parsed.explicitDays ? parsed.days : null) : draftDays;
      if (effectiveDirection) {
        const matchingPeriods = periods.filter((period) => (!targetQuery || period.label.toLowerCase().includes(targetQuery))
          && (effectiveDirection === "before" || !period.openEnded));
        for (const period of matchingPeriods) {
          results.push({
            id: `period-target:${effectiveDays ?? "draft"}:${effectiveDirection}:${period.id}`,
            kind: "period",
            role: "target",
            period,
            direction: effectiveDirection,
            days: effectiveDays,
            title: period.label,
            detail: effectiveDirection === "before"
              ? `${effectiveDays === null ? "All data" : `${effectiveDays}d`} before its start · ${displayDate(period.start)}`
              : `${effectiveDays === null ? "All data" : `${effectiveDays}d`} after its end · ${displayDate(period.end)}`,
          });
        }
      }
      const matchingEvents = events.filter((event) => !targetQuery || event.label.toLowerCase().includes(targetQuery));
      for (const event of matchingEvents) {
        results.push({
          id: `event:${effectiveDays ?? "draft"}:${effectiveDirection ?? "draft"}:${event.id}`,
          kind: "event",
          event,
          direction: effectiveDirection,
          days: effectiveDays,
          title: event.label,
          detail: effectiveDirection
            ? `${displayEventTime(event.time)} · ${effectiveDays === null ? "All data" : `${effectiveDays}d`} ${effectiveDirection}`
            : `${displayEventTime(event.time)} · Add before or after to use this annotation`,
        });
      }
    }

    return results.slice(0, 10);
  }, [draftDays, draftDirection, draftTarget, events, hasDraft, parsed.days, parsed.direction, parsed.explicitDays, parsed.subject, periods, query, selectedPeriodIds]);

  useEffect(() => {
    if (draftTarget?.kind === "event" && !events.some((event) => event.id === draftTarget.event.id)) setDraftTarget(null);
    if (draftTarget?.kind === "period" && !periods.some((period) => period.id === draftTarget.period.id)) setDraftTarget(null);
  }, [draftTarget, events, periods]);

  useEffect(() => {
    if (draftReplacement && draftDays === null && draftDirection === null && draftTarget === null) {
      onRemoveSelection(draftReplacement.id);
      setDraftReplacement(null);
    }
  }, [draftDays, draftDirection, draftReplacement, draftTarget, onRemoveSelection]);

  useEffect(() => {
    if (!open || activeIndex < 0 || !suggestions[activeIndex]) return;
    document.getElementById(`comparison-suggestion-${suggestions[activeIndex].id}`)?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, open, suggestions]);

  function resetDraft() {
    setDraftDays(null);
    setDraftDirection(null);
    setDraftTarget(null);
    setDraftReplacement(null);
    setQuery("");
    setActiveIndex(-1);
  }

  function keepComposing() {
    setOpen(true);
    setActiveIndex(0);
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  function applyDraft(days: number | null, direction: ComparisonDirection | null, target: ComparisonTarget | null) {
    if (direction && target) {
      onCreateRelativeComparison(target, direction, days, draftReplacement ?? undefined);
      resetDraft();
    } else {
      setDraftDays(days);
      setDraftDirection(direction);
      setDraftTarget(target);
      setQuery("");
    }
    keepComposing();
  }

  function choose(suggestion: Suggestion) {
    if (suggestion.kind === "duration") {
      applyDraft(suggestion.days, draftDirection, draftTarget);
      return;
    }
    if (suggestion.kind === "keyword") {
      applyDraft(draftDays, suggestion.direction, draftTarget);
      return;
    }
    if (suggestion.kind === "period") {
      if (suggestion.role === "target") {
        applyDraft(suggestion.days ?? draftDays, suggestion.direction ?? draftDirection, { kind: "period", period: suggestion.period });
        return;
      }
      onSelectPeriod(suggestion.period.id);
      resetDraft();
      keepComposing();
      return;
    }
    applyDraft(suggestion.days ?? draftDays, suggestion.direction ?? draftDirection, { kind: "event", event: suggestion.event });
  }

  function editDerivedToken(selection: DerivedSelection, token: "days" | "direction" | "target", index: number) {
    if (hasDraft) {
      keepComposing();
      return;
    }
    if (token === "days") {
      onCreateRelativeComparison(selection.target, selection.direction, null, { id: selection.id, index });
      resetDraft();
      keepComposing();
      return;
    }
    setDraftReplacement({ id: selection.id, index });
    setDraftDays(selection.days);
    setDraftDirection(token === "direction" ? null : selection.direction);
    setDraftTarget(token === "target" ? null : selection.target);
    setQuery("");
    keepComposing();
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((current) => Math.min(current + 1, suggestions.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((current) => current < 0 ? suggestions.length - 1 : Math.max(0, current - 1));
    } else if ((event.key === "Enter" || event.key === " ") && suggestions[activeIndex >= 0 ? activeIndex : query.trim() ? 0 : -1]) {
      event.preventDefault();
      choose(suggestions[activeIndex >= 0 ? activeIndex : 0]);
    } else if (event.key === " " && !query.trim()) {
      event.preventDefault();
    } else if (event.key === "Backspace" && !query) {
      if (draftTarget) setDraftTarget(null);
      else if (draftDirection) setDraftDirection(null);
      else if (draftDays !== null) setDraftDays(null);
      else if (selections.at(-1)?.kind === "derived") editDerivedToken(selections.at(-1) as DerivedSelection, "target", selections.length - 1);
      else if (selections.at(-1)) onRemoveSelection(selections.at(-1)!.id);
    } else if (event.key === "Escape") {
      setOpen(false);
      setActiveIndex(-1);
    }
  }

  const tokenEvents = {
    onMouseDown: (event: MouseEvent<HTMLButtonElement>) => event.preventDefault(),
  };

  return (
    <section className={`comparison-composer${open ? " comparison-composer--open" : ""}`} aria-label="Comparison periods">
      <div className="comparison-query">
        <svg className="comparison-query__search-icon" viewBox="0 0 20 20" aria-hidden="true"><circle cx="8.5" cy="8.5" r="5.25" /><path d="m12.5 12.5 4 4" /></svg>
        <div className="comparison-query__tokens" onClick={() => inputRef.current?.focus()}>
          {selections.map((selection, index) => {
            if (selection.id === draftReplacement?.id) return null;
            const color = colors[index % colors.length];
            if (selection.kind === "period") return <button
              className="comparison-token comparison-token--period"
              key={selection.id}
              type="button"
              style={{ color }}
              title={`${displayDate(selection.period.start)} – ${selection.period.openEnded ? "Present" : displayDate(selection.period.end)} · Click to remove`}
              aria-label={`Remove ${selection.period.label} from comparison`}
              {...tokenEvents}
              onClick={(event) => { event.stopPropagation(); onRemoveSelection(selection.id); keepComposing(); }}
            ><span>{selection.period.label}</span></button>;
            const targetLabel = selection.target.kind === "event" ? selection.target.event.label : selection.target.period.label;
            const targetType = selection.target.kind === "event" ? "annotation" : "period";
            return <Fragment key={selection.id}>
              {selection.days !== null && <span className="comparison-clause">
                <span className="comparison-syntax-keyword">range:</span>
                <button className="comparison-token comparison-token--period" type="button" style={{ color }} aria-disabled={hasDraft} aria-label={`Remove ${selection.days} day duration`} title={hasDraft ? "Finish the current comparison first" : "Click to remove only the duration"} {...tokenEvents} onClick={(event) => { event.stopPropagation(); editDerivedToken(selection, "days", index); }}><span>{selection.days}d</span></button>
              </span>}
              <span className="comparison-clause">
                <button className="comparison-token comparison-token--keyword" type="button" aria-disabled={hasDraft} aria-label={`Remove ${selection.direction}`} title={hasDraft ? "Finish the current comparison first" : `Click to remove only ${selection.direction}`} {...tokenEvents} onClick={(event) => { event.stopPropagation(); editDerivedToken(selection, "direction", index); }}><span>{selection.direction}:</span></button>
                <button className="comparison-token comparison-token--period" type="button" style={{ color }} aria-disabled={hasDraft} aria-label={`Remove ${targetLabel} ${targetType}`} title={hasDraft ? "Finish the current comparison first" : `Click to remove only the ${targetType}`} {...tokenEvents} onClick={(event) => { event.stopPropagation(); editDerivedToken(selection, "target", index); }}><span>{targetLabel}</span></button>
              </span>
            </Fragment>;
          })}
          {draftDays !== null && <span className="comparison-clause">
            <span className="comparison-syntax-keyword">range:</span>
            <button className="comparison-token comparison-token--draft" type="button" aria-label="Remove duration" title="Click to remove only the duration" {...tokenEvents} onClick={(event) => { event.stopPropagation(); setDraftDays(null); keepComposing(); }}><span>{draftDays}d</span></button>
          </span>}
          {(draftDirection || draftTarget) && <span className="comparison-clause">
            {draftDirection && <button className="comparison-token comparison-token--keyword" type="button" aria-label={`Remove ${draftDirection}`} title={`Click to remove only ${draftDirection}`} {...tokenEvents} onClick={(event) => { event.stopPropagation(); setDraftDirection(null); keepComposing(); }}><span>{draftDirection}:</span></button>}
            {draftTarget && <button className="comparison-token comparison-token--draft" type="button" aria-label={`Remove ${draftTarget.kind === "event" ? draftTarget.event.label : draftTarget.period.label}`} title="Click to remove only the target" {...tokenEvents} onClick={(event) => { event.stopPropagation(); setDraftTarget(null); keepComposing(); }}><span>{draftTarget.kind === "event" ? draftTarget.event.label : draftTarget.period.label}</span></button>}
          </span>}
          <input
            ref={inputRef}
            role="combobox"
            aria-label="Add comparison periods"
            aria-expanded={open}
            aria-autocomplete="list"
            aria-controls="comparison-suggestions"
            aria-activedescendant={open && activeIndex >= 0 && suggestions[activeIndex] ? `comparison-suggestion-${suggestions[activeIndex].id}` : undefined}
            autoComplete="off"
            readOnly={atLimit}
            placeholder={atLimit ? "Remove a comparison to add another" : selectionCount || hasDraft ? "Add another…" : "Add a period, or type 14d then before/after…"}
            value={query}
            onFocus={() => { setOpen(true); setActiveIndex(0); }}
            onBlur={() => window.setTimeout(() => setOpen(false), 120)}
            onChange={(event) => { setQuery(event.target.value); setOpen(true); setActiveIndex(0); }}
            onKeyDown={onKeyDown}
          />
        </div>
      </div>

      {open && !atLimit && <div className="comparison-query__menu" id="comparison-suggestions" role="listbox">
        {suggestions.length ? suggestions.map((suggestion, index) => (
          <button
            id={`comparison-suggestion-${suggestion.id}`}
            key={suggestion.id}
            type="button"
            role="option"
            tabIndex={-1}
            aria-selected={index === activeIndex}
            className={index === activeIndex ? "comparison-query__option--active" : ""}
            onMouseDown={(event) => event.preventDefault()}
            onMouseEnter={() => setActiveIndex(index)}
            onClick={() => choose(suggestion)}
          >
            <span className={`comparison-query__kind comparison-query__kind--${suggestion.kind}`} aria-hidden="true">{suggestion.kind === "duration" ? "#" : suggestion.kind === "keyword" ? "⌘" : suggestion.kind === "event" ? "◆" : "●"}</span>
            <span><strong>{suggestion.title}</strong><small>{suggestion.detail}</small></span>
            <kbd>Space</kbd>
          </button>
        )) : <div className="comparison-query__empty">No matching periods or annotations</div>}
      </div>}
    </section>
  );
}
