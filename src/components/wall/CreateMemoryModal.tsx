import React, { useEffect, useState } from 'react';
import { Check, Newspaper, Star, UserPlus } from 'lucide-react';
import { isLikelyHeicFile, isSupportedPhotoFile } from '../../services/mediaProcessor';
import { saveLocalPhotoAsset } from '../../services/mediaStore';
import { useFamily } from '../../store/FamilyContext';
import type { MediaAsset, MemoryPost } from '../../types/family';
import {
  addMediaToCollageState,
  type CollageStudioState,
  createInitialCollageState,
  finalizeCollageForSave,
} from '../../utils/collage';
import { AvatarBadge } from '../common/AvatarBadge';
import { Modal } from '../common/Modal';
import { CollageStudio } from './CollageStudio';

interface CreateMemoryModalProps {
  open: boolean;
  onClose: () => void;
  editPost?: MemoryPost | null;
}

export const CreateMemoryModal: React.FC<CreateMemoryModalProps> = ({
  open,
  onClose,
  editPost,
}) => {
  const {
    activeProfile,
    activeProfiles,
    activeRememberedPeople,
    createRememberedPerson,
    createMemoryPost,
    updateMemoryPost,
    addToast,
    tr,
  } = useFamily();

  const [collageState, setCollageState] = useState<CollageStudioState>(() =>
    createInitialCollageState([]),
  );
  const [stagedAssets, setStagedAssets] = useState<MediaAsset[]>([]);
  const [caption, setCaption] = useState('');
  const [memoryDate, setMemoryDate] = useState('');
  const [taggedProfileIds, setTaggedProfileIds] = useState<string[]>([]);
  const [taggedGuestIds, setTaggedGuestIds] = useState<string[]>([]);
  const [addingGuestOpen, setAddingGuestOpen] = useState(false);
  const [newGuestName, setNewGuestName] = useState('');
  const [includeInGazette, setIncludeInGazette] = useState(true);
  const [fullPageFeature, setFullPageFeature] = useState(false);
  const [compressing, setCompressing] = useState(false);
  const [convertingHeic, setConvertingHeic] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setStagedAssets([]);
    setAddingGuestOpen(false);
    setNewGuestName('');

    if (editPost) {
      setCollageState(
        createInitialCollageState(editPost.mediaIds, editPost.collageLayout, editPost.mediaCrops),
      );
      setCaption(editPost.caption);
      setMemoryDate(editPost.memoryDate);
      setTaggedProfileIds(editPost.taggedProfileIds);
      setTaggedGuestIds(editPost.taggedGuestIds || []);
      setIncludeInGazette(editPost.includeInGazette);
      setFullPageFeature(editPost.fullPageFeature);
    } else {
      setCollageState(createInitialCollageState([]));
      setCaption('');
      setMemoryDate(new Date().toISOString().slice(0, 10));
      setTaggedProfileIds([]);
      setTaggedGuestIds([]);
      setIncludeInGazette(true);
      setFullPageFeature(false);
    }
  }, [open, editPost]);

  const processFiles = async (files: FileList | File[]) => {
    if (!activeProfile) return;
    const incoming = Array.from(files).filter((f) => isSupportedPhotoFile(f));
    if (incoming.length === 0) return;

    const currentTotal =
      collageState.slots.filter((id): id is string => Boolean(id)).length +
      collageState.tray.length;
    const remainingCapacity = Math.max(0, 12 - currentTotal);

    if (remainingCapacity === 0) {
      addToast({ title: tr('collageMaxTrayReached'), tone: 'info' });
      return;
    }

    const batch = incoming.slice(0, remainingCapacity);
    if (incoming.length > remainingCapacity) {
      addToast({ title: tr('collageMaxTrayReached'), tone: 'info' });
    }

    setCompressing(true);
    setConvertingHeic(batch.some((f) => isLikelyHeicFile(f)));
    setError(null);

    try {
      const assets: MediaAsset[] = [];
      for (const file of batch) {
        const asset = await saveLocalPhotoAsset(file, activeProfile.id);
        assets.push(asset);
      }
      setStagedAssets((prev) => [...prev, ...assets]);
      setCollageState((prev) =>
        addMediaToCollageState(
          prev,
          assets.map((a) => a.id),
          12,
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to process image.');
    } finally {
      setCompressing(false);
      setConvertingHeic(false);
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.files;
    if (items && items.length > 0) {
      const imgs = Array.from(items).filter((f) => isSupportedPhotoFile(f));
      if (imgs.length > 0) {
        e.preventDefault();
        void processFiles(imgs);
      }
    }
  };

  const toggleTagMember = (profileId: string) => {
    setTaggedProfileIds((prev) =>
      prev.includes(profileId) ? prev.filter((id) => id !== profileId) : [...prev, profileId],
    );
  };

  const toggleTagGuest = (guestId: string) => {
    setTaggedGuestIds((prev) =>
      prev.includes(guestId) ? prev.filter((id) => id !== guestId) : [...prev, guestId],
    );
  };

  const handleAddRememberedGuest = () => {
    const clean = newGuestName.trim();
    if (!clean) return;
    const guest = createRememberedPerson(clean);
    setTaggedGuestIds((prev) => (prev.includes(guest.id) ? prev : [...prev, guest.id]));
    setNewGuestName('');
    setAddingGuestOpen(false);
  };

  const allMembersSelected =
    activeProfiles.length > 0 && taggedProfileIds.length === activeProfiles.length;

  const placedPhotosCount = collageState.slots.filter((id): id is string => Boolean(id)).length;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const finalized = finalizeCollageForSave(collageState);
    if (finalized.mediaIds.length === 0 && !caption.trim()) {
      setError(tr('memoryNeedContent'));
      return;
    }

    if (editPost) {
      updateMemoryPost(editPost.id, {
        mediaAssets: stagedAssets,
        mediaIds: finalized.mediaIds,
        collageLayout: finalized.collageLayout,
        mediaCrops: finalized.mediaCrops,
        caption,
        memoryDate,
        taggedProfileIds,
        taggedGuestIds,
        includeInGazette,
        fullPageFeature: finalized.mediaIds.length > 0 ? fullPageFeature : false,
      });
    } else {
      createMemoryPost({
        mediaAssets: stagedAssets,
        mediaIds: finalized.mediaIds,
        collageLayout: finalized.collageLayout,
        mediaCrops: finalized.mediaCrops,
        caption,
        memoryDate,
        taggedProfileIds,
        taggedGuestIds,
        includeInGazette,
        fullPageFeature: finalized.mediaIds.length > 0 ? fullPageFeature : false,
      });
    }
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editPost ? tr('memoryEditTitle') : tr('memoryCreateTitle')}
      subtitle={tr('memoryModalSubtitle')}
      maxWidthClass="max-w-xl"
    >
      <form onSubmit={handleSubmit} onPaste={handlePaste} className="p-4 sm:p-5 space-y-5">
        <CollageStudio
          state={collageState}
          onChange={setCollageState}
          onUploadFiles={processFiles}
          uploading={compressing}
          uploadingLabel={convertingHeic ? tr('collageConvertingHeic') : tr('memoryCompressing')}
        />

        {/* Caption & Memory Date */}
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400 mb-1.5">
              {tr('memoryCaptionLabel')}
            </label>
            <textarea
              rows={3}
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder={tr('memoryCaptionPlaceholder')}
              className="w-full px-3.5 py-2.5 rounded-xl bg-stone-50 dark:bg-stone-900 border border-stone-200 dark:border-stone-700 text-sm text-stone-900 dark:text-stone-100 focus:ring-2 focus:ring-[#1B5E7C] outline-none resize-y"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400 mb-1.5">
              {tr('memoryDateLabel')}
            </label>
            <input
              type="date"
              value={memoryDate}
              onChange={(e) => setMemoryDate(e.target.value)}
              className="w-full sm:w-56 px-3.5 py-2 rounded-xl bg-stone-50 dark:bg-stone-900 border border-stone-200 dark:border-stone-700 text-sm text-stone-900 dark:text-stone-100 focus:ring-2 focus:ring-[#1B5E7C] outline-none"
            />
          </div>
        </div>

        {/* Tag Members + Remembered Non-Member People */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">
              {tr('memoryTagFamilyLabel')}
            </label>
            {activeProfiles.length > 0 && (
              <button
                type="button"
                onClick={() =>
                  setTaggedProfileIds(
                    allMembersSelected ? [] : activeProfiles.map((p) => p.id),
                  )
                }
                className="text-xs font-semibold text-[#1B5E7C] dark:text-teal-400 hover:underline cursor-pointer shrink-0"
              >
                {allMembersSelected ? tr('memoryClearAll') : tr('memorySelectAll')}
              </button>
            )}
          </div>

          <div className="flex gap-2 flex-wrap">
            {activeProfiles.map((member) => {
              const selected = taggedProfileIds.includes(member.id);
              return (
                <button
                  key={member.id}
                  type="button"
                  onClick={() => toggleTagMember(member.id)}
                  className={`inline-flex items-center gap-1.5 min-h-[36px] pl-1.5 pr-3 py-1 rounded-full border text-xs font-semibold transition-all cursor-pointer ${
                    selected
                      ? 'bg-[#1B5E7C]/12 border-[#1B5E7C] text-[#1B5E7C] dark:bg-teal-500/15 dark:text-teal-300'
                      : 'bg-stone-50 dark:bg-stone-900 border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-300'
                  }`}
                >
                  <AvatarBadge profile={member} size="xs" />
                  <span>{member.name}</span>
                  {selected && <Check className="w-3 h-3" />}
                </button>
              );
            })}

            {activeRememberedPeople.map((guest) => {
              const selected = taggedGuestIds.includes(guest.id);
              return (
                <button
                  key={guest.id}
                  type="button"
                  onClick={() => toggleTagGuest(guest.id)}
                  className={`inline-flex items-center gap-1.5 min-h-[36px] px-3 py-1 rounded-full border border-dashed text-xs font-semibold transition-all cursor-pointer ${
                    selected
                      ? 'bg-amber-500/15 border-amber-500 text-amber-800 dark:text-amber-300'
                      : 'bg-stone-50 dark:bg-stone-900 border-stone-300 dark:border-stone-700 text-stone-600 dark:text-stone-300'
                  }`}
                >
                  <span>{guest.avatarEmoji}</span>
                  <span>{guest.name}</span>
                  {selected && <Check className="w-3 h-3" />}
                </button>
              );
            })}

            <button
              type="button"
              onClick={() => setAddingGuestOpen((o) => !o)}
              className="inline-flex items-center gap-1 min-h-[36px] px-3 py-1 rounded-full border border-dashed border-[#1B5E7C]/50 text-[#1B5E7C] dark:text-teal-300 text-xs font-semibold hover:bg-[#1B5E7C]/8 cursor-pointer"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>{tr('memoryAddGuestBtn')}</span>
            </button>
          </div>

          {addingGuestOpen && (
            <div className="flex items-center gap-2 pt-1">
              <input
                type="text"
                value={newGuestName}
                onChange={(e) => setNewGuestName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddRememberedGuest();
                  }
                }}
                placeholder={tr('memoryAddGuestPlaceholder')}
                className="flex-1 px-3 py-2 rounded-xl bg-stone-50 dark:bg-stone-900 border border-stone-200 dark:border-stone-700 text-sm outline-none focus:ring-2 focus:ring-[#1B5E7C]"
              />
              <button
                type="button"
                onClick={handleAddRememberedGuest}
                disabled={!newGuestName.trim()}
                className="px-4 py-2 rounded-xl bg-[#1B5E7C] hover:bg-[#164b63] disabled:opacity-45 text-white text-xs font-semibold cursor-pointer shrink-0"
              >
                {tr('memoryAddGuestConfirm')}
              </button>
            </div>
          )}
        </div>

        {/* Gazette Options */}
        <div className="space-y-2.5 p-3.5 rounded-2xl bg-stone-50 dark:bg-stone-900/60 border border-stone-200/80 dark:border-stone-800">
          <label className="flex items-start justify-between gap-3 cursor-pointer">
            <div className="flex items-start gap-2.5">
              <Newspaper className="w-4 h-4 text-[#1B5E7C] dark:text-teal-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-stone-800 dark:text-stone-200">
                  {tr('memoryIncludeGazetteLabel')}
                </p>
                <p className="text-xs text-stone-500 dark:text-stone-400">
                  {tr('memoryIncludeGazetteHint')}
                </p>
              </div>
            </div>
            <input
              type="checkbox"
              checked={includeInGazette}
              onChange={(e) => setIncludeInGazette(e.target.checked)}
              className="mt-1 h-4 w-4 rounded accent-[#1B5E7C] cursor-pointer"
            />
          </label>

          {placedPhotosCount > 0 && includeInGazette && (
            <label className="flex items-start justify-between gap-3 pt-2.5 border-t border-stone-200/70 dark:border-stone-800 cursor-pointer">
              <div className="flex items-start gap-2.5">
                <Star className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-stone-800 dark:text-stone-200">
                    {tr('memoryFullPageLabel')}
                  </p>
                  <p className="text-xs text-stone-500 dark:text-stone-400">
                    {tr('memoryFullPageHint')}
                  </p>
                </div>
              </div>
              <input
                type="checkbox"
                checked={fullPageFeature}
                onChange={(e) => setFullPageFeature(e.target.checked)}
                className="mt-1 h-4 w-4 rounded accent-amber-500 cursor-pointer"
              />
            </label>
          )}
        </div>

        {error && (
          <p className="text-xs font-medium text-rose-600 dark:text-rose-400">{error}</p>
        )}

        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-sm font-medium text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 cursor-pointer"
          >
            {tr('cancel')}
          </button>
          <button
            type="submit"
            disabled={compressing}
            className="px-5 py-2.5 rounded-xl text-sm font-semibold bg-[#1B5E7C] hover:bg-[#164b63] text-white shadow-md shadow-teal-900/20 disabled:opacity-50 cursor-pointer"
          >
            {editPost ? tr('memorySaveBtn') : tr('memoryPublishBtn')}
          </button>
        </div>
      </form>
    </Modal>
  );
};
