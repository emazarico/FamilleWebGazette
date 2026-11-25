import type { CSSProperties } from 'react';
import type { CollageLayout, PhotoCrop } from '../types/family';
import { normalizeCollageLayout } from './feed';

export type CollageSlotCount = 1 | 2 | 3 | 4;

export interface CollageStudioState {
  slotCount: CollageSlotCount;
  layout: CollageLayout;
  slots: Array<string | null>;
  tray: string[];
  crops: Record<string, PhotoCrop>;
}

export const DEFAULT_PHOTO_CROP: PhotoCrop = {
  x: 50,
  y: 50,
  zoom: 1,
};

function clampNumber(val: number, min: number, max: number): number {
  if (!Number.isFinite(val)) return min;
  return Math.min(max, Math.max(min, val));
}

export function clampPhotoCrop(crop?: Partial<PhotoCrop> | null): PhotoCrop {
  return {
    x: Math.round(clampNumber(crop?.x ?? DEFAULT_PHOTO_CROP.x, 0, 100) * 10) / 10,
    y: Math.round(clampNumber(crop?.y ?? DEFAULT_PHOTO_CROP.y, 0, 100) * 10) / 10,
    zoom: Math.round(clampNumber(crop?.zoom ?? DEFAULT_PHOTO_CROP.zoom, 1, 3) * 100) / 100,
  };
}

export function getCropImageStyle(crop?: Partial<PhotoCrop> | null): CSSProperties {
  const { x, y, zoom } = clampPhotoCrop(crop);
  return {
    objectPosition: `${x}% ${y}%`,
    transformOrigin: `${x}% ${y}%`,
    transform: zoom > 1 ? `scale(${zoom})` : undefined,
  };
}

