import React, { useEffect, useMemo, useState } from 'react';
import {
  CalendarClock,
  Camera,
  MessageSquarePlus,
  Newspaper,
  Search,
  Sparkles,
} from 'lucide-react';
import { useFamily } from '../../store/FamilyContext';
import type { AppTab, MemoryPost, WallFilterMode } from '../../types/family';
import { computeNextGazetteSchedule, filterMemoryPosts } from '../../utils/feed';
import { formatMemoryDate, type TranslationKey } from '../../utils/i18n';
import { CreateMessageModal } from '../messages/CreateMessageModal';
import { CreateMemoryModal } from './CreateMemoryModal';
import { MemoryCard } from './MemoryCard';
import { PostDetailDrawer } from './PostDetailDrawer';

interface FeedViewProps {
  onNavigateTab: (tab: AppTab) => void;
  externalOpenPost?: { postId: string; photoIdx: number } | null;
  onClearExternalOpenPost?: () => void;
}

const FILTER_OPTIONS: Array<{ id: WallFilterMode; labelKey: TranslationKey }> = [
  { id: 'all', labelKey: 'filterAll' },
  { id: 'photos', labelKey: 'filterPhotos' },
  { id: 'stories', labelKey: 'filterStories' },
  { id: 'gazette', labelKey: 'filterGazette' },
  { id: 'tagged-me', labelKey: 'filterTaggedMe' },
];

