import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { resolveSupportEmail } from "./supportContact.js";
import { ContactLine, LegalLinks, LegalScreen, SignInConsent } from "./LegalScreen.js";
import { LEGAL_DOCUMENTS, LEGAL_EFFECTIVE_DATE } from "./legalDocuments.js";

const FALLBACK = "the contact address in the app’s About/Account screen";

describe("resolveSupportEmail", () => {
  it("is absent unless VITE_SUPPORT_EMAIL holds one plausible address", () => {
    expect(resolveSupportEmail({})).toBeNull();
    expect(resolveSupportEmail({ VITE_SUPPORT_EMAIL: "" })).toBeNull();
    expect(resolveSupportEmail({ VITE_SUPPORT_EMAIL: "   " })).toBeNull();
    expect(resolveSupportEmail({ VITE_SUPPORT_EMAIL: "not an email" })).toBeNull();
    expect(resolveSupportEmail({ VITE_SUPPORT_EMAIL: "<a@b.co>" })).toBeNull();
    expect(resolveSupportEmail({ VITE_SUPPORT_EMAIL: " help@example.com " })).toBe("help@example.com");
  });
});

describe("ContactLine", () => {
  it("links the configured address", () => {
    const html = renderToStaticMarkup(createElement(ContactLine, { email: "help@example.com" }));
    expect(html).toContain('href="mailto:help@example.com"');
    expect(html).not.toContain("About/Account");
  });

  it("points to the app when no address is configured, and never invents one", () => {
    const html = renderToStaticMarkup(createElement(ContactLine, { email: null }));
    expect(html).toContain(FALLBACK);
    expect(html).not.toContain("mailto:");
    expect(html).not.toMatch(/@/);
  });
});

describe("LegalScreen", () => {
  for (const doc of ["privacy", "terms"] as const) {
    it(`renders the ${doc} page with its title, effective date and numbered sections`, () => {
      const html = renderToStaticMarkup(createElement(LegalScreen, { doc, contactEmail: null }));
      expect(LEGAL_EFFECTIVE_DATE).toBe("26 September 2026");
      expect(html).toContain(`<h1 id="legal-title">${LEGAL_DOCUMENTS[doc].title}</h1>`);
      expect(html).toContain(`Effective ${LEGAL_EFFECTIVE_DATE}`);
      expect(html.match(/<h2>/g)?.length).toBe(LEGAL_DOCUMENTS[doc].sections.length);
      expect(html).toContain('href="/privacy"');
      expect(html).toContain('href="/terms"');
      expect(html).toContain('href="/"');
      // Indexable: nothing asks search engines to skip these pages.
      expect(html).not.toMatch(/noindex/i);
    });

    it(`shows the ${doc} contact line only when an address is configured`, () => {
      const without = renderToStaticMarkup(createElement(LegalScreen, { doc, contactEmail: null }));
      expect(without).toContain(FALLBACK);
      expect(without).not.toContain("mailto:");
      const withEmail = renderToStaticMarkup(createElement(LegalScreen, { doc, contactEmail: "help@example.com" }));
      expect(withEmail).toContain('href="mailto:help@example.com"');
      expect(withEmail).not.toContain(FALLBACK);
    });
  }

  it("marks the current page in its footer links", () => {
    const html = renderToStaticMarkup(createElement(LegalLinks, { current: "terms" }));
    expect(html).toMatch(/<a href="\/terms" aria-current="page">Terms of Service<\/a>/);
    expect(html).toMatch(/<a href="\/privacy">Privacy Policy<\/a>/);
  });

  it("tells people what signing in agrees to, with both links", () => {
    const html = renderToStaticMarkup(createElement(SignInConsent));
    expect(html).toContain("By continuing you agree to the");
    expect(html).toContain('href="/terms"');
    expect(html).toContain('href="/privacy"');
  });
});
