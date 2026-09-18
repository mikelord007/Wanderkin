import { useEffect } from "react";
import type { PhotoReference } from "@shared/index.js";

interface PhotoLightboxProps {
  photos: PhotoReference[];
  index: number;
  onClose: () => void;
  onNavigate: (index: number) => void;
}

/** Full-size photo overlay with left/right keyboard navigation and Escape
 * to close. Numbering matches the user's original upload order. */
export function PhotoLightbox({ photos, index, onClose, onNavigate }: PhotoLightboxProps) {
  const photo = photos[index];

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        onNavigate((index - 1 + photos.length) % photos.length);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        onNavigate((index + 1) % photos.length);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [index, photos.length, onClose, onNavigate]);

  if (!photo) return null;

  return (
    <div
      className="oq-lightbox"
      role="dialog"
      aria-modal="true"
      aria-label={`Photo ${photo.order}${photo.label ? `, ${photo.label}` : ""}`}
      onClick={onClose}
    >
      <button
        type="button"
        className="oq-lightbox__close"
        onClick={onClose}
        aria-label="Close enlarged photo"
      >
        ✕
      </button>
      <button
        type="button"
        className="oq-lightbox__nav oq-lightbox__nav--prev"
        aria-label="Previous photo"
        onClick={(event) => {
          event.stopPropagation();
          onNavigate((index - 1 + photos.length) % photos.length);
        }}
        disabled={photos.length < 2}
      >
        ‹
      </button>
      <figure className="oq-lightbox__figure" onClick={(event) => event.stopPropagation()}>
        <img src={photo.url} alt={photo.label ?? `Photo ${photo.order}`} />
        <figcaption>
          Photo {photo.order}
          {photo.label ? ` — ${photo.label}` : ""} ({index + 1} of {photos.length})
        </figcaption>
      </figure>
      <button
        type="button"
        className="oq-lightbox__nav oq-lightbox__nav--next"
        aria-label="Next photo"
        onClick={(event) => {
          event.stopPropagation();
          onNavigate((index + 1) % photos.length);
        }}
        disabled={photos.length < 2}
      >
        ›
      </button>
    </div>
  );
}
