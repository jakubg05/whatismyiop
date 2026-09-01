import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { SiteFooter } from "../../app/layout/SiteFooter";

export const LEGAL_EFFECTIVE_DATE = "30 August 2026";

type LegalPageProps = {
  title: string;
  summary: string;
  children: ReactNode;
};

export function LegalPage({ title, summary, children }: LegalPageProps) {
  return (
    <main className="legal-page">
      <header className="legal-header">
        <Link className="legal-brand" to="/" aria-label="WhatIsMyIOP.com home">
          <img src="/whatismyiop_mark_black.svg" alt="" />
          <span>WhatIsMyIOP.com</span>
        </Link>
      </header>

      <article className="legal-document">
        <header className="legal-document__intro">
          <h1>{title}</h1>
          <p>{summary}</p>
          <small>Effective {LEGAL_EFFECTIVE_DATE}</small>
        </header>
        <div className="legal-document__body">{children}</div>
      </article>

      <SiteFooter variant="compact" />
    </main>
  );
}
