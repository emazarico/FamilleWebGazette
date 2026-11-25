import React, { useMemo, useRef, useState } from 'react';
import {
  ArrowLeftRight,
  ArrowDownToLine,
  ImagePlus,
  Move,
  Plus,
  RotateCcw,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { useFamily } from '../../store/FamilyContext';
import type { CollageLayout } from '../../types/family';
import {
  changeCollageSlotCount,
  clampPhotoCrop,
  type CollageSlotCount,
  type CollageStudioState,
  DEFAULT_PHOTO_CROP,
  placeTrayPhotoInSlot,
  removePhotoFromTray,
  resetCropInState,
  sendSlotPhotoToTray,
  swapCollageSlots,
  updateCropInState,
} from '../../utils/collage';
import { normalizeCollageLayout } from '../../utils/feed';
import { COLLAGE_LAYOUT_OPTIONS } from '../../utils/themes';
import { MediaImage } from '../common/MediaImage';

interface CollageStudioProps {
  state: CollageStudioState;
  onChange: React.Dispatch<React.SetStateAction<CollageStudioState>>;
  onUploadFiles: (files: FileList | File[]) => Promise<void>;
  uploading: boolean;
  uploadingLabel?: string;
}

const LayoutThumbIcon: React.FC<{ layout: CollageLayout }> = ({ layout }) => {
  switch (layout) {
    case 'single':
      return (
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
          <rect x="3" y="4" width="18" height="16" rx="2.5" />
        </svg>
      );
    case 'two-col':
      return (
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
          <rect x="3" y="4" width="8" height="16" rx="1.5" />
          <rect x="13" y="4" width="8" height="16" rx="1.5" />
        </svg>
      );
    case 'two-row':
      return (
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
          <rect x="3" y="4" width="18" height="7" rx="1.5" />
          <rect x="3" y="13" width="18" height="7" rx="1.5" />
        </svg>
      );
    case 'three-mosaic':
      return (
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
          <rect x="3" y="4" width="8" height="7" rx="1.5" />
          <rect x="13" y="4" width="8" height="7" rx="1.5" />
          <rect x="3" y="13" width="18" height="7" rx="1.5" />
        </svg>
      );
    case 'three-top':
      return (
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
          <rect x="3" y="4" width="18" height="7" rx="1.5" />
          <rect x="3" y="13" width="8" height="7" rx="1.5" />
          <rect x="13" y="13" width="8" height="7" rx="1.5" />
        </svg>
      );
    case 'three-left':
      return (
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
          <rect x="3" y="4" width="8" height="16" rx="1.5" />
          <rect x="13" y="4" width="8" height="7" rx="1.5" />
          <rect x="13" y="13" width="8" height="7" rx="1.5" />
        </svg>
      );
    case 'four-hero':
      return (
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
          <rect x="3" y="4" width="11" height="16" rx="1.5" />
          <rect x="16" y="4" width="5" height="4.5" rx="1" />
          <rect x="16" y="9.75" width="5" height="4.5" rx="1" />
          <rect x="16" y="15.5" width="5" height="4.5" rx="1" />
        </svg>
      );
    default:
      return (
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
          <rect x="3" y="4" width="8" height="7" rx="1.5" />
          <rect x="13" y="4" width="8" height="7" rx="1.5" />
          <rect x="3" y="13" width="8" height="7" rx="1.5" />
          <rect x="13" y="13" width="8" height="7" rx="1.5" />
        </svg>
      );
  }
};

function getGridContainerClass(layout: CollageLayout): string {
  switch (layout) {
    case 'single':
      return 'grid grid-cols-1';
    case 'two-col':
      return 'grid grid-cols-2';
    case 'two-row':
      return 'grid grid-rows-2';
    case 'three-mosaic':
    case 'three-top':
    case 'three-left':
    case 'four-grid':
      return 'grid grid-cols-2 grid-rows-2';
    case 'four-hero':
      return 'grid grid-cols-3 grid-rows-3';
  }
}

function getSlotSpanClass(layout: CollageLayout, slotIndex: number): string {
  if (layout === 'three-mosaic' && slotIndex === 2) return 'col-span-2';
  if (layout === 'three-top' && slotIndex === 0) return 'col-span-2';
  if (layout === 'three-left' && slotIndex === 0) return 'row-span-2';
  if (layout === 'four-hero' && slotIndex === 0) return 'col-span-2 row-span-3';
  return '';
}

export const CollageStudio: React.FC<CollageStudioProps> = ({
  state,
  onChange,
  onUploadFiles,
  uploading,
  uploadingLabel,
}) => {
  const { language, tr } = useFamily();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selectedSlotIdx, setSelectedSlotIdx] = useState<number>(0);
  const [swapSourceIdx, setSwapSourceIdx] = useState<number | null>(null);
  const [draggingFiles, setDraggingFiles] = useState(false);

  const dragSessionRef = useRef<{
    mediaId: string;
    startClientX: number;
    startClientY: number;
    width: number;
    height: number;
    startX: number;
    startY: number;
    zoom: number;
  } | null>(null);

  const safeSelectedIdx = Math.min(selectedSlotIdx, Math.max(0, state.slotCount - 1));
  const selectedMediaId = state.slots[safeSelectedIdx] || null;
  const selectedCrop = selectedMediaId
    ? clampPhotoCrop(state.crops[selectedMediaId])
    : DEFAULT_PHOTO_CROP;

  const layoutOptions = useMemo(
    () => COLLAGE_LAYOUT_OPTIONS.filter((opt) => opt.photoCount === state.slotCount),
    [state.slotCount],
  );

  const totalImages =
    state.slots.filter((id): id is string => Boolean(id)).length + state.tray.length;
  const effectiveLayout = normalizeCollageLayout(state.slotCount, state.layout);

  const handleSlotCountChange = (count: CollageSlotCount) => {
    setSwapSourceIdx(null);
    onChange((prev) => changeCollageSlotCount(prev, count));
    setSelectedSlotIdx((idx) => Math.min(idx, count - 1));
  };

  const handleSlotTap = (idx: number) => {
    if (swapSourceIdx !== null) {
      if (swapSourceIdx !== idx) {
        onChange((prev) => swapCollageSlots(prev, swapSourceIdx, idx));
        setSelectedSlotIdx(idx);
      }
      setSwapSourceIdx(null);
      return;
    }
    setSelectedSlotIdx(idx);
  };

  const handleTrayPhotoTap = (trayId: string) => {
    if (swapSourceIdx !== null) {
      onChange((prev) => placeTrayPhotoInSlot(prev, trayId, swapSourceIdx));
      setSelectedSlotIdx(swapSourceIdx);
      setSwapSourceIdx(null);
      return;
    }
    onChange((prev) => placeTrayPhotoInSlot(prev, trayId, safeSelectedIdx));
  };

  const handlePointerDown = (
    e: React.PointerEvent<HTMLDivElement>,
    slotIdx: number,
    mediaId: string | null,
  ) => {
    if (swapSourceIdx !== null) {
      handleSlotTap(slotIdx);
      return;
    }
    setSelectedSlotIdx(slotIdx);
    if (!mediaId) return;

    // Only initiate pan gesture when slot is already active (or single photo)
    if (slotIdx !== safeSelectedIdx && state.slotCount > 1) return;

    e.preventDefault();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // ignore if synthetic event
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const crop = clampPhotoCrop(state.crops[mediaId]);
    dragSessionRef.current = {
      mediaId,
      startClientX: e.clientX,
      startClientY: e.clientY,
      width: Math.max(60, rect.width),
      height: Math.max(60, rect.height),
      startX: crop.x,
      startY: crop.y,
      zoom: crop.zoom,
    };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const sess = dragSessionRef.current;
    if (!sess) return;
    e.preventDefault();
    const dxPct = ((e.clientX - sess.startClientX) / sess.width) * 100;
    const dyPct = ((e.clientY - sess.startClientY) / sess.height) * 100;
    const speedFactor = 1 / Math.max(0.85, sess.zoom * 0.85);
    onChange((prev) =>
      updateCropInState(prev, sess.mediaId, {
        x: sess.startX - dxPct * speedFactor,
        y: sess.startY - dyPct * speedFactor,
      }),
    );
  };

  const handlePointerEnd = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragSessionRef.current) return;
    dragSessionRef.current = null;
    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {
      // ignore
    }
  };

  return (
    <div className="space-y-3.5">
      {/* Header row: Slot Count Selector (1 | 2 | 3 | 4) + Upload Trigger */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">
            {tr('collageSlotsLabel')}
          </span>
          <div className="inline-flex items-center p-0.5 rounded-xl bg-stone-100 dark:bg-stone-800 border border-stone-200 dark:border-stone-700">
            {([1, 2, 3, 4] as CollageSlotCount[]).map((count) => {
              const active = state.slotCount === count;
              return (
                <button
                  key={count}
                  type="button"
                  onClick={() => handleSlotCountChange(count)}
                  className={`min-w-[36px] min-h-[36px] px-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    active
                      ? 'bg-[#1B5E7C] text-white shadow-xs'
                      : 'text-stone-600 dark:text-stone-300 hover:text-stone-900 dark:hover:text-white'
                  }`}
                >
                  {count}
                </button>
              );
            })}
          </div>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,.heic,.heif"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) {
              void onUploadFiles(e.target.files);
            }
            e.target.value = '';
          }}
        />

        <button
          type="button"
          disabled={uploading || totalImages >= 12}
          onClick={() => fileInputRef.current?.click()}
          className="inline-flex items-center gap-1.5 min-h-[40px] px-3.5 py-2 rounded-xl bg-[#1B5E7C]/12 hover:bg-[#1B5E7C]/20 text-[#1B5E7C] dark:text-teal-300 text-xs font-bold transition-colors cursor-pointer disabled:opacity-50"
        >
          <ImagePlus className="w-4 h-4" />
          <span>{uploading ? uploadingLabel || tr('memoryCompressing') : tr('memoryAddPhotosBtn')}</span>
        </button>
      </div>

      {/* Interactive Collage Stage */}
      {(totalImages > 0 || state.slotCount > 1) && (
        <div className="space-y-2.5">
          {swapSourceIdx !== null && (
            <div className="px-3 py-2 rounded-xl bg-amber-500/15 border border-amber-400/50 text-xs font-semibold text-amber-900 dark:text-amber-200 flex items-center justify-between gap-2">
              <span>{tr('collageSwapPickTarget')}</span>
              <button
                type="button"
                onClick={() => setSwapSourceIdx(null)}
                className="underline cursor-pointer shrink-0"
              >
                {tr('cancel')}
              </button>
            </div>
          )}

          <div
            className={`aspect-[4/3] w-full gap-1.5 rounded-2xl overflow-hidden bg-stone-100 dark:bg-stone-900 p-1 border border-stone-200 dark:border-stone-800 ${getGridContainerClass(
              effectiveLayout,
            )}`}
          >
            {Array.from({ length: state.slotCount }).map((_, idx) => {
              const slotId = state.slots[idx] ?? null;
              const isSelected = idx === safeSelectedIdx;
              const isSwapSource = idx === swapSourceIdx;
              const spanClass = getSlotSpanClass(effectiveLayout, idx);

              return (
                <div
                  key={idx}
                  onPointerDown={(e) => handlePointerDown(e, idx, slotId)}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerEnd}
                  onPointerCancel={handlePointerEnd}
                  onClick={() => handleSlotTap(idx)}
                  className={`relative overflow-hidden rounded-xl select-none transition-all ${spanClass} ${
                    slotId && isSelected && swapSourceIdx === null
                      ? 'touch-none cursor-grab active:cursor-grabbing'
                      : 'cursor-pointer'
                  } ${
                    isSwapSource
                      ? 'ring-3 ring-amber-500 z-10'
                      : isSelected
                        ? 'ring-2 ring-[#1B5E7C] dark:ring-teal-400 z-10'
                        : swapSourceIdx !== null
                          ? 'ring-2 ring-dashed ring-amber-400/70'
                          : 'ring-1 ring-black/5 dark:ring-white/10'
                  }`}
                >
                  {slotId ? (
                    <>
                      <MediaImage
                        mediaId={slotId}
                        variant="full"
                        crop={state.crops[slotId]}
                        alt={`Slot ${idx + 1}`}
                        className="w-full h-full object-cover pointer-events-none select-none"
                      />
                      <span
                        className={`absolute top-2 left-2 px-2 py-0.5 rounded-full text-[10px] font-bold backdrop-blur-sm ${
                          isSelected
                            ? 'bg-[#1B5E7C] text-white shadow-sm'
                            : 'bg-black/50 text-white'
                        }`}
                      >
                        {idx + 1}
                      </span>
                      {isSelected && swapSourceIdx === null && (
                        <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-black/55 text-white backdrop-blur-sm pointer-events-none">
                          <Move className="w-3 h-3" />
                          <span className="hidden xs:inline">{tr('collageDragToReposition')}</span>
                        </span>
                      )}
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedSlotIdx(idx);
                        if (state.tray.length === 0) {
                          fileInputRef.current?.click();
                        }
                      }}
                      className="w-full h-full flex flex-col items-center justify-center gap-1 p-2 text-center bg-stone-50 dark:bg-stone-800/60 border-2 border-dashed border-stone-300 dark:border-stone-700 rounded-xl text-stone-500 dark:text-stone-400 hover:text-[#1B5E7C] cursor-pointer"
                    >
                      <Plus className="w-5 h-5" />
                      <span className="text-[11px] font-semibold leading-tight max-w-[140px]">
                        {tr('collageEmptySlotHint')}
                      </span>
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {/* Per-Photo Zoom / Crop / Swap / To-Tray Controls */}
          {selectedMediaId ? (
            <div className="p-3 rounded-2xl bg-stone-50 dark:bg-stone-900/60 border border-stone-200/80 dark:border-stone-800 space-y-2.5">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-stone-700 dark:text-stone-200 shrink-0">
                  {tr('collageZoomLabel')} ({selectedCrop.zoom.toFixed(1)}×)
                </span>
                <button
                  type="button"
                  onClick={() =>
                    onChange((prev) =>
                      updateCropInState(prev, selectedMediaId, {
                        zoom: selectedCrop.zoom - 0.2,
                      }),
                    )
                  }
                  disabled={selectedCrop.zoom <= 1}
                  aria-label="Zoom out"
                  className="min-w-[36px] min-h-[36px] rounded-lg bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 flex items-center justify-center text-stone-600 dark:text-stone-300 disabled:opacity-40 cursor-pointer"
                >
                  <ZoomOut className="w-4 h-4" />
                </button>
                <input
                  type="range"
                  min={1}
                  max={3}
                  step={0.05}
                  value={selectedCrop.zoom}
                  onChange={(e) =>
                    onChange((prev) =>
                      updateCropInState(prev, selectedMediaId, {
                        zoom: Number(e.target.value),
                      }),
                    )
                  }
                  aria-label={tr('collageZoomLabel')}
                  className="flex-1 accent-[#1B5E7C] cursor-pointer"
                />
                <button
                  type="button"
                  onClick={() =>
                    onChange((prev) =>
                      updateCropInState(prev, selectedMediaId, {
                        zoom: selectedCrop.zoom + 0.2,
                      }),
                    )
                  }
                  disabled={selectedCrop.zoom >= 3}
                  aria-label="Zoom in"
                  className="min-w-[36px] min-h-[36px] rounded-lg bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 flex items-center justify-center text-stone-600 dark:text-stone-300 disabled:opacity-40 cursor-pointer"
                >
                  <ZoomIn className="w-4 h-4" />
                </button>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => onChange((prev) => resetCropInState(prev, selectedMediaId))}
                  className="inline-flex items-center gap-1.5 min-h-[36px] px-3 py-1.5 rounded-xl bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 text-xs font-semibold text-stone-700 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-700 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>{tr('collageResetCrop')}</span>
                </button>

                {(state.slotCount > 1 || state.tray.length > 0) && (
                  <button
                    type="button"
                    onClick={() =>
                      setSwapSourceIdx((cur) => (cur === safeSelectedIdx ? null : safeSelectedIdx))
                    }
                    className={`inline-flex items-center gap-1.5 min-h-[36px] px-3 py-1.5 rounded-xl border text-xs font-semibold transition-colors cursor-pointer ${
                      swapSourceIdx === safeSelectedIdx
                        ? 'bg-amber-500 text-white border-amber-500'
                        : 'bg-white dark:bg-stone-800 border-stone-200 dark:border-stone-700 text-stone-700 dark:text-stone-200 hover:border-amber-400'
                    }`}
                  >
                    <ArrowLeftRight className="w-3.5 h-3.5" />
                    <span>
                      {swapSourceIdx === safeSelectedIdx
                        ? tr('collageSwapCancel')
                        : tr('collageSwapBtn')}
                    </span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    setSwapSourceIdx(null);
                    onChange((prev) => sendSlotPhotoToTray(prev, safeSelectedIdx));
                  }}
                  className="inline-flex items-center gap-1.5 min-h-[36px] px-3 py-1.5 rounded-xl bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 text-xs font-semibold text-stone-700 dark:text-stone-200 hover:border-rose-400 hover:text-rose-600 cursor-pointer"
                >
                  <ArrowDownToLine className="w-3.5 h-3.5" />
                  <span>{tr('collageToTrayBtn')}</span>
                </button>
              </div>
            </div>
          ) : (
            <p className="text-xs text-stone-500 dark:text-stone-400 px-1">
              {tr('collageTapSlotToCrop')}
            </p>
          )}

          {/* Arrangement Layout Variants */}
          {layoutOptions.length > 1 && (
            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-stone-600 dark:text-stone-300">
                {tr('memoryCollageLayout')}
              </p>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {layoutOptions.map((opt) => {
                  const selected = effectiveLayout === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() =>
                        onChange((prev) => ({
                          ...prev,
                          layout: opt.id,
                        }))
                      }
                      className={`inline-flex items-center gap-2 min-h-[40px] px-3 py-1.5 rounded-xl border text-xs font-semibold whitespace-nowrap transition-all cursor-pointer shrink-0 ${
                        selected
                          ? 'bg-[#1B5E7C] text-white border-[#1B5E7C] shadow-sm'
                          : 'bg-stone-50 dark:bg-stone-900 text-stone-600 dark:text-stone-300 border-stone-200 dark:border-stone-700 hover:border-[#1B5E7C]/60'
                      }`}
                    >
                      <LayoutThumbIcon layout={opt.id} />
                      <span>{language === 'fr' ? opt.labelFr : opt.labelEn}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Photo Tray ("Plateau") + Drag/Drop Zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDraggingFiles(true);
        }}
        onDragLeave={() => setDraggingFiles(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDraggingFiles(false);
          if (e.dataTransfer.files.length > 0) {
            void onUploadFiles(e.dataTransfer.files);
          }
        }}
        className={`rounded-2xl border-2 border-dashed p-3.5 transition-colors space-y-2.5 ${
          draggingFiles
            ? 'border-[#1B5E7C] bg-[#1B5E7C]/8'
            : 'border-stone-300 dark:border-stone-700 bg-stone-50/70 dark:bg-stone-900/40'
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-bold text-stone-700 dark:text-stone-200">
            {tr('collageTrayTitle', { count: state.tray.length })}
          </span>
          <span className="text-[11px] text-stone-500 dark:text-stone-400">
            {totalImages} / 12
          </span>
        </div>

        {state.tray.length > 0 ? (
          <>
            <p className="text-[11px] text-stone-500 dark:text-stone-400">
              {tr('collageTrayHint')}
            </p>
            <div className="flex gap-2.5 overflow-x-auto pb-1">
              {state.tray.map((trayId) => (
                <div
                  key={trayId}
                  className="relative w-16 h-16 rounded-xl overflow-hidden border border-stone-200 dark:border-stone-700 shrink-0 bg-stone-200 dark:bg-stone-800"
                >
                  <button
                    type="button"
                    onClick={() => handleTrayPhotoTap(trayId)}
                    className="w-full h-full block cursor-pointer"
                    aria-label={tr('collageTrayHint')}
                  >
                    <MediaImage
                      mediaId={trayId}
                      variant="thumb"
                      crop={state.crops[trayId]}
                      alt="Tray item"
                    />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onChange((prev) => removePhotoFromTray(prev, trayId));
                    }}
                    aria-label={tr('memoryRemovePhoto')}
                    className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/65 hover:bg-rose-600 text-white flex items-center justify-center cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          </>
        ) : (
          <p className="text-[11px] text-stone-500 dark:text-stone-400">
            {totalImages === 0 ? tr('memoryDropHint') : tr('collageTrayEmptyHint')}
          </p>
        )}
      </div>
    </div>
  );
};
