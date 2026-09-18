import { useEffect, useMemo, useRef, useState } from "react";
import type { PhotoReference, ProviderCapabilityDescriptor, PhotoViewSlot } from "@shared/index.js";
import { describeApiError, getCapabilities, submitJob, uploadPhotos } from "../api.js";
import { PhotoLightbox } from "../components/PhotoLightbox.js";
import { buildProviderInputPhotos, deriveSelectionFromInputPhotos } from "../photoSelection.js";
import {
  clearPendingSubmission,
  loadPendingSubmission,
  saveActiveSource,
  savePendingSubmission,
  type PendingSubmission,
} from "../jobStorage.js";

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

function capabilityInputSummary(capability: ProviderCapabilityDescriptor): string {
  const count =
    capability.minPhotos === capability.maxPhotos
      ? `${capability.minPhotos} photo${capability.minPhotos === 1 ? "" : "s"}`
      : `${capability.minPhotos}–${capability.maxPhotos} photos`;
  const views = capability.requiredViewOrder;
  if (!views?.length) return `Use ${count} in any order.`;
  return `Use ${count}. Assign views in order: ${views.join(", ")}.`;
}

function capabilityFallbackNotice(capability: ProviderCapabilityDescriptor): string | null {
  if (!capability.notes?.toLowerCase().includes("fallback")) return null;
  return (
    "If this model is unavailable, the provider may use a compatible alternative. " +
    "The result will record which model was used."
  );
}

/** A submission in localStorage before its POST /api/jobs response ever
 * arrived (reload, tab close, timeout) — the server may already have
 * accepted it, so resuming must reuse the same idempotencyKey and the same
 * already-uploaded photo refs rather than re-uploading and minting new ids
 * under that key. */
function restoredFromPending(): PendingSubmission | null {
  return loadPendingSubmission();
}

export function PhotosScreen({ onJobStarted, onBack }: PhotosScreenProps) {
  const resumed = useRef(restoredFromPending()).current;

  const [photos, setPhotos] = useState<PhotoReference[]>(resumed?.photos ?? []);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const [capabilities, setCapabilities] = useState<ProviderCapabilityDescriptor[] | null>(null);
  const [capabilitiesError, setCapabilitiesError] = useState<string | null>(null);
  const [selectedCapabilityId, setSelectedCapabilityId] = useState<string | null>(
    resumed?.capability ?? null,
  );

  const restoredSelection = resumed ? deriveSelectionFromInputPhotos(resumed.inputPhotos) : null;
  const [includedPhotoIds, setIncludedPhotoIds] = useState<Set<string>>(
    restoredSelection?.includedPhotoIds ?? new Set(),
  );
  const [slotAssignments, setSlotAssignments] = useState<Record<string, string>>(
    restoredSelection?.slotAssignments ?? {},
  );

  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [resuming, setResuming] = useState(!!resumed);

  const idempotencyKeyRef = useRef(resumed?.idempotencyKey ?? newIdempotencyKey());
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const autoResumeAttempted = useRef(false);

  useEffect(() => {
    let cancelled = false;
    getCapabilities()
      .then((list) => {
        if (cancelled) return;
        setCapabilities(list);
        if (!resumed && list.length > 0) {
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
    // Only ever runs once — `resumed` is a ref snapshot from mount time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const { inputPhotos, validationError } = useMemo(
    () => buildProviderInputPhotos(selectedCapability, photos, includedPhotoIds, slotAssignments),
    [selectedCapability, slotAssignments, includedPhotoIds, photos],
  );

  async function handleSubmit() {
    if (!selectedCapability || validationError) return;
    setSubmitting(true);
    setSubmitError(null);

    // Persist BEFORE the network call: if the response never arrives
    // (timeout/reload/tab close), the server may already have accepted
    // this request. A reload must retry with this exact key and these
    // exact already-uploaded photo refs, never re-upload and mint new ids.
    savePendingSubmission({
      idempotencyKey: idempotencyKeyRef.current,
      capability: selectedCapability.id,
      inputPhotos,
      photos,
    });

    try {
      const job = await submitJob(
        { capability: selectedCapability.id, photos: inputPhotos, idempotencyKey: idempotencyKeyRef.current },
        idempotencyKeyRef.current,
      );
      // Durable job id confirmed — the pending submission phase is over.
      clearPendingSubmission();
      saveActiveSource({ kind: "job", jobId: job.id, photos });
      onJobStarted(job.id);
    } catch (error) {
      // Leave the pending submission in place: this attempt is still
      // reconcilable under the same key on retry or after a reload.
      setSubmitError(describeApiError(error));
    } finally {
      setSubmitting(false);
      setResuming(false);
    }
  }

  useEffect(() => {
    if (!resumed || autoResumeAttempted.current) return;
    if (!selectedCapability || validationError) return;
    autoResumeAttempted.current = true;
    handleSubmit();
    // handleSubmit closes over current state; only fire once selection is
    // valid again after restoring it from the pending submission.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resumed, selectedCapability, validationError]);

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

      {resuming ? (
        <div className="oq-panel">
          <p className="oq-warning-text">
            Resuming a submission that didn't finish confirming last time — retrying now without
            re-uploading your photos.
          </p>
        </div>
      ) : null}

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
            {capabilities.map((cap) => {
              const fallbackNotice = capabilityFallbackNotice(cap);
              return (
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
                  <span className="oq-capability-card__meta">{capabilityInputSummary(cap)}</span>
                  {fallbackNotice ? (
                    <span className="oq-capability-card__notes">{fallbackNotice}</span>
                  ) : null}
                </label>
              );
            })}
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
