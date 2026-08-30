import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "../LegalPage";

export const Route = createFileRoute("/disclaimer")({
  component: MedicalDisclaimer,
});

function MedicalDisclaimer() {
  return (
    <LegalPage
      title="Medical disclaimer"
      summary="WhatIsMyIOP.com is a general-purpose tool for organising and visualising measurements."
    >
      <section className="legal-callout">
        <h2>Do not use this website for diagnosis or treatment decisions</h2>
        <p>The website does not diagnose an eye condition, establish a safe pressure range, recommend treatment, or replace an ophthalmologist or another qualified healthcare professional. Do not start, stop, or change medication or treatment based only on this website.</p>
      </section>

      <section>
        <h2>No emergency service</h2>
        <p>The website does not monitor you or alert a clinician. It cannot identify an emergency. If you think you may have a medical emergency, contact local emergency services or seek urgent professional care.</p>
      </section>

      <section>
        <h2>What the charts mean</h2>
        <p>Charts reproduce or summarise the data in the imported file. Sessions combine nearby measurements. Observed trends statistically smooth session values. Adjusted trends also estimate and remove a repeatable time-of-day pattern before displaying a common reference.</p>
        <p>A smoothed or adjusted value is not a new physical measurement. An uncertainty band describes agreement in the statistical fit; it is not a normal range, safety boundary, prediction, diagnosis, or probability that a condition is present.</p>
      </section>

      <section>
        <h2>Limitations</h2>
        <ul>
          <li>The website cannot verify that a measurement was taken correctly or that the measuring device was accurate, calibrated, or appropriate.</li>
          <li>Missing, mistimed, duplicated, incorrectly formatted, or selectively recorded measurements can change the charts and trends.</li>
          <li>Statistical smoothing can hide short-lived changes and can suggest a pattern where the underlying data are sparse.</li>
          <li>The website does not account for your diagnosis, medication, surgery, symptoms, corneal characteristics, device model, or other clinical context unless that information appears only as a label you entered.</li>
          <li>The website does not claim clinical validation or regulatory certification.</li>
        </ul>
      </section>

      <section>
        <h2>Use with professional care</h2>
        <p>Keep the original measurements and share them with your eye-care professional in the format they request. Ask that professional how often to measure, how to interpret the readings, and what action to take.</p>
      </section>
    </LegalPage>
  );
}
