import React, { useEffect, useMemo, useState } from 'react';
import {
  Archive,
  CheckCircle2,
  Code2,
  Copy,
  Download,
  ExternalLink,
  FileText,
  KeyRound,
  Lock,
  Mail,
  RefreshCw,
  Send,
  ShieldAlert,
  Unlock,
} from 'lucide-react';
import { downloadGazettePdf } from '../../services/gazettePdf';
import { buildEmailPreviewThumbnails, rasterizeMediaToJpeg } from '../../services/mediaRender';
import { useFamily } from '../../store/FamilyContext';
import type { GazetteIssue } from '../../types/family';
import { buildDriveFileViewUrl } from '../../utils/drivePaths';
import {
  buildGazetteEmailDigest,
  buildStandaloneGazetteHtml,
  EMAIL_HTML_MAX_BYTES,
} from '../../utils/emailDigest';
import {
  buildGazetteSecretUrl,
  buildScopedGazettePayload,
  computeShareExpiryIso,
  validateGazetteSecretAccess,
  type GazetteExpiryPreset,
} from '../../utils/gazette';
import { formatMemoryDate } from '../../utils/i18n';
import { resolveEffectiveAppsScriptUrl } from '../../utils/syncUrls';
import { Modal } from '../common/Modal';

interface GazetteShareModalProps {
  issue: GazetteIssue | null;
  onClose: () => void;
  onOpenReader?: (issueId: string) => void;
}

const EXPIRY_PRESETS: Array<{
  id: GazetteExpiryPreset;
  labelKey: 'studioExpiry7d' | 'studioExpiry30d' | 'studioExpiry90d' | 'studioExpiryPermanent';
}> = [
  { id: '7d', labelKey: 'studioExpiry7d' },
  { id: '30d', labelKey: 'studioExpiry30d' },
  { id: '90d', labelKey: 'studioExpiry90d' },
  { id: 'permanent', labelKey: 'studioExpiryPermanent' },
];

