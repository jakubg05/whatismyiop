import { useEffect, useRef, useState } from "react";
import {
  acceptCompletion,
  autocompletion,
  closeCompletion,
  completionStatus,
  pickedCompletion,
  selectedCompletionIndex,
  setSelectedCompletion,
  startCompletion,
  type Completion,
  type CompletionContext,
  type CompletionResult,
  type CompletionSection,
} from "@codemirror/autocomplete";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { EditorSelection, EditorState, StateEffect, Transaction } from "@codemirror/state";
import { Decoration, EditorView, ViewPlugin, keymap, type DecorationSet, type ViewUpdate } from "@codemirror/view";
import {
  canonicalizeComparisonExpression,
  comparisonCompletionContext,
  parseComparisonExpression,
  type ComparisonCatalog,
  type ComparisonCompletion,
} from "./comparison";
import { MaterialSymbol, materialSymbolPath, type MaterialSymbolName } from "./MaterialSymbol";
import { eventPalette, periodPalette } from "./periodPalette";

type Explanation = { visible: boolean; left: number; message: string };
type ComparisonVisualCompletion = Completion & { comparisonColor?: string };
export type ComparisonValuePreview = { kind: "period" | "event"; label: string };
const defaultValueCompletionSection: CompletionSection = {
  name: "Values",
  rank: 1,
  header: () => {
    const separator = document.createElement("li");
    separator.className = "comparison-completion__separator";
    separator.setAttribute("aria-hidden", "true");
    return separator;
  },
};
const catalogChanged = StateEffect.define<void>();

function materialCompletionIcon(completion: Completion): Node | null {
  if ((completion.type === "period" || completion.type === "event") && completion.label !== "now") {
    const marker = document.createElement("span");
    marker.className = `comparison-completion__icon comparison-completion__marker comparison-completion__marker--${completion.type}`;
    marker.style.backgroundColor = (completion as ComparisonVisualCompletion).comparisonColor ?? "currentColor";
    return marker;
  }
  const icon: MaterialSymbolName | null = completion.label === "now"
    ? "pin_history"
    : completion.label === "range:"
      ? "arrow_range"
      : completion.label === "before:"
        ? "line_start_square"
        : completion.label === "after:"
          ? "line_end_square"
          : completion.type === "delimiter"
            ? "add_circle"
            : null;
  if (!icon) return null;
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", "comparison-completion__icon");
  svg.setAttribute("viewBox", "0 -960 960 960");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", materialSymbolPath(icon));
  svg.append(path);
  return svg;
}

function materialCompletionSupportingText(completion: Completion): HTMLSpanElement | null {
  if ((completion.type !== "period" && completion.type !== "event") || !completion.detail) return null;
  const supportingText = document.createElement("span");
  supportingText.className = "comparison-completion__supporting";
  supportingText.textContent = completion.detail;
  supportingText.dataset.comparisonPreviewKind = completion.type;
  supportingText.dataset.comparisonPreviewLabel = completion.label;
  return supportingText;
}

function comparisonPreviewFromTarget(target: EventTarget | null): ComparisonValuePreview | null {
  if (!(target instanceof Element)) return null;
  const preview = target.closest("li")?.querySelector<HTMLElement>("[data-comparison-preview-kind]");
  const kind = preview?.dataset.comparisonPreviewKind;
  const label = preview?.dataset.comparisonPreviewLabel;
  return (kind === "period" || kind === "event") && label ? { kind, label } : null;
}

function minimalChange(before: string, after: string) {
  let from = 0;
  while (from < before.length && from < after.length && before[from] === after[from]) from += 1;
  let beforeTo = before.length;
  let afterTo = after.length;
  while (beforeTo > from && afterTo > from && before[beforeTo - 1] === after[afterTo - 1]) {
    beforeTo -= 1;
    afterTo -= 1;
  }
  return { from, to: beforeTo, insert: after.slice(from, afterTo) };
}

function fuzzyMatch(candidate: string, query: string): boolean {
  const target = candidate.toLocaleLowerCase();
  const needle = query.toLocaleLowerCase().replace(/\s+/g, "");
  let position = 0;
  for (const character of needle) {
    position = target.indexOf(character, position);
    if (position < 0) return false;
    position += 1;
  }
  return true;
}

function noMatchMessage(expected: ReturnType<typeof comparisonCompletionContext>["expected"]): string {
  if (expected === "duration") return "Expected a whole-day duration such as 14d";
  if (expected === "target-value") return "No matching period or event";
  if (expected === "and") return "Expected AND";
  if (expected === "direction") return "Expected before: or after:";
  if (expected === "maximum") return "Six comparison segments are already shown";
  return "Expected a comparison keyword";
}