function dedupePreserveOrder(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of items) {
    if (id && !seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  return out;
}

export function createInitialCollageState(
  mediaIds: string[],
  layout?: CollageLayout,
  crops?: Record<string, PhotoCrop>,
): CollageStudioState {
  const uniqueIds = dedupePreserveOrder(mediaIds);
  const slotCount = Math.min(4, Math.max(1, uniqueIds.length || 1)) as CollageSlotCount;
  const slots: Array<string | null> = [];
  for (let i = 0; i < slotCount; i++) {
    slots.push(uniqueIds[i] ?? null);
  }
  const tray = uniqueIds.slice(slotCount);
  const normalizedCrops: Record<string, PhotoCrop> = {};
  if (crops) {
    for (const [key, value] of Object.entries(crops)) {
      normalizedCrops[key] = clampPhotoCrop(value);
    }
  }

  return {
    slotCount,
    layout: normalizeCollageLayout(slotCount, layout),
    slots,
    tray,
    crops: normalizedCrops,
  };
}

export function changeCollageSlotCount(
  state: CollageStudioState,
  nextCount: CollageSlotCount,
): CollageStudioState {
  if (nextCount === state.slotCount) return state;

  if (nextCount < state.slotCount) {
    const keptSlots = state.slots.slice(0, nextCount);
    const displaced = state.slots
      .slice(nextCount)
      .filter((id): id is string => Boolean(id));
    const nextTray = dedupePreserveOrder([...displaced, ...state.tray]);
    return {
      ...state,
      slotCount: nextCount,
      layout: normalizeCollageLayout(nextCount, state.layout),
      slots: keptSlots,
      tray: nextTray,
    };
  }

  // Expanding: pull from the front of tray into newly opened slots
  const needed = nextCount - state.slotCount;
  const pulled = state.tray.slice(0, needed);
  const nextSlots: Array<string | null> = [...state.slots, ...pulled];
  while (nextSlots.length < nextCount) {
    nextSlots.push(null);
  }

  return {
    ...state,
    slotCount: nextCount,
    layout: normalizeCollageLayout(nextCount, state.layout),
    slots: nextSlots,
    tray: state.tray.slice(pulled.length),
  };
}

export function addMediaToCollageState(
  state: CollageStudioState,
  incomingIds: string[],
  maxTrayTotal = 12,
): CollageStudioState {
  const existingSet = new Set<string>([
    ...state.slots.filter((id): id is string => Boolean(id)),
    ...state.tray,
  ]);
  const fresh = dedupePreserveOrder(incomingIds).filter((id) => !existingSet.has(id));
  if (fresh.length === 0) return state;

  const availableCapacity = Math.max(0, maxTrayTotal - existingSet.size);
  const accepted = fresh.slice(0, availableCapacity);
  if (accepted.length === 0) return state;

  const nextSlots = [...state.slots];
  let cursor = 0;

  // 1. Fill existing empty slots first
  for (let i = 0; i < nextSlots.length && cursor < accepted.length; i++) {
    if (!nextSlots[i]) {
      nextSlots[i] = accepted[cursor++];
    }
  }

  // 2. Grow slot count up to 4 when all current slots are filled
  while (nextSlots.length < 4 && cursor < accepted.length) {
    nextSlots.push(accepted[cursor++]);
  }

  // 3. Remaining images go to tray
  const overflow = accepted.slice(cursor);
  const nextSlotCount = Math.min(4, Math.max(1, nextSlots.length)) as CollageSlotCount;

  return {
    ...state,
    slotCount: nextSlotCount,
    layout: normalizeCollageLayout(nextSlotCount, state.layout),
    slots: nextSlots,
    tray: dedupePreserveOrder([...state.tray, ...overflow]),
  };
}

export function swapCollageSlots(
  state: CollageStudioState,
  idxA: number,
  idxB: number,
): CollageStudioState {
  if (
    idxA === idxB ||
    idxA < 0 ||
    idxB < 0 ||
    idxA >= state.slots.length ||
    idxB >= state.slots.length
  ) {
    return state;
  }
  const nextSlots = [...state.slots];
  const temp = nextSlots[idxA];
  nextSlots[idxA] = nextSlots[idxB];
  nextSlots[idxB] = temp;
  return {
    ...state,
    slots: nextSlots,
  };
}

export function placeTrayPhotoInSlot(
  state: CollageStudioState,
  trayMediaId: string,
  targetSlotIdx: number,
): CollageStudioState {
  if (
    targetSlotIdx < 0 ||
    targetSlotIdx >= state.slots.length ||
    !state.tray.includes(trayMediaId)
  ) {
    return state;
  }

  const displaced = state.slots[targetSlotIdx];
  const nextSlots = [...state.slots];
  nextSlots[targetSlotIdx] = trayMediaId;

  const withoutInserted = state.tray.filter((id) => id !== trayMediaId);
  const nextTray = displaced
    ? dedupePreserveOrder([displaced, ...withoutInserted])
    : withoutInserted;

  return {
    ...state,
    slots: nextSlots,
    tray: nextTray,
  };
}

export function sendSlotPhotoToTray(
  state: CollageStudioState,
  slotIdx: number,
): CollageStudioState {
  if (slotIdx < 0 || slotIdx >= state.slots.length) return state;
  const photo = state.slots[slotIdx];
  if (!photo) return state;

  const nextSlots = [...state.slots];
  nextSlots[slotIdx] = null;

  return {
    ...state,
    slots: nextSlots,
    tray: dedupePreserveOrder([photo, ...state.tray]),
  };
}

export function removePhotoFromTray(
  state: CollageStudioState,
  mediaId: string,
): CollageStudioState {
  if (!state.tray.includes(mediaId)) return state;
  const nextCrops = { ...state.crops };
  delete nextCrops[mediaId];
  return {
    ...state,
    tray: state.tray.filter((id) => id !== mediaId),
    crops: nextCrops,
  };
}

export function updateCropInState(
  state: CollageStudioState,
  mediaId: string,
  patch: Partial<PhotoCrop>,
): CollageStudioState {
  const current = state.crops[mediaId] ?? DEFAULT_PHOTO_CROP;
  return {
    ...state,
    crops: {
      ...state.crops,
      [mediaId]: clampPhotoCrop({ ...current, ...patch }),
    },
  };
}

export function resetCropInState(
  state: CollageStudioState,
  mediaId: string,
): CollageStudioState {
  if (!state.crops[mediaId]) return state;
  const nextCrops = { ...state.crops };
  delete nextCrops[mediaId];
  return {
    ...state,
    crops: nextCrops,
  };
}

export function finalizeCollageForSave(state: CollageStudioState): {
  mediaIds: string[];
  collageLayout: CollageLayout;
  mediaCrops: Record<string, PhotoCrop>;
} {
  const mediaIds = state.slots.filter((id): id is string => Boolean(id));
  const collageLayout = normalizeCollageLayout(mediaIds.length, state.layout);
  const mediaCrops: Record<string, PhotoCrop> = {};
  for (const id of mediaIds) {
    if (state.crops[id]) {
      mediaCrops[id] = clampPhotoCrop(state.crops[id]);
    }
  }
  return {
    mediaIds,
    collageLayout,
    mediaCrops,
  };
}