export const GazetteShareModal: React.FC<GazetteShareModalProps> = ({
  issue,
  onClose,
  onOpenReader,
}) => {
  const {
    db,
    activeSubscribers,
    isActiveProfileAdmin,
    syncConfig,
    updateGazetteIssue,
    rotateGazetteSecretKey,
    archiveGazetteToDrive,
    dispatchGazetteViaRelay,
    language,
    tr,
    addToast,
  } = useFamily();

  const [inlineThumbs, setInlineThumbs] = useState<Record<string, string>>({});
  const [buildingPdf, setBuildingPdf] = useState(false);
  const [buildingHtml, setBuildingHtml] = useState(false);
  const [archivingDrive, setArchivingDrive] = useState(false);
  const [sendingRelay, setSendingRelay] = useState(false);

  const liveIssue = useMemo(
    () => (issue ? db.gazettes.find((g) => g.id === issue.id) || issue : null),
    [db.gazettes, issue],
  );

  const payload = useMemo(
    () => (liveIssue ? buildScopedGazettePayload(db, liveIssue) : null),
    [db, liveIssue],
  );

  useEffect(() => {
    if (!payload) return;
    let cancelled = false;
    void buildEmailPreviewThumbnails(payload.posts).then((thumbs) => {
      if (!cancelled) setInlineThumbs(thumbs);
    });
    return () => {
      cancelled = true;
    };
  }, [payload]);

  const baseAppUrl = useMemo(() => {
    if (typeof window === 'undefined') return 'https://familygazette.example/';
    return `${window.location.origin}${window.location.pathname}`;
  }, []);

  const effectiveApiUrl = useMemo(
    () =>
      resolveEffectiveAppsScriptUrl(
        null,
        syncConfig.appsScriptUrl,
        import.meta.env.VITE_APPS_SCRIPT_URL,
      ),
    [syncConfig.appsScriptUrl],
  );

  const htmlUrl = liveIssue
    ? buildGazetteSecretUrl(
        baseAppUrl,
        liveIssue.id,
        liveIssue.secretKey,
        'html',
        effectiveApiUrl || undefined,
      )
    : '';
  const pdfUrl = liveIssue
    ? buildGazetteSecretUrl(
        baseAppUrl,
        liveIssue.id,
        liveIssue.secretKey,
        'pdf',
        effectiveApiUrl || undefined,
      )
    : '';

  const cidDigest = useMemo(() => {
    if (!payload) return null;
    return buildGazetteEmailDigest({
      payload,
      lang: language,
      htmlUrl,
      pdfUrl,
      thumbnailMode: 'cid',
    });
  }, [payload, language, htmlUrl, pdfUrl]);

  const previewDigest = useMemo(() => {
    if (!payload) return null;
    return buildGazetteEmailDigest({
      payload,
      lang: language,
      htmlUrl,
      pdfUrl,
      thumbnailMode: 'inline-data',
      inlineThumbnailsByMediaId: inlineThumbs,
    });
  }, [payload, language, htmlUrl, pdfUrl, inlineThumbs]);

  const accessStatus = liveIssue
    ? validateGazetteSecretAccess(liveIssue, liveIssue.secretKey)
    : null;

  const copyText = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      addToast({ title: tr('shareCopiedToast'), tone: 'success' });
    } catch {
      addToast({ title: value.slice(0, 60), tone: 'info' });
    }
  };

  const handleDownloadPdf = async () => {
    if (!payload || buildingPdf) return;
    setBuildingPdf(true);
    try {
      const res = await downloadGazettePdf(payload, language);
      addToast({
        title: tr('gazettesPdfDownloadedToast', { filename: res.filename }),
        tone: 'success',
      });
    } finally {
      setBuildingPdf(false);
    }
  };

  const handleDownloadStandaloneHtml = async () => {
    if (!payload || buildingHtml) return;
    setBuildingHtml(true);
    try {
      const dataUrlsByMediaId: Record<string, string> = {};
      for (const post of payload.posts) {
        for (const mediaId of post.mediaIds) {
          if (dataUrlsByMediaId[mediaId]) continue;
          const rendered = await rasterizeMediaToJpeg(mediaId, {
            maxEdge: 1400,
            quality: 0.85,
            crop: post.mediaCrops?.[mediaId],
            variant: 'full',
          });
          if (rendered) {
            dataUrlsByMediaId[mediaId] = rendered.dataUrl;
          }
        }
      }
      const docHtml = buildStandaloneGazetteHtml({
        payload,
        lang: language,
        dataUrlsByMediaId,
      });
      const blob = new Blob([docHtml], { type: 'text/html;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `familygazette-n${payload.issue.issueNumber}.html`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.setTimeout(() => URL.revokeObjectURL(url), 1500);
      addToast({ title: tr('gazettesHtmlDownloadedToast'), tone: 'success' });
    } finally {
      setBuildingHtml(false);
    }
  };

  const handleArchiveDrive = async () => {
    if (!liveIssue || archivingDrive) return;
    setArchivingDrive(true);
    try {
      await archiveGazetteToDrive(liveIssue);
    } finally {
      setArchivingDrive(false);
    }
  };

  const handleSendViaRelay = async () => {
    if (!liveIssue || sendingRelay) return;
    setSendingRelay(true);
    try {
      await dispatchGazetteViaRelay(liveIssue);
    } finally {
      setSendingRelay(false);
    }
  };

  if (!liveIssue || !payload || !cidDigest || !previewDigest) return null;

  const isCloudConnected = syncConfig.mode === 'apps-script';
  const recipientEmails = activeSubscribers.map((s) => s.email).filter(Boolean);
  const mailtoHref = `mailto:${encodeURIComponent(recipientEmails.join(','))}?subject=${encodeURIComponent(
    cidDigest.subject,
  )}&body=${encodeURIComponent(cidDigest.plainText.slice(0, 1750))}`;
  const kbUsed = (cidDigest.byteSize / 1024).toFixed(1);
  const withinBudget = cidDigest.byteSize <= EMAIL_HTML_MAX_BYTES;
  const expiryLabel = liveIssue.shareExpiresAt
    ? tr('gazettesExpiresOnLabel', {
        date: formatMemoryDate(liveIssue.shareExpiresAt.slice(0, 10), language),
      })
    : tr('gazettesPermanentLabel');

  return (
    <Modal
      open={Boolean(liveIssue)}
      onClose={onClose}
      title={tr('shareModalTitle', { title: liveIssue.title })}
      subtitle={tr('shareModalSubtitle')}
      maxWidthClass="max-w-3xl"
    >
      <div className="p-5 sm:p-6 space-y-5">
        {/* Status Banner */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            {accessStatus?.ok ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
                <Lock className="w-3.5 h-3.5" />
                {tr('gazettesLinkStatusActive')}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-rose-500/15 text-rose-700 dark:text-rose-300">
                <ShieldAlert className="w-3.5 h-3.5" />
                {accessStatus?.reason === 'revoked'
                  ? tr('gazettesLinkStatusRevoked')
                  : tr('gazettesLinkStatusExpired')}
              </span>
            )}
            <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300">
              {expiryLabel}
            </span>
            {liveIssue.sentAt && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                {tr('shareSentAtLabel', {
                  date: formatMemoryDate(liveIssue.sentAt.slice(0, 10), language),
                })}
              </span>
            )}
            {(liveIssue.pdfDriveFileId || liveIssue.htmlDriveFileId) && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-[#1B5E7C]/12 text-[#1B5E7C] dark:text-teal-300">
                <Archive className="w-3.5 h-3.5" />
                {tr('gazettesDriveSavedBadge')}
              </span>
            )}
          </div>

          {onOpenReader && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenReader(liveIssue.id);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#1B5E7C]/12 hover:bg-[#1B5E7C]/20 text-[#1B5E7C] dark:text-teal-300 text-xs font-semibold cursor-pointer"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>{tr('shareOpenReaderBtn')}</span>
            </button>
          )}
        </div>

        {/* Direct Google Drive Archive Links when saved */}
        {(liveIssue.pdfDriveFileId || liveIssue.htmlDriveFileId) && (
          <div className="flex flex-wrap items-center gap-2">
            {liveIssue.pdfDriveFileId && (
              <a
                href={buildDriveFileViewUrl(liveIssue.pdfDriveFileId)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-stone-100 hover:bg-stone-200 dark:bg-stone-800 dark:hover:bg-stone-700 text-xs font-semibold text-stone-800 dark:text-stone-100"
              >
                <ExternalLink className="w-3.5 h-3.5 text-[#1B5E7C] dark:text-teal-400" />
                <span>{tr('gazettesOpenDrivePdf')}</span>
              </a>
            )}
            {liveIssue.htmlDriveFileId && (
              <a
                href={buildDriveFileViewUrl(liveIssue.htmlDriveFileId)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-stone-100 hover:bg-stone-200 dark:bg-stone-800 dark:hover:bg-stone-700 text-xs font-semibold text-stone-800 dark:text-stone-100"
              >
                <ExternalLink className="w-3.5 h-3.5 text-[#1B5E7C] dark:text-teal-400" />
                <span>{tr('gazettesOpenDriveHtml')}</span>
              </a>
            )}
          </div>
        )}

        {/* Secret-Key URLs */}
        <div className="space-y-3 p-4 rounded-2xl bg-stone-50 dark:bg-stone-900/60 border border-stone-200/80 dark:border-stone-800">
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-stone-500 dark:text-stone-400 mb-1">
              {tr('shareSecretHtmlLabel')}
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                readOnly
                value={htmlUrl}
                onClick={(e) => (e.target as HTMLInputElement).select()}
                className="flex-1 px-3 py-1.5 rounded-xl bg-white dark:bg-stone-950 border border-stone-200 dark:border-stone-800 text-xs font-mono text-stone-700 dark:text-stone-300"
              />
              <button
                type="button"
                onClick={() => void copyText(htmlUrl)}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-[#1B5E7C] text-white text-xs font-semibold cursor-pointer shrink-0"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>{tr('shareCopyBtn')}</span>
              </button>
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-stone-500 dark:text-stone-400 mb-1">
              {tr('shareSecretPdfLabel')}
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                readOnly
                value={pdfUrl}
                onClick={(e) => (e.target as HTMLInputElement).select()}
                className="flex-1 px-3 py-1.5 rounded-xl bg-white dark:bg-stone-950 border border-stone-200 dark:border-stone-800 text-xs font-mono text-stone-700 dark:text-stone-300"
              />
              <button
                type="button"
                onClick={() => void copyText(pdfUrl)}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-stone-200 dark:bg-stone-800 text-stone-800 dark:text-stone-200 text-xs font-semibold cursor-pointer shrink-0"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>{tr('shareCopyBtn')}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Admin Security & Expiry Controls */}
        {isActiveProfileAdmin && (
          <div className="space-y-2.5 p-4 rounded-2xl bg-white dark:bg-[#1A1D27] border border-stone-200 dark:border-stone-800">
            <p className="text-xs font-bold flex items-center gap-1.5 text-stone-800 dark:text-stone-100">
              <KeyRound className="w-4 h-4 text-[#1B5E7C] dark:text-teal-400" />
              <span>{tr('shareControlsTitle')}</span>
            </p>
            <p className="text-[11px] text-stone-500 dark:text-stone-400 leading-relaxed">
              {tr('shareArchiveLifetimeNote')}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              {EXPIRY_PRESETS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => {
                    updateGazetteIssue(liveIssue.id, {
                      shareExpiresAt: computeShareExpiryIso(opt.id),
                      shareRevoked: false,
                    });
                    if (!accessStatus?.ok) {
                      addToast({ title: tr('gazettesReactivatedToast'), tone: 'success' });
                    }
                  }}
                  className="px-2.5 py-1.5 rounded-xl bg-stone-100 hover:bg-stone-200 dark:bg-stone-800 dark:hover:bg-stone-700 text-xs font-semibold text-stone-700 dark:text-stone-200 cursor-pointer"
                >
                  {tr(opt.labelKey)}
                </button>
              ))}

              <button
                type="button"
                onClick={() => rotateGazetteSecretKey(liveIssue.id)}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-800 dark:text-amber-300 text-xs font-semibold cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>{tr('shareRotateKeyBtn')}</span>
              </button>

              <button
                type="button"
                onClick={() =>
                  updateGazetteIssue(liveIssue.id, {
                    shareRevoked: !liveIssue.shareRevoked,
                  })
                }
                className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-semibold cursor-pointer ${
                  liveIssue.shareRevoked
                    ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                    : 'bg-rose-500/12 text-rose-700 dark:text-rose-300'
                }`}
              >
                {liveIssue.shareRevoked ? (
                  <>
                    <Unlock className="w-3.5 h-3.5" />
                    <span>{tr('shareReactivateBtn')}</span>
                  </>
                ) : (
                  <>
                    <ShieldAlert className="w-3.5 h-3.5" />
                    <span>{tr('shareRevokeBtn')}</span>
                  </>
                )}
              </button>

              {!liveIssue.sentAt && (
                <button
                  type="button"
                  onClick={() =>
                    updateGazetteIssue(liveIssue.id, {
                      sentAt: new Date().toISOString(),
                      deliveryChannel: 'manual',
                      recipientEmails,
                    })
                  }
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-[#1B5E7C] text-white text-xs font-semibold cursor-pointer"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>{tr('shareMarkSentBtn')}</span>
                </button>
              )}
            </div>
            <p className="text-[11px] text-stone-500 dark:text-stone-400">
              {tr('shareExtendSameLinkHint')}
            </p>
          </div>
        )}

        {/* Email Digest Preview & Export Actions */}
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-stone-500 dark:text-stone-400">
                {tr('shareDigestTitle')}
              </h4>
              {cidDigest.omittedPreviewCount > 0 && (
                <p className="text-[11px] text-stone-500 dark:text-stone-400">
                  {tr('shareDigestTruncatedNote', {
                    included: cidDigest.includedPreviewCount,
                    omitted: cidDigest.omittedPreviewCount,
                  })}
                </p>
              )}
            </div>
            <span
              className={`px-2.5 py-1 rounded-full text-[11px] font-bold ${
                withinBudget
                  ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                  : 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
              }`}
            >
              {tr('shareDigestSizeMeter', { kb: kbUsed })}
            </span>
          </div>

          <iframe
            srcDoc={previewDigest.html}
            sandbox=""
            title={liveIssue.title}
            className="w-full h-72 rounded-2xl border border-stone-200 dark:border-stone-800 bg-white"
          />

          <div className="flex flex-wrap gap-2">
            {isActiveProfileAdmin && isCloudConnected && recipientEmails.length > 0 && (
              <button
                type="button"
                onClick={() => void handleSendViaRelay()}
                disabled={sendingRelay}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-xs font-semibold cursor-pointer shadow-xs"
              >
                <Send className="w-3.5 h-3.5" />
                <span>
                  {sendingRelay
                    ? tr('shareSendingRelay')
                    : tr('shareSendRelayBtn', { count: recipientEmails.length })}
                </span>
              </button>
            )}

            {isActiveProfileAdmin && isCloudConnected && (
              <button
                type="button"
                onClick={() => void handleArchiveDrive()}
                disabled={archivingDrive}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-teal-600/15 hover:bg-teal-600/25 disabled:opacity-60 text-teal-900 dark:text-teal-200 text-xs font-semibold cursor-pointer"
              >
                <Archive className="w-3.5 h-3.5" />
                <span>
                  {archivingDrive ? tr('gazettesArchivingDrive') : tr('gazettesArchiveDriveBtn')}
                </span>
              </button>
            )}

            <button
              type="button"
              onClick={handleDownloadPdf}
              disabled={buildingPdf}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#1B5E7C] hover:bg-[#164b63] disabled:opacity-60 text-white text-xs font-semibold cursor-pointer shadow-xs"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{buildingPdf ? tr('gazettesGeneratingPdf') : tr('shareDownloadPdfBtn')}</span>
            </button>

            <button
              type="button"
              onClick={handleDownloadStandaloneHtml}
              disabled={buildingHtml}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-stone-100 hover:bg-stone-200 dark:bg-stone-800 dark:hover:bg-stone-700 text-stone-800 dark:text-stone-100 text-xs font-semibold cursor-pointer"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>{tr('shareDownloadHtmlBtn')}</span>
            </button>

            <button
              type="button"
              onClick={() => void copyText(cidDigest.html)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-stone-100 hover:bg-stone-200 dark:bg-stone-800 dark:hover:bg-stone-700 text-stone-800 dark:text-stone-100 text-xs font-semibold cursor-pointer"
            >
              <Code2 className="w-3.5 h-3.5" />
              <span>{tr('shareCopyHtmlBtn')}</span>
            </button>

            <a
              href={mailtoHref}
              onClick={() => {
                if (isActiveProfileAdmin && !liveIssue.sentAt) {
                  updateGazetteIssue(liveIssue.id, {
                    sentAt: new Date().toISOString(),
                    deliveryChannel: 'manual',
                    recipientEmails,
                  });
                }
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-900 dark:text-amber-200 text-xs font-semibold"
            >
              <Mail className="w-3.5 h-3.5" />
              <span>{tr('shareOpenMailtoBtn', { count: recipientEmails.length })}</span>
            </a>
          </div>

          {isActiveProfileAdmin && !isCloudConnected && (
            <p className="text-[11px] text-stone-500 dark:text-stone-400">
              {tr('shareRelayNeedCloudHint')}
            </p>
          )}
        </div>
      </div>
    </Modal>
  );
};
