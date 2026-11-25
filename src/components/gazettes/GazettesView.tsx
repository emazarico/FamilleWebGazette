import React, { useMemo, useState } from 'react';
import {
  Archive,
  BellRing,
  BookOpen,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Copy,
  Download,
  ExternalLink,
  Lock,
  Mail,
  Newspaper,
  Plus,
  RefreshCw,
  Send,
  Settings,
  Share2,
  ShieldAlert,
  Trash2,
} from 'lucide-react';
import { downloadGazettePdf } from '../../services/gazettePdf';
import { useFamily } from '../../store/FamilyContext';
import type { GazetteCadence, GazetteIssue, GazetteTheme } from '../../types/family';
import { buildDriveFileViewUrl } from '../../utils/drivePaths';
import { buildReminderEmailDigest } from '../../utils/emailDigest';
import { computeNextGazetteSchedule } from '../../utils/feed';
import {
  buildScopedGazettePayload,
  computeShareExpiryIso,
  validateGazetteSecretAccess,
} from '../../utils/gazette';
import { formatMemoryDate } from '../../utils/i18n';
import { GazetteShareModal } from './GazetteShareModal';
import { GazetteStudioModal } from './GazetteStudioModal';
import { SubscriberManager } from './SubscriberManager';

interface GazettesViewProps {
  onOpenReader: (issueId: string) => void;
}