export const FeedView: React.FC<FeedViewProps> = ({
  onNavigateTab,
  externalOpenPost,
  onClearExternalOpenPost,
}) => {
  const {
    db,
    activeProfile,
    activeProfiles,
    activePosts,
    activeComments,
    queuedGazettePosts,
    profilesById,
    rememberedPeopleById,
    isActiveProfileAdmin,
    language,
    tr,
  } = useFamily();

  const [filter, setFilter] = useState<WallFilterMode>('all');
  const [authorFilterId, setAuthorFilterId] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const [composerOpen, setComposerOpen] = useState(false);
  const [messageModalOpen, setMessageModalOpen] = useState(false);
  const [editingPost, setEditingPost] = useState<MemoryPost | null>(null);
  const [detailTarget, setDetailTarget] = useState<{
    postId: string;
    photoIdx: number;
  } | null>(null);

  useEffect(() => {
    if (!externalOpenPost) return;
    setDetailTarget({
      postId: externalOpenPost.postId,
      photoIdx: externalOpenPost.photoIdx || 0,
    });
    onClearExternalOpenPost?.();
  }, [externalOpenPost, onClearExternalOpenPost]);

  const schedule = useMemo(
    () => computeNextGazetteSchedule(db.settings),
    [db.settings],
  );

  const commentCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of activeComments) {
      map.set(c.postId, (map.get(c.postId) || 0) + 1);
    }
    return map;
  }, [activeComments]);

  const filteredPosts = useMemo(
    () =>
      filterMemoryPosts(activePosts, {
        filter,
        activeProfileId: activeProfile?.id || null,
        authorFilterId,
        searchQuery,
        profilesById,
        rememberedPeopleById,
      }),
    [
      activePosts,
      filter,
      activeProfile?.id,
      authorFilterId,
      searchQuery,
      profilesById,
      rememberedPeopleById,
    ],
  );

  const detailPost = useMemo(
    () =>
      detailTarget ? activePosts.find((p) => p.id === detailTarget.postId) || null : null,
    [activePosts, detailTarget],
  );

  const formattedNextDate = schedule.nextPublishDate
    ? formatMemoryDate(schedule.nextPublishDate, language)
    : '';

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      {/* Monthly Gazette Countdown & 3-Day Advance Reminder Banner */}
      {schedule.nextPublishDate && (
        <div
          className={`rounded-3xl p-4 sm:p-5 border flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs ${
            schedule.isInReminderWindow
              ? 'bg-gradient-to-r from-amber-500/15 via-orange-500/10 to-teal-500/10 border-amber-400/50 dark:border-amber-500/40'
              : 'bg-white/90 dark:bg-[#171A23]/90 border-stone-200/85 dark:border-stone-800'
          }`}
        >
          <div className="flex items-start gap-3">
            <div
              className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${
                schedule.isInReminderWindow
                  ? 'bg-amber-500 text-white shadow-sm shadow-amber-500/30'
                  : 'bg-[#1B5E7C]/12 text-[#1B5E7C] dark:bg-teal-500/15 dark:text-teal-300'
              }`}
            >
              <CalendarClock className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm font-bold text-stone-900 dark:text-stone-100">
                {schedule.isDueToday
                  ? tr('gazetteBannerDueToday', { date: formattedNextDate })
                  : schedule.isInReminderWindow
                    ? tr('gazetteBannerReminderActive', {
                        days: db.settings.reminderDaysBefore,
                        date: formattedNextDate,
                      })
                    : tr('gazetteBannerDueSoon', {
                        days: schedule.daysUntilPublish ?? 0,
                        date: formattedNextDate,
                      })}
              </p>
              <p className="text-xs text-stone-600 dark:text-stone-400 mt-0.5">
                {tr('gazetteBannerQueuedCount', { count: queuedGazettePosts.length })}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => onNavigateTab('gazettes')}
            className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#1B5E7C] hover:bg-[#164b63] text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer shrink-0"
          >
            <Newspaper className="w-3.5 h-3.5" />
            <span>{tr('gazetteBannerOpenStudio')}</span>
          </button>
        </div>
      )}

      {/* Quick Action Cards */}
      <div className={`grid gap-3 ${isActiveProfileAdmin ? 'grid-cols-1 sm:grid-cols-3' : 'grid-cols-1 sm:grid-cols-2'}`}>
        <button
          type="button"
          onClick={() => {
            setEditingPost(null);
            setComposerOpen(true);
          }}
          className="flex items-center gap-3 p-4 rounded-2xl bg-white dark:bg-[#171A23] border border-stone-200/85 dark:border-stone-800 hover:border-[#1B5E7C]/60 shadow-xs hover:shadow-md transition-all text-left cursor-pointer"
        >
          <div className="w-11 h-11 rounded-xl bg-[#1B5E7C]/12 text-[#1B5E7C] dark:bg-teal-500/15 dark:text-teal-300 flex items-center justify-center shrink-0">
            <Camera className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-stone-900 dark:text-stone-100 truncate">
              {tr('wallQuickNewMemory')}
            </p>
            <p className="text-xs text-stone-500 dark:text-stone-400 truncate">
              {tr('wallQuickNewMemoryDesc')}
            </p>
          </div>
        </button>

        <button
          type="button"
          onClick={() => setMessageModalOpen(true)}
          className="flex items-center gap-3 p-4 rounded-2xl bg-white dark:bg-[#171A23] border border-stone-200/85 dark:border-stone-800 hover:border-indigo-400/60 shadow-xs hover:shadow-md transition-all text-left cursor-pointer"
        >
          <div className="w-11 h-11 rounded-xl bg-indigo-500/12 text-indigo-600 dark:text-indigo-300 flex items-center justify-center shrink-0">
            <MessageSquarePlus className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-stone-900 dark:text-stone-100 truncate">
              {tr('wallQuickPrivateNote')}
            </p>
            <p className="text-xs text-stone-500 dark:text-stone-400 truncate">
              {tr('wallQuickPrivateNoteDesc')}
            </p>
          </div>
        </button>

        {isActiveProfileAdmin && (
          <button
            type="button"
            onClick={() => onNavigateTab('gazettes')}
            className="flex items-center gap-3 p-4 rounded-2xl bg-white dark:bg-[#171A23] border border-stone-200/85 dark:border-stone-800 hover:border-amber-400/70 shadow-xs hover:shadow-md transition-all text-left cursor-pointer"
          >
            <div className="w-11 h-11 rounded-xl bg-amber-500/15 text-amber-700 dark:text-amber-300 flex items-center justify-center shrink-0">
              <Newspaper className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-stone-900 dark:text-stone-100 truncate">
                {tr('wallQuickCompileGazette')}
              </p>
              <p className="text-xs text-stone-500 dark:text-stone-400 truncate">
                {tr('wallQuickCompileGazetteDesc', { count: queuedGazettePosts.length })}
              </p>
            </div>
          </button>
        )}
      </div>

      {/* Filter & Search Bar */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row gap-2.5">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={tr('wallSearchPlaceholder')}
              className="w-full pl-10 pr-4 py-2.5 rounded-2xl bg-white dark:bg-[#171A23] border border-stone-200 dark:border-stone-800 text-sm text-stone-900 dark:text-stone-100 outline-none focus:ring-2 focus:ring-[#1B5E7C]"
            />
          </div>

          <select
            value={authorFilterId}
            onChange={(e) => setAuthorFilterId(e.target.value)}
            aria-label={tr('filterAllMembers')}
            className="px-3.5 py-2.5 rounded-2xl bg-white dark:bg-[#171A23] border border-stone-200 dark:border-stone-800 text-sm font-medium text-stone-700 dark:text-stone-200 outline-none focus:ring-2 focus:ring-[#1B5E7C]"
          >
            <option value="all">{tr('filterAllMembers')}</option>
            {activeProfiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.avatarEmoji} {p.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {FILTER_OPTIONS.map((opt) => {
            const active = filter === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => setFilter(opt.id)}
                className={`px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                  active
                    ? 'bg-[#1B5E7C] text-white shadow-xs'
                    : 'bg-white dark:bg-[#171A23] border border-stone-200 dark:border-stone-800 text-stone-600 dark:text-stone-300 hover:border-[#1B5E7C]/50'
                }`}
              >
                {tr(opt.labelKey)}
              </button>
            );
          })}
        </div>
      </div>

      {/* Memories Stream */}
      {filteredPosts.length === 0 ? (
        <div className="rounded-3xl bg-white dark:bg-[#171A23] border border-stone-200 dark:border-stone-800 p-8 text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-[#1B5E7C]/10 text-[#1B5E7C] dark:text-teal-300 flex items-center justify-center mx-auto">
            <Sparkles className="w-6 h-6" />
          </div>
          <h3 className="font-serif-display text-xl font-bold text-stone-900 dark:text-stone-100">
            {tr('wallEmptyTitle')}
          </h3>
          <p className="text-sm text-stone-500 dark:text-stone-400 max-w-md mx-auto">
            {tr('wallEmptyBody')}
          </p>
          <button
            type="button"
            onClick={() => {
              setEditingPost(null);
              setComposerOpen(true);
            }}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#1B5E7C] hover:bg-[#164b63] text-white text-sm font-semibold shadow-sm cursor-pointer"
          >
            <Camera className="w-4 h-4" />
            <span>{tr('wallEmptyCta')}</span>
          </button>
        </div>
      ) : (
        <div className="space-y-5">
          {filteredPosts.map((post) => (
            <MemoryCard
              key={post.id}
              post={post}
              commentCount={commentCounts.get(post.id) || 0}
              onOpenDetail={(targetPost, idx = 0) =>
                setDetailTarget({ postId: targetPost.id, photoIdx: idx })
              }
              onEdit={(targetPost) => {
                setEditingPost(targetPost);
                setComposerOpen(true);
              }}
            />
          ))}
        </div>
      )}

      <CreateMemoryModal
        open={composerOpen}
        onClose={() => {
          setComposerOpen(false);
          setEditingPost(null);
        }}
        editPost={editingPost}
      />

      <CreateMessageModal
        open={messageModalOpen}
        onClose={() => setMessageModalOpen(false)}
      />

      <PostDetailDrawer
        post={detailPost}
        initialPhotoIndex={detailTarget?.photoIdx || 0}
        onClose={() => setDetailTarget(null)}
        onEdit={(targetPost) => {
          setEditingPost(targetPost);
          setComposerOpen(true);
        }}
      />
    </div>
  );
};
