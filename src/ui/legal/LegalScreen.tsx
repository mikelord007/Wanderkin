import { Logo, WorldStyleScope } from "../components/index.js";
import { BRAND_NAME } from "../../brand.js";
import { pathForPrivacy, pathForStart, pathForTerms } from "../routing.js";
import { LEGAL_DOCUMENTS, LEGAL_EFFECTIVE_DATE, type LegalDocumentId } from "./legalDocuments.js";
import "./legal.css";

/**
 * The public Privacy Policy and Terms of Service. One narrow reading column:
 * the logo and a way home, the title and effective date, short numbered
 * sections, and the same two links in the footer. No sign-in, no decoration.
 * Links are plain anchors, so each page loads on its own URL exactly as it is
 * published on the Google sign-in consent screen.
 */
export function LegalScreen({ doc, contactEmail }: { doc: LegalDocumentId; contactEmail: string | null }) {
  const page = LEGAL_DOCUMENTS[doc];
  return (
    <WorldStyleScope className="wk-legal">
      <header className="wk-legal__top">
        <a className="wk-legal__brand" href={pathForStart()} aria-label={`${BRAND_NAME} home page`}><Logo size={30} /></a>
        <a className="wk-legal__back" href={pathForStart()}>Back to home</a>
      </header>
      <main className="wk-legal__column" aria-labelledby="legal-title">
        <h1 id="legal-title">{page.title}</h1>
        <p className="wk-legal__date">Effective {LEGAL_EFFECTIVE_DATE}</p>
        <p className="wk-legal__intro">{page.intro}</p>
        <ol className="wk-legal__sections">
          {page.sections.map((section) => (
            <li key={section.id} id={section.id}>
              <h2>{section.heading}</h2>
              {section.body({ contactEmail })}
            </li>
          ))}
        </ol>
      </main>
      <footer className="wk-legal__foot">
        <LegalLinks current={doc} />
        <span>{BRAND_NAME} is in early access.</span>
      </footer>
    </WorldStyleScope>
  );
}

/** "Privacy Policy" and "Terms of Service", for page footers. */
export function LegalLinks({ current, className = "wk-legal-links" }: { current?: LegalDocumentId; className?: string }) {
  return (
    <nav className={className} aria-label="Legal">
      <a href={pathForPrivacy()} aria-current={current === "privacy" ? "page" : undefined}>Privacy Policy</a>
      <a href={pathForTerms()} aria-current={current === "terms" ? "page" : undefined}>Terms of Service</a>
    </nav>
  );
}

/** The line under a sign-in button. */
export function SignInConsent({ className = "wk-signin-consent" }: { className?: string }) {
  return (
    <p className={className}>
      By continuing you agree to the <a href={pathForTerms()}>Terms of Service</a> and <a href={pathForPrivacy()}>Privacy Policy</a>.
    </p>
  );
}

export { ContactLine } from "./ContactLine.js";
