import React, { useEffect, useMemo, useState } from 'react';
import {
  Check,
  Cloud,
  Copy,
  KeyRound,
  Link2,
  MessageSquareShare,
  ShieldCheck,
} from 'lucide-react';
import { useFamily } from '../../store/FamilyContext';
import { buildMagicInviteUrl, resolveEffectiveAppsScriptUrl } from '../../utils/syncUrls';
import { Modal } from '../common/Modal';

interface InviteModalProps {
  open: boolean;
  onClose: () => void;
  onOpenSyncSetup?: () => void;
}

export const InviteModal: React.FC<InviteModalProps> = ({
  open,
  onClose,
  onOpenSyncSetup,
}) => {
  const {
    db,
    syncConfig,
    isActiveProfileAdmin,
    updateFamilySettings,
    language,
    tr,
    addToast,
  } = useFamily();

  const [inviteCode, setInviteCode] = useState(
    syncConfig.familyInviteCode || db.settings.inviteCode || '',
  );
  const [copiedLink, setCopiedLink] = useState(false);

  const canEditInviteCode = isActiveProfileAdmin && syncConfig.mode !== 'apps-script';

  useEffect(() => {
    if (!open) return;
    setInviteCode(syncConfig.familyInviteCode || db.settings.inviteCode || '');
    setCopiedLink(false);
  }, [open, syncConfig.familyInviteCode, db.settings.inviteCode]);

  const effectiveApiUrl = useMemo(
    () =>
      resolveEffectiveAppsScriptUrl(
        null,
        syncConfig.appsScriptUrl,
        import.meta.env.VITE_APPS_SCRIPT_URL,
      ),
    [syncConfig.appsScriptUrl],
  );

  const baseAppUrl = useMemo(() => {
    if (typeof window === 'undefined') return 'https://familygazette.example/';
    return `${window.location.origin}${window.location.pathname}`;
  }, []);

  const trimmedCode = inviteCode.trim();
  const magicInviteUrl = useMemo(() => {
    if (!effectiveApiUrl || !trimmedCode) return '';
    return buildMagicInviteUrl(baseAppUrl, effectiveApiUrl, trimmedCode);
  }, [baseAppUrl, effectiveApiUrl, trimmedCode]);

  const inviteMessage = useMemo(() => {
    if (!magicInviteUrl) return '';
    if (language === 'fr') {
      return [
        `Rejoins notre journal familial "${db.settings.familyName}" sur ${tr('appName')} !`,
        '',
        `1. Ouvre ce lien magique : ${magicInviteUrl}`,
        `2. Touche ton prénom (ou crée ton profil) et saisis ton code PIN personnel s’il y en a un.`,
        `(Code d’invitation : ${trimmedCode})`,
      ].join('\n');
    }
    return [
      `Join our family journal "${db.settings.familyName}" on ${tr('appName')}!`,
      '',
      `1. Open this magic invite link: ${magicInviteUrl}`,
      `2. Tap your name (or create your profile) and enter your optional personal PIN.`,
      `(Family Invite Code: ${trimmedCode})`,
    ].join('\n');
  }, [db.settings.familyName, language, magicInviteUrl, tr, trimmedCode]);

  const copyValue = async (text: string, markLink = false) => {
    try {
      await navigator.clipboard.writeText(text);
      if (markLink) {
        setCopiedLink(true);
        window.setTimeout(() => setCopiedLink(false), 1800);
      }
      addToast({ title: tr('shareCopiedToast'), tone: 'success' });
    } catch {
      addToast({ title: text.slice(0, 60), tone: 'info' });
    }
  };

  const handleSaveInviteCode = (e: React.FormEvent) => {
    e.preventDefault();
    if (!trimmedCode || !canEditInviteCode) return;
    updateFamilySettings({ inviteCode: trimmedCode });
    addToast({ title: tr('inviteCodeSavedToast'), tone: 'success' });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={tr('inviteModalTitle')}
      subtitle={tr('inviteModalSubtitle')}
      maxWidthClass="max-w-xl"
    >
      <div className="p-5 sm:p-6 space-y-5">
        {/* Invite Code */}
        <form onSubmit={handleSaveInviteCode} className="space-y-1.5">
          <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 flex items-center gap-1.5">
            <KeyRound className="w-3.5 h-3.5 text-amber-600" />
            <span>{tr('inviteCodeLabel')}</span>
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={inviteCode}
              readOnly={!canEditInviteCode}
              onChange={(e) => setInviteCode(e.target.value)}
              className="flex-1 px-3.5 py-2 rounded-xl bg-stone-50 dark:bg-stone-900 border border-stone-200 dark:border-stone-700 text-sm font-mono text-stone-900 dark:text-stone-100 outline-none focus:ring-2 focus:ring-[#1B5E7C]"
            />
            {canEditInviteCode && (
              <button
                type="submit"
                disabled={!trimmedCode}
                className="px-4 py-2 rounded-xl bg-stone-200 hover:bg-stone-300 dark:bg-stone-800 dark:hover:bg-stone-700 text-stone-800 dark:text-stone-100 text-xs font-semibold cursor-pointer disabled:opacity-50"
              >
                {tr('save')}
              </button>
            )}
          </div>
        </form>

        {/* Magic Invite Link or Prompt to Connect Relay */}
        {magicInviteUrl ? (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 flex items-center gap-1.5">
                <Link2 className="w-3.5 h-3.5 text-[#1B5E7C] dark:text-teal-400" />
                <span>{tr('inviteMagicLinkLabel')}</span>
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  readOnly
                  value={magicInviteUrl}
                  onClick={(e) => (e.target as HTMLInputElement).select()}
                  className="flex-1 px-3 py-2 rounded-xl bg-stone-50 dark:bg-stone-900 border border-stone-200 dark:border-stone-700 text-xs font-mono text-stone-700 dark:text-stone-300"
                />
                <button
                  type="button"
                  onClick={() => void copyValue(magicInviteUrl, true)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#1B5E7C] hover:bg-[#164b63] text-white text-xs font-semibold cursor-pointer shrink-0"
                >
                  {copiedLink ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{tr('inviteCopyLinkBtn')}</span>
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 flex items-center gap-1.5">
                <MessageSquareShare className="w-3.5 h-3.5 text-emerald-600" />
                <span>{tr('inviteMessagePreviewLabel')}</span>
              </label>
              <pre className="whitespace-pre-wrap text-xs font-sans text-stone-700 dark:text-stone-200 bg-stone-50 dark:bg-stone-900/70 p-3.5 rounded-2xl border border-stone-200 dark:border-stone-800">
                {inviteMessage}
              </pre>
              <button
                type="button"
                onClick={() => void copyValue(inviteMessage)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold cursor-pointer"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>{tr('inviteCopyMessageBtn')}</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/25 space-y-3">
            <p className="text-xs text-amber-900 dark:text-amber-200 leading-relaxed">
              {tr('inviteNeedCloudHint')}
            </p>
            {onOpenSyncSetup && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenSyncSetup();
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#1B5E7C] hover:bg-[#164b63] text-white text-xs font-semibold cursor-pointer"
              >
                <Cloud className="w-3.5 h-3.5" />
                <span>{tr('inviteOpenSyncSetupBtn')}</span>
              </button>
            )}
          </div>
        )}

        {/* How Family Members Log In Explainer */}
        <div className="p-4 rounded-2xl bg-stone-50 dark:bg-stone-900/60 border border-stone-200/80 dark:border-stone-800 space-y-2">
          <p className="text-xs font-bold flex items-center gap-1.5 text-stone-800 dark:text-stone-100">
            <ShieldCheck className="w-4 h-4 text-[#1B5E7C] dark:text-teal-400" />
            <span>{tr('inviteHowLoginTitle')}</span>
          </p>
          <ol className="list-decimal list-inside space-y-1 text-xs text-stone-600 dark:text-stone-300 leading-relaxed">
            <li>{tr('inviteHowLoginStep1')}</li>
            <li>{tr('inviteHowLoginStep2')}</li>
            <li>{tr('inviteHowLoginStep3')}</li>
          </ol>
        </div>
      </div>
    </Modal>
  );
};
