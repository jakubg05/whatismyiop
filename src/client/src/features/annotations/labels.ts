import type { TimelineEvent, TreatmentPeriod } from "./model";

type AnnotationKind = "period" | "event";
type AnnotationCatalog = {
  periods: readonly TreatmentPeriod[];
  events: readonly TimelineEvent[];
};

const LABEL_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N}_-]*$/u;
const RESERVED_LABELS = new Set(["and", "range", "before", "after", "now"]);

export function annotationLabelError(
  label: string,
  kind: AnnotationKind,
  catalog: AnnotationCatalog,
  excludingId?: string,
): string | null {
  if (/\s/u.test(label))
    return "Names cannot contain spaces. Use hyphens or underscores instead.";
  if (!LABEL_PATTERN.test(label)) {
    return "Labels may contain letters, numbers, hyphens, and underscores, and must begin with a letter or number.";
  }
  const normalized = label.toLocaleLowerCase();
  if (RESERVED_LABELS.has(normalized)) {
    return "Labels cannot use the reserved comparison words AND, range, before, after, or now.";
  }
  const duplicate = [
    ...catalog.periods.map((value) => ({ ...value, kind: "period" as const })),
    ...catalog.events.map((value) => ({ ...value, kind: "event" as const })),
  ].some(
    (value) =>
      !(value.kind === kind && value.id === excludingId) &&
      value.label.toLocaleLowerCase() === normalized,
  );
  return duplicate ? `A period or event named ${label} already exists.` : null;
}
