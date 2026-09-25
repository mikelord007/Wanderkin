/**
 * Wanderkin — product identity, in one place.
 *
 * *Wander* is exploring without a fixed route; *-kin* is the old English
 * diminutive (munchkin, bumpkin). A wanderkin is a very small explorer, which
 * is what the product makes you: it takes a photo of something everyday and
 * shrinks you down until that thing is a world to explore.
 *
 * Anything that renders the product name, tagline, or file-naming stem should
 * read it from here rather than hard-coding a string, so a future rename is a
 * one-file change. The `<Logo>` component in `src/ui/components/Logo.tsx` is
 * the visual half of the same identity.
 */

/** Product name as it appears in prose and in the wordmark. */
export const BRAND_NAME = "Wanderkin";

/** The one-line promise. Used on the landing page footer. */
export const BRAND_TAGLINE = "Everything is enormous when you're this small.";

/** A sentence that explains the product to someone who has never seen it. */
export const BRAND_DESCRIPTION =
  "Turn a photo of an everyday object into a tiny world you can run, climb, and jump around in.";

/**
 * Lowercase, punctuation-free stem for generated filenames. Persisted storage
 * keys, protocol names, and `window.__objectquest` deliberately keep their
 * historical names. This stem is only for names a person will see, such as
 * downloaded bundles and gameplay clips.
 */
export const BRAND_SLUG = "wanderkin";

/** File extension stem for exported world bundles: `<name>.wanderkin.json`. */
export const BRAND_BUNDLE_EXTENSION = `${BRAND_SLUG}.json`;
