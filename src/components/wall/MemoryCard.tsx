import React from 'react';
import {
  CheckCircle2,
  Heart,
  MessageCircle,
  Newspaper,
  Pencil,
  Sparkles,
  Star,
} from 'lucide-react';
import { useFamily } from '../../store/FamilyContext';
import type { MemoryPost } from '../../types/family';
import { formatMemoryDate, formatRelativeTime } from '../../utils/i18n';
import { AvatarBadge } from '../common/AvatarBadge';
import { CollageGrid } from '../common/CollageGrid';

interface MemoryCardProps {
  post: MemoryPost;
  commentCount: number;
  onOpenDetail: (post: MemoryPost, initialPhotoIndex?: number) => void;
  onEdit: (post: MemoryPost) => void;
}

export const MemoryCard: React.FC<MemoryCardProps> = ({
  post,
  commentCount,
  onOpenDetail,
  onEdit,
}) => {
  const {
    activeProfile,
    isActiveProfileAdmin,
    profilesById,
    rememberedPeopleById,
    togglePostLike,
    togglePostGazetteFlag,
    language,
    tr,
  } = useFamily();

  const author = profilesById.get(post.authorProfileId);
  const canModify =
    Boolean(activeProfile && activeProfile.id === post.authorProfileId) || isActiveProfileAdmin;
  const isLiked = Boolean(activeProfile && post.likedByProfileIds.includes(activeProfile.id));

  const taggedProfiles = post.taggedProfileIds
    .map((id) => profilesById.get(id))
    .filter((p): p is NonNullable<typeof p> => Boolean(p && !p.deletedAt));

  const taggedGuests = (post.taggedGuestIds || [])
    .map((id) => rememberedPeopleById.get(id))
    .filter((g): g is NonNullable<typeof g> => Boolean(g && !g.deletedAt));

  return (
    <article className="rounded-3xl bg-white dark:bg-[#171A23] border border-stone-200/85 dark:border-stone-800 shadow-sm hover:shadow-md transition-shadow overflow-hidden animate-fade-slide">
      {/* Author Header */}
      <div className="px-4 sm:px-5 pt-4 pb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <AvatarBadge profile={author} size="md" />
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-bold text-stone-900 dark:text-stone-100 truncate">
                {author?.name || 'Membre'}
              </p>
              {author?.relationLabel && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300">
                  {author.relationLabel}
                </span>
              )}
            </div>
            <p className="text-xs text-stone-500 dark:text-stone-400">
              {formatMemoryDate(post.memoryDate, language)}
              {' · '}
              {formatRelativeTime(post.createdAt, language)}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {post.fullPageFeature && post.mediaIds.length > 0 && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-500/15 text-amber-800 dark:text-amber-300">
              <Star className="w-3 h-3 fill-current" />
              <span className="hidden sm:inline">{tr('badgeFullPage')}</span>
            </span>
          )}
          {canModify && (
            <button
              type="button"
              onClick={() => onEdit(post)}
              aria-label={tr('postEdit')}
              className="p-2 rounded-full text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors cursor-pointer"
            >
              <Pencil className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* High-resolution Collage Media with persisted crops */}
      {post.mediaIds.length > 0 && (
        <div className="px-2 sm:px-3">
          <CollageGrid
            mediaIds={post.mediaIds}
            layout={post.collageLayout}
            crops={post.mediaCrops}
            altPrefix={post.caption.slice(0, 40) || 'Souvenir'}
            variant="full"
            onPhotoClick={(idx) => onOpenDetail(post, idx)}
          />
        </div>
      )}

      {/* Body & Badges */}
      <div className="px-4 sm:px-5 py-3.5 space-y-3">
        {post.mediaIds.length === 0 ? (
          <button
            type="button"
            onClick={() => onOpenDetail(post)}
            className="w-full text-left p-4 rounded-2xl bg-[#FAF8F5] dark:bg-stone-900/60 border border-stone-200/70 dark:border-stone-800 hover:border-[#1B5E7C]/40 transition-colors cursor-pointer"
          >
            <div className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-[#1B5E7C] dark:text-teal-400 mb-1.5">
              <Sparkles className="w-3 h-3" /> {tr('badgeStory')}
            </div>
            <p className="font-serif-display text-base sm:text-lg leading-relaxed text-stone-800 dark:text-stone-100 whitespace-pre-line">
              {post.caption}
            </p>
          </button>
        ) : (
          post.caption && (
            <button
              type="button"
              onClick={() => onOpenDetail(post)}
              className="w-full text-left cursor-pointer"
            >
              <p className="text-sm sm:text-[15px] leading-relaxed text-stone-800 dark:text-stone-200 whitespace-pre-line">
                {post.caption}
              </p>
            </button>
          )
        )}

        {/* Tagged Members & Remembered People + Gazette Status */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          {taggedProfiles.length > 0 || taggedGuests.length > 0 ? (
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[11px] font-medium text-stone-400">{tr('taggedWith')}</span>
              {taggedProfiles.map((member) => (
                <span
                  key={member.id}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300"
                >
                  <span>{member.avatarEmoji}</span>
                  <span>{member.name}</span>
                </span>
              ))}
              {taggedGuests.map((guest) => (
                <span
                  key={guest.id}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border border-dashed border-stone-300 dark:border-stone-700 bg-stone-50 dark:bg-stone-900/60 text-stone-600 dark:text-stone-300"
                >
                  <span>{guest.avatarEmoji}</span>
                  <span>{guest.name}</span>
                </span>
              ))}
            </div>
          ) : (
            <span />
          )}

          {post.includeInGazette && (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/12 text-emerald-700 dark:text-emerald-300">
              <CheckCircle2 className="w-3 h-3" />
              {tr('badgeGazette')}
            </span>
          )}
        </div>
      </div>

      {/* Footer Actions */}
      <div className="px-4 sm:px-5 py-3 border-t border-stone-100 dark:border-stone-800/80 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => togglePostLike(post.id)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors cursor-pointer ${
              isLiked
                ? 'bg-rose-500/12 text-rose-600 dark:text-rose-400'
                : 'text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800'
            }`}
          >
            <Heart className={`w-4 h-4 ${isLiked ? 'fill-current' : ''}`} />
            <span>{post.likedByProfileIds.length}</span>
          </button>

          <button
            type="button"
            onClick={() => onOpenDetail(post)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors cursor-pointer"
          >
            <MessageCircle className="w-4 h-4" />
            <span>{commentCount}</span>
          </button>
        </div>

        {canModify && (
          <button
            type="button"
            onClick={() => togglePostGazetteFlag(post.id)}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-semibold transition-colors cursor-pointer ${
              post.includeInGazette
                ? 'bg-[#1B5E7C]/10 text-[#1B5E7C] dark:bg-teal-500/15 dark:text-teal-300'
                : 'text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800'
            }`}
            title={post.includeInGazette ? tr('toggleGazetteOn') : tr('toggleGazetteOff')}
          >
            <Newspaper className="w-3.5 h-3.5" />
            <span className="hidden xs:inline">Gazette</span>
          </button>
        )}
      </div>
    </article>
  );
};
