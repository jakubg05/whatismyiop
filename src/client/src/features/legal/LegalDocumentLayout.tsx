import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { SiteFooter } from "../../shared/layout/SiteFooter";

const LEGAL_EFFECTIVE_DATE = "30 August 2026";

type LegalDocumentLayoutProps = {
  title: string;
  summary: string;
  children: ReactNode;
};

export function LegalDocumentLayout({
  title,
  summary,
  children,
}: LegalDocumentLayoutProps) {
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
