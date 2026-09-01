export type EditablePeriod = {
  label: string;
  start: string;
  startTime: string;
  end: string;
  endTime: string;
  openEnded: boolean;
};

export type TreatmentPeriod = EditablePeriod & { id: string };

export type PointAnnotation = {
  id: string;
  label: string;
  time: number;
};
