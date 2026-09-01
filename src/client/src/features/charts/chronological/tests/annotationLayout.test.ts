import { describe, expect, it } from "vitest";
import {
  annotationIsKind,
  annotationKey,
  annotationLaneCount,
  layoutAnnotationLabels,
  type AnnotationLabel,
} from "../annotations/annotationLayout";

const domain = [0, 100] as const;

describe("annotation keys", () => {
  it("keeps period and event identities distinct", () => {
    expect(annotationKey("period", "same-id")).toBe("period:same-id");
    expect(annotationKey("event", "same-id")).toBe("event:same-id");
    expect(annotationIsKind("period:same-id", "period")).toBe(true);
    expect(annotationIsKind("event:same-id", "period")).toBe(false);
  });
});

describe("annotation label layout", () => {
  it("places overlapping labels in separate lanes", () => {
    const labels: AnnotationLabel[] = [
      { id: "first", kind: "event", text: "First", time: 10 },
      { id: "second", kind: "event", text: "Second", time: 12 },
      { id: "third", kind: "event", text: "Third", time: 90 },
    ];
    const positioned = layoutAnnotationLabels(
      labels,
      domain,
      1000,
      null,
      false,
    );

    expect(positioned.map(({ lane }) => lane)).toEqual([0, 1, 0]);
    expect(annotationLaneCount(positioned)).toBe(2);
  });

  it("uses a period's full span when it is wider than the compact label", () => {
    const [label] = layoutAnnotationLabels(
      [
        {
          id: "period",
          kind: "period",
          text: "Treatment",
          time: 10,
          endTime: 70,
        },
      ],
      domain,
      1000,
      null,
      false,
    );

    expect(label.fullWidth).toBe(true);
    expect(label.width).toBe(600);
  });

  it("keeps only the focused label outside preview mode", () => {
    const labels: AnnotationLabel[] = [
      {
        id: "first",
        focusKey: "event:first",
        kind: "event",
        text: "First",
        time: 10,
      },
      {
        id: "second",
        focusKey: "event:second",
        kind: "event",
        text: "Second",
        time: 20,
      },
    ];

    expect(
      layoutAnnotationLabels(labels, domain, 1000, "event:second", false).map(
        ({ id }) => id,
      ),
    ).toEqual(["second"]);
    expect(
      layoutAnnotationLabels(labels, domain, 1000, "event:second", true).map(
        ({ id }) => id,
      ),
    ).toEqual(["first", "second"]);
  });

  it("always reserves at least one lane", () => {
    expect(annotationLaneCount([])).toBe(1);
  });
});