export const GazettesView: React.FC<GazettesViewProps> = ({ onOpenReader }) => {
  const {
    db,
    activeGazettes,
    activeSubscribers,
    queuedGazettePosts,
    isActiveProfileAdmin,
    syncConfig,
    updateGazetteIssue,
    deleteGazetteIssue,
    archiveGazetteToDrive,
    dispatchReminderViaRelay,
    updateFamilySettings,
    markReminderCycleSent,
    language,
    tr,
    addToast,
  } = useFamily();

  const [studioOpen, setStudioOpen] = useState(false);
  const [shareIssue, setShareIssue] = useState<GazetteIssue | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [archivingId, setArchivingId] = useState<string | null>(null);
  const [sendingReminderRelay, setSendingReminderRelay] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [reminderPreviewOpen, setReminderPreviewOpen] = useState(false);

  const [titleInput, setTitleInput] = useState(db.settings.gazetteTitle);
  const [subtitleInput, setSubtitleInput] = useState(db.settings.gazetteSubtitle || '');
  const [cadenceInput, setCadenceInput] = useState<GazetteCadence>(db.settings.gazetteCadence);
  const [publishDayInput, setPublishDayInput] = useState(db.settings.publishDayOfMonth);
  const [reminderDaysInput, setReminderDaysInput] = useState(db.settings.reminderDaysBefore);
  const [themeInput, setThemeInput] = useState<GazetteTheme>(db.settings.gazetteTheme);

  const schedule = useMemo(() => computeNextGazetteSchedule(db.settings), [db.settings]);
  const isCloudConnected = syncConfig.mode === 'apps-script';

  const reminderDigest = useMemo(() => {
    if (!schedule.nextPublishDate) return null;
    const appUrl =
      typeof window !== 'undefined'
        ? `${window.location.origin}${window.location.pathname}`
        : 'https://familygazette.example/';
    return buildReminderEmailDigest({
      familyName: db.settings.familyName,
      gazetteTitle: db.settings.gazetteTitle,
      nextPublishDate: schedule.nextPublishDate,
      queuedCount: queuedGazettePosts.length,
      appUrl,
      lang: language,
    });
  }, [
    schedule.nextPublishDate,
    db.settings.familyName,
    db.settings.gazetteTitle,
    queuedGazettePosts.length,
    language,
  ]);

  const handleDownloadPdf = async (issue: GazetteIssue) => {
    if (downloadingId) return;
    setDownloadingId(issue.id);
    try {
      const scoped = buildScopedGazettePayload(db, issue);
      const res = await downloadGazettePdf(scoped, language);
      addToast({
        title: tr('gazettesPdfDownloadedToast', { filename: res.filename }),
        tone: 'success',
      });
    } finally {
      setDownloadingId(null);
    }
  };

  const handleArchiveDrive = async (issue: GazetteIssue) => {
    if (archivingId) return;
    setArchivingId(issue.id);
    try {
      await archiveGazetteToDrive(issue);
    } finally {
      setArchivingId(null);
    }
  };

  const handleReactivate30d = (issue: GazetteIssue) => {
    updateGazetteIssue(issue.id, {
      shareExpiresAt: computeShareExpiryIso('30d'),
      shareRevoked: false,
    });
    addToast({ title: tr('gazettesReactivatedToast'), tone: 'success' });
  };

  const handleSendReminderRelay = async () => {
    if (sendingReminderRelay) return;
    setSendingReminderRelay(true);
    try {
      await dispatchReminderViaRelay();
    } finally {
      setSendingReminderRelay(false);
    }
  };

  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    updateFamilySettings({
      gazetteTitle: titleInput.trim() || db.settings.gazetteTitle,
      gazetteSubtitle: subtitleInput.trim() || undefined,
      gazetteCadence: cadenceInput,
      publishDayOfMonth: Math.min(28, Math.max(1, Math.round(publishDayInput || 1))),
      reminderDaysBefore: Math.min(14, Math.max(0, Math.round(reminderDaysInput || 0))),
      gazetteTheme: themeInput,
    });
    addToast({ title: tr('gazettesSettingsSavedToast'), tone: 'success' });
    setSettingsOpen(false);
  };

  const reminderEmails = activeSubscribers.map((s) => s.email).filter(Boolean);
  const reminderMailto = reminderDigest
    ? `mailto:${encodeURIComponent(reminderEmails.join(','))}?subject=${encodeURIComponent(
        reminderDigest.subject,
      )}&body=${encodeURIComponent(reminderDigest.plainText)}`
    : '#';

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      {/* Studio & Schedule Hero Card */}
      <section className="rounded-3xl bg-white dark:bg-[#171A23] border border-stone-200/90 dark:border-stone-800 p-5 sm:p-6 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <h2 className="font-serif-display text-2xl font-bold flex items-center gap-2.5 text-stone-900 dark:text-stone-100">
              <span className="w-9 h-9 rounded-xl bg-amber-500/15 text-amber-700 dark:text-amber-300 flex items-center justify-center shrink-0">
                <Newspaper className="w-5 h-5" />
              </span>
              <span>{tr('gazettesHeaderTitle')}</span>
            </h2>
            <p className="text-sm text-stone-600 dark:text-stone-400">
              {tr('gazettesHeaderSubtitle')}
            </p>
          </div>

          {isActiveProfileAdmin && (
            <button
              type="button"
              onClick={() => setStudioOpen(true)}
              className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-2xl bg-[#1B5E7C] hover:bg-[#164b63] text-white text-sm font-semibold shadow-md shadow-teal-900/15 transition-all cursor-pointer shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span>{tr('gazettesCompileBtn')}</span>
            </button>
          )}
        </div>

        {/* Countdown + Queued Pill Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 pt-2 border-t border-stone-100 dark:border-stone-800">
          <div className="flex flex-wrap items-center gap-2">
            {schedule.nextPublishDate && (
              <span
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${
                  schedule.isInReminderWindow
                    ? 'bg-amber-500/15 text-amber-800 dark:text-amber-300'
                    : 'bg-[#1B5E7C]/10 text-[#1B5E7C] dark:bg-teal-500/15 dark:text-teal-300'
                }`}
              >
                <CalendarClock className="w-3.5 h-3.5" />
                {tr('gazettesNextDate', {
                  date: formatMemoryDate(schedule.nextPublishDate, language),
                  days: db.settings.reminderDaysBefore,
                })}
              </span>
            )}
            <span className="px-3 py-1 rounded-full text-xs font-semibold bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300">
              {tr('gazetteBannerQueuedCount', { count: queuedGazettePosts.length })}
            </span>
          </div>

          {isActiveProfileAdmin && (
            <div className="flex items-center gap-2 flex-wrap">
              {reminderDigest && (
                <button
                  type="button"
                  onClick={() => setReminderPreviewOpen((o) => !o)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/12 hover:bg-amber-500/20 text-amber-800 dark:text-amber-300 text-xs font-semibold cursor-pointer"
                >
                  <BellRing className="w-3.5 h-3.5" />
                  <span>{tr('gazettesReminderPreviewBtn')}</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setTitleInput(db.settings.gazetteTitle);
                  setSubtitleInput(db.settings.gazetteSubtitle || '');
                  setCadenceInput(db.settings.gazetteCadence);
                  setPublishDayInput(db.settings.publishDayOfMonth);
                  setReminderDaysInput(db.settings.reminderDaysBefore);
                  setThemeInput(db.settings.gazetteTheme);
                  setSettingsOpen((o) => !o);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-stone-100 hover:bg-stone-200 dark:bg-stone-800 dark:hover:bg-stone-700 text-stone-700 dark:text-stone-200 text-xs font-semibold cursor-pointer"
              >
                <Settings className="w-3.5 h-3.5" />
                <span>{tr('gazettesSettingsToggle')}</span>
                {settingsOpen ? (
                  <ChevronUp className="w-3.5 h-3.5" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5" />
                )}
              </button>
            </div>
          )}
        </div>

        {!isActiveProfileAdmin && (
          <p className="text-xs text-stone-500 dark:text-stone-400 italic">
            {tr('gazettesAdminOnlyNotice')}
          </p>
        )}

        {/* 3-Day Reminder Draft Panel */}
        {isActiveProfileAdmin && reminderPreviewOpen && reminderDigest && (
          <div className="p-4 rounded-2xl bg-amber-50/75 dark:bg-amber-950/20 border border-amber-300/60 dark:border-amber-700/50 space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <p className="text-xs font-bold text-amber-900 dark:text-amber-200 flex items-center gap-1.5">
                <BellRing className="w-4 h-4 text-amber-600" />
                <span>{tr('gazettesReminderCardTitle', { days: db.settings.reminderDaysBefore })}</span>
              </p>
              {schedule.reminderAlreadySentForCycle && schedule.cycleKey && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
                  <CheckCircle2 className="w-3 h-3" />
                  {tr('gazettesReminderAlreadySentBadge', { cycle: schedule.cycleKey })}
                </span>
              )}
            </div>

            <pre className="whitespace-pre-wrap text-xs font-sans text-stone-700 dark:text-stone-200 bg-white/90 dark:bg-stone-900/80 p-3 rounded-xl border border-amber-200/70 dark:border-stone-800">
              {reminderDigest.plainText}
            </pre>

            <div className="flex flex-wrap gap-2">
              {isCloudConnected && (
                <button
                  type="button"
                  onClick={() => void handleSendReminderRelay()}
                  disabled={sendingReminderRelay}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-xs font-semibold cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>
                    {sendingReminderRelay
                      ? tr('shareSendingRelay')
                      : tr('gazettesReminderSendRelayBtn')}
                  </span>
                </button>
              )}
              <a
                href={reminderMailto}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#1B5E7C] text-white text-xs font-semibold"
              >
                <Mail className="w-3.5 h-3.5" />
                <span>{tr('gazettesReminderOpenMailBtn')}</span>
              </a>
              <button
                type="button"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(reminderDigest.plainText);
                    addToast({ title: tr('shareCopiedToast'), tone: 'success' });
                  } catch {
                    // ignore clipboard rejection
                  }
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 text-xs font-semibold text-stone-700 dark:text-stone-200 cursor-pointer"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>{tr('gazettesReminderCopyBtn')}</span>
              </button>
              {schedule.cycleKey && !schedule.reminderAlreadySentForCycle && (
                <button
                  type="button"
                  onClick={() => markReminderCycleSent(schedule.cycleKey!)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600/15 text-emerald-800 dark:text-emerald-300 text-xs font-semibold cursor-pointer"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>{tr('gazettesReminderMarkSentBtn')}</span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* Inline Schedule & Gazette Settings Editor */}
        {isActiveProfileAdmin && settingsOpen && (
          <form
            onSubmit={handleSaveSettings}
            className="p-4 rounded-2xl bg-stone-50 dark:bg-stone-900/60 border border-stone-200/80 dark:border-stone-800 space-y-3"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1">
                  {tr('gazettesSettingsTitleField')}
                </label>
                <input
                  type="text"
                  value={titleInput}
                  onChange={(e) => setTitleInput(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-white dark:bg-stone-950 border border-stone-200 dark:border-stone-700 text-sm outline-none focus:ring-2 focus:ring-[#1B5E7C]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1">
                  {tr('gazettesSettingsSubtitleField')}
                </label>
                <input
                  type="text"
                  value={subtitleInput}
                  onChange={(e) => setSubtitleInput(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-white dark:bg-stone-950 border border-stone-200 dark:border-stone-700 text-sm outline-none focus:ring-2 focus:ring-[#1B5E7C]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1">
                  {tr('gazettesSettingsCadenceField')}
                </label>
                <select
                  value={cadenceInput}
                  onChange={(e) => setCadenceInput(e.target.value as GazetteCadence)}
                  className="w-full px-3 py-2 rounded-xl bg-white dark:bg-stone-950 border border-stone-200 dark:border-stone-700 text-sm outline-none"
                >
                  <option value="monthly">{tr('gazettesCadenceMonthly')}</option>
                  <option value="weekly">{tr('gazettesCadenceWeekly')}</option>
                  <option value="biweekly">{tr('gazettesCadenceBiweekly')}</option>
                  <option value="manual">{tr('gazettesCadenceManual')}</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1">
                  {tr('gazettesSettingsThemeField')}
                </label>
                <select
                  value={themeInput}
                  onChange={(e) => setThemeInput(e.target.value as GazetteTheme)}
                  className="w-full px-3 py-2 rounded-xl bg-white dark:bg-stone-950 border border-stone-200 dark:border-stone-700 text-sm outline-none"
                >
                  <option value="editorial">{tr('gazetteThemeEditorial')}</option>
                  <option value="classic">{tr('gazetteThemeClassic')}</option>
                  <option value="keepsake">{tr('gazetteThemeKeepsake')}</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1">
                  {tr('gazettesSettingsPublishDayField')}
                </label>
                <input
                  type="number"
                  min={1}
                  max={28}
                  value={publishDayInput}
                  onChange={(e) => setPublishDayInput(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-xl bg-white dark:bg-stone-950 border border-stone-200 dark:border-stone-700 text-sm outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1">
                  {tr('gazettesSettingsReminderDaysField')}
                </label>
                <input
                  type="number"
                  min={0}
                  max={14}
                  value={reminderDaysInput}
                  onChange={(e) => setReminderDaysInput(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-xl bg-white dark:bg-stone-950 border border-stone-200 dark:border-stone-700 text-sm outline-none"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setSettingsOpen(false)}
                className="px-3.5 py-1.5 rounded-xl bg-stone-200/80 dark:bg-stone-800 text-xs font-semibold text-stone-700 dark:text-stone-200 cursor-pointer"
              >
                {tr('cancel')}
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 rounded-xl bg-[#1B5E7C] text-white text-xs font-semibold cursor-pointer"
              >
                {tr('save')}
              </button>
            </div>
          </form>
        )}
      </section>

      {/* Archive Bookshelf */}
      <section className="rounded-3xl bg-white dark:bg-[#171A23] border border-stone-200/90 dark:border-stone-800 p-5 sm:p-6 space-y-4 shadow-xs">
        <h3 className="font-serif-display text-xl font-bold text-stone-900 dark:text-stone-100">
          {tr('gazettesArchiveTitle', { count: activeGazettes.length })}
        </h3>

        {activeGazettes.length === 0 ? (
          <div className="rounded-2xl border-2 border-dashed border-stone-200 dark:border-stone-800 p-8 text-center space-y-2">
            <Newspaper className="w-8 h-8 text-stone-400 mx-auto" />
            <p className="font-serif-display text-lg font-bold text-stone-800 dark:text-stone-100">
              {tr('gazettesArchiveEmptyTitle')}
            </p>
            <p className="text-sm text-stone-500 dark:text-stone-400 max-w-md mx-auto">
              {tr('gazettesArchiveEmptyBody')}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {activeGazettes.map((issue) => {
              const linkStatus = validateGazetteSecretAccess(issue, issue.secretKey);
              const isBuilding = downloadingId === issue.id;
              const isArchiving = archivingId === issue.id;
              const expiryLabel = issue.shareExpiresAt
                ? tr('gazettesExpiresOnLabel', {
                    date: formatMemoryDate(issue.shareExpiresAt.slice(0, 10), language),
                  })
                : tr('gazettesPermanentLabel');

              return (
                <article
                  key={issue.id}
                  className="p-4 sm:p-5 rounded-2xl bg-stone-50/80 dark:bg-stone-900/60 border border-stone-200/80 dark:border-stone-800 flex flex-col justify-between gap-4"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-[#1B5E7C]/12 text-[#1B5E7C] dark:bg-teal-500/15 dark:text-teal-300">
                        {tr('gazettesIssueBadge', { n: issue.issueNumber })}
                      </span>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {linkStatus.ok ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
                            <Lock className="w-2.5 h-2.5" />
                            {tr('gazettesLinkStatusActive')}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/15 text-rose-700 dark:text-rose-300">
                            <ShieldAlert className="w-2.5 h-2.5" />
                            {linkStatus.reason === 'revoked'
                              ? tr('gazettesLinkStatusRevoked')
                              : tr('gazettesLinkStatusExpired')}
                          </span>
                        )}
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-stone-200/70 dark:bg-stone-800 text-stone-600 dark:text-stone-300">
                          {expiryLabel}
                        </span>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-stone-200/70 dark:bg-stone-800 text-stone-600 dark:text-stone-300">
                          {issue.sentAt ? tr('gazettesSentBadge') : tr('gazettesDraftBadge')}
                        </span>
                      </div>
                    </div>

                    <h4 className="font-serif-display text-lg font-bold text-stone-900 dark:text-stone-100 leading-snug">
                      {issue.title}
                    </h4>

                    <p className="text-xs text-stone-500 dark:text-stone-400">
                      {formatMemoryDate(issue.periodStart, language)} →{' '}
                      {formatMemoryDate(issue.periodEnd, language)} •{' '}
                      {tr('gazettesMemoriesCount', { count: issue.includedPostIds.length })}
                    </p>

                    {issue.editorialNote && (
                      <p className="text-xs text-stone-600 dark:text-stone-300 line-clamp-2 italic">
                        « {issue.editorialNote} »
                      </p>
                    )}

                    {(issue.pdfDriveFileId || issue.htmlDriveFileId) && (
                      <div className="flex flex-wrap items-center gap-1.5 pt-1">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#1B5E7C]/12 text-[#1B5E7C] dark:text-teal-300">
                          <Archive className="w-2.5 h-2.5" />
                          {tr('gazettesDriveSavedBadge')}
                        </span>
                        {issue.pdfDriveFileId && (
                          <a
                            href={buildDriveFileViewUrl(issue.pdfDriveFileId)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 text-stone-700 dark:text-stone-200 hover:border-[#1B5E7C]"
                          >
                            <ExternalLink className="w-2.5 h-2.5" />
                            <span>{tr('gazettesOpenDrivePdf')}</span>
                          </a>
                        )}
                        {issue.htmlDriveFileId && (
                          <a
                            href={buildDriveFileViewUrl(issue.htmlDriveFileId)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 text-stone-700 dark:text-stone-200 hover:border-[#1B5E7C]"
                          >
                            <ExternalLink className="w-2.5 h-2.5" />
                            <span>{tr('gazettesOpenDriveHtml')}</span>
                          </a>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-stone-200/70 dark:border-stone-800">
                    <button
                      type="button"
                      onClick={() => onOpenReader(issue.id)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#1B5E7C] hover:bg-[#164b63] text-white text-xs font-semibold cursor-pointer"
                    >
                      <BookOpen className="w-3.5 h-3.5" />
                      <span>{tr('gazettesReadBtn')}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => void handleDownloadPdf(issue)}
                      disabled={isBuilding}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 text-stone-800 dark:text-stone-100 text-xs font-semibold cursor-pointer disabled:opacity-50"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>{isBuilding ? tr('gazettesGeneratingPdf') : tr('gazettesPdfBtn')}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setShareIssue(issue)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-900 dark:text-amber-200 text-xs font-semibold cursor-pointer"
                    >
                      <Share2 className="w-3.5 h-3.5" />
                      <span>{tr('gazettesShareBtn')}</span>
                    </button>

                    {isActiveProfileAdmin && !linkStatus.ok && (
                      <button
                        type="button"
                        onClick={() => handleReactivate30d(issue)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600/15 hover:bg-emerald-600/25 text-emerald-800 dark:text-emerald-300 text-xs font-semibold cursor-pointer"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>{tr('gazettesReactivate30dBtn')}</span>
                      </button>
                    )}

                    {isActiveProfileAdmin && isCloudConnected && (
                      <button
                        type="button"
                        onClick={() => void handleArchiveDrive(issue)}
                        disabled={isArchiving}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-teal-600/12 hover:bg-teal-600/20 disabled:opacity-50 text-teal-900 dark:text-teal-200 text-xs font-semibold cursor-pointer"
                      >
                        <Archive className="w-3.5 h-3.5" />
                        <span>
                          {isArchiving ? tr('gazettesArchivingDrive') : tr('gazettesArchiveDriveBtn')}
                        </span>
                      </button>
                    )}

                    {isActiveProfileAdmin && (
                      <button
                        type="button"
                        onClick={() => deleteGazetteIssue(issue.id)}
                        aria-label={tr('gazettesDeleteBtn')}
                        className="ml-auto p-1.5 rounded-lg text-stone-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* Subscribers Section */}
      <SubscriberManager />

      <GazetteStudioModal
        open={studioOpen}
        onClose={() => setStudioOpen(false)}
        onCompiled={(compiled) => setShareIssue(compiled)}
      />

      <GazetteShareModal
        issue={shareIssue}
        onClose={() => setShareIssue(null)}
        onOpenReader={onOpenReader}
      />
    </div>
  );
};
