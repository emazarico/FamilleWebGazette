import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Lock, Send, Trash2, X } from 'lucide-react';
import { useFamily } from '../../store/FamilyContext';
import type { PrivateMessage } from '../../types/family';
import { formatRelativeTime } from '../../utils/i18n';
import { AvatarBadge } from '../common/AvatarBadge';

interface MessageDetailDrawerProps {
  message: PrivateMessage | null;
  onClose: () => void;
}

export const MessageDetailDrawer: React.FC<MessageDetailDrawerProps> = ({
  message,
  onClose,
}) => {
  const {
    activeProfile,
    isActiveProfileAdmin,
    profilesById,
    activeMessageReplies,
    markPrivateMessageRead,
    replyToPrivateMessage,
    deletePrivateMessage,
    deleteMessageReply,
    language,
    tr,
  } = useFamily();

  const [replyText, setReplyText] = useState('');

  useEffect(() => {
    if (!message) return;
    markPrivateMessageRead(message.id);
    setReplyText('');
  }, [message?.id, markPrivateMessageRead]);

  useEffect(() => {
    if (!message) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [message, onClose]);

  if (!message || typeof document === 'undefined') return null;

  const sender = profilesById.get(message.senderProfileId);
  const recipients = message.recipientProfileIds
    .map((id) => profilesById.get(id))
    .filter((p): p is NonNullable<typeof p> => Boolean(p && !p.deletedAt));
  const replies = activeMessageReplies
    .filter((r) => r.messageId === message.id)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  const canDeleteThread =
    Boolean(activeProfile && activeProfile.id === message.senderProfileId) ||
    isActiveProfileAdmin;

  const handleSendReply = (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyText.trim()) return;
    replyToPrivateMessage(message.id, replyText);
    setReplyText('');
  };

  const handleDeleteThread = () => {
    if (window.confirm(tr('messagesDeleteConfirm'))) {
      deletePrivateMessage(message.id);
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
        {/* Header */}
        <div className="px-5 py-4 border-b border-stone-100 dark:border-stone-800 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <AvatarBadge profile={sender} size="sm" />
            <div className="min-w-0">
              <h2 className="font-serif-display text-lg font-bold text-stone-900 dark:text-stone-100 truncate">
                {sender?.name || 'Membre'}
              </h2>
              <p className="text-xs text-stone-500 dark:text-stone-400">
                {formatRelativeTime(message.createdAt, language)}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {canDeleteThread && (
              <button
                type="button"
                onClick={handleDeleteThread}
                aria-label={tr('postDelete')}
                className="p-2 rounded-lg text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
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

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto overscroll-contain custom-scrollbar p-5 space-y-5">
          {message.subject && (
            <h3 className="font-serif-display text-xl sm:text-2xl font-bold text-stone-900 dark:text-stone-100">
              {message.subject}
            </h3>
          )}

          <p className="text-base leading-relaxed text-stone-800 dark:text-stone-200 whitespace-pre-line">
            {message.body}
          </p>

          {/* Shared With Recipients Tray */}
          <div className="p-3.5 rounded-2xl bg-stone-50 dark:bg-stone-900/60 border border-stone-200/80 dark:border-stone-800 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-stone-400">
                {tr('messagesSharedWith')}
              </span>
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[#1B5E7C] dark:text-teal-400">
                <Lock className="w-3 h-3" />
                {tr('messagesPrivacyFooter').split('·')[0].trim()}
              </span>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              {sender && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 text-stone-700 dark:text-stone-200">
                  <span>{sender.avatarEmoji}</span>
                  <span>
                    {sender.id === activeProfile?.id ? tr('messagesYou') : sender.name}
                  </span>
                </span>
              )}
              {recipients.map((rec) => (
                <span
                  key={rec.id}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 text-stone-700 dark:text-stone-200"
                >
                  <span>{rec.avatarEmoji}</span>
                  <span>
                    {rec.id === activeProfile?.id ? tr('messagesYou') : rec.name}
                  </span>
                </span>
              ))}
            </div>
          </div>

          {/* Threaded Replies */}
          <section className="space-y-3 pt-1">
            <h4 className="text-xs font-bold uppercase tracking-wider text-stone-400">
              {tr('messagesConversation', { n: replies.length })}
            </h4>

            {replies.length === 0 ? (
              <p className="text-sm text-stone-500 dark:text-stone-400 italic">
                {tr('messagesNoReplies')}
              </p>
            ) : (
              <div className="space-y-3">
                {replies.map((reply) => {
                  const rAuthor = profilesById.get(reply.authorProfileId);
                  const isOwn = reply.authorProfileId === activeProfile?.id;
                  const canDeleteReply = isOwn || isActiveProfileAdmin;
                  return (
                    <div
                      key={reply.id}
                      className={`flex items-start gap-2.5 group ${
                        isOwn ? 'flex-row-reverse' : ''
                      }`}
                    >
                      <AvatarBadge profile={rAuthor} size="sm" />
                      <div
                        className={`flex-1 rounded-2xl px-3.5 py-2.5 border ${
                          isOwn
                            ? 'rounded-tr-none bg-[#1B5E7C]/10 dark:bg-teal-500/15 border-[#1B5E7C]/25 dark:border-teal-500/30'
                            : 'rounded-tl-none bg-stone-50 dark:bg-stone-900/70 border-stone-200/70 dark:border-stone-800'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2 mb-0.5">
                          <span className="text-xs font-bold text-stone-900 dark:text-stone-100">
                            {isOwn ? tr('messagesYou') : rAuthor?.name || 'Membre'}
                          </span>
                          <div className="flex items-center gap-1.5">
                            <span className="text-[11px] text-stone-400">
                              {formatRelativeTime(reply.createdAt, language)}
                            </span>
                            {canDeleteReply && (
                              <button
                                type="button"
                                onClick={() => deleteMessageReply(reply.id)}
                                aria-label={tr('postDelete')}
                                className="opacity-0 group-hover:opacity-100 focus:opacity-100 text-stone-400 hover:text-rose-500 transition-opacity cursor-pointer"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        </div>
                        <p className="text-sm text-stone-700 dark:text-stone-200 leading-snug whitespace-pre-line">
                          {reply.body}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>

        {/* Safe-area Reply Composer */}
        <form
          onSubmit={handleSendReply}
          className="px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] border-t border-stone-200 dark:border-stone-800 bg-white dark:bg-[#171A23] flex items-center gap-2 shrink-0"
        >
          <input
            type="text"
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            placeholder={tr('messagesReplyPlaceholder')}
            className="flex-1 px-4 py-2.5 rounded-full bg-stone-100 dark:bg-stone-900 border border-transparent focus:border-[#1B5E7C] text-sm text-stone-900 dark:text-stone-100 outline-none"
          />
          <button
            type="submit"
            disabled={!replyText.trim()}
            aria-label={tr('messagesSendBtn')}
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
