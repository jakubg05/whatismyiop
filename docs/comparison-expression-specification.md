# Comparison Expression Specification

This document is the authoritative product and interaction specification for defining temporary Comparison Segments. It supersedes the existing comparison search implementation.

The implementation must remove the old comparison composer, parser, token widgets, persisted comparison state, and compatibility behavior before building this design. Do not adapt the old interaction model, preserve its state shape, add migrations, or retain dead fallback code.

Terminology is defined in [`CONTEXT.md`](../CONTEXT.md). The editor architecture is recorded in [`ADR 0001`](./adr/0001-use-codemirror-for-comparison-expressions.md).

## Purpose

The Comparison Expression is a temporary, single-line expression that defines up to six Comparison Segments. Each complete segment is displayed on the chronological main chart and contributes one series to the diurnal chart.

Comparison Segments are visualization state only. They never create, edit, or persist a Persistent Period or Annotation.

## Canonical grammar

```text
expression     = segment (" AND " segment){0,5}

segment        = direct-period | relative-segment
direct-period  = period-label

relative-segment = ["range:" duration " "] direction ":" target-label
direction        = "before" | "after"
duration         = positive-day-count "d"
```

Canonical examples:

```text
Baseline
before:Xalatan
after:PostOp
range:14d before:Xalatan
range:30d after:Treatment
Baseline AND range:14d before:Xalatan AND FollowUp
```

Rules:

- Keywords are lowercase and include their colon: `range:`, `before:`, and `after:`.
- `AND` is always uppercase.
- A Persistent Period may be used directly by its label.
- An Annotation cannot define a segment directly because it has no duration. It must be targeted through `before:` or `after:`.
- `after:` is unavailable for an open-ended Persistent Period.
- Exact duplicate segments are allowed.

## Duration grammar

A duration is valid only when it:

- matches `[1-9][0-9]*d` exactly;
- is no greater than `36500d`; and
- contains no sign, decimal point, alternative unit, or leading zero.

Examples:

| Text | Valid |
|---|---:|
| `1d` | Yes |
| `14d` | Yes |
| `36500d` | Yes |
| `0d` | No |
| `014d` | No |
| `1.5d` | No |
| `12h` | No |
| `36501d` | No |

The duration dropdown initially recommends `7d`, `14d`, `30d`, and `90d`. A user may type and accept any other valid duration.

## Parser model

The document is ordinary text. Recognized tokens are styled text ranges, not chips, links, buttons, widgets, or atomic editor nodes.

The parser proceeds strictly from left to right and derives the longest valid prefix:

1. Every complete segment in the valid prefix is active.
2. The first invalid or incomplete fragment stops semantic parsing.
3. The invalid fragment and all following text remain visible and editable but inactive.
4. Repairing the invalid fragment immediately reparses the remaining suffix. Any complete later segments become active again automatically.
5. Text is never silently deleted, guessed, reordered, or interpreted out of sequence.

Example:

```text
Baseline AND range:14 before:Xalatan AND FollowUp
```

Only `period:Baseline` is active because `14` is not a valid duration. The damaged segment and everything following it remain as ordinary inactive text.

For:

```text
range:014d before:Xalatan
```

Only `range:` is recognized and canonically formatted. `014d` and everything after it remain inactive text.

### Six-segment limit

- At most six complete Comparison Segments are active.
- After the sixth complete segment, the parser stops.
- Every character after the sixth segment is ordinary black text, regardless of whether it would otherwise be valid syntax.
- The dropdown does not offer `AND` after the sixth segment. It displays an explanation that six segments are already shown.
- Existing text beyond the limit is never deleted.

## State machine and suggestions

The dropdown contains only options valid for the parser state at the caret. It never mixes a keyword state with a value state and never suggests a multi-token expression.

