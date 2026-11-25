import React, { useEffect, useMemo, useState } from 'react';
import { Check, Lock, Send, Users } from 'lucide-react';
import { useFamily } from '../../store/FamilyContext';
import { AvatarBadge } from '../common/AvatarBadge';
import { Modal } from '../common/Modal';

interface CreateMessageModalProps {
  open: boolean;
  onClose: () => void;
}

export const CreateMessageModal: React.FC<CreateMessageModalProps> = ({ open, onClose }) => {
  const { activeProfile, activeProfiles, createPrivateMessage, tr } = useFamily();

  const otherMembers = useMemo(
    () => activeProfiles.filter((p) => p.id !== activeProfile?.id),
    [activeProfiles, activeProfile?.id],
  );

  const [recipientIds, setRecipientIds] = useState<string[]>([]);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setRecipientIds([]);
    setSubject('');
    setBody('');
    setError(null);
  }, [open]);

  const toggleRecipient = (id: string) => {
    setError(null);
    setRecipientIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  };

  const allSelected =
    otherMembers.length > 0 && recipientIds.length === otherMembers.length;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (recipientIds.length === 0) {
      setError(tr('messagesSelectAtLeastOne'));
      return;
    }
    if (!body.trim()) return;

    const created = createPrivateMessage({
      recipientProfileIds: recipientIds,
      subject,
      body,
    });
    if (created) {
      onClose();
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={tr('messagesCreateTitle')}
      subtitle={tr('messagesCreateSubtitle')}
      maxWidthClass="max-w-lg"
    >
      <form onSubmit={handleSubmit} className="p-5 space-y-5">
        {/* Recipient Selection */}
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <label className="text-xs font-bold uppercase tracking-wider text-stone-500 dark:text-stone-400">
              {tr('messagesToLabel')}
            </label>
            {otherMembers.length > 1 && (
              <button
                type="button"
                onClick={() =>
                  setRecipientIds(allSelected ? [] : otherMembers.map((m) => m.id))
                }
                className="inline-flex items-center gap-1 text-xs font-semibold text-[#1B5E7C] dark:text-teal-400 hover:underline cursor-pointer"
              >
                <Users className="w-3.5 h-3.5" />
                <span>{allSelected ? tr('memoryClearAll') : tr('memorySelectAll')}</span>
              </button>
            )}
          </div>

          <div className="flex gap-2 flex-wrap">
            {otherMembers.map((member) => {
              const selected = recipientIds.includes(member.id);
              return (
                <button
                  key={member.id}
                  type="button"
                  onClick={() => toggleRecipient(member.id)}
                  className={`inline-flex items-center gap-1.5 min-h-[40px] pl-1.5 pr-3 py-1 rounded-full border text-xs font-semibold transition-all cursor-pointer ${
                    selected
                      ? 'bg-[#1B5E7C]/12 border-[#1B5E7C] text-[#1B5E7C] dark:bg-teal-500/15 dark:text-teal-300 shadow-xs'
                      : 'bg-stone-50 dark:bg-stone-900 border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-300 hover:border-[#1B5E7C]/50'
                  }`}
                >
                  <AvatarBadge profile={member} size="xs" />
                  <span>{member.name}</span>
                  {selected && <Check className="w-3.5 h-3.5" />}
                </button>
              );
            })}
          </div>
        </div>

        {/* Optional Subject */}
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400 mb-1.5">
            {tr('messagesSubjectLabel')}
          </label>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder={tr('messagesSubjectPlaceholder')}
            className="w-full px-3.5 py-2.5 rounded-xl bg-stone-50 dark:bg-stone-900 border border-stone-200 dark:border-stone-700 text-sm text-stone-900 dark:text-stone-100 focus:ring-2 focus:ring-[#1B5E7C] outline-none"
          />
        </div>

        {/* Message Body */}
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400 mb-1.5">
            {tr('messagesBodyLabel')}
          </label>
          <textarea
            rows={5}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={tr('messagesBodyPlaceholder')}
            required
            className="w-full px-3.5 py-2.5 rounded-xl bg-stone-50 dark:bg-stone-900 border border-stone-200 dark:border-stone-700 text-sm text-stone-900 dark:text-stone-100 focus:ring-2 focus:ring-[#1B5E7C] outline-none resize-y"
          />
        </div>

        {/* Privacy Notice */}
        <div className="flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl bg-stone-100 dark:bg-stone-900/70 text-stone-500 dark:text-stone-400 text-xs font-medium">
          <Lock className="w-3.5 h-3.5 text-[#1B5E7C] dark:text-teal-400 shrink-0" />
          <span>{tr('messagesPrivacyFooter')}</span>
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
            disabled={!body.trim()}
            className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-sm font-semibold bg-[#1B5E7C] hover:bg-[#164b63] disabled:opacity-45 text-white shadow-md shadow-teal-900/20 cursor-pointer"
          >
            <Send className="w-4 h-4" />
            <span>{tr('messagesSendBtn')}</span>
          </button>
        </div>
      </form>
    </Modal>
  );
};
