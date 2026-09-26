import type { ReactNode } from "react";
import { BRAND_NAME } from "../../brand.js";
import { ContactLine } from "./ContactLine.js";

/*
 * The text of the Privacy Policy and Terms of Service. Every statement here
 * was checked against what the code does on 26 September 2026 (sign-in in
 * src/auth and server/auth, storage in server/persistence, the generation
 * provider in server/livepeer, sharing in server/publications.ts). Change the
 * wording when the behaviour changes, and move the effective date.
 */

export type LegalDocumentId = "privacy" | "terms";

export const LEGAL_EFFECTIVE_DATE = "26 September 2026";

export interface LegalSection {
  id: string;
  heading: string;
  body: (context: { contactEmail: string | null }) => ReactNode;
}

export interface LegalDocument {
  title: string;
  intro: string;
  sections: LegalSection[];
}

/** A sentence the site owner must fill in before relying on the page. */
function Placeholder({ children }: { children: ReactNode }) {
  return <span className="wk-legal__placeholder">[Placeholder: {children}]</span>;
}

const privacy: LegalDocument = {
  title: "Privacy Policy",
  intro: `${BRAND_NAME} turns a photo of an everyday object into a small 3D world you can explore. This page explains what information that takes, where it goes, and what you can ask us to do with it.`,
  sections: [
    {
      id: "sign-in",
      heading: "Signing in with Google",
      body: () => <>
        <p>You sign in with your Google account. Sign-in is handled by Supabase Auth, which receives your details from Google and keeps your account record. From that account we use four things:</p>
        <ul>
          <li>your account id,</li>
          <li>your email address,</li>
          <li>your name, and</li>
          <li>your profile picture (a link to the image Google hosts).</li>
        </ul>
        <p>We show your name, email and picture in the app so you can see who is signed in. Your picture loads directly from Google. Our own server keeps only your account id, which is how it knows which worlds are yours. It does not keep a copy of your name, email or picture, apart from a one-time record that links the site owner’s own account to worlds made before sign-in existed.</p>
      </>,
    },
    {
      id: "cookies",
      heading: "Cookies and storage in your browser",
      body: () => <>
        <p>We use no advertising or tracking cookies. There is one cookie on the live site:</p>
        <ul>
          <li><code>wk_session</code> holds your current sign-in token so your own pictures, models and sounds can load. It can’t be read by page scripts, is only sent to our API, lasts at most 24 hours, and is removed when you sign out.</li>
        </ul>
        <p>An older cookie, <code>objectquest_owner</code>, is only used when sign-in is switched off, which the live site never does.</p>
        <p>The app also saves some things in your browser’s local storage:</p>
        <ul>
          <li><code>wanderkin-auth</code> keeps you signed in between visits (it holds your Supabase sign-in session). Signing out removes it.</li>
          <li>Other entries keep your work and preferences on this device: worlds you are still creating, unsaved course edits, sound settings, your best race times, and which introductions you have already seen.</li>
        </ul>
        <p>You can clear all of this at any time from your browser’s settings.</p>
      </>,
    },
    {
      id: "what-we-store",
      heading: "What we store on our server",
      body: () => <>
        <p>To build and keep your worlds, our server stores:</p>
        <ul>
          <li>the photos you upload, exactly as uploaded, with their file names. A photo can carry details your camera added, such as when and where it was taken; we don’t remove them, so you may want to remove them before uploading;</li>
          <li>the 3D models, images, music, sound effects, narration and videos made from your photos, and any 3D model you import;</li>
          <li>your worlds (their courses, settings and text), and screenshots taken when you finish one;</li>
          <li>records of each generation request, including the text it used, such as the atmosphere you describe.</li>
        </ul>
        <p>These are linked to your account id and are only shown to you, unless you share a world.</p>
      </>,
    },
    {
      id: "generation",
      heading: "How your photos are turned into worlds",
      body: () => <>
        <p>We don’t build the 3D models ourselves. When you create a world, our server sends your photo and the text for that step (our instructions plus the style, mode and atmosphere you choose) to Livepeer, a third-party generation service. Livepeer runs the request on AI models hosted by its providers (for example fal.ai) and returns the results, which we store as described above.</p>
        <p>Those services receive your photo and text only to produce the result, and are covered by their own terms and privacy policies. We don’t control how long they keep copies.</p>
      </>,
    },
    {
      id: "sharing",
      heading: "Sharing a world",
      body: () => <>
        <p>Your worlds are private until you share one. Sharing makes a fixed snapshot of that version with its own link. Anyone who has the link can view and play it without signing in, and the 3D model, sounds and videos it uses become reachable from it. Your original photos are not included.</p>
        <p>A shared snapshot can’t be edited afterwards; sharing again makes a new link. There isn’t yet a button to unshare, so ask us (see the last section) if you want a link taken down.</p>
      </>,
    },
    {
      id: "no-tracking",
      heading: "No analytics, no ads",
      body: () => <>
        <p>{BRAND_NAME} has no analytics, advertising or tracking tools, and loads no third-party scripts. We don’t sell or rent your information. Our server keeps ordinary error logs to fix problems. Our website is hosted on Vercel.</p>
      </>,
    },
    {
      id: "retention",
      heading: "How long we keep things",
      body: () => <>
        <p>Nothing is deleted automatically today: your photos, generated files, worlds and shared snapshots stay until you ask us to delete them. You can ask us to delete any of your worlds, their files and shared links, or everything linked to your account, including the Supabase account record. We’ll do it and confirm when it’s done.</p>
      </>,
    },
    {
      id: "rights",
      heading: "Your choices",
      body: () => <>
        <p>You can ask for a copy of the information we hold about you, ask us to correct it, or ask us to delete it. You can export any of your worlds from the app. You can stop using {BRAND_NAME} at any time and sign out to remove the sign-in session from your browser.</p>
      </>,
    },
    {
      id: "children",
      heading: "Age",
      body: () => <>
        <p>{BRAND_NAME} is for people aged 13 and over, or the minimum age for using online services without a parent’s consent where you live, if that is higher. If you believe a younger child has used it, contact us and we will delete their information.</p>
      </>,
    },
    {
      id: "changes",
      heading: "Changes to this policy",
      body: () => <>
        <p>If what we collect or how we use it changes, we will update this page and its effective date before the change takes effect.</p>
      </>,
    },
    {
      id: "contact",
      heading: "Contact",
      body: ({ contactEmail }) => <>
        <p>For any privacy question or request, <ContactLine email={contactEmail} />.</p>
      </>,
    },
  ],
};

