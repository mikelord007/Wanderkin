/**
 * Mousehold — product identity, in one place.
 *
 * The name is a portmanteau of *mouse* and *household*: the ordinary domestic
 * world seen from a mouse's-eye view. That is exactly what the product does —
 * it takes a photo of something everyday and turns it into a place you are
 * small enough to explore.
 *
 * Anything that renders the product name, tagline, or file-naming stem should
 * read it from here rather than hard-coding a string, so a future rename is a
 * one-file change. The `<Logo>` component in `src/ui/components/Logo.tsx` is
 * the visual half of the same identity.
 */

/** Product name as it appears in prose and in the wordmark. */
export const BRAND_NAME = "Mousehold";

/** The one-line promise. Used on the landing hero and in share metadata. */
export const BRAND_TAGLINE = "Everything is enormous when you're this small.";

/** A sentence that explains the product to someone who has never seen it. */
export const BRAND_DESCRIPTION =
  "Turn a photo of an everyday object into a tiny world you can run, climb, and jump around in.";

/**
 * Lowercase, punctuation-free stem for generated filenames and storage keys.
 * Existing persisted keys deliberately keep their historical prefix — this is
 * only for names a person will see, such as downloaded bundles.
 */
export const BRAND_SLUG = "mousehold";

/** File extension stem for exported world bundles: `<name>.mousehold.json`. */
export const BRAND_BUNDLE_EXTENSION = `${BRAND_SLUG}.json`;
