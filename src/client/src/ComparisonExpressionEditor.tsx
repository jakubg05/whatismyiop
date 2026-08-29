import { useEffect, useMemo, useRef, useState } from "react";
import {
  acceptCompletion,
  autocompletion,
  closeCompletion,
  completionStatus,
  pickedCompletion,
  startCompletion,
  type Completion,
  type CompletionContext,
  type CompletionResult,
} from "@codemirror/autocomplete";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { EditorState, StateEffect, Transaction } from "@codemirror/state";
import { Decoration, EditorView, ViewPlugin, keymap, placeholder, type DecorationSet, type ViewUpdate } from "@codemirror/view";
import {
  canonicalizeComparisonExpression,
  comparisonCompletionContext,
  parseComparisonExpression,
  type ComparisonCatalog,
  type ComparisonCompletion,
} from "./comparison";

type Explanation = { visible: boolean; left: number; message: string };
const catalogChanged = StateEffect.define<void>();

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

function insertionFor(option: ComparisonCompletion, view: EditorView, from: number, catalog: ComparisonCatalog): string {
  if (option.label === "AND") return `${from > 0 && !/\s/.test(view.state.doc.sliceString(from - 1, from)) ? " " : ""}AND `;
  if (option.type === "duration") return `${option.label} `;
  if (option.type === "keyword") {
    const previous = [...parseComparisonExpression(view.state.doc.toString(), catalog).tokens].reverse().find((token) => token.to === from);
    if (previous?.role === "duration" || previous?.role === "and") return ` ${option.label}`;
  }
  return option.label;
}

export function ComparisonExpressionEditor({
  catalog,
  value,
  onChange,
}: {
  catalog: ComparisonCatalog;
  value: string;
  onChange: (value: string) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const catalogRef = useRef(catalog);
  const onChangeRef = useRef(onChange);
  const [focused, setFocused] = useState(false);
  const [explanation, setExplanation] = useState<Explanation>({ visible: false, left: 0, message: "" });
  catalogRef.current = catalog;
  onChangeRef.current = onChange;
  const expanded = focused || value.length > 0;
  const parsed = useMemo(() => parseComparisonExpression(value, catalog), [catalog, value]);
  const liveStatus = `${parsed.segments.length} comparison segment${parsed.segments.length === 1 ? "" : "s"}. ${parsed.maximumReached ? "Six-segment limit reached. " : ""}${parsed.inactiveFrom === null ? "" : "Inactive text follows the valid expression. "}Expected ${parsed.expected}.`;

  useEffect(() => {
    if (!host.current) return;

    const updateExplanation = (view: EditorView) => {
      const position = view.state.selection.main.head;
      const context = comparisonCompletionContext(view.state.doc.toString(), position, catalogRef.current);
      const query = view.state.doc.sliceString(context.from, position).replace(/\s/g, "");
      const hasMatch = context.options.some((option) => fuzzyMatch(option.label, query));
      const shouldExplain = view.hasFocus && (context.options.length === 0 || (!hasMatch && query.length > 0));
      const root = host.current?.getBoundingClientRect();
      const token = view.coordsAtPos(context.from);
      setExplanation({
        visible: shouldExplain,
        left: Math.max(0, (token?.left ?? root?.left ?? 0) - (root?.left ?? 0)),
        message: context.message,
      });
    };

    const applyOption = (view: EditorView, option: ComparisonCompletion, completion: Completion, from: number, to: number) => {
      view.dispatch({
        changes: { from, to, insert: insertionFor(option, view, from, catalogRef.current) },
        annotations: [Transaction.userEvent.of("input.complete"), pickedCompletion.of(completion)],
        scrollIntoView: true,
      });
      window.setTimeout(() => startCompletion(view), 0);
    };

    const source = (context: CompletionContext): CompletionResult | null => {
      const domain = comparisonCompletionContext(context.state.doc.toString(), context.pos, catalogRef.current);
      if (domain.options.length === 0) return null;
      return {
        from: domain.from,
        to: domain.to,
        options: domain.options.map((option): Completion => {
          const completion: Completion = {
            label: option.label,
            detail: option.detail,
            type: option.type === "delimiter" ? "keyword" : option.type,
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
      if (previous && (previous.role === "duration" || previous.role === "and") && !/\s/.test(text[from] ?? "")) {
        view.dispatch({ changes: { from, to, insert: " " }, annotations: Transaction.userEvent.of("input.complete"), scrollIntoView: true });
        window.setTimeout(() => startCompletion(view), 0);
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
        && (nextParsed.tokens.length > oldParsed.tokens.length || nextParsed.segments.length > oldParsed.segments.length);
      const shouldFormat = transaction.isUserEvent("input.complete") || transaction.isUserEvent("input.paste") || repaired;
      if (!shouldFormat) return transaction;
      const formatted = canonicalizeComparisonExpression(nextText, catalogRef.current);
      if (formatted === nextText) return transaction;
      return [transaction, { changes: minimalChange(nextText, formatted), sequential: true }];
    });

    const state = EditorState.create({
      doc: value,
      extensions: [
        history(),
        keymap.of([
          { key: "Tab", run: acceptCompletion },
          { key: "Enter", run: (view) => completionStatus(view.state) === "active" ? acceptCompletion(view) : true },
          ...defaultKeymap,
          ...historyKeymap,
        ]),
        autocompletion({ override: [source], activateOnTyping: true, icons: false, maxRenderedOptions: 10, interactionDelay: 0 }),
        placeholder("Add a comparison segment…"),
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
          focus: (event, view) => {
            setFocused(true);
            updateExplanation(view);
            window.setTimeout(() => startCompletion(view), 0);
            return false;
          },
          blur: (_event, view) => {
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
          if (update.docChanged || update.selectionSet || update.focusChanged) updateExplanation(update.view);
          if (update.selectionSet && update.view.hasFocus) window.setTimeout(() => startCompletion(update.view), 0);
        }),
      ],
    });
    const view = new EditorView({ state, parent: host.current });
    viewRef.current = view;
    return () => {
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
    <div className={`comparison-composer${expanded ? " comparison-composer--open" : ""}`}>
      <div className="comparison-expression">
        <svg className="comparison-expression__search-icon" viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="4.5" /><path d="m10.5 10.5 3 3" /></svg>
        <div ref={host} className="comparison-expression__editor" />
        {value && <button
          className="comparison-expression__clear"
          type="button"
          aria-label="Clear comparison expressions"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            const view = viewRef.current;
            if (!view) return;
            view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: "" }, selection: { anchor: 0 }, annotations: Transaction.userEvent.of("delete") });
            view.focus();
            startCompletion(view);
          }}
        >×</button>}
      </div>
      {explanation.visible && <div className="comparison-expression__explanation" style={{ left: explanation.left }} role="status">{explanation.message}</div>}
      <span className="visually-hidden" aria-live="polite">{liveStatus}</span>
    </div>
  );
}
