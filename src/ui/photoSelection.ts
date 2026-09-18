import type {
  PhotoReference,
  PhotoViewSlot,
  ProviderCapabilityDescriptor,
  ProviderInputPhoto,
} from "@shared/index.js";

export interface PhotoSelectionResult {
  inputPhotos: ProviderInputPhoto[];
  validationError: string | null;
}

/**
 * Pure selection → ProviderInputPhoto[] builder, shared by the live Photos
 * screen UI and by state restored from a persisted PendingSubmission. Two
 * selection shapes: view-slot assignment (Tripo-style, ordered, no gaps)
 * or free inclusion (Rodin-style, any subset in upload order).
 */
export function buildProviderInputPhotos(
  capability: ProviderCapabilityDescriptor | null,
  photos: readonly PhotoReference[],
  includedPhotoIds: ReadonlySet<string>,
  slotAssignments: Readonly<Record<string, string>>,
): PhotoSelectionResult {
  if (!capability) {
    return { inputPhotos: [], validationError: "Select a generation model first." };
  }
  const photoById = new Map(photos.map((p) => [p.id, p] as const));

  if (capability.requiredViewOrder?.length) {
    const order = capability.requiredViewOrder;
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
    if (filled.length < capability.minPhotos) {
      return {
        inputPhotos: [],
        validationError: `${capability.displayName} needs at least ${capability.minPhotos} view${capability.minPhotos === 1 ? "" : "s"} assigned.`,
      };
    }
    if (filled.length > capability.maxPhotos) {
      return {
        inputPhotos: [],
        validationError: `${capability.displayName} accepts at most ${capability.maxPhotos} views.`,
      };
    }
    return { inputPhotos: filled, validationError: null };
  }

  const included = photos
    .filter((p) => includedPhotoIds.has(p.id))
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((p): ProviderInputPhoto => ({ photoId: p.id, sourceIndex: p.order }));

  if (included.length < capability.minPhotos) {
    return {
      inputPhotos: [],
      validationError: `${capability.displayName} needs at least ${capability.minPhotos} photo${capability.minPhotos === 1 ? "" : "s"} selected.`,
    };
  }
  if (included.length > capability.maxPhotos) {
    return {
      inputPhotos: [],
      validationError: `${capability.displayName} accepts at most ${capability.maxPhotos} photos — deselect some.`,
    };
  }
  return { inputPhotos: included, validationError: null };
}

export interface RestoredSelection {
  includedPhotoIds: Set<string>;
  slotAssignments: Record<string, string>;
}

/** Inverse of buildProviderInputPhotos — reconstructs UI selection state
 * from a persisted PendingSubmission's inputPhotos so a resumed Photos
 * screen reflects exactly what was (or is about to be) submitted. */
export function deriveSelectionFromInputPhotos(
  inputPhotos: readonly ProviderInputPhoto[],
): RestoredSelection {
  const includedPhotoIds = new Set<string>();
  const slotAssignments: Record<string, string> = {};
  for (const input of inputPhotos) {
    includedPhotoIds.add(input.photoId);
    if (input.viewSlot) {
      slotAssignments[input.viewSlot as PhotoViewSlot] = input.photoId;
    }
  }
  return { includedPhotoIds, slotAssignments };
}
