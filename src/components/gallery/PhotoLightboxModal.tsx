import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, ExternalLink, X } from 'lucide-react';
import { useFamily } from '../../store/FamilyContext';
import type { GalleryPhotoItem } from '../../utils/gallery';
import { formatMemoryDate } from '../../utils/i18n';
import { AvatarBadge } from '../common/AvatarBadge';
import { MediaImage } from '../common/MediaImage';

interface PhotoLightboxModalProps {
  items: GalleryPhotoItem[];
  currentIndex: number | null;
  onClose: () => void;
  onChangeIndex: (nextIndex: number) => void;
  onOpenPost: (postId: string, photoIndexInPost: number) => void;
}

export const PhotoLightboxModal: React.FC<PhotoLightboxModalProps> = ({
  items,
  currentIndex,
  onClose,
  onChangeIndex,
  onOpenPost,
}) => {
  const { profilesById, rememberedPeopleById, language, tr } = useFamily();

  const isOpen = currentIndex !== null && items.length > 0;
  const safeIndex =
    currentIndex !== null
      ? Math.min(Math.max(0, currentIndex), Math.max(0, items.length - 1))
      : 0;
  const currentItem = isOpen ? items[safeIndex] : null;

  useEffect(() => {
    if (!isOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowLeft' && items.length > 1) {
        onChangeIndex((safeIndex - 1 + items.length) % items.length);
      } else if (e.key === 'ArrowRight' && items.length > 1) {
        onChangeIndex((safeIndex + 1) % items.length);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen, items.length, safeIndex, onClose, onChangeIndex]);

  if (!isOpen || !currentItem || typeof document === 'undefined') return null;

  const author = profilesById.get(currentItem.authorProfileId);
  const taggedProfiles = currentItem.taggedProfileIds
    .map((id) => profilesById.get(id))
    .filter((p): p is NonNullable<typeof p> => Boolean(p && !p.deletedAt));
  const taggedGuests = currentItem.taggedGuestIds
    .map((id) => rememberedPeopleById.get(id))
    .filter((g): g is NonNullable<typeof g> => Boolean(g && !g.deletedAt));

  return createPortal(
    <div
      className="fixed inset-0 h-[100dvh] z-50 bg-stone-950/95 text-white flex flex-col pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]"
      role="dialog"
      aria-modal="true"
    >
      {/* Top Bar */}
      <div className="px-4 py-3 flex items-center justify-between gap-3 border-b border-white/10 shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <AvatarBadge profile={author} size="sm" />
          <div className="min-w-0">
            <p className="text-sm font-bold truncate">{author?.name || 'Membre'}</p>
            <p className="text-xs text-stone-400">
              {formatMemoryDate(currentItem.memoryDate, language)}
              {' · '}
              {tr('galleryPhotoCounter', { current: safeIndex + 1, total: items.length })}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenPost(currentItem.postId, currentItem.photoIndexInPost);
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/15 hover:bg-white/25 text-xs font-semibold transition-colors cursor-pointer"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span className="hidden xs:inline">{tr('galleryOpenPost')}</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label={tr('close')}
            className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Main Image Stage */}
      <div className="relative flex-1 min-h-0 flex items-center justify-center p-3 sm:p-6">
        <MediaImage
          mediaId={currentItem.mediaId}
          variant="full"
          alt={currentItem.caption || 'Photo'}
          className="max-w-full max-h-full object-contain rounded-xl shadow-2xl"
        />

        {items.length > 1 && (
          <>
            <button
              type="button"
              onClick={() => onChangeIndex((safeIndex - 1 + items.length) % items.length)}
              aria-label="Previous"
              className="absolute left-3 sm:left-5 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-black/60 hover:bg-black/80 text-white flex items-center justify-center transition-colors cursor-pointer"
            >
              <ChevronLeft className="w-6 h-6" />
            </button>
            <button
              type="button"
              onClick={() => onChangeIndex((safeIndex + 1) % items.length)}
              aria-label="Next"
              className="absolute right-3 sm:right-5 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-black/60 hover:bg-black/80 text-white flex items-center justify-center transition-colors cursor-pointer"
            >
              <ChevronRight className="w-6 h-6" />
            </button>
          </>
        )}
      </div>

      {/* Caption & Tags Footer */}
      {(currentItem.caption || taggedProfiles.length > 0 || taggedGuests.length > 0) && (
        <div className="px-4 sm:px-6 py-3.5 border-t border-white/10 bg-black/40 space-y-2 shrink-0 max-w-3xl mx-auto w-full">
          {currentItem.caption && (
            <p className="text-sm text-stone-100 leading-relaxed line-clamp-3">
              {currentItem.caption}
            </p>
          )}
          {(taggedProfiles.length > 0 || taggedGuests.length > 0) && (
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[11px] text-stone-400">{tr('taggedWith')}:</span>
              {taggedProfiles.map((member) => (
                <span
                  key={member.id}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-white/12 text-stone-100"
                >
                  <span>{member.avatarEmoji}</span>
                  <span>{member.name}</span>
                </span>
              ))}
              {taggedGuests.map((guest) => (
                <span
                  key={guest.id}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-white/10 border border-dashed border-white/25 text-stone-200"
                >
                  <span>{guest.avatarEmoji}</span>
                  <span>{guest.name}</span>
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>,
    document.body,
  );
};
