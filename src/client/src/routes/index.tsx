import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: WelcomePage,
});

function WelcomePage() {
  return (
    <main className="welcome-page">
      <section className="welcome-hero">
        <div className="welcome-card">
          <img src="/whatismyiop_mark_black.svg" alt="What Is My IOP" />
          <div>
            <p className="welcome-eyebrow">Measurement analysis</p>
            <h1>Understand your eye‑pressure measurements.</h1>
            <p className="welcome-copy">
              Import your measurements, explore trends, and compare meaningful periods in one focused dashboard.
            </p>
          </div>
          <Link className="welcome-action" to="/measurements">
            Open measurements
          </Link>
        </div>
      </section>

      <section className="product-preview" aria-labelledby="product-preview-title">
        <div className="product-preview__heading">
          <p className="welcome-eyebrow">Product tour</p>
          <h2 id="product-preview-title">See your measurements more clearly.</h2>
        </div>
        <div className="product-video-placeholder" role="img" aria-label="Product video placeholder">
          <span className="product-video-placeholder__play" aria-hidden="true">
            <svg viewBox="0 0 24 24"><path d="m9 7 8 5-8 5V7Z" /></svg>
          </span>
          <span>Product walkthrough coming soon</span>
        </div>
      </section>
    </main>
  );
}