| Expected state | Dropdown contents |
|---|---|
| Segment start | Persistent Period labels, `range:`, `before:`, `after:` |
| Duration after `range:` | Recommended duration values |
| Direction after a duration | `before:`, `after:` |
| Target after a direction | Matching Persistent Period and Annotation labels, plus `now` |
| Completed segment | `AND` only |
| After `AND` | Segment-start keywords |
| Six completed segments | Maximum-reached explanation |

CodeMirror performs fuzzy filtering, match highlighting, and ranking within the legal option set supplied by the current parser state.

When no option matches, the dropdown explains the current expectation without changing the expression. Examples include:

- `Expected a whole-day duration such as 14d`
- `Expected period: or event:`
- `No matching period`
- `No matching annotation`
- `Expected AND`
- `Six comparison segments are already shown`

No invalid-state message changes the field border, adds an error icon, or decorates the inactive suffix.

## Accepting completions

- Clicking a suggestion accepts it.
- Up and Down move the highlighted suggestion.
- Enter accepts the highlighted suggestion.
- Tab accepts the highlighted suggestion when one exists; otherwise it moves focus normally.
- Escape closes the dropdown without changing text.
- Clicking outside closes the dropdown without changing text.
- Moving the caret or resuming typing reopens the dropdown when legal choices exist.
- Enter does not insert a line break.

The `:` and Space keys are grammar-aware acceptance keys:

- They accept only an exact legal keyword or value currently being typed.
- They never accept a fuzzy or partial match merely because it is highlighted.
- If the current text is not an exact legal option, the typed character is inserted as ordinary text and may make the suffix inactive.
- Target labels behave like every other value; spaces are not part of labels.

Acceptance inserts canonical syntax rather than preserving the acceptance character literally. For example:

- Typing `range` and pressing Space produces `range:`.
- Typing `14d` and pressing `:` produces `14d ` because the next token is a direction.
- Typing `and` and pressing Space produces `AND `.
- Tab and Enter never appear in the document.

## Canonical formatting

The parser accepts whitespace anywhere, including around a keyword and its colon. Once syntax is recognized, formatting converges to the canonical expression:

- keywords are lowercase;
- `AND` is uppercase;
- target labels use their saved canonical spelling;
- duration spelling is preserved because leading-zero forms are invalid rather than normalized;
- spaces around colons are removed;
- exactly one space separates sequential tokens;
- exactly one space appears on each side of `AND`;
- leading and trailing whitespace are removed;
- line breaks are forbidden.

Formatting runs only when:

- a completion is accepted;
- `:` or Space accepts an exact token;
- an edit repairs an inactive prefix into a valid one;
- text is pasted; or
- the editor loses focus.

Formatting and the triggering edit are one CodeMirror transaction and one Undo step. The caret and selection map to the equivalent logical position after formatting. Already-canonical text is not repeatedly rewritten.

## Editor behavior

Use modular CodeMirror 6 packages directly. Do not use a third-party React wrapper or a programming-language `basicSetup` bundle.

CodeMirror owns:

- text and selection state;
- normal character-level caret movement;
- character-level Backspace and Delete;
- mouse and keyboard selection;
- copy, cut, and paste;
- Undo and Redo;
- IME/composition input;
- Home and End;
- horizontal scrolling and caret visibility;
- completion popup rendering and keyboard navigation; and
- non-atomic text decorations.

Application code owns:

- the grammar and longest-valid-prefix parser;
- parser-state-aware completion sources;
- exact acceptance through `:` and Space;
- canonical formatting;
- semantic text ranges;
- Comparison Segment derivation;
- the six-segment limit; and
- chart behavior.

The CodeMirror document text is the sole source of truth. Decorations contain no persistent meaning, and the editor document stores no invisible record IDs.

### Single-line layout

- The editor is one physical line and never wraps.
- Long expressions scroll horizontally.
- When empty and unfocused, the search field uses its compact centered width.
- Focusing an empty field expands it to the dashboard width.
- Once it contains any text, it remains expanded even after losing focus.
- After the expression is cleared, it contracts only when it is also unfocused.
- Focus and caret movement scroll the caret into view.