function expectedStateLabel(expected: ReturnType<typeof comparisonCompletionContext>["expected"]): string {
  if (expected === "segment-start") return "comparison keyword or saved period";
  if (expected === "duration") return "whole-day duration";
  if (expected === "direction") return "before or after";
  if (expected === "target-value") return "period or event name";
  if (expected === "and") return "AND";
  return "six-segment limit";
}

function editorCanonicalText(text: string, catalog: ComparisonCatalog, preserveTrailingSeparator: boolean): string {
  const formatted = canonicalizeComparisonExpression(text, catalog);
  if (!preserveTrailingSeparator || !/\s$/.test(text)) return formatted;
  const parsed = parseComparisonExpression(text, catalog);
  const lastToken = parsed.tokens.at(-1);
  return lastToken?.role === "duration"
    || lastToken?.role === "direct-period-value"
    || lastToken?.role === "period-value"
    || lastToken?.role === "event-value"
    || lastToken?.role === "and"
    ? `${formatted} `
    : formatted;
}

function mapFormattingPosition(before: string, after: string, position: number, catalog: ComparisonCatalog): number {
  const beforeParsed = parseComparisonExpression(before, catalog);
  const afterParsed = parseComparisonExpression(after, catalog);
  const tokenIndex = beforeParsed.tokens.findIndex((token) => position >= token.from && position <= token.to);
  if (tokenIndex >= 0 && afterParsed.tokens[tokenIndex]) {
    const beforeToken = beforeParsed.tokens[tokenIndex];
    const afterToken = afterParsed.tokens[tokenIndex];
    const offset = Math.max(0, position - beforeToken.from);
    return afterToken.from + Math.min(offset, afterToken.to - afterToken.from);
  }
  if (beforeParsed.inactiveFrom !== null && position >= beforeParsed.inactiveFrom && afterParsed.inactiveFrom !== null) {
    return Math.min(after.length, afterParsed.inactiveFrom + position - beforeParsed.inactiveFrom);
  }
  let previousIndex = -1;
  for (let index = 0; index < beforeParsed.tokens.length; index += 1) {
    if (beforeParsed.tokens[index].to <= position) previousIndex = index;
  }
  if (previousIndex >= 0 && afterParsed.tokens[previousIndex]) {
    const gapOffset = position - beforeParsed.tokens[previousIndex].to;
    return Math.min(after.length, afterParsed.tokens[previousIndex].to + Math.max(0, gapOffset));
  }
  return Math.min(position, after.length);
}

function insertionFor(option: ComparisonCompletion, view: EditorView, from: number, catalog: ComparisonCatalog): string {
  if (option.label === "AND") return `${from > 0 && !/\s/.test(view.state.doc.sliceString(from - 1, from)) ? " " : ""}AND `;
  if (option.type === "duration") return `${option.label} `;
  if (option.type === "keyword") {
    const previous = [...parseComparisonExpression(view.state.doc.toString(), catalog).tokens].reverse().find((token) => token.to === from);
    if (previous?.role === "duration" || previous?.role === "and") return ` ${option.label}`;
  }
  return option.label;
}

function acceptFirstCompletion(view: EditorView): boolean {
  if (completionStatus(view.state) !== "active") return false;
  const selected = selectedCompletionIndex(view.state);
  if (selected === null) view.dispatch({ effects: setSelectedCompletion(0) });
  return acceptCompletion(view);
}

function startCompletionWhenFocused(view: EditorView): void {
  window.setTimeout(() => {
    if (view.hasFocus) startCompletion(view);
  }, 0);
}

