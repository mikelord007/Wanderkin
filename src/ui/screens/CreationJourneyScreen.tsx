import { useEffect, useRef, useState } from "react";
import { STYLE_DEFINITIONS, type ImageEditGenerationRequest, type ImageTo3dGenerationRequest } from "@shared/index.js";
import { approvePreview, describeApiError, getJob, retryJob, submitGeneration, submitPreview, uploadPhotos } from "../api.js";
import { canBuildWorld,createCreationRecord, visiblePreviewUrl, withCreationUpdate, withNewPhoto, withoutPhoto, withReadyPreview, type CreationRecord } from "../creationFlow.js";
import { loadActiveCreation, loadCreationRecords, saveCreationRecord, setActiveCreationId, updateCreationJob } from "../creationStorage.js";
import { saveActiveSource } from "../jobStorage.js";
import { startWorldBuild } from "../worldBuild.js";
import { CaptureScreen } from "./CaptureScreen.js";
import { ReviewObjectScreen } from "./ReviewObjectScreen.js";
import { CustomizeScreen } from "./CustomizeScreen.js";
import { StylePreviewScreen } from "./StylePreviewScreen.js";

interface CreationJourneyScreenProps { onJobStarted: (jobId: string) => void; onBack: () => void; }
function newKey(prefix: string): string { const suffix = "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`; return `${prefix}-${suffix}`; }
/** Resumes the creation in progress, but never one whose build has started:
 * that one lives in My worlds now, so Create starts again at step 1. */
function initialRecord(): CreationRecord { const restored = loadActiveCreation(); if (restored && restored.step !== "building" && restored.step !== "ready") return restored; const record = createCreationRecord(newKey("world")); saveCreationRecord(record); setActiveCreationId(record.id); return record; }

/** Step 3's preview slot: this creation's own preview, or an empty slot. */
function previewProps(record: CreationRecord): { previewUrl?: string } { const url = visiblePreviewUrl(record); return url ? { previewUrl: url } : {}; }

export function CreationJourneyScreen({ onJobStarted, onBack }: CreationJourneyScreenProps) {
  const [record, setRecord] = useState<CreationRecord>(initialRecord);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewVariant, setPreviewVariant] = useState(0);
  const navigatedJob = useRef<string | null>(null);
  function persist(next: CreationRecord) { setRecord(next); saveCreationRecord(next); setActiveCreationId(next.id); }

  useEffect(() => { const shape = record.jobs.shape; if (record.step !== "building" || !shape || navigatedJob.current === shape.id) return; navigatedJob.current = shape.id; onJobStarted(shape.id); }, [onJobStarted, record]);
  const observedStage = record.step === "review" ? "object" : record.step === "preview" ? "preview" : null;
  const observedJob = observedStage ? record.jobs[observedStage] : undefined;
  useEffect(() => {
    if (!observedStage || !observedJob || observedJob.state === "ready" || observedJob.state === "failed") return;
    let cancelled = false; let timer = 0;
    const observe = async () => {
      try {
        const job = await getJob(observedJob.id); if (cancelled) return;
        let next = updateCreationJob(record, observedStage, job);
        if (job.state === "ready" && job.result?.kind === "image-edit") {
          if (observedStage === "object") next = withCreationUpdate(next, { objectImage: job.result.asset });
          else next = withReadyPreview(next, record, job.id, job.result.asset);
        }
        persist(next);
        if (job.state !== "ready" && job.state !== "failed") timer = window.setTimeout(observe, 900);
      } catch (caught) { if (!cancelled) { setError(describeApiError(caught)); timer = window.setTimeout(observe, 1800); } }
    };
    timer = window.setTimeout(observe, 300);
    return () => { cancelled = true; window.clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [observedStage, observedJob?.id, observedJob?.state]);

  async function usePhoto(file?: File) {
    setError(null); let photo = record.photo;
    if (file) { const uploaded = await uploadPhotos([file]); photo = uploaded[0]; }
    if (!photo) throw new Error("Choose a photo before continuing.");
    // A different photo drops the old cut-out, preview and approval (see
    // withNewPhoto), so step 3 never shows another photo's preview. The cut-out
    // is always redone, as before.
    const fresh = withNewPhoto(record, photo);
    const jobs = { ...fresh.jobs }; delete jobs.object;
    const next = withCreationUpdate(fresh, { useOriginalImage: false, jobs }); delete next.objectImage; persist(next);
    try {
      const request: ImageEditGenerationRequest = { schemaVersion: 1, kind: "image-edit", capability: "bg-remove", idempotencyKey: newKey("object"), purpose: "object-cutout", sourceImageAssetId: photo.id, instruction: "Remove the background while preserving the complete photographed object and every edge.", outputMimeType: "image/png" };
      persist(updateCreationJob(next, "object", await submitGeneration({ request, worldId: next.id })));
    } catch (caught) { setError(describeApiError(caught)); throw caught; }
  }

  async function retryIsolation() {
    const jobRef = record.jobs.object; setBusy(true); setError(null);
    try {
      if (jobRef) persist(updateCreationJob(record, "object", await retryJob(jobRef.id)));
      else if (record.photo) { const request: ImageEditGenerationRequest = { schemaVersion: 1, kind: "image-edit", capability: "bg-remove", idempotencyKey: newKey("object"), purpose: "object-cutout", sourceImageAssetId: record.photo.id, instruction: "Remove the background while preserving the complete photographed object and every edge.", outputMimeType: "image/png" }; persist(updateCreationJob(record, "object", await submitGeneration({ request, worldId: record.id }))); }
    } catch (caught) { setError(describeApiError(caught)); } finally { setBusy(false); }
  }

  async function createPreview(variant = previewVariant) {
    const sourceId = record.objectImage?.id ?? record.photo?.id; if (!sourceId) return;
    setBusy(true); setError(null); const definition = STYLE_DEFINITIONS[record.selection.style];
    const variation = variant > 0 ? ` Create a distinct variation ${variant}.` : "";
    const atmosphere = record.selection.atmosphere.trim() ? ` Atmosphere: ${record.selection.atmosphere.trim()}.` : "";
    const request: ImageEditGenerationRequest = { schemaVersion: 1, kind: "image-edit", capability: "kontext-edit", idempotencyKey: newKey("preview"), purpose: "style-preview", sourceImageAssetId: sourceId, instruction: `${definition.imagePrompts.preview} ${definition.imagePrompts.negative}${atmosphere}${variation}`, outputMimeType: "image/png" };
    try {
      const response = await submitPreview({ request, worldId: record.id }); let next = updateCreationJob(withCreationUpdate(record, { step: "preview" }), "preview", response.job);
      const asset = response.job.result?.kind === "image-edit" ? response.job.result.asset : null;
      const selection = { ...record.selection };
      if (asset) {
        next = withCreationUpdate(next, { preview: { cacheKey: response.cacheKey, jobId: response.job.id, asset, selection, ...(response.approved ? { approvedAt: new Date().toISOString() } : {}) } });
        delete next.pendingPreview;
      } else {
        // No picture yet: the slot keeps this photo's last successful preview,
        // or stays empty. Nothing else (the cut-out, an older creation) stands in.
        next = withCreationUpdate(next, { pendingPreview: { cacheKey: response.cacheKey, jobId: response.job.id, selection } });
      }
      persist(next);
    } catch (caught) { setError(describeApiError(caught)); } finally { setBusy(false); }
  }

  async function approveCurrentPreview() {
    if (!record.preview || record.jobs.preview?.state !== "ready") return; setBusy(true); setError(null);
    try {
      await approvePreview(record.preview.cacheKey, record.preview.jobId);
      const reviewedImageAssetId = record.reviewedImageAssetId ?? record.objectImage?.id ?? record.photo?.id;
      if (!reviewedImageAssetId || !record.photo) return;
      persist(withCreationUpdate(record, {
        preview: { ...record.preview, approvedAt: new Date().toISOString() },
        reviewedImageAssetId,
        selectedReference: {
          photoIds: [record.photo.id],
          reviewedImageAssetId,
          approvedPreviewAssetId: record.preview.asset.id,
          style: record.selection.style,
          mode: record.selection.mode,
          atmosphere: record.selection.atmosphere,
        },
      }));
    }
    catch (caught) { setError(describeApiError(caught)); } finally { setBusy(false); }
  }

  async function buildWorld() {
    if (!canBuildWorld(record) || !record.photo) return; setBusy(true); setError(null);
    const reviewedImageAssetId = record.reviewedImageAssetId ?? record.objectImage?.id ?? record.photo.id;
    const request: ImageTo3dGenerationRequest = { schemaVersion: 1, kind: "image-to-3d", capability: "rodin-i3d", idempotencyKey: newKey("shape"), purpose: "world-mesh", photos: [{ photoId: record.photo.id, sourceIndex: 1 }], sourceImageAssetIds: [reviewedImageAssetId], styleReferenceAssetId: record.preview.asset.id, scenePrompt: `${STYLE_DEFINITIONS[record.selection.style].imagePrompts.geometryReference} ${record.selection.atmosphere}`.trim() };
    const photo = record.photo;
    try {
      // The build moves on to My worlds as soon as the shape exists. Story and
      // music start with it, so they are made even if nobody opens the progress
      // screen; they land in the stored record after Create has been left.
      // Claiming the shape before the save keeps the step-4 effect above from
      // handing it over a second time.
      await startWorldBuild(record, request, {
        submit: generation => submitGeneration({ request: generation, worldId: record.id }),
        save: next => { if (next.jobs.shape) navigatedJob.current = next.jobs.shape.id; persist(next); },
        record: (stage, job) => { const current = loadCreationRecords().find(candidate => candidate.id === record.id); if (current) saveCreationRecord(updateCreationJob(current, stage, job)); },
        key: newKey,
        navigate: next => { const shapeId = next.jobs.shape!.id; saveActiveSource({ kind: "job", jobId: shapeId, photos: [photo] }); onJobStarted(shapeId); },
      });
    }
    catch (caught) { setError(describeApiError(caught)); } finally { setBusy(false); }
  }

  if (record.step === "photo") return <CaptureScreen {...(record.photo?.url ? { initialPhotoUrl: record.photo.url } : {})} onUsePhoto={usePhoto} onBack={onBack} />;
  if (record.step === "review" && record.photo) { const objectJob = record.jobs.object; const reviewDetail = error ?? objectJob?.error; return <ReviewObjectScreen originalUrl={record.photo.url} {...(record.objectImage?.url ? { cutoutUrl: record.objectImage.url } : {})} state={objectJob?.state === "failed" ? "broken" : record.objectImage ? "ready" : "loading"} {...(reviewDetail ? { detail: reviewDetail } : {})} crop={record.crop} onCropChange={crop => persist(withCreationUpdate(record, { crop }))} onAccept={() => record.objectImage && persist(withCreationUpdate(record, { step: "customize", useOriginalImage: false, reviewedImageAssetId: record.objectImage.id }))} onUseOriginal={() => persist(withCreationUpdate(record, { step: "customize", useOriginalImage: true, reviewedImageAssetId: record.photo!.id }))} onReplace={() => persist(withoutPhoto(record))} onRetryIsolation={() => void retryIsolation()} onBack={() => persist(withCreationUpdate(record, { step: "photo" }))} />; }
  if (record.step === "customize") return <CustomizeScreen selection={record.selection} onChange={selection => persist(withCreationUpdate(record, { selection }))} onPreview={() => { persist(withCreationUpdate(record, { step: "preview" })); void createPreview(); }} onBack={() => persist(withCreationUpdate(record, { step: "review" }))} submitting={busy} {...(error ? { error } : {})} />;
  if (record.step === "preview" && record.photo) { const previewJob = record.jobs.preview; const previewError = error ?? previewJob?.error; return <StylePreviewScreen originalUrl={(record.useOriginalImage ? record.photo : record.objectImage)?.url ?? record.photo.url} {...previewProps(record)} selection={record.selection} state={previewJob?.state === "failed" ? "failed" : previewJob?.state === "ready" && record.preview ? "ready" : "loading"} approved={canBuildWorld(record)} {...(previewError ? { error: previewError } : {})} approving={busy} building={busy} onApprove={() => void approveCurrentPreview()} onBuild={() => void buildWorld()} onChangeLook={() => persist(withCreationUpdate(record, { step: "customize" }))} onRetry={() => { const variant = previewVariant + 1; setPreviewVariant(variant); void createPreview(variant); }} onBack={() => persist(withCreationUpdate(record, { step: "customize" }))} />; }
  return <CaptureScreen onUsePhoto={usePhoto} onBack={onBack} />;
}