### Dropdown placement

- The dropdown is left-aligned with the beginning of the text token containing the caret, not with the caret character itself.
- The completion range supplied to CodeMirror begins at that token boundary.
- CodeMirror may clamp or flip the popup to keep it inside the field and viewport.
- The menu retains the established light control styling.

### Clear control

- A small `×` appears at the far right whenever the document contains text.
- Clicking it empties the document, removes all Comparison Segments, restores Persistent Periods and Annotations, and keeps focus in the editor.
- Escape never clears the document.

## Text styling

- Valid keywords are ordinary black text with normal font weight.
- Valid values, including durations and target labels, are blue text.
- Valid `AND` delimiters are purple text.
- Inactive text is ordinary black text.
- No recognized range has a pill background, outline, underline, chip border, or button appearance.
- The editor uses the application's normal UI font rather than a monospace font.
- The field keeps the same subtle gray outline when idle and focused. It has no focus shadow or blue outline.

## Label validity

New Persistent Period and Annotation labels:

- may contain letters, digits, hyphens, and underscores;
- must begin with a letter or digit;
- may not contain whitespace or a colon;
- are case-insensitively unique across Persistent Periods and Annotations.

No comparison-expression migration or legacy-label compatibility is required. Do not add dormant migration code.

## Comparison Segment semantics

### Direct period

`X` creates a temporary Comparison Segment with the same start and end boundaries as Persistent Period X. It does not reuse X's persistent chart representation or mutate X.

### Relative to an Annotation

- `before:X` extends from the earliest available measurement to immediately before Annotation X.
- `after:X` extends from Annotation X to the latest available measurement.
- `range:Nd before:X` covers N consecutive 24-hour days ending immediately before Annotation X.
- `range:Nd after:X` covers N consecutive 24-hour days beginning at Annotation X.

### Relative to a Persistent Period

- `before:X` extends from the earliest available measurement to immediately before Persistent Period X starts.
- `after:X` extends from immediately after Persistent Period X ends to the latest available measurement.
- `range:Nd before:X` covers N consecutive 24-hour days ending immediately before Persistent Period X starts.
- `range:Nd after:X` covers N consecutive 24-hour days beginning immediately after Persistent Period X ends.
- `after:X` and its ranged form are unavailable while X is open-ended.

### Boundary ownership

At minute precision:

- a before-Annotation segment ends one minute before the Annotation timestamp;
- an after-Annotation segment includes the Annotation timestamp;
- a before-period segment ends one minute before the period start;
- a direct period includes its start and end; and
- an after-period segment starts one minute after the period end.

A boundary measurement cannot belong to both adjacent segments.

### No-reading segments

A syntactically valid segment remains valid even when it contains no measurements. It retains its label and color, while the diurnal chart shows no line for it and exposes a `No readings` state when appropriate.

## Chart behavior

### Replacement mode

When zero complete Comparison Segments exist:

- the main chart displays normal Persistent Periods and Annotations; and
- all normal chart controls remain available.

When at least one complete Comparison Segment exists:

- the main chart hides every Persistent Period and Annotation;
- the main chart displays only complete Comparison Segments from the valid prefix;
- the diurnal chart displays those same complete segments;
- an incomplete current segment and all inactive suffix text have no chart representation; and
- repairing the expression restores newly valid segments immediately.

Replacement mode depends on complete Comparison Segments, not whether the editor contains text. An expression containing only invalid or incomplete text leaves the normal Persistent Periods and Annotations visible.

### Appearance

- Each segment uses one color for its complete interval, label, main-chart representation, and diurnal series.
- Colors are assigned by left-to-right segment order.
- The chart label is the entire canonical segment expression, such as `range:14d before:Xalatan`.
- Duplicate segments are allowed and receive their own positional colors.
- Comparison Segments are read-only and cannot be dragged, resized, or edited on the chart.

### Existing chart viewport

