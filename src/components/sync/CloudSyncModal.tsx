import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Cloud,
  CloudOff,
  HelpCircle,
  KeyRound,
  Link2,
  RefreshCw,
} from 'lucide-react';
import { useFamily } from '../../store/FamilyContext';
import { resolveEffectiveAppsScriptUrl } from '../../utils/syncUrls';
import { Modal } from '../common/Modal';

interface CloudSyncModalProps {
  open: boolean;
  onClose: () => void;
}

export const CloudSyncModal: React.FC<CloudSyncModalProps> = ({ open, onClose }) => {
  const {
    db,
    syncStatus,
    syncConfig,
    connectCloudSync,
    disconnectCloudSync,
    syncNow,
    language,
    tr,
    addToast,
  } = useFamily();

  const [appsScriptUrl, setAppsScriptUrl] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [syncingNow, setSyncingNow] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setAppsScriptUrl(
      syncConfig.appsScriptUrl ||
        resolveEffectiveAppsScriptUrl(null, null, import.meta.env.VITE_APPS_SCRIPT_URL) ||
        '',
    );
    setInviteCode(syncConfig.mode === 'apps-script' ? syncConfig.familyInviteCode : '');
    setErrorMsg(null);
    setConfirmDisconnect(false);
  }, [open, syncConfig.mode, syncConfig.appsScriptUrl, syncConfig.familyInviteCode]);

  const isConnected = syncConfig.mode === 'apps-script';

  const lastSyncedFormatted = syncConfig.lastSyncedAt
    ? tr('syncLastSyncedAt', {
        date: new Date(syncConfig.lastSyncedAt).toLocaleString(
          language === 'fr' ? 'fr-FR' : 'en-US',
          { dateStyle: 'medium', timeStyle: 'short' },
        ),
      })
    : tr('syncNeverSynced');

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setErrorMsg(null);
    setSubmitting(true);
    const res = await connectCloudSync(appsScriptUrl, inviteCode);
    setSubmitting(false);

    if (!res.ok) {
      setErrorMsg(res.error || tr('syncInvalidUrlError'));
      return;
    }

    addToast({
      title: tr('syncConnectedToast', { family: res.familyName || db.settings.familyName }),
      tone: 'success',
    });
    onClose();
  };

  const handleSyncNow = async () => {
    if (syncingNow) return;
    setErrorMsg(null);
    setSyncingNow(true);
    const ok = await syncNow();
    setSyncingNow(false);
    if (ok) {
      addToast({ title: tr('syncPulledToast'), tone: 'success' });
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={tr('syncModalTitle')}
      subtitle={tr('syncModalSubtitle')}
      maxWidthClass="max-w-xl"
    >
      <div className="p-5 sm:p-6 space-y-5">
        {/* Status Banner */}
        <div
          className={`p-3.5 rounded-2xl border flex items-start justify-between gap-3 flex-wrap ${
            isConnected
              ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-900 dark:text-emerald-200'
              : 'bg-stone-100/90 dark:bg-stone-900/70 border-stone-200 dark:border-stone-800 text-stone-700 dark:text-stone-300'
          }`}
        >
          <div className="flex items-start gap-2.5 min-w-0">
            <span className="mt-0.5 shrink-0">
              {isConnected ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              ) : (
                <Cloud className="w-4 h-4 text-[#1B5E7C] dark:text-teal-400" />
              )}
            </span>
            <div className="min-w-0">
              <p className="text-xs font-bold">
                {isConnected ? tr('syncStatusBannerCloud') : tr('syncStatusBannerLocal')}
              </p>
              <p className="text-[11px] opacity-80 mt-0.5">{lastSyncedFormatted}</p>
            </div>
          </div>

          {isConnected && (
            <button
              type="button"
              onClick={() => void handleSyncNow()}
              disabled={syncingNow || syncStatus === 'syncing'}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white dark:bg-stone-950 border border-emerald-500/30 text-emerald-800 dark:text-emerald-200 text-xs font-semibold shadow-xs cursor-pointer disabled:opacity-50"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${syncingNow || syncStatus === 'syncing' ? 'animate-spin' : ''}`}
              />
              <span>{tr('syncNowBtn')}</span>
            </button>
          )}
        </div>

        {/* Relay Credentials Form */}
        <form onSubmit={(e) => void handleConnect(e)} className="space-y-3.5">
          <div>
            <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1 flex items-center gap-1.5">
              <Link2 className="w-3.5 h-3.5 text-[#1B5E7C] dark:text-teal-400" />
              <span>{tr('syncAppsScriptUrlLabel')}</span>
            </label>
            <input
              type="url"
              required
              value={appsScriptUrl}
              onChange={(e) => setAppsScriptUrl(e.target.value)}
              placeholder={tr('syncAppsScriptUrlPlaceholder')}
              className="w-full px-3.5 py-2.5 rounded-xl bg-stone-50 dark:bg-stone-900 border border-stone-200 dark:border-stone-700 text-xs sm:text-sm font-mono text-stone-900 dark:text-stone-100 outline-none focus:ring-2 focus:ring-[#1B5E7C]"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1 flex items-center gap-1.5">
              <KeyRound className="w-3.5 h-3.5 text-amber-600" />
              <span>{tr('syncInviteCodeLabel')}</span>
            </label>
            <input
              type="text"
              required
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value)}
              placeholder={tr('syncInviteCodePlaceholder')}
              className="w-full px-3.5 py-2.5 rounded-xl bg-stone-50 dark:bg-stone-900 border border-stone-200 dark:border-stone-700 text-sm text-stone-900 dark:text-stone-100 outline-none focus:ring-2 focus:ring-[#1B5E7C]"
            />
          </div>

          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/25 flex items-start gap-2 text-xs text-rose-700 dark:text-rose-300">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            {isConnected ? (
              !confirmDisconnect ? (
                <button
                  type="button"
                  onClick={() => setConfirmDisconnect(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 cursor-pointer"
                >
                  <CloudOff className="w-3.5 h-3.5" />
                  <span>{tr('syncDisconnectBtn')}</span>
                </button>
              ) : (
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={() => {
                      disconnectCloudSync();
                      setConfirmDisconnect(false);
                    }}
                    className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold cursor-pointer"
                  >
                    {tr('syncDisconnectBtn')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDisconnect(false)}
                    className="px-3 py-1.5 rounded-xl bg-stone-100 dark:bg-stone-800 text-xs font-semibold text-stone-700 dark:text-stone-300 cursor-pointer"
                  >
                    {tr('cancel')}
                  </button>
                </div>
              )
            ) : (
              <span />
            )}

            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-[#1B5E7C] hover:bg-[#164b63] disabled:opacity-60 text-white text-sm font-semibold shadow-md shadow-teal-900/20 cursor-pointer"
            >
              <Cloud className="w-4 h-4" />
              <span>{submitting ? tr('syncConnectingBtn') : tr('syncConnectBtn')}</span>
            </button>
          </div>

          {confirmDisconnect && (
            <p className="text-[11px] text-stone-500 dark:text-stone-400">
              {tr('syncDisconnectConfirm')}
            </p>
          )}
        </form>

        {/* Quick 4-step Admin Setup Checklist */}
        <div className="p-4 rounded-2xl bg-stone-50 dark:bg-stone-900/60 border border-stone-200/80 dark:border-stone-800 space-y-2">
          <p className="text-xs font-bold flex items-center gap-1.5 text-stone-800 dark:text-stone-100">
            <HelpCircle className="w-4 h-4 text-[#1B5E7C] dark:text-teal-400" />
            <span>{tr('syncSetupChecklistTitle')}</span>
          </p>
          <ol className="list-decimal list-inside space-y-1 text-xs text-stone-600 dark:text-stone-300 leading-relaxed">
            <li>{tr('syncSetupStep1')}</li>
            <li>{tr('syncSetupStep2')}</li>
            <li>{tr('syncSetupStep3')}</li>
            <li>{tr('syncSetupStep4')}</li>
          </ol>
          <p className="text-[11px] text-stone-500 dark:text-stone-400 pt-1">
            {tr('syncSetupGuideHint')}
          </p>
        </div>
      </div>
    </Modal>
  );
};
