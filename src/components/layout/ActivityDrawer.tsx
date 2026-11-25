import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AtSign,
  Bell,
  CalendarClock,
  Camera,
  CheckCheck,
  Lock,
  MessageCircle,
  X,
} from 'lucide-react';
import { useFamily } from '../../store/FamilyContext';
import {
  type ActivityFilter,
  type ActivityItem,
  filterActivityItems,
} from '../../utils/activity';
import { formatMemoryDate, formatRelativeTime, type TranslationKey } from '../../utils/i18n';
import { AvatarBadge } from '../common/AvatarBadge';
import { MediaImage } from '../common/MediaImage';

interface ActivityDrawerProps {
  open: boolean;
  onClose: () => void;
  onSelectActivity: (item: ActivityItem) => void;
}

const FILTER_TABS: Array<{ id: ActivityFilter; labelKey: TranslationKey }> = [
  { id: 'all', labelKey: 'activityFilterAll' },
  { id: 'mentions', labelKey: 'activityFilterMentions' },
  { id: 'messages', labelKey: 'activityFilterMessages' },
  { id: 'gazette', labelKey: 'activityFilterGazette' },
];

export const ActivityDrawer: React.FC<ActivityDrawerProps> = ({
  open,
  onClose,
  onSelectActivity,
}) => {
  const {
    activityItems,
    unreadActivityCount,
    profilesById,
    markAllActivityRead,
    language,
    tr,
  } = useFamily();

  const [filter, setFilter] = useState<ActivityFilter>('all');

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  const filtered = useMemo(
    () => filterActivityItems(activityItems, filter),
    [activityItems, filter],
  );

  const grouped = useMemo(() => {
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const yesterdayStr = new Date(now.getTime() - 86_400_000).toISOString().slice(0, 10);

    const today: ActivityItem[] = [];
    const yesterday: ActivityItem[] = [];
    const earlier: ActivityItem[] = [];

    for (const item of filtered) {
      const day = item.createdAt.slice(0, 10);
      if (day === todayStr) today.push(item);
      else if (day === yesterdayStr) yesterday.push(item);
      else earlier.push(item);
    }

    return [
      { key: 'today', label: tr('activitySectionToday'), items: today },
      { key: 'yesterday', label: tr('activitySectionYesterday'), items: yesterday },
      { key: 'earlier', label: tr('activitySectionEarlier'), items: earlier },
    ].filter((g) => g.items.length > 0);
  }, [filtered, tr]);

  if (!open || typeof document === 'undefined') return null;

  const renderBadgeIcon = (kind: ActivityItem['kind']) => {
    switch (kind) {
      case 'tagged_in_post':
        return (
          <span className="w-5 h-5 rounded-full bg-purple-500 text-white flex items-center justify-center border-2 border-white dark:border-[#171A23]">
            <AtSign className="w-2.5 h-2.5" />
          </span>
        );
      case 'comment':
        return (
          <span className="w-5 h-5 rounded-full bg-sky-500 text-white flex items-center justify-center border-2 border-white dark:border-[#171A23]">
            <MessageCircle className="w-2.5 h-2.5" />
          </span>
        );
      case 'private_message':
      case 'message_reply':
        return (
          <span className="w-5 h-5 rounded-full bg-indigo-500 text-white flex items-center justify-center border-2 border-white dark:border-[#171A23]">
            <Lock className="w-2.5 h-2.5" />
          </span>
        );
      case 'gazette_reminder':
        return (
          <span className="w-5 h-5 rounded-full bg-amber-500 text-white flex items-center justify-center border-2 border-white dark:border-[#171A23]">
            <CalendarClock className="w-2.5 h-2.5" />
          </span>
        );
      default:
        return (
          <span className="w-5 h-5 rounded-full bg-emerald-500 text-white flex items-center justify-center border-2 border-white dark:border-[#171A23]">
            <Camera className="w-2.5 h-2.5" />
          </span>
        );
    }
  };

  const formatTitle = (item: ActivityItem): string => {
    const actorName = item.actorProfileId
      ? profilesById.get(item.actorProfileId)?.name || 'Membre'
      : '';
    switch (item.kind) {
      case 'tagged_in_post':
        return tr('activityTaggedYou', { name: actorName });
      case 'comment':
        return tr('activityCommented', { name: actorName });
      case 'private_message':
        return tr('activitySentMessage', { name: actorName });
      case 'message_reply':
        return tr('activityRepliedMessage', { name: actorName });
      case 'gazette_reminder':
        return tr('activityGazetteReminder', {
          date: item.snippet ? formatMemoryDate(item.snippet, language) : '',
        });
      default:
        return tr('activityNewPost', { name: actorName });
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
        className="w-full max-w-md h-full bg-white dark:bg-[#171A23] border-l border-stone-200 dark:border-stone-800 shadow-2xl flex flex-col animate-fade-slide pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]"
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-stone-100 dark:border-stone-800 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2">
            <Bell className="w-5 h-5 text-[#1B5E7C] dark:text-teal-400" />
            <h2 className="font-serif-display text-xl font-bold text-stone-900 dark:text-stone-100">
              {tr('activityTitle')}
            </h2>
          </div>

          <div className="flex items-center gap-2">
            {unreadActivityCount > 0 && (
              <button
                type="button"
                onClick={markAllActivityRead}
                className="inline-flex items-center gap-1 text-xs font-semibold text-[#1B5E7C] dark:text-teal-400 hover:underline cursor-pointer"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                <span>{tr('activityMarkAllRead')}</span>
              </button>
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

        {/* Segmented Filter */}
        <div className="px-4 py-3 border-b border-stone-100 dark:border-stone-800 shrink-0">
          <div className="grid grid-cols-4 gap-1 p-1 rounded-xl bg-stone-100 dark:bg-stone-800/80">
            {FILTER_TABS.map((tab) => {
              const active = filter === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setFilter(tab.id)}
                  className={`py-1.5 px-2 rounded-lg text-xs font-semibold transition-all cursor-pointer truncate ${
                    active
                      ? 'bg-white dark:bg-[#171A23] text-[#1B5E7C] dark:text-teal-300 shadow-xs'
                      : 'text-stone-500 dark:text-stone-400'
                  }`}
                >
                  {tr(tab.labelKey)}
                </button>
              );
            })}
          </div>
        </div>

        {/* Feed */}
        <div className="flex-1 overflow-y-auto overscroll-contain custom-scrollbar p-4 space-y-5">
          {grouped.length === 0 ? (
            <div className="py-12 text-center space-y-2">
              <Bell className="w-8 h-8 text-stone-300 dark:text-stone-600 mx-auto" />
              <p className="text-sm text-stone-500 dark:text-stone-400">{tr('activityEmpty')}</p>
            </div>
          ) : (
            grouped.map((section) => (
              <div key={section.key} className="space-y-2">
                <p className="text-[11px] font-bold uppercase tracking-wider text-stone-400 px-1">
                  {section.label}
                </p>
                <div className="space-y-1.5">
                  {section.items.map((item) => {
                    const actor = item.actorProfileId
                      ? profilesById.get(item.actorProfileId)
                      : undefined;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          onSelectActivity(item);
                          onClose();
                        }}
                        className={`w-full text-left flex items-center gap-3 p-3 rounded-2xl transition-colors cursor-pointer ${
                          item.unread
                            ? 'bg-[#1B5E7C]/6 dark:bg-teal-500/10 hover:bg-[#1B5E7C]/10'
                            : 'hover:bg-stone-50 dark:hover:bg-stone-900/60'
                        }`}
                      >
                        <div className="relative shrink-0">
                          {item.kind === 'gazette_reminder' ? (
                            <div className="w-10 h-10 rounded-2xl bg-amber-500/15 text-amber-600 dark:text-amber-300 flex items-center justify-center">
                              <CalendarClock className="w-5 h-5" />
                            </div>
                          ) : (
                            <AvatarBadge profile={actor} size="md" />
                          )}
                          <div className="absolute -bottom-1 -right-1">
                            {renderBadgeIcon(item.kind)}
                          </div>
                        </div>

                        <div className="flex-1 min-w-0">
                          <p className="text-xs sm:text-sm font-semibold text-stone-900 dark:text-stone-100 leading-snug">
                            {formatTitle(item)}
                          </p>
                          {item.snippet && item.kind !== 'gazette_reminder' && (
                            <p className="text-xs text-stone-500 dark:text-stone-400 line-clamp-1 mt-0.5">
                              “{item.snippet}”
                            </p>
                          )}
                          <p className="text-[11px] text-stone-400 mt-0.5">
                            {formatRelativeTime(item.createdAt, language)}
                          </p>
                        </div>

                        {item.previewMediaId && (
                          <div className="w-11 h-11 rounded-xl overflow-hidden bg-stone-100 dark:bg-stone-800 shrink-0">
                            <MediaImage
                              mediaId={item.previewMediaId}
                              variant="thumb"
                              alt="Preview"
                            />
                          </div>
                        )}

                        {item.unread && (
                          <span className="w-2 h-2 rounded-full bg-[#1B5E7C] dark:bg-teal-400 shrink-0" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
};
