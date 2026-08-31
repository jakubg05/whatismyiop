import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "../LegalPage";

export const Route = createFileRoute("/policy")({
  component: PrivacyPolicy,
});

function PrivacyPolicy() {
  return (
    <LegalPage
      title="Privacy and local data policy"
      summary="The measurement file is handled by code running in your browser. The website does not send its contents to the site operator."
    >
      <section>
        <h2>Your measurement file</h2>
        <p>When you choose a CSV file, the application reads and analyses it locally in your browser. The application does not transmit the file, its filename, its measurements, your saved periods, or your annotations to the site operator or Cloudflare.</p>
        <p>The file may contain health-related information, including dates and times, right- and left-eye pressure measurements, measurement quality, position, and any other text present in supported columns.</p>
      </section>

      <section>
        <h2>Storage on your device</h2>
        <p>To restore your work when you return, the application saves the raw CSV text, filename, periods, and annotations in this browser&apos;s local storage under <code>whatismyiop:v1</code>. It remains there until you use <strong>Clear data</strong>, clear this site&apos;s browser data, or remove the browser profile.</p>
        <p>This storage is not separately encrypted by the application. Other people who can use the same browser profile may be able to open the saved information. Clear it after use on a shared or managed device.</p>
      </section>

      <section>
        <h2>Website delivery data</h2>
        <p>The site is delivered using Cloudflare. Like other web-hosting and security providers, Cloudflare may process connection information such as your IP address, requested URL, request time, browser or device information, routing information, and security events. This information is used to deliver the site, maintain availability, and protect it from abuse.</p>
        <p>The operator does not currently add application analytics, advertising trackers, user accounts, or profiling. The operator does not keep a separate copy of Cloudflare network logs outside the Cloudflare service. Cloudflare handles information under its <a href="https://www.cloudflare.com/policies/privacy/" target="_blank" rel="noreferrer">privacy policy</a> and applicable customer terms, including its provisions for international data transfers.</p>
      </section>

      <section>
        <h2>Cookies and similar technologies</h2>
        <p>The application does not currently set advertising or analytics cookies. It uses local storage only for the measurement-file state described above. If analytics, advertising, cloud sync, accounts, or another non-essential technology is introduced, this policy and any required consent controls must be updated first.</p>
      </section>

      <section>
        <h2>External links</h2>
        <p>If you follow the GitHub link, GitHub receives information about your visit under its own privacy terms. The site does not automatically send your measurement data with that link.</p>
      </section>

      <section>
        <h2>Your choices and rights</h2>
        <p>You can avoid importing a file, clear the saved local copy at any time, or use browser controls to remove this site&apos;s storage. Because the site operator does not receive the measurement file, the operator cannot view, export, correct, or delete that local copy for you.</p>
        <p>Depending on applicable law, you may have rights concerning website-delivery data, including access, correction, deletion, restriction, objection, portability, and the right to complain to the data-protection authority where you live or work.</p>
      </section>

      <section>
        <h2>Contact</h2>
        <p>Questions about this policy or the website can be raised through the <a href="https://github.com/jakubg05/whatismyiop" target="_blank" rel="noreferrer">GitHub repository</a>. GitHub activity may be public, so do not include measurement files, health information, or other personal or confidential information.</p>
      </section>

      <section>
        <h2>Changes to this policy</h2>
        <p>The effective date will change when this policy is materially updated. Review it again if the application adds network processing, accounts, sharing, analytics, error reporting, advertising, or a new hosting provider.</p>
      </section>
    </LegalPage>
  );
}
