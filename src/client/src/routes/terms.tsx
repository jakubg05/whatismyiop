import { createFileRoute, Link } from "@tanstack/react-router";
import { LegalPage } from "../LegalPage";

export const Route = createFileRoute("/terms")({
  component: Terms,
});

function Terms() {
  return (
    <LegalPage
      title="Terms of use"
      summary="These terms govern use of the free WhatIsMyIOP.com measurement-visualisation website."
    >
      <section>
        <h2>Using the website</h2>
        <p>By using the website, you agree to these terms. If you do not agree, do not use it. Mandatory rights that apply to you under consumer or other law are not limited by these terms.</p>
      </section>

      <section>
        <h2>What the website does</h2>
        <p>The website organises and visualises measurement records that you provide. It can group nearby readings, calculate summaries, and display statistical trends. The detailed limitations in the <Link to="/disclaimer">medical disclaimer</Link> form part of these terms.</p>
      </section>

      <section>
        <h2>File compatibility</h2>
        <p>The website currently supports CSV exports from the iCare HOME2 tonometer. Other device models and export formats may differ and may not work. References to iCare HOME2 identify file compatibility only; WhatIsMyIOP.com is independent and is not affiliated with or endorsed by the device manufacturer.</p>
      </section>

      <section>
        <h2>Not medical care</h2>
        <p>The website is not a healthcare provider and does not provide diagnosis, monitoring by a clinician, treatment, or emergency services. It does not determine whether a reading or trend is safe and must not be used as the sole basis for starting, stopping, or changing treatment.</p>
      </section>

      <section>
        <h2>Your responsibilities</h2>
        <ul>
          <li>Use only data that you own or are authorised to use.</li>
          <li>Check important information against the original file and measuring device.</li>
          <li>Do not assume that a missing warning, smooth trend, or narrow uncertainty band means that your measurements are safe.</li>
          <li>Protect the browser profile and device on which the file is stored, especially when using a shared or managed device.</li>
          <li>Consult an appropriately qualified eye-care professional about medical questions or treatment decisions.</li>
        </ul>
      </section>

      <section>
        <h2>Accuracy and availability</h2>
        <p>The website is provided without a promise that file parsing, grouping, calculations, charts, or explanations will be complete, uninterrupted, or error-free. Results can be affected by input quality, unsupported columns, device accuracy, measurement technique, timing, missing observations, and the assumptions of the statistical methods.</p>
        <p>The operator may change, suspend, or discontinue the free service. You are responsible for retaining the original data; the browser copy is not a backup service.</p>
      </section>

      <section>
        <h2>Third-party services and source code</h2>
        <p>The website is delivered through third-party infrastructure and links to GitHub. Those services have their own terms. Availability of the source repository does not grant rights beyond the licence actually included with that repository.</p>
      </section>

      <section>
        <h2>Liability</h2>
        <p>To the extent permitted by applicable law, the operator is not liable for indirect or consequential loss arising from use of, inability to use, or reliance on the website. Nothing in these terms excludes liability that cannot legally be excluded, including applicable mandatory consumer protections.</p>
      </section>

      <section>
        <h2>Changes</h2>
        <p>Material changes to these terms will be shown by updating the effective date.</p>
      </section>

      <section>
        <h2>Contact</h2>
        <p>Questions about the website can be raised through the <a href="https://github.com/jakubg05/whatismyiop" target="_blank" rel="noreferrer">GitHub repository</a>. Do not include measurement files, health information, or other personal or confidential information in public GitHub activity.</p>
      </section>
    </LegalPage>
  );
}
