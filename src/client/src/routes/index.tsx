import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: WelcomePage,
});

function WelcomePage() {
  return (
    <main className="welcome-page">
      <section className="welcome-hero">
        <img className="welcome-brand" src="/whatismyiop_mark_black.svg" alt="What Is My IOP" />
        <div className="welcome-card">
          <div>
            <h1>Visualize your IOP measurements</h1>
            <p className="welcome-copy">
              Open a <code>measurements.csv</code> file to explore readings, trends, and comparisons. Your file is processed locally in this browser and is never uploaded.
            </p>
          </div>
          <Link className="welcome-action" to="/measurements">
            Choose measurements.csv
          </Link>
          <div className="welcome-facts">
            <span>Free to use</span>
            <span aria-hidden="true">·</span>
            <span>Runs locally</span>
            <span aria-hidden="true">·</span>
            <a className="welcome-source" href="https://github.com/jakubg05/whatismyiop" target="_blank" rel="noreferrer">
              View source
            </a>
          </div>
        </div>
      </section>
    </main>
  );
}
