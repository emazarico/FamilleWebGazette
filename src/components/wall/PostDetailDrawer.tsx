import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ChevronLeft,
  ChevronRight,
  Heart,
  Newspaper,
  Pencil,
  Send,
  Star,
  Trash2,
  X,
} from 'lucide-react';
import { useFamily } from '../../store/FamilyContext';
import type { MemoryPost } from '../../types/family';
import { formatMemoryDate, formatRelativeTime } from '../../utils/i18n';
import { AvatarBadge } from '../common/AvatarBadge';
import { MediaImage } from '../common/MediaImage';

interface PostDetailDrawerProps {
  post: MemoryPost | null;
  initialPhotoIndex?: number;
  onClose: () => void;
  onEdit: (post: MemoryPost) => void;
}

export const PostDetailDrawer: React.FC<PostDetailDrawerProps> = ({
  post,
  initialPhotoIndex = 0,
  onClose,
  onEdit,
}) => {
  const {
    activeProfile,
    isActiveProfileAdmin,
    profilesById,
    rememberedPeopleById,
    activeComments,
    togglePostLike,
    togglePostGazetteFlag,
    togglePostFullPage,
    addPostComment,
    deletePostComment,
    deleteMemoryPost,
    language,
    tr,
  } = useFamily();

  const [photoIdx, setPhotoIdx] = useState(initialPhotoIndex);
  const [commentText, setCommentText] = useState('');

  useEffect(() => {
    setPhotoIdx(initialPhotoIndex);
    setCommentText('');
  }, [post?.id, initialPhotoIndex]);

  useEffect(() => {
    if (!post) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [post, onClose]);

  if (!post || typeof document === 'undefined') return null;

  const author = profilesById.get(post.authorProfileId);
  const canModify =
    Boolean(activeProfile && activeProfile.id === post.authorProfileId) || isActiveProfileAdmin;
  const isLiked = Boolean(activeProfile && post.likedByProfileIds.includes(activeProfile.id));
  const comments = activeComments
    .filter((c) => c.postId === post.id)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  const taggedProfiles = post.taggedProfileIds
    .map((id) => profilesById.get(id))
    .filter((p): p is NonNullable<typeof p> => Boolean(p && !p.deletedAt));

  const taggedGuests = (post.taggedGuestIds || [])
    .map((id) => rememberedPeopleById.get(id))
    .filter((g): g is NonNullable<typeof g> => Boolean(g && !g.deletedAt));

  const safeIdx = Math.min(Math.max(0, photoIdx), Math.max(0, post.mediaIds.length - 1));
  const currentMediaId = post.mediaIds[safeIdx];

  const handleSendComment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentText.trim()) return;
    addPostComment(post.id, commentText);
    setCommentText('');
  };

  const handleDeletePost = () => {
    if (window.confirm(tr('postDeleteConfirm'))) {
      deleteMemoryPost(post.id);
      onClose();
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 h-[100dvh] z-50 flex justify-end bg-stone-950/60 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl h-full bg-white dark:bg-[#171A23] border-l border-stone-200 dark:border-stone-800 shadow-2xl flex flex-col animate-fade-slide pt-[env(safe-area-inset-top)]"
      >
        {/* Drawer Header */}
        <div className="px-5 py-4 border-b border-stone-100 dark:border-stone-800 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <AvatarBadge profile={author} size="sm" />
            <div className="min-w-0">
              <h2 className="font-serif-display text-lg font-bold text-stone-900 dark:text-stone-100 truncate">
                {author?.name || tr('postDetailsTitle')}
              </h2>
              <p className="text-xs text-stone-500 dark:text-stone-400">
                {formatMemoryDate(post.memoryDate, language)}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {canModify && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onEdit(post);
                  }}
                  aria-label={tr('postEdit')}
                  className="p-2 rounded-lg text-stone-500 hover:text-stone-900 dark:text-stone-400 dark:hover:text-white hover:bg-stone-100 dark:hover:bg-stone-800 cursor-pointer"
                >
                  <Pencil className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={handleDeletePost}
                  aria-label={tr('postDelete')}
                  className="p-2 rounded-lg text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label={tr('close')}
              className="p-2 rounded-lg text-stone-400 hover:text-stone-800 dark:hover:text-stone-100 hover:bg-stone-100 dark:hover:bg-stone-800 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto overscroll-contain custom-scrollbar p-5 space-y-5">
          {currentMediaId && (
            <div className="space-y-2.5">
              <div className="relative aspect-[4/3] w-full rounded-2xl overflow-hidden bg-stone-100 dark:bg-stone-900 border border-stone-200/70 dark:border-stone-800">
                <MediaImage
                  mediaId={currentMediaId}
                  variant="full"
                  alt={post.caption || tr('postDetailsTitle')}
                  className="w-full h-full object-contain bg-stone-950/5 dark:bg-black/30"
                />

                {post.mediaIds.length > 1 && (
                  <>
                    <button
                      type="button"
                      onClick={() =>
                        setPhotoIdx((i) => (i - 1 + post.mediaIds.length) % post.mediaIds.length)
                      }
                      aria-label="Previous photo"
                      className="absolute left-2.5 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors cursor-pointer"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setPhotoIdx((i) => (i + 1) % post.mediaIds.length)}
                      aria-label="Next photo"
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors cursor-pointer"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </>
                )}
              </div>

              {post.mediaIds.length > 1 && (
                <div className="flex gap-2 justify-center">
                  {post.mediaIds.map((id, idx) => (
                    <button
                      key={`${id}-${idx}`}
                      type="button"
                      onClick={() => setPhotoIdx(idx)}
                      className={`w-14 h-14 rounded-xl overflow-hidden border-2 transition-all cursor-pointer ${
                        idx === safeIdx
                          ? 'border-[#1B5E7C] scale-105 shadow-sm'
                          : 'border-transparent opacity-65 hover:opacity-100'
                      }`}
                    >
                      <MediaImage mediaId={id} variant="thumb" alt={`Thumb ${idx + 1}`} />
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {post.caption && (
            <p className="text-base leading-relaxed text-stone-800 dark:text-stone-100 whitespace-pre-line">
              {post.caption}
            </p>
          )}

          {(taggedProfiles.length > 0 || taggedGuests.length > 0) && (
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs font-semibold text-stone-400 mr-1">{tr('taggedWith')}:</span>
              {taggedProfiles.map((member) => (
                <span
                  key={member.id}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-200"
                >
                  <span>{member.avatarEmoji}</span>
                  <span>{member.name}</span>
                </span>
              ))}
              {taggedGuests.map((guest) => (
                <span
                  key={guest.id}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold border border-dashed border-stone-300 dark:border-stone-700 bg-stone-50 dark:bg-stone-900/60 text-stone-600 dark:text-stone-300"
                >
                  <span>{guest.avatarEmoji}</span>
                  <span>{guest.name}</span>
                </span>
              ))}
            </div>
          )}

          {/* Reactions & Gazette Toggles */}
          <div className="flex items-center gap-2 flex-wrap py-3 border-y border-stone-100 dark:border-stone-800">
            <button
              type="button"
              onClick={() => togglePostLike(post.id)}
              className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold transition-colors cursor-pointer ${
                isLiked
                  ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400'
                  : 'bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300'
              }`}
            >
              <Heart className={`w-4 h-4 ${isLiked ? 'fill-current' : ''}`} />
              <span>{tr('likesCount', { n: post.likedByProfileIds.length })}</span>
            </button>

            {canModify && (
              <>
                <button
                  type="button"
                  onClick={() => togglePostGazetteFlag(post.id)}
                  className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold transition-colors cursor-pointer ${
                    post.includeInGazette
                      ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                      : 'bg-stone-100 dark:bg-stone-800 text-stone-500 dark:text-stone-400'
                  }`}
                >
                  <Newspaper className="w-3.5 h-3.5" />
                  <span>
                    {post.includeInGazette ? tr('toggleGazetteOn') : tr('toggleGazetteOff')}
                  </span>
                </button>

                {post.mediaIds.length > 0 && post.includeInGazette && (
                  <button
                    type="button"
                    onClick={() => togglePostFullPage(post.id)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors cursor-pointer ${
                      post.fullPageFeature
                        ? 'bg-amber-500/15 text-amber-800 dark:text-amber-300'
                        : 'bg-stone-100 dark:bg-stone-800 text-stone-500 dark:text-stone-400'
                    }`}
                  >
                    <Star className={`w-3.5 h-3.5 ${post.fullPageFeature ? 'fill-current' : ''}`} />
                    <span>{tr('badgeFullPage')}</span>
                  </button>
                )}
              </>
            )}
          </div>

          {/* Comments */}
          <section className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-stone-400">
              {tr('postCommentsTitle', { n: comments.length })}
            </h3>

            {comments.length === 0 ? (
              <p className="text-sm text-stone-500 dark:text-stone-400 italic">
                {tr('postNoComments')}
              </p>
            ) : (
              <div className="space-y-3">
                {comments.map((cmt) => {
                  const cAuthor = profilesById.get(cmt.authorProfileId);
                  const canDeleteCmt =
                    Boolean(activeProfile && activeProfile.id === cmt.authorProfileId) ||
                    isActiveProfileAdmin;
                  return (
                    <div key={cmt.id} className="flex items-start gap-2.5 group">
                      <AvatarBadge profile={cAuthor} size="sm" />
                      <div className="flex-1 rounded-2xl rounded-tl-none bg-stone-50 dark:bg-stone-900/70 border border-stone-200/70 dark:border-stone-800 px-3.5 py-2.5">
                        <div className="flex items-center justify-between gap-2 mb-0.5">
                          <span className="text-xs font-bold text-stone-900 dark:text-stone-100">
                            {cAuthor?.name || 'Membre'}
                          </span>
                          <div className="flex items-center gap-1.5">
                            <span className="text-[11px] text-stone-400">
                              {formatRelativeTime(cmt.createdAt, language)}
                            </span>
                            {canDeleteCmt && (
                              <button
                                type="button"
                                onClick={() => deletePostComment(cmt.id)}
                                aria-label={tr('postDelete')}
                                className="opacity-0 group-hover:opacity-100 focus:opacity-100 text-stone-400 hover:text-rose-500 transition-opacity cursor-pointer"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        </div>
                        <p className="text-sm text-stone-700 dark:text-stone-300 leading-snug whitespace-pre-line">
                          {cmt.body}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>

        {/* Safe-area Comment Composer */}
        <form
          onSubmit={handleSendComment}
          className="px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] border-t border-stone-200 dark:border-stone-800 bg-white dark:bg-[#171A23] flex items-center gap-2 shrink-0"
        >
          <input
            type="text"
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            placeholder={tr('postCommentPlaceholder')}
            className="flex-1 px-4 py-2.5 rounded-full bg-stone-100 dark:bg-stone-900 border border-transparent focus:border-[#1B5E7C] text-sm text-stone-900 dark:text-stone-100 outline-none"
          />
          <button
            type="submit"
            disabled={!commentText.trim()}
            aria-label={tr('postCommentSend')}
            className="p-2.5 rounded-full bg-[#1B5E7C] hover:bg-[#164b63] disabled:opacity-40 text-white shadow-sm transition-colors cursor-pointer shrink-0"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>,
    document.body,
  );
};
