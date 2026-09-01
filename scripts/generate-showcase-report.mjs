import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const DAY_MS = 86_400_000;
const REPORT_PATH = resolve("output", "showcase-history.whatismyiop");

function mulberry32(seed) {
  return () => {
    let value = (seed += 0x6d2b79f5);
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

const random = mulberry32(0x1ca4e2026);

function normal() {
  const first = Math.max(Number.EPSILON, random());
  const second = random();
  return Math.sqrt(-2 * Math.log(first)) * Math.cos(2 * Math.PI * second);
}

function pad(value) {
  return String(value).padStart(2, "0");
}

function datePart(time) {
  const date = new Date(time);
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

function timestamp(day, minute, seconds = 0) {
  const hours = Math.floor(minute / 60);
  const minutes = minute % 60;
  return `${day}T${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

function treatmentBaseline(day, eye) {
  if (day < "2025-11-17") return eye === "OD" ? 21.7 : 20.4;
  if (day < "2026-03-06") return eye === "OD" ? 18.7 : 17.8;
  if (day < "2026-06-10") return eye === "OD" ? 16.5 : 17.6;
  return eye === "OD" ? 15.4 : 16.2;
}

function timeOfDayEffect(minute) {
  if (minute < 5 * 60) return 2.3;
  if (minute < 9 * 60) return 1.7;
  if (minute < 17 * 60) return -0.6;
  return 0.5;
}

function temporaryEffect(day) {
  if (day >= "2026-02-02" && day <= "2026-02-05") return 2.1;
  return 0;
}

const start = Date.UTC(2025, 9, 1);
const end = Date.UTC(2026, 7, 31);
const pendingMeasurements = [];

for (let dayTime = start; dayTime <= end; dayTime += DAY_MS) {
  const day = datePart(dayTime);
  if (day >= "2026-04-12" && day <= "2026-04-19") continue;
  if (random() < 0.17) continue;

  const sessions = [
    { minute: 6 * 60 + 35, probability: 0.96 },
    { minute: 13 * 60 + 10, probability: 0.46 },
    { minute: 20 * 60 + 40, probability: 0.87 },
    { minute: 2 * 60 + 25, probability: 0.08 },
  ]
    .filter(({ probability }) => random() < probability)
    .map(({ minute }) => ({
      minute: Math.max(0, Math.min(1_439, minute + Math.round(normal() * 16))),
    }))
    .sort((left, right) => left.minute - right.minute);

  for (const session of sessions) {
    const position = session.minute < 5 * 60 ? "Supine" : "Sitting";
    for (const eye of ["OD", "OS"]) {
      if (random() < 0.025) continue;
      const readingCount = random() < 0.34 ? 3 : 2;
      const sessionShift = normal() * 0.55;
      for (let reading = 0; reading < readingCount; reading += 1) {
        const iop = Math.max(
          8,
          Math.min(
            32,
            treatmentBaseline(day, eye) +
              timeOfDayEffect(session.minute) +
              temporaryEffect(day) +
              sessionShift +
              normal() * 0.42,
          ),
        );
        const qualityRoll = random();
        pendingMeasurements.push({
          measuredAt: timestamp(
            day,
            session.minute,
            Math.min(59, reading * 19 + (eye === "OS" ? 7 : 0)),
          ),
          eye,
          iop: Math.round(iop * 10) / 10,
          quality:
            qualityRoll < 0.91
              ? "Good"
              : qualityRoll < 0.985
                ? "Acceptable"
                : "Poor",
          position,
        });
      }
    }
  }
}

pendingMeasurements.sort(
  (left, right) =>
    left.measuredAt.localeCompare(right.measuredAt) ||
    left.eye.localeCompare(right.eye),
);

const measurements = pendingMeasurements.map((measurement, sequence) => ({
  ...measurement,
  sequence,
}));

const report = {
  format: "whatismyiop-report",
  version: 1,
  generatedAt: "2026-09-01T12:00:00.000Z",
  generator: { name: "WhatIsMyIOP", version: "0.1.0" },
  measurements,
  periods: [
    {
      id: "period-baseline-monitoring",
      label: "Baseline-monitoring",
      start: "2025-10-01",
      startTime: "00:00",
      end: "2025-11-16",
      endTime: "23:59",
      openEnded: false,
    },
    {
      id: "period-latanoprost-only",
      label: "Latanoprost-only",
      start: "2025-11-17",
      startTime: "00:00",
      end: "2026-03-05",
      endTime: "23:59",
      openEnded: false,
    },
    {
      id: "period-post-slt",
      label: "Post-SLT",
      start: "2026-03-06",
      startTime: "00:00",
      end: "2026-06-09",
      endTime: "23:59",
      openEnded: false,
    },
    {
      id: "period-dual-therapy",
      label: "Dual-therapy",
      start: "2026-06-10",
      startTime: "00:00",
      end: "",
      endTime: "",
      openEnded: true,
    },
  ],
  annotations: [
    {
      id: "annotation-started-latanoprost",
      label: "Started-latanoprost",
      annotatedAt: "2025-11-17T21:00:00",
    },
    {
      id: "annotation-adherence-review",
      label: "Adherence-review",
      annotatedAt: "2026-02-06T09:30:00",
    },
    {
      id: "annotation-slt-right-eye",
      label: "SLT-right-eye",
      annotatedAt: "2026-03-06T10:15:00",
    },
    {
      id: "annotation-travel-gap",
      label: "Travel-no-readings",
      annotatedAt: "2026-04-12T08:00:00",
    },
    {
      id: "annotation-added-timolol",
      label: "Added-timolol-AM",
      annotatedAt: "2026-06-10T08:30:00",
    },
  ],
};

mkdirSync(dirname(REPORT_PATH), { recursive: true });
writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
console.log(
  `Wrote ${measurements.length.toLocaleString()} measurements to ${REPORT_PATH}`,
);
