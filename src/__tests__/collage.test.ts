import { describe, expect, it } from 'vitest';
import { isSupportedPhotoFile } from '../services/mediaProcessor';
import {
  addMediaToCollageState,
  changeCollageSlotCount,
  clampPhotoCrop,
  createInitialCollageState,
  finalizeCollageForSave,
  getCropImageStyle,
  placeTrayPhotoInSlot,
  removePhotoFromTray,
  sendSlotPhotoToTray,
  swapCollageSlots,
  updateCropInState,
} from '../utils/collage';
import { extractFirstGrapheme } from '../utils/themes';

describe('collage studio state, tray management, crops & HEIC support', () => {
  it('returns displaced extra photo to the tray when shrinking 4 -> 3 and restores on 3 -> 4', () => {
    const initial = createInitialCollageState(['m1', 'm2', 'm3', 'm4'], 'four-grid');
    expect(initial.slotCount).toBe(4);
    expect(initial.slots).toEqual(['m1', 'm2', 'm3', 'm4']);
    expect(initial.tray).toEqual([]);

    const shrunk = changeCollageSlotCount(initial, 3);
    expect(shrunk.slotCount).toBe(3);
    expect(shrunk.slots).toEqual(['m1', 'm2', 'm3']);
    expect(shrunk.tray).toEqual(['m4']);

    const reExpanded = changeCollageSlotCount(shrunk, 4);
    expect(reExpanded.slotCount).toBe(4);
    expect(reExpanded.slots).toEqual(['m1', 'm2', 'm3', 'm4']);
    expect(reExpanded.tray).toEqual([]);
  });

  it('places overflow photos into tray and swaps slots cleanly without losing crops', () => {
    let state = createInitialCollageState(['m1', 'm2'], 'two-col');
    state = updateCropInState(state, 'm1', { x: 20, y: 80, zoom: 1.8 });
    state = addMediaToCollageState(state, ['m3', 'm4', 'm5', 'm6']);

    expect(state.slotCount).toBe(4);
    expect(state.slots).toEqual(['m1', 'm2', 'm3', 'm4']);
    expect(state.tray).toEqual(['m5', 'm6']);

    const swapped = swapCollageSlots(state, 0, 2);
    expect(swapped.slots).toEqual(['m3', 'm2', 'm1', 'm4']);
    expect(swapped.crops['m1']).toEqual({ x: 20, y: 80, zoom: 1.8 });

    const placedFromTray = placeTrayPhotoInSlot(swapped, 'm5', 1);
    expect(placedFromTray.slots).toEqual(['m3', 'm5', 'm1', 'm4']);
    expect(placedFromTray.tray).toEqual(['m2', 'm6']);

    const sentToTray = sendSlotPhotoToTray(placedFromTray, 3);
    expect(sentToTray.slots).toEqual(['m3', 'm5', 'm1', null]);
    expect(sentToTray.tray).toEqual(['m4', 'm2', 'm6']);

    const removed = removePhotoFromTray(sentToTray, 'm6');
    expect(removed.tray).toEqual(['m4', 'm2']);

    const finalized = finalizeCollageForSave(removed);
    expect(finalized.mediaIds).toEqual(['m3', 'm5', 'm1']);
    expect(finalized.collageLayout).toBe('three-mosaic');
    expect(finalized.mediaCrops['m1']).toEqual({ x: 20, y: 80, zoom: 1.8 });
  });

  it('clamps photo crops and formats CSS transform styles cleanly', () => {
    expect(clampPhotoCrop({ x: -25, y: 140, zoom: 5 })).toEqual({
      x: 0,
      y: 100,
      zoom: 3,
    });
    expect(clampPhotoCrop({ x: 35, y: 65, zoom: 0.4 })).toEqual({
      x: 35,
      y: 65,
      zoom: 1,
    });

    const style = getCropImageStyle({ x: 25, y: 75, zoom: 1.5 });
    expect(style).toEqual({
      objectPosition: '25% 75%',
      transformOrigin: '25% 75%',
      transform: 'scale(1.5)',
    });
  });

  it('recognizes HEIC/HEIF files even when browser MIME type is empty', () => {
    expect(isSupportedPhotoFile({ type: '', name: 'IMG_4012.HEIC' })).toBe(true);
    expect(isSupportedPhotoFile({ type: '', name: 'vacation.heif' })).toBe(true);
    expect(isSupportedPhotoFile({ type: 'image/heic', name: 'photo' })).toBe(true);
    expect(isSupportedPhotoFile({ type: 'image/jpeg', name: 'pic.jpg' })).toBe(true);
    expect(isSupportedPhotoFile({ type: 'application/pdf', name: 'doc.pdf' })).toBe(false);
  });

  it('extracts a single custom emoji grapheme cleanly', () => {
    expect(extractFirstGrapheme('  🥳🎉  ')).toBe('🥳');
    expect(extractFirstGrapheme('🏡✨')).toBe('🏡');
    expect(extractFirstGrapheme('   ')).toBe('');
  });
});