- Creating or changing a Comparison Segment never changes the main chart's domain, zoom, or horizontal position.
- The existing chart implementation remains responsible for clipping annotations and interval shading to its current viewport.
- Do not build a second range-rendering, clipping, zooming, or viewport system for Comparison Segments.
- Long segments use the existing chart behavior and become visible as the user pans or zooms normally.

### Controls disabled in replacement mode

Only these creation/editing paths are blocked:

- the Periods toggle/control;
- the Annotations toggle/control;
- Ctrl-drag period creation; and
- Ctrl-click Annotation creation.

Position, Quality, Sessions, Raw, Trend, Right, Left, zooming, panning, and other measurement-analysis controls remain available.

Blocked toolbar controls remain visible and use `aria-disabled` so an attempted activation can provide feedback. A blocked control or chart gesture creates a toast reading:

> Clear the search expressions before creating or editing periods and annotations.

Toast behavior:

- a toast is a simple yellow card;
- it drops down from the top of the screen;
- multiple toasts stack rather than replacing one another;
- each toast disappears automatically after a short interval;
- each toast has an `×` at the right for manual dismissal; and
- creation and dismissal are announced accessibly.

## Accessibility

- The editor has an accessible textbox label describing Comparison Expressions.
- The completion popup uses listbox semantics and exposes the active descendant.
- Syntax color is supplementary; an invisible live status announces domain state.
- The live status announces the expected token type, available suggestion count, active Comparison Segment count, whether an inactive suffix exists, and when the six-segment limit is reached.
- Disabled Period and Annotation controls expose `aria-disabled` and remain keyboard-focusable for feedback.
- The clear control has an explicit accessible name.
- Toasts use an appropriate live region and their close controls have explicit accessible names.

## Temporary lifecycle

The Comparison Expression and its derived segments live only in memory.

| Action | Result |
|---|---|
| Navigate to the welcome page and return without reloading | Preserve expression |
| Browser Back or Forward within the app | Preserve expression |
| Reload the page | Clear expression |
| Close and reopen the tab | Clear expression |
| Import a different CSV | Clear expression |
| Clear the current dataset | Clear expression |
| Activate the editor's clear control | Clear expression |

State must live above the measurement route so in-app navigation preserves it. Do not write the Comparison Expression, Comparison Segments, or editor state to localStorage or sessionStorage.

## Implementation replacement rule

Implementation begins by removing the existing comparison search and its supporting interaction/state code. Specifically:

- do not wrap CodeMirror around the existing token composer;
- do not retain the existing query parser as a compatibility path;
- do not persist or restore the existing comparison-selection arrays;
- do not migrate prior comparison state;
- do not retain old token deletion, draft replacement, suggestion, or grouping behavior;
- do not create temporary Persistent Period or Annotation records to represent Comparison Segments; and
- do not add legacy branches for behavior that was never released or used.

The new parser, editor integration, derived segment state, and chart projection are built from this specification and the existing chart primitives only.

## Verification requirements

At minimum, automated tests must cover:

- every valid grammar production;
- every state-machine transition and illegal transition;
- whitespace-tolerant parsing and canonical formatting;
- duration minimum, maximum, leading-zero, decimal, sign, and unit cases;
- longest-valid-prefix invalidation and automatic suffix recovery;
- six-segment cutoff behavior;
- exact duplicates;
- state-aware completion sets;
- exact delimiter acceptance versus fuzzy Enter/Tab acceptance;
- caret and selection mapping through formatting;
- single-step Undo after acceptance and formatting;
- paste, cut, deletion, and repair behavior;
- label validation and type-scoped uniqueness;
- open-ended-period restrictions;
- precise boundary ownership;
- replacement-mode visibility on both charts;
- non-persistence and lifecycle clearing;
- blocked creation gestures and stacked toast behavior; and
- keyboard and accessibility semantics.

The production build and the entire existing test suite must pass after the old implementation is removed and the new one is complete.