const terms: LegalDocument = {
  title: "Terms of Service",
  intro: `These terms cover your use of ${BRAND_NAME}. By signing in or using the service you agree to them. The Privacy Policy explains how we handle your information.`,
  sections: [
    {
      id: "early-access",
      heading: "An early-access service",
      body: () => <>
        <p>{BRAND_NAME} is in early access. Features may change, stop working or be removed, and generation may fail or produce odd results. We may pause or end the service.</p>
      </>,
    },
    {
      id: "eligibility",
      heading: "Who can use it",
      body: () => <>
        <p>You must be at least 13, or the minimum age for using online services without a parent’s consent where you live, if that is higher. If you are under 18, please have a parent or guardian’s permission.</p>
      </>,
    },
    {
      id: "account",
      heading: "Your account",
      body: () => <>
        <p>You sign in with a Google account. You are responsible for what happens under your account, so keep it secure and sign out on shared devices.</p>
      </>,
    },
    {
      id: "your-content",
      heading: "Your photos and worlds",
      body: () => <>
        <p>You keep the rights you have in the photos you upload. You give us permission to store them, send them to our generation provider to build your worlds, and show the results to you and to anyone you share a world with. This permission lasts as long as we hold the content.</p>
        <p>Worlds are generated by AI models, so parts of them may be inaccurate or similar to other people’s results. You may use the worlds you make for any lawful purpose.</p>
      </>,
    },
    {
      id: "acceptable-use",
      heading: "Acceptable use",
      body: () => <>
        <p>Please don’t:</p>
        <ul>
          <li>upload photos you don’t have the right to use, or that infringe anyone’s copyright, trademark, privacy or other rights;</li>
          <li>upload anything illegal, sexual content involving minors, or content meant to harass, threaten or demean people;</li>
          <li>upload other people’s personal information without their permission;</li>
          <li>misuse generation: automate requests, get around usage limits, or use the service to produce harmful or illegal material;</li>
          <li>try to break, overload or gain unauthorised access to the service or other people’s worlds.</li>
        </ul>
      </>,
    },
    {
      id: "sharing",
      heading: "Sharing",
      body: () => <>
        <p>When you share a world, anyone with the link can view and play that snapshot. Only share worlds you are happy for others to see. We may take down shared worlds that break these terms.</p>
      </>,
    },
    {
      id: "as-is",
      heading: "No warranty",
      body: () => <>
        <p>The service is provided “as is” and “as available”, without warranties of any kind, to the extent the law allows. Keep your own copies of anything important; the app lets you export your worlds.</p>
      </>,
    },
    {
      id: "liability",
      heading: "Limits on liability",
      body: () => <>
        <p>To the extent the law allows, we are not liable for indirect or consequential losses, or for lost data, arising from your use of {BRAND_NAME}. Nothing in these terms limits rights you have that cannot be limited by law.</p>
      </>,
    },
    {
      id: "ending",
      heading: "Ending use",
      body: () => <>
        <p>You can stop using {BRAND_NAME} at any time and ask us to delete your content. We may suspend or close accounts that break these terms or put the service or other people at risk.</p>
      </>,
    },
    {
      id: "changes",
      heading: "Changes to these terms",
      body: () => <>
        <p>We may update these terms. We will post the new version here with a new effective date; if you keep using {BRAND_NAME} after that, the new terms apply.</p>
      </>,
    },
    {
      id: "law",
      heading: "Governing law",
      body: () => <>
        <p><Placeholder>name the country or state whose law governs these terms, and whose courts handle disputes</Placeholder></p>
      </>,
    },
    {
      id: "contact",
      heading: "Contact",
      body: ({ contactEmail }) => <>
        <p>For questions about these terms, <ContactLine email={contactEmail} />.</p>
      </>,
    },
  ],
};

export const LEGAL_DOCUMENTS: Record<LegalDocumentId, LegalDocument> = { privacy, terms };
