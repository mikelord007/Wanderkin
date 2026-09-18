import { useEffect, useMemo, useRef, useState } from "react";
import type {
  PhotoReference,
  ProviderCapabilityDescriptor,
  ProviderInputPhoto,
  PhotoViewSlot,
} from "@shared/index.js";
import { describeApiError, getCapabilities, submitJob, uploadPhotos } from "../api.js";
import { PhotoLightbox } from "../components/PhotoLightbox.js";

interface PhotosScreenProps {
  onJobStarted: (jobId: string) => void;
  onBack: () => void;
}

function newIdempotencyKey(): string {
  if ("randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `key-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function PhotosScreen({ onJobStarted, onBack }: PhotosScreenProps) {
  const [photos, setPhotos] = useState<PhotoReference[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const [capabilities, setCapabilities] = useState<ProviderCapabilityDescriptor[] | null>(null);
  const [capabilitiesError, setCapabilitiesError] = useState<string | null>(null);
  const [selectedCapabilityId, setSelectedCapabilityId] = useState<string | null>(null);

  const [includedPhotoIds, setIncludedPhotoIds] = useState<Set<string>>(new Set());
  const [slotAssignments, setSlotAssignments] = useState<Record<string, string>>({});

  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const idempotencyKeyRef = useRef(newIdempotencyKey());
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    getCapabilities()
      .then((list) => {
        if (cancelled) return;
        setCapabilities(list);
        if (list.length > 0) {
          const first = list[0];
          if (first) setSelectedCapabilityId(first.id);
        }
      })
      .catch((error) => {
        if (cancelled) return;
        setCapabilitiesError(describeApiError(error));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedCapability = useMemo(
    () => capabilities?.find((cap) => cap.id === selectedCapabilityId) ?? null,
    [capabilities, selectedCapabilityId],
  );

  async function handleFilesChosen(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    setUploading(true);
    setUploadError(null);
    try {
      const uploaded = await uploadPhotos(Array.from(fileList));
      setPhotos((prev) => [...prev, ...uploaded].sort((a, b) => a.order - b.order));
      setIncludedPhotoIds((prev) => {
        const next = new Set(prev);
        for (const p of uploaded) next.add(p.id);
        return next;
      });
    } catch (error) {
      setUploadError(describeApiError(error));
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function togglePhotoIncluded(photoId: string) {
    setIncludedPhotoIds((prev) => {
      const next = new Set(prev);
      if (next.has(photoId)) {
        next.delete(photoId);
      } else {
        next.add(photoId);
      }
      return next;
    });
  }

  function setSlot(slot: PhotoViewSlot, photoId: string) {
    setSlotAssignments((prev) => {
      const next = { ...prev };
      if (photoId === "") {
        delete next[slot];
      } else {
        next[slot] = photoId;
      }
      return next;
    });
  }

  const usesViewSlots = !!selectedCapability?.requiredViewOrder?.length;

  const { inputPhotos, validationError } = useMemo<{
    inputPhotos: ProviderInputPhoto[];
    validationError: string | null;
  }>(() => {
    if (!selectedCapability) {
      return { inputPhotos: [], validationError: "Select a generation model first." };
    }
    const photoById = new Map(photos.map((p) => [p.id, p] as const));

    if (usesViewSlots) {
      const order = selectedCapability.requiredViewOrder!;
      const filled: ProviderInputPhoto[] = [];
      let sawGap = false;
      for (const slot of order) {
        const photoId = slotAssignments[slot];
        if (!photoId) {
          sawGap = true;
          continue;
        }
        if (sawGap) {
          return {
            inputPhotos: [],
            validationError: `Fill views in order (${order.join(" → ")}) starting from the first — no gaps.`,
          };
        }
        const photo = photoById.get(photoId);
        if (!photo) continue;
        filled.push({ photoId: photo.id, sourceIndex: photo.order, viewSlot: slot });
      }
      if (filled.length < selectedCapability.minPhotos) {
        return {
          inputPhotos: [],
          validationError: `${selectedCapability.displayName} needs at least ${selectedCapability.minPhotos} view${selectedCapability.minPhotos === 1 ? "" : "s"} assigned.`,
        };
      }
      if (filled.length > selectedCapability.maxPhotos) {
        return {
          inputPhotos: [],
          validationError: `${selectedCapability.displayName} accepts at most ${selectedCapability.maxPhotos} views.`,
        };
      }
      return { inputPhotos: filled, validationError: null };
    }

    const included = photos
      .filter((p) => includedPhotoIds.has(p.id))
      .sort((a, b) => a.order - b.order)
      .map((p): ProviderInputPhoto => ({ photoId: p.id, sourceIndex: p.order }));

    if (included.length < selectedCapability.minPhotos) {
      return {
        inputPhotos: [],
        validationError: `${selectedCapability.displayName} needs at least ${selectedCapability.minPhotos} photo${selectedCapability.minPhotos === 1 ? "" : "s"} selected.`,
      };
    }
    if (included.length > selectedCapability.maxPhotos) {
      return {
        inputPhotos: [],
        validationError: `${selectedCapability.displayName} accepts at most ${selectedCapability.maxPhotos} photos — deselect some.`,
      };
    }
    return { inputPhotos: included, validationError: null };
  }, [selectedCapability, usesViewSlots, slotAssignments, includedPhotoIds, photos]);

  async function handleSubmit() {
    if (!selectedCapability || validationError) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const job = await submitJob(
        { capability: selectedCapability.id, photos: inputPhotos, idempotencyKey: idempotencyKeyRef.current },
        idempotencyKeyRef.current,
      );
      onJobStarted(job.id);
    } catch (error) {
      setSubmitError(describeApiError(error));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="oq-screen oq-screen--photos">
      <header className="oq-screen__header">
        <button type="button" className="oq-button oq-button--ghost" onClick={onBack}>
          ← Back
        </button>
        <h1>Add your photos</h1>
        <p className="oq-subtitle">
          Upload photos of a room or furniture corner, choose the views a model needs, then
          generate a 3D level.
        </p>
      </header>

      <section className="oq-panel">
        <div className="oq-upload-row">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            id="oq-photo-input"
            className="oq-visually-hidden"
            onChange={(event) => handleFilesChosen(event.target.files)}
          />
          <label htmlFor="oq-photo-input" className="oq-button oq-button--primary">
            {uploading ? "Uploading…" : "Add photos"}
          </label>
          {uploadError ? <p className="oq-error-text">{uploadError}</p> : null}
        </div>

        {photos.length === 0 ? (
          <p className="oq-empty-hint">No photos yet. Add a few shots of the same room or corner.</p>
        ) : (
          <ul className="oq-photo-grid" aria-label="Uploaded photos">
            {photos.map((photo, index) => {
              const included = usesViewSlots
                ? Object.values(slotAssignments).includes(photo.id)
                : includedPhotoIds.has(photo.id);
              const slotLabel = usesViewSlots
                ? (Object.entries(slotAssignments).find(([, id]) => id === photo.id)?.[0] ?? null)
                : null;
              return (
                <li key={photo.id} className={`oq-photo-card${included ? " oq-photo-card--included" : ""}`}>
                  <button
                    type="button"
                    className="oq-photo-card__thumb"
                    onClick={() => setLightboxIndex(index)}
                    aria-label={`Enlarge photo ${photo.order}`}
                  >
                    <span className="oq-photo-card__number">{photo.order}</span>
                    <img src={photo.url} alt={photo.label ?? `Photo ${photo.order}`} loading="lazy" />
                    {slotLabel ? <span className="oq-photo-card__slot">{slotLabel}</span> : null}
                  </button>
                  {!usesViewSlots ? (
                    <label className="oq-photo-card__checkbox">
                      <input
                        type="checkbox"
                        checked={includedPhotoIds.has(photo.id)}
                        onChange={() => togglePhotoIncluded(photo.id)}
                      />
                      Use this photo
                    </label>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="oq-panel">
        <h2>Generation model</h2>
        {capabilitiesError ? (
          <p className="oq-error-text">{capabilitiesError}</p>
        ) : !capabilities ? (
          <p className="oq-empty-hint">Checking available models…</p>
        ) : capabilities.length === 0 ? (
          <p className="oq-error-text">No generation model is available right now.</p>
        ) : (
          <div className="oq-capability-list" role="radiogroup" aria-label="Generation model">
            {capabilities.map((cap) => (
              <label
                key={cap.id}
                className={`oq-capability-card${cap.id === selectedCapabilityId ? " oq-capability-card--selected" : ""}`}
              >
                <input
                  type="radio"
                  name="capability"
                  checked={cap.id === selectedCapabilityId}
                  onChange={() => setSelectedCapabilityId(cap.id)}
                />
                <span className="oq-capability-card__title">{cap.displayName}</span>
                <span className="oq-capability-card__meta">
                  {cap.requiredViewOrder?.length
                    ? `Views: ${cap.requiredViewOrder.join(", ")} (${cap.minPhotos}-${cap.maxPhotos})`
                    : `${cap.minPhotos}-${cap.maxPhotos} photos, any order`}
                </span>
                {cap.notes ? <span className="oq-capability-card__notes">{cap.notes}</span> : null}
              </label>
            ))}
          </div>
        )}

        {selectedCapability && usesViewSlots ? (
          <div className="oq-slot-assign">
            <p className="oq-subtitle">Assign a photo to each required view, in order:</p>
            {selectedCapability.requiredViewOrder!.map((slot) => (
              <div key={slot} className="oq-slot-row">
                <span className="oq-slot-row__label">{slot}</span>
                <select
                  value={slotAssignments[slot] ?? ""}
                  onChange={(event) => setSlot(slot, event.target.value)}
                >
                  <option value="">— none —</option>
                  {photos.map((photo) => (
                    <option key={photo.id} value={photo.id}>
                      Photo {photo.order}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        ) : null}
      </section>

      {validationError ? <p className="oq-error-text">{validationError}</p> : null}
      {submitError ? <p className="oq-error-text">{submitError}</p> : null}

      <div className="oq-actions">
        <button
          type="button"
          className="oq-button oq-button--primary oq-button--large"
          disabled={!!validationError || submitting}
          onClick={handleSubmit}
        >
          {submitting ? "Starting generation…" : "Generate 3D level"}
        </button>
      </div>

      {lightboxIndex !== null ? (
        <PhotoLightbox
          photos={photos}
          index={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onNavigate={setLightboxIndex}
        />
      ) : null}
    </div>
  );
}
