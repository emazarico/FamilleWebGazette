import React, { useEffect, useMemo, useState } from 'react';
import { Lock, MessageCircle, MessageSquarePlus, Search } from 'lucide-react';
import { useFamily } from '../../store/FamilyContext';
import type { TranslationKey } from '../../utils/i18n';
import { formatRelativeTime } from '../../utils/i18n';
import {
  filterVisibleMessages,
  getMessageLatestTimestamp,
  isMessageUnread,
  type MessageFilterMode,
} from '../../utils/messages';
import { AvatarBadge } from '../common/AvatarBadge';
import { CreateMessageModal } from './CreateMessageModal';
import { MessageDetailDrawer } from './MessageDetailDrawer';

interface MessagesViewProps {
  initialOpenMessageId?: string | null;
  onClearInitialMessage?: () => void;
}

const MODE_TABS: Array<{ id: MessageFilterMode; labelKey: TranslationKey }> = [
  { id: 'all', labelKey: 'messagesFilterAll' },
  { id: 'inbox', labelKey: 'messagesFilterInbox' },
  { id: 'sent', labelKey: 'messagesFilterSent' },
  { id: 'unread', labelKey: 'messagesFilterUnread' },
];

export const MessagesView: React.FC<MessagesViewProps> = ({
  initialOpenMessageId,
  onClearInitialMessage,
}) => {
  const {
    activeProfile,
    visibleMessages,
    activeMessageReplies,
    profilesById,
    language,
    tr,
  } = useFamily();

  const [mode, setMode] = useState<MessageFilterMode>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [composeOpen, setComposeOpen] = useState(false);
  const [openMessageId, setOpenMessageId] = useState<string | null>(null);

  useEffect(() => {
    if (initialOpenMessageId) {
      setOpenMessageId(initialOpenMessageId);
      onClearInitialMessage?.();
    }
  }, [initialOpenMessageId, onClearInitialMessage]);

  const filteredMessages = useMemo(() => {
    if (!activeProfile) return [];
    return filterVisibleMessages(visibleMessages, activeMessageReplies, {
      profileId: activeProfile.id,
      mode,
      searchQuery,
      profilesById,
    });
  }, [visibleMessages, activeMessageReplies, activeProfile, mode, searchQuery, profilesById]);

  const replyStats = useMemo(() => {
    const counts = new Map<string, number>();
    const lastBody = new Map<string, string>();
    const sortedReplies = activeMessageReplies
      .slice()
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    for (const r of sortedReplies) {
      counts.set(r.messageId, (counts.get(r.messageId) || 0) + 1);
      lastBody.set(r.messageId, r.body);
    }
    return { counts, lastBody };
  }, [activeMessageReplies]);

  const activeMessage = useMemo(
    () => visibleMessages.find((m) => m.id === openMessageId) || null,
    [visibleMessages, openMessageId],
  );

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      {/* Header & Compose CTA */}
      <div className="rounded-3xl bg-white dark:bg-[#171A23] border border-stone-200/85 dark:border-stone-800 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 shadow-xs">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-2xl bg-indigo-500/12 text-indigo-600 dark:text-indigo-300 flex items-center justify-center shrink-0">
            <Lock className="w-5 h-5" />
          </div>
          <div>
            <h1 className="font-serif-display text-xl font-bold text-stone-900 dark:text-stone-100">
              {tr('messagesTitle')}
            </h1>
            <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5 leading-relaxed">
              {tr('messagesPrivacyBanner')}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setComposeOpen(true)}
          className="inline-flex items-center justify-center gap-2 min-h-[42px] px-4 py-2 rounded-xl bg-[#1B5E7C] hover:bg-[#164b63] text-white text-xs font-semibold shadow-sm transition-colors cursor-pointer shrink-0"
        >
          <MessageSquarePlus className="w-4 h-4" />
          <span>{tr('messagesNewBtn')}</span>
        </button>
      </div>

      {/* Search & Mode Filters */}
      <div className="space-y-2.5">
        <div className="relative">
          <Search className="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={tr('messagesSearchPlaceholder')}
            className="w-full pl-10 pr-4 py-2.5 rounded-2xl bg-white dark:bg-[#171A23] border border-stone-200 dark:border-stone-800 text-sm text-stone-900 dark:text-stone-100 outline-none focus:ring-2 focus:ring-[#1B5E7C]"
          />
        </div>

        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {MODE_TABS.map((tab) => {
            const active = mode === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setMode(tab.id)}
                className={`px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                  active
                    ? 'bg-[#1B5E7C] text-white shadow-xs'
                    : 'bg-white dark:bg-[#171A23] border border-stone-200 dark:border-stone-800 text-stone-600 dark:text-stone-300 hover:border-[#1B5E7C]/50'
                }`}
              >
                {tr(tab.labelKey)}
              </button>
            );
          })}
        </div>
      </div>

      {/* Threads List */}
      {filteredMessages.length === 0 ? (
        <div className="rounded-3xl bg-white dark:bg-[#171A23] border border-stone-200 dark:border-stone-800 p-8 text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-indigo-500/12 text-indigo-600 dark:text-indigo-300 flex items-center justify-center mx-auto">
            <Lock className="w-6 h-6" />
          </div>
          <h3 className="font-serif-display text-xl font-bold text-stone-900 dark:text-stone-100">
            {tr('messagesEmptyTitle')}
          </h3>
          <p className="text-sm text-stone-500 dark:text-stone-400 max-w-md mx-auto">
            {tr('messagesEmptyBody')}
          </p>
          <button
            type="button"
            onClick={() => setComposeOpen(true)}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#1B5E7C] hover:bg-[#164b63] text-white text-sm font-semibold shadow-sm cursor-pointer"
          >
            <MessageSquarePlus className="w-4 h-4" />
            <span>{tr('messagesNewBtn')}</span>
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredMessages.map((msg) => {
            const sender = profilesById.get(msg.senderProfileId);
            const unread = isMessageUnread(msg, activeProfile?.id || null);
            const replyCount = replyStats.counts.get(msg.id) || 0;
            const latestSnippet = replyStats.lastBody.get(msg.id) || msg.body;
            const latestTs = getMessageLatestTimestamp(msg, activeMessageReplies);
            const recipients = msg.recipientProfileIds
              .map((id) => profilesById.get(id))
              .filter((p): p is NonNullable<typeof p> => Boolean(p && !p.deletedAt));

            return (
              <button
                key={msg.id}
                type="button"
                onClick={() => setOpenMessageId(msg.id)}
                className={`w-full text-left rounded-3xl p-4 sm:p-5 border transition-all cursor-pointer shadow-xs hover:shadow-md ${
                  unread
                    ? 'bg-white dark:bg-[#171A23] border-[#1B5E7C]/50 dark:border-teal-500/50 ring-1 ring-[#1B5E7C]/15'
                    : 'bg-white dark:bg-[#171A23] border-stone-200/85 dark:border-stone-800'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="relative">
                      <AvatarBadge profile={sender} size="md" />
                      {unread && (
                        <span className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-[#1B5E7C] border-2 border-white dark:border-[#171A23]" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-bold text-stone-900 dark:text-stone-100">
                          {msg.senderProfileId === activeProfile?.id
                            ? tr('messagesYou')
                            : sender?.name || 'Membre'}
                        </p>
                        {unread && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#1B5E7C]/12 text-[#1B5E7C] dark:bg-teal-500/15 dark:text-teal-300">
                            {tr('messagesUnreadBadge')}
                          </span>
                        )}
                      </div>
                      {msg.subject && (
                        <p className="font-serif-display font-bold text-base text-stone-900 dark:text-stone-100 mt-0.5 line-clamp-1">
                          {msg.subject}
                        </p>
                      )}
                      <p className="text-sm text-stone-600 dark:text-stone-300 mt-0.5 line-clamp-2">
                        {latestSnippet}
                      </p>
                    </div>
                  </div>

                  <span className="text-[11px] text-stone-400 whitespace-nowrap shrink-0">
                    {formatRelativeTime(latestTs, language)}
                  </span>
                </div>

                <div className="mt-3 pt-2.5 border-t border-stone-100 dark:border-stone-800/80 flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[11px] text-stone-400">{tr('messagesSharedWith')}:</span>
                    {recipients.map((rec) => (
                      <span
                        key={rec.id}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300"
                      >
                        <span>{rec.avatarEmoji}</span>
                        <span>
                          {rec.id === activeProfile?.id ? tr('messagesYou') : rec.name}
                        </span>
                      </span>
                    ))}
                  </div>

                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-stone-500 dark:text-stone-400">
                    <MessageCircle className="w-3.5 h-3.5" />
                    <span>{tr('messagesRepliesCount', { n: replyCount })}</span>
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}

      <CreateMessageModal open={composeOpen} onClose={() => setComposeOpen(false)} />
      <MessageDetailDrawer message={activeMessage} onClose={() => setOpenMessageId(null)} />
    </div>
  );
};
