import type { StyleId } from "@shared/index.js";
import "./kit.css";

/**
 * The fixed illustrative style example.
 *
 * All four pictures are the same photograph of the same room: one untouched
 * reference and three genuine restyles of it, generated once at build time and
 * committed to `public/style-previews/` (see `provenance.json` there for the
 * model, prompts, and hashes). Nothing here is a filter, and nothing here is a
 * preview of the person's own object — choosing a look only moves a radio
 * button, it never calls a provider.
 */
export interface StyleExampleEntry {
  id: StyleId;
  label: string;
  description: string;
  src: string;
  alt: string;
}

export const STYLE_REFERENCE = {
  src: "/style-previews/room-photo.jpg",
  alt: "The reference photograph: a small room with a wooden desk, a laptop, and a dark fabric sofa",
} as const;

export const STYLE_EXAMPLES: readonly StyleExampleEntry[] = [
  {
    id: "cartoon",
    label: "Cartoon",
    description: "Flat color, clean outlines, everything a little bolder than life.",
    src: "/style-previews/room-cartoon.jpg",
    alt: "The same room as a cartoon: flat saturated color and clean dark outlines",
  },
  {
    id: "hand-painted",
    label: "Hand-painted",
    description: "Thick brush strokes and warm light, like a page from a storybook.",
    src: "/style-previews/room-hand-painted.jpg",
    alt: "The same room as an oil painting: visible brush strokes and warm golden light",
  },
  {
    id: "watercolor",
    label: "Watercolor",
    description: "Soft washes, paper grain, and plenty of air around everything.",
    src: "/style-previews/room-watercolor.jpg",
    alt: "The same room as a watercolor: translucent washes, soft bleeds, and visible paper grain",
  },
];

/**
 * The reference half of the example: the untouched photo, captioned so nobody
 * can mistake it for their own upload.
 */
export function StyleReference() {
  return (
    <figure className="oq-style-example">
      <img src={STYLE_REFERENCE.src} alt={STYLE_REFERENCE.alt} loading="lazy" width={1120} height={630} />
      <figcaption>
        <strong>An example photo, styled three ways.</strong>
        <span>
          Each look below is this exact photograph, redrawn. Your own object gets
          the same treatment on the next step.
        </span>
      </figcaption>
    </figure>
  );
}
