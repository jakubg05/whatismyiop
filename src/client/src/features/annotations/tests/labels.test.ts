import { describe, expect, it } from "vitest";
import { annotationLabelError } from "../labels";
import type { PointAnnotation, TreatmentPeriod } from "../model";

const periods: TreatmentPeriod[] = [
  {
    id: "baseline",
    label: "Baseline",
    start: "2026-05-01",
    startTime: "08:30",
    end: "2026-05-10",
    endTime: "17:00",
    openEnded: false,
  },
];
const annotations: PointAnnotation[] = [{ id: "xalatan", label: "Xalatan", time: 0 }];
const catalog = { periods, annotations };

describe("annotation labels", () => {
  it("enforces grammar, reserved words, and cross-type uniqueness", () => {
    expect(annotationLabelError("With space", "period", catalog)).toBe(
      "Names cannot contain spaces. Use hyphens or underscores instead.",
    );
    expect(
      annotationLabelError("_startsWrong", "period", catalog),
    ).not.toBeNull();
    expect(annotationLabelError("baseline", "period", catalog)).not.toBeNull();
    expect(annotationLabelError("Xalatan", "period", catalog)).not.toBeNull();
    expect(annotationLabelError("before", "period", catalog)).not.toBeNull();
    expect(annotationLabelError("AND", "annotation", catalog)).not.toBeNull();
    expect(annotationLabelError("now", "annotation", catalog)).not.toBeNull();
    expect(
      annotationLabelError("Baseline", "period", catalog, "baseline"),
    ).toBeNull();
  });

  it("accepts Unicode letters", () => {
    expect(
      annotationLabelError("Liečba_2", "period", { periods: [], annotations: [] }),
    ).toBeNull();
  });
});