export function ComparisonExpressionEditor({
  catalog,
  value,
  onChange,
  onPreviewChange,
}: {
  catalog: ComparisonCatalog;
  value: string;
  onChange: (value: string) => void;
  onPreviewChange?: (preview: ComparisonValuePreview | null) => void;
}) {
  const composer = useRef<HTMLDivElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const catalogRef = useRef(catalog);
  const onChangeRef = useRef(onChange);
  const onPreviewChangeRef = useRef(onPreviewChange);
  const [focused, setFocused] = useState(false);
  const [needsMoreSpace, setNeedsMoreSpace] = useState(false);
  const [explanation, setExplanation] = useState<Explanation>({ visible: false, left: 0, message: "" });
  const [liveStatus, setLiveStatus] = useState("");
  catalogRef.current = catalog;
  onChangeRef.current = onChange;
  onPreviewChangeRef.current = onPreviewChange;
  const active = focused || value.length > 0;

  useEffect(() => {
    if (!host.current) return;

    let widthFrame = 0;
    let hoveredPreviewKey = "";
    const updatePreview = (preview: ComparisonValuePreview | null) => {
      const key = preview ? `${preview.kind}:${preview.label}` : "";
      if (key === hoveredPreviewKey) return;
      hoveredPreviewKey = key;
      onPreviewChangeRef.current?.(preview);
    };
    const updateEditorWidth = (view: EditorView) => {
      window.cancelAnimationFrame(widthFrame);
      widthFrame = window.requestAnimationFrame(() => {
        const root = composer.current;
        const editor = host.current;
        const start = view.coordsAtPos(0);
        const end = view.coordsAtPos(view.state.doc.length);
        if (!root || !editor || !start || !end) return;

        const rootFontSize = Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
        const compactWidth = 38 * rootFontSize;
        const availableWidth = Math.min(compactWidth, root.parentElement?.clientWidth ?? compactWidth);
        const chromeWidth = root.getBoundingClientRect().width - editor.getBoundingClientRect().width;
        const contentWidth = Math.max(0, end.right - start.left);
        setNeedsMoreSpace(contentWidth > availableWidth - chromeWidth);
      });
    };

    const updateExplanation = (view: EditorView) => {
      const position = view.state.selection.main.head;
      const context = comparisonCompletionContext(view.state.doc.toString(), position, catalogRef.current);
      const query = view.state.doc.sliceString(context.from, position).replace(/\s/g, "");
      const matchingOptions = context.options.filter((option) => fuzzyMatch(option.label, query));
      const hasMatch = matchingOptions.length > 0;
      const shouldExplain = view.hasFocus && (context.options.length === 0 || (!hasMatch && query.length > 0));
      const root = composer.current?.getBoundingClientRect();
      const token = view.coordsAtPos(context.from);
      const popupWidth = Math.min(288, Math.max(0, window.innerWidth - 32));
      const desiredLeft = Math.max(0, (token?.left ?? root?.left ?? 0) - (root?.left ?? 0));
      const documentState = parseComparisonExpression(view.state.doc.toString(), catalogRef.current);
      setExplanation({
        visible: shouldExplain,
        left: Math.min(desiredLeft, Math.max(0, (root?.width ?? popupWidth) - popupWidth)),
        message: !hasMatch && query.length > 0 ? noMatchMessage(context.expected) : context.message,
      });
      setLiveStatus(`${documentState.segments.length} comparison segment${documentState.segments.length === 1 ? "" : "s"}. ${matchingOptions.length} suggestion${matchingOptions.length === 1 ? "" : "s"} available. Expected ${expectedStateLabel(context.expected)}. ${documentState.maximumReached ? "Six-segment limit reached. " : ""}${documentState.inactiveFrom === null ? "" : "Inactive text follows the valid expression."}`);
    };

    const applyOption = (view: EditorView, option: ComparisonCompletion, completion: Completion, from: number, to: number) => {
      updatePreview(null);
      const insert = insertionFor(option, view, from, catalogRef.current);
      view.dispatch({
        changes: { from, to, insert },
        selection: { anchor: from + insert.length },
        annotations: [Transaction.userEvent.of("input.complete"), pickedCompletion.of(completion)],
        scrollIntoView: true,
      });
      startCompletionWhenFocused(view);
    };

    const source = (context: CompletionContext): CompletionResult | null => {
      const domain = comparisonCompletionContext(context.state.doc.toString(), context.pos, catalogRef.current);
      if (domain.options.length === 0) return null;
      const query = context.state.doc.sliceString(domain.from, context.pos).replace(/\s/g, "");
      return {
        from: domain.from,
        to: domain.to,
        // Preserve the grammar's keyword-first order only for the untouched menu.
        // Once the user types, CodeMirror scores every keyword and value together.
        filter: query.length === 0 ? false : undefined,
        options: domain.options.map((option): Completion => {
          const catalog = catalogRef.current;
          const periodIndex = option.type === "period" ? catalog.periods.findIndex((period) => period.label === option.label) : -1;
          const eventIndex = option.type === "event"
            ? option.label === "now"
              ? catalog.events.length
              : catalog.events.findIndex((event) => event.label === option.label)
            : -1;
          const completion: ComparisonVisualCompletion = {
            label: option.label,
            detail: option.type === "period" || option.type === "event" ? option.detail : undefined,
            type: option.type,
            comparisonColor: periodIndex >= 0
              ? periodPalette(periodIndex).stroke
              : eventIndex >= 0 ? eventPalette(eventIndex) : undefined,
            section: query.length === 0 && domain.expected === "segment-start" && option.type === "period"
              ? defaultValueCompletionSection
              : undefined,
          };
          completion.apply = (view, selected, from, to) => applyOption(view, option, selected, from, to);
          return completion;
        }),
      };
    };

    const syntax = ViewPlugin.fromClass(class {
      decorations: DecorationSet;
      constructor(view: EditorView) {
        this.decorations = this.build(view);
      }
      update(update: ViewUpdate) {
        if (update.docChanged || update.transactions.some((transaction) => transaction.effects.some((effect) => effect.is(catalogChanged)))) {
          this.decorations = this.build(update.view);
        }
      }
      build(view: EditorView): DecorationSet {
        const result = parseComparisonExpression(view.state.doc.toString(), catalogRef.current);
        return Decoration.set(result.tokens.map((token) => Decoration.mark({ class: `comparison-expression__${token.style}` }).range(token.from, token.to)), true);
      }
    }, { decorations: (plugin) => plugin.decorations });

    const exactInput = EditorView.inputHandler.of((view, from, to, input) => {
      if (input !== " " && input !== ":") return false;
      const text = view.state.doc.toString();
      const domain = comparisonCompletionContext(text, from, catalogRef.current);
      const partial = text.slice(domain.from, from).replace(/\s/g, "").toLocaleLowerCase();
      const exact = domain.options.find((option) => {
        const label = option.label.toLocaleLowerCase();
        return partial === label || partial === label.replace(/:$/, "");
      });
      if (exact) {
        const completion: Completion = { label: exact.label, type: exact.type };
        applyOption(view, exact, completion, domain.from, to);
        return true;
      }
      const previous = [...parseComparisonExpression(text, catalogRef.current).tokens].reverse().find((token) => token.to === from);
      if (previous && (previous.role === "period-value" || previous.role === "event-value")) {
        const insert = `${previous.canonical} `;
        view.dispatch({
          changes: { from: previous.from, to: previous.to, insert },
          selection: { anchor: previous.from + insert.length },
          annotations: Transaction.userEvent.of("input.complete"),
          scrollIntoView: true,
        });
        startCompletionWhenFocused(view);
        return true;
      }
      if (previous && (previous.role === "duration" || previous.role === "and") && !/\s/.test(text[from] ?? "")) {
        view.dispatch({
          changes: { from, to, insert: " " },
          selection: { anchor: from + 1 },
          annotations: Transaction.userEvent.of("input.complete"),
          scrollIntoView: true,
        });
        startCompletionWhenFocused(view);
        return true;
      }
      return false;
    });

    const canonicalTransactions = EditorState.transactionFilter.of((transaction) => {
      if (!transaction.docChanged) return transaction;
      const oldText = transaction.startState.doc.toString();
      const nextText = transaction.newDoc.toString();
      const oldParsed = parseComparisonExpression(oldText, catalogRef.current);
      const nextParsed = parseComparisonExpression(nextText, catalogRef.current);
      const repaired = oldParsed.inactiveFrom !== null
        && (nextParsed.inactiveFrom === null
          || nextParsed.tokens.length > oldParsed.tokens.length
          || nextParsed.segments.length > oldParsed.segments.length);
      const completed = transaction.isUserEvent("input.complete");
      const shouldFormat = completed || transaction.isUserEvent("input.paste") || repaired || /[\r\n]/.test(nextText);
      if (!shouldFormat) return transaction;
      const formatted = editorCanonicalText(nextText, catalogRef.current, completed);
      if (formatted === nextText) return transaction;
      const selection = EditorSelection.create(transaction.newSelection.ranges.map((range) => EditorSelection.range(
        mapFormattingPosition(nextText, formatted, range.anchor, catalogRef.current),
        mapFormattingPosition(nextText, formatted, range.head, catalogRef.current),
      )), transaction.newSelection.mainIndex);
      return [transaction, { changes: minimalChange(nextText, formatted), selection, sequential: true }];
    });

    const state = EditorState.create({
      doc: value,
      extensions: [
        history(),
        keymap.of([
          { key: "Tab", run: acceptFirstCompletion },
          { key: "Enter", run: (view) => completionStatus(view.state) === "active" ? acceptFirstCompletion(view) : true },
          { key: "Shift-Enter", run: () => true },
          ...defaultKeymap,
          ...historyKeymap,
        ]),
        autocompletion({
          override: [source],
          activateOnTyping: true,
          selectOnOpen: false,
          icons: false,
          maxRenderedOptions: 12,
          interactionDelay: 0,
          addToOptions: [
            { render: materialCompletionIcon, position: 20 },
            { render: materialCompletionSupportingText, position: 80 },
          ],
        }),
        syntax,
        exactInput,
        canonicalTransactions,
        EditorView.contentAttributes.of({ "aria-label": "Comparison expressions", "aria-multiline": "false", spellcheck: "false" }),
        EditorView.theme({
          "&": { height: "100%" },
          ".cm-scroller": { overflowX: "auto", overflowY: "hidden" },
          ".cm-content": { whiteSpace: "pre", minWidth: "max-content" },
        }),
        EditorView.domEventHandlers({
          focus: (_event, view) => {
            setFocused(true);
            updateExplanation(view);
            startCompletionWhenFocused(view);
            return false;
          },
          blur: (_event, view) => {
            updatePreview(null);
            setFocused(false);
            setExplanation((current) => ({ ...current, visible: false }));
            closeCompletion(view);
            const before = view.state.doc.toString();
            const formatted = canonicalizeComparisonExpression(before, catalogRef.current);
            if (formatted !== before) view.dispatch({ changes: minimalChange(before, formatted), annotations: Transaction.addToHistory.of(false) });
            return false;
          },
        }),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) onChangeRef.current(update.state.doc.toString());
          if (update.docChanged || completionStatus(update.state) !== "active") updatePreview(null);
          if (update.docChanged || update.geometryChanged) updateEditorWidth(update.view);
          if (update.docChanged || update.selectionSet || update.focusChanged) updateExplanation(update.view);
          if (update.selectionSet && update.view.hasFocus) startCompletionWhenFocused(update.view);
        }),
      ],
    });
    const view = new EditorView({ state, parent: host.current });
    viewRef.current = view;
    const handleDocumentPointerDown = (event: PointerEvent) => {
      const root = composer.current;
      if (!root || root.contains(event.target as Node)) return;
      updatePreview(null);
      closeCompletion(view);
      view.contentDOM.blur();
      setFocused(false);
      setExplanation((current) => ({ ...current, visible: false }));
    };
    const handlePointerOver = (event: PointerEvent) => updatePreview(comparisonPreviewFromTarget(event.target));
    const handlePointerOut = (event: PointerEvent) => {
      const from = comparisonPreviewFromTarget(event.target);
      const to = comparisonPreviewFromTarget(event.relatedTarget);
      if (from?.kind === to?.kind && from?.label === to?.label) return;
      updatePreview(to);
    };
    document.addEventListener("pointerdown", handleDocumentPointerDown);
    view.dom.addEventListener("pointerover", handlePointerOver);
    view.dom.addEventListener("pointerout", handlePointerOut);
    updateExplanation(view);
    updateEditorWidth(view);
    const resizeObserver = new ResizeObserver(() => updateEditorWidth(view));
    if (composer.current?.parentElement) resizeObserver.observe(composer.current.parentElement);
    return () => {
      window.cancelAnimationFrame(widthFrame);
      resizeObserver.disconnect();
      document.removeEventListener("pointerdown", handleDocumentPointerDown);
      view.dom.removeEventListener("pointerover", handlePointerOver);
      view.dom.removeEventListener("pointerout", handlePointerOut);
      updatePreview(null);
      viewRef.current = null;
      view.destroy();
    };
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({ effects: catalogChanged.of(undefined) });
  }, [catalog]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view || view.state.doc.toString() === value) return;
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value }, annotations: Transaction.addToHistory.of(false) });
  }, [value]);

  return (
    <div ref={composer} className={`comparison-composer${needsMoreSpace ? " comparison-composer--open" : ""}`}>
      <div className="comparison-expression">
        <MaterialSymbol className="comparison-expression__search-icon" name="search" />
        <div ref={host} className="comparison-expression__editor" />
        {!active && <span className="comparison-expression__placeholder" aria-hidden="true">Compare segments</span>}
        {value && <button
          className="comparison-expression__clear"
          type="button"
          aria-label="Clear comparison expressions"
          onClick={() => {
            const view = viewRef.current;
            if (!view) return;
            closeCompletion(view);
            view.contentDOM.blur();
            setFocused(false);
            setExplanation((current) => ({ ...current, visible: false }));
            view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: "" }, selection: { anchor: 0 }, annotations: Transaction.userEvent.of("delete") });
            closeCompletion(view);
          }}
        ><MaterialSymbol name="close" /></button>}
      </div>
      {explanation.visible && <div className="comparison-expression__explanation" style={{ left: explanation.left }} role="status">
        <div className="comparison-expression__message">{explanation.message}</div>
      </div>}
      <span className="visually-hidden" aria-live="polite">{liveStatus}</span>
    </div>
  );
}
