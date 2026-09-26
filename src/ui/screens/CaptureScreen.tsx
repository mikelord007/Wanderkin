import { useEffect, useRef, useState, type DragEvent } from "react";
import { Button, Card, Icon, Modal } from "../components/index.js";
import { validateImageFile } from "../imageValidation.js";
import { CreationFrame } from "./CreationFrame.js";

export interface CaptureScreenProps {
  initialPhotoUrl?: string;
  onUsePhoto: (file?: File) => Promise<void>;
  onBack: () => void;
}

export function CaptureScreen({ initialPhotoUrl, onUsePhoto, onBack }: CaptureScreenProps) {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState(initialPhotoUrl ?? null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => {
    if (videoRef.current && stream) videoRef.current.srcObject = stream;
  }, [stream, cameraOpen]);

  useEffect(() => () => stream?.getTracks().forEach((track) => track.stop()), [stream]);

  async function choose(candidate: File | null) {
    if (!candidate) return;
    setError(null);
    try {
      await validateImageFile(candidate);
      setFile(candidate);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Choose a different photo.");
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    void choose(event.dataTransfer.files[0] ?? null);
  }

  async function openCamera() {
    setCameraError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError("Camera unavailable. Choose a photo instead.");
      return;
    }
    try {
      const nextStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      setStream(nextStream);
      setCameraOpen(true);
    } catch {
      setCameraError("Camera unavailable. Choose a photo instead.");
    }
  }

  function closeCamera() {
    stream?.getTracks().forEach((track) => track.stop());
    setStream(null);
    setCameraOpen(false);
  }

  function capturePhoto() {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0 || video.videoHeight === 0) {
      setCameraError("The camera is still getting ready. Try again in a moment.");
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0);
    canvas.toBlob((blob) => {
      if (!blob) {
        setCameraError("We couldn’t capture that photo. Try again or choose a photo.");
        return;
      }
      closeCamera();
      void choose(new File([blob], `object-${Date.now()}.jpg`, { type: "image/jpeg" }));
    }, "image/jpeg", 0.92);
  }

  async function usePhoto() {
    if (!previewUrl) return;
    setUploading(true);
    setError(null);
    try {
      await onUsePhoto(file ?? undefined);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "We couldn’t upload this photo. Try again.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <CreationFrame activeStep={0} eyebrow="Step 1 of 5 · Photo" title="What will your world be made of?" onBack={onBack}>
      <section className="oq-capture" aria-label="Choose an object photo">
        <Card className="oq-capture__card">
          {previewUrl ? (
            <figure className="oq-capture__preview">
              <img src={previewUrl} alt="Your selected object" />
              <figcaption>Ready to review</figcaption>
            </figure>
          ) : (
            <div
              className={`oq-capture__drop${dragging ? " oq-capture__drop--active" : ""}`}
              onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
              onDragOver={(event) => event.preventDefault()}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
            >
              <span className="oq-capture__icon"><Icon name="photo" /></span>
              <h2>Choose one clear photo</h2>
              <p className="oq-kit-muted">Drop a photo here, or pick one from your device.</p>
              <div className="oq-kit-row oq-capture__actions">
                <Button onClick={() => inputRef.current?.click()}>Choose from photos</Button>
                <Button variant="secondary" onClick={() => void openCamera()}>Take a photo</Button>
              </div>
            </div>
          )}
          <input
            ref={inputRef}
            className="oq-kit-sr-only"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            aria-label="Choose an object photo"
            onChange={(event) => void choose(event.target.files?.[0] ?? null)}
          />
          {error ? <p className="oq-kit-error" role="alert">{error}</p> : null}
          {cameraError ? <p className="oq-kit-error" role="alert">{cameraError}</p> : null}
          {previewUrl ? (
            <div className="oq-kit-row oq-capture__confirm">
              <Button loading={uploading} loadingLabel="Uploading your photo…" onClick={() => void usePhoto()}>Use this photo</Button>
              <Button variant="secondary" disabled={uploading} onClick={() => inputRef.current?.click()}>Retake or replace</Button>
              <Button variant="ghost" disabled={uploading} onClick={onBack}>Back</Button>
            </div>
          ) : null}
        </Card>
        <aside className="oq-capture__tips" aria-labelledby="photo-tips-title">
          <p className="oq-kit-eyebrow">A tiny field guide</p>
          <h2 id="photo-tips-title">Help us see the whole object</h2>
          <ol>
            <li><span>1</span><div><strong>Show the whole object</strong><p>Leave a little room around every edge.</p></div></li>
            <li><span>2</span><div><strong>Find good light</strong><p>Soft daylight makes shapes easier to see.</p></div></li>
            <li><span>3</span><div><strong>Keep it simple</strong><p>A plain background helps your object stand out.</p></div></li>
          </ol>
          <p className="oq-kit-muted">One photo is enough. You can add extra angles later when a world needs them.</p>
        </aside>
      </section>
      <Modal open={cameraOpen} onClose={closeCamera} title="Take a photo">
        <video className="oq-capture__video" ref={videoRef} autoPlay playsInline muted aria-label="Camera preview" />
        <p className="oq-kit-muted">Center the whole object, then capture the photo.</p>
        <div className="oq-kit-row">
          <Button onClick={capturePhoto}>Capture photo</Button>
          <Button variant="secondary" onClick={closeCamera}>Cancel</Button>
        </div>
      </Modal>
    </CreationFrame>
  );
}

