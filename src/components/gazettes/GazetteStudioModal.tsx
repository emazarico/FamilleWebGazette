import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  CheckSquare,
  FileText,
  Newspaper,
  ShieldCheck,
  Sparkles,
  Square,
  Star,
} from 'lucide-react';
import { useFamily } from '../../store/FamilyContext';
import type { GazetteIssue, GazetteTheme, MemoryPost } from '../../types/family';
import {
  computeGazettePeriodRange,
  computeShareExpiryIso,
  GAZETTE_THEME_STYLES,
  getNextIssueNumber,
  selectGazetteCandidatePosts,
  type GazetteExpiryPreset,
  type GazettePeriodPreset,
} from '../../utils/gazette';
import { formatMemoryDate } from '../../utils/i18n';
import { MediaImage } from '../common/MediaImage';
import { Modal } from '../common/Modal';

interface GazetteStudioModalProps {
  open: boolean;
  onClose: () => void;
  onCompiled: (issue: GazetteIssue) => void;
}

const THEME_OPTIONS: Array<{ id: GazetteTheme; labelKey: 'gazetteThemeEditorial' | 'gazetteThemeClassic' | 'gazetteThemeKeepsake' }> = [
  { id: 'editorial', labelKey: 'gazetteThemeEditorial' },
  { id: 'classic', labelKey: 'gazetteThemeClassic' },
  { id: 'keepsake', labelKey: 'gazetteThemeKeepsake' },
];

const EXPIRY_OPTIONS: Array<{ id: GazetteExpiryPreset; labelKey: 'studioExpiry7d' | 'studioExpiry30d' | 'studioExpiry90d' | 'studioExpiryPermanent' }> = [
  { id: '7d', labelKey: 'studioExpiry7d' },
  { id: '30d', labelKey: 'studioExpiry30d' },
  { id: '90d', labelKey: 'studioExpiry90d' },
  { id: 'permanent', labelKey: 'studioExpiryPermanent' },
];

export const GazetteStudioModal: React.FC<GazetteStudioModalProps> = ({
  open,
  onClose,
  onCompiled,
}) => {
  const {
    db,
    activePosts,
    activeGazettes,
    activeSubscribers,
    queuedGazettePosts,
    profilesById,
    compileGazetteIssue,
    togglePostFullPage,
    language,
    tr,
  } = useFamily();

  const [preset, setPreset] = useState<GazettePeriodPreset>('all-queued');
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [issueNumber, setIssueNumber] = useState(1);
  const [title, setTitle] = useState('');
  const [editorialNote, setEditorialNote] = useState('');
  const [theme, setTheme] = useState<GazetteTheme>(db.settings.gazetteTheme || 'editorial');
  const [expiryPreset, setExpiryPreset] = useState<GazetteExpiryPreset>('30d');
  const [includePublished, setIncludePublished] = useState(false);
  const [orderedIds, setOrderedIds] = useState<string[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const nextNum = getNextIssueNumber(db.settings, activeGazettes);
    const sinceLastRange = computeGazettePeriodRange(
      'since-last',
      activeGazettes,
      undefined,
      queuedGazettePosts,
    );
    const sinceLastCandidates = selectGazetteCandidatePosts(activePosts, {
      ...sinceLastRange,
      includeAlreadyPublished: false,
    });

    const initialPreset: GazettePeriodPreset =
      sinceLastCandidates.length > 0 || queuedGazettePosts.length === 0
        ? 'since-last'
        : 'all-queued';
    const initialRange = computeGazettePeriodRange(
      initialPreset,
      activeGazettes,
      undefined,
      queuedGazettePosts,
    );
    const initialCandidates = selectGazetteCandidatePosts(activePosts, {
      ...initialRange,
      includeAlreadyPublished: false,
    });

    setPreset(initialPreset);
    setPeriodStart(initialRange.periodStart);
    setPeriodEnd(initialRange.periodEnd);
    setIssueNumber(nextNum);
    setTitle(`${db.settings.gazetteTitle} — N° ${nextNum}`);
    setEditorialNote('');
    setTheme(db.settings.gazetteTheme || 'editorial');
    setExpiryPreset('30d');
    setIncludePublished(false);
    const ids = initialCandidates.map((p) => p.id);
    setOrderedIds(ids);
    setSelectedIds(new Set(ids));
    setError(null);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const candidatePosts = useMemo(
    () =>
      selectGazetteCandidatePosts(activePosts, {
        periodStart: periodStart || undefined,
        periodEnd: periodEnd || undefined,
        includeAlreadyPublished: includePublished,
      }),
    [activePosts, periodStart, periodEnd, includePublished],
  );

  useEffect(() => {
    if (!open) return;
    const candidateIdSet = new Set(candidatePosts.map((p) => p.id));
    setOrderedIds((prev) => {
      const kept = prev.filter((id) => candidateIdSet.has(id));
      const keptSet = new Set(kept);
      const added = candidatePosts.filter((p) => !keptSet.has(p.id)).map((p) => p.id);
      return [...kept, ...added];
    });
    setSelectedIds((prev) => {
      const next = new Set(Array.from(prev).filter((id) => candidateIdSet.has(id)));
      if (next.size === 0 && candidatePosts.length > 0 && prev.size === 0) {
        return new Set(candidatePosts.map((p) => p.id));
      }
      return next;
    });
  }, [candidatePosts, open]);

  const orderedPosts = useMemo(() => {
    const byId = new Map<string, MemoryPost>(candidatePosts.map((p) => [p.id, p]));
    return orderedIds
      .map((id) => byId.get(id))
      .filter((p): p is MemoryPost => Boolean(p));
  }, [candidatePosts, orderedIds]);

  const handleApplyPreset = (nextPreset: GazettePeriodPreset) => {
    setPreset(nextPreset);
    if (nextPreset === 'custom') return;
    const range = computeGazettePeriodRange(
      nextPreset,
      activeGazettes,
      undefined,
      queuedGazettePosts,
    );
    setPeriodStart(range.periodStart);
    setPeriodEnd(range.periodEnd);
    const refreshed = selectGazetteCandidatePosts(activePosts, {
      ...range,
      includeAlreadyPublished: includePublished,
    });
    const ids = refreshed.map((p) => p.id);
    setOrderedIds(ids);
    setSelectedIds(new Set(ids));
  };

  const togglePostSelected = (postId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(postId)) next.delete(postId);
      else next.add(postId);
      return next;
    });
  };

  const moveItem = (index: number, delta: -1 | 1) => {
    setOrderedIds((prev) => {
      const target = index + delta;
      if (target < 0 || target >= prev.length) return prev;
      const copy = [...prev];
      const [moved] = copy.splice(index, 1);
      copy.splice(target, 0, moved);
      return copy;
    });
  };

  const selectedOrderedIds = useMemo(
    () => orderedIds.filter((id) => selectedIds.has(id)),
    [orderedIds, selectedIds],
  );

  const handleCompile = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedOrderedIds.length === 0) {
      setError(tr('studioNeedSelection'));
      return;
    }
    setError(null);
    const compiled = compileGazetteIssue({
      issueNumber,
      title,
      editorialNote,
      theme,
      periodStart,
      periodEnd,
      includedPostIds: selectedOrderedIds,
      shareExpiresAt: computeShareExpiryIso(expiryPreset),
      recipientEmails: activeSubscribers.map((s) => s.email),
    });
    if (compiled) {
      onClose();
      onCompiled(compiled);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={tr('studioTitle', { n: issueNumber })}
      subtitle={tr('studioSubtitle')}
      maxWidthClass="max-w-4xl"
    >
      <form onSubmit={handleCompile} className="p-5 sm:p-6 space-y-5">
        {/* Privacy Firewall Banner */}
        <div className="flex items-start gap-2.5 px-3.5 py-2.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/25 text-xs text-emerald-900 dark:text-emerald-200">
          <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600 dark:text-emerald-400" />
          <span className="font-medium">{tr('studioPrivacyFirewallBanner')}</span>
        </div>

        {/* Period Presets & Issue Metadata */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1.5">
                {tr('studioPresetLabel')}
              </label>
              <div className="flex flex-wrap gap-1.5">
                {(
                  [
                    ['since-last', 'studioPresetSinceLast'],
                    ['this-month', 'studioPresetThisMonth'],
                    ['last-30', 'studioPresetLast30'],
                    ['all-queued', 'studioPresetAllQueued'],
                    ['custom', 'studioPresetCustom'],
                  ] as const
                ).map(([id, key]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => handleApplyPreset(id)}
                    className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                      preset === id
                        ? 'bg-[#1B5E7C] text-white'
                        : 'bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 hover:bg-stone-200 dark:hover:bg-stone-700'
                    }`}
                  >
                    {tr(key)}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[11px] font-semibold text-stone-500 dark:text-stone-400 mb-1">
                  {tr('studioStartDate')}
                </label>
                <input
                  type="date"
                  value={periodStart}
                  onChange={(e) => {
                    setPreset('custom');
                    setPeriodStart(e.target.value);
                  }}
                  className="w-full px-3 py-2 rounded-xl bg-stone-50 dark:bg-stone-900 border border-stone-200 dark:border-stone-700 text-xs font-medium outline-none focus:ring-2 focus:ring-[#1B5E7C]"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-stone-500 dark:text-stone-400 mb-1">
                  {tr('studioEndDate')}
                </label>
                <input
                  type="date"
                  value={periodEnd}
                  onChange={(e) => {
                    setPreset('custom');
                    setPeriodEnd(e.target.value);
                  }}
                  className="w-full px-3 py-2 rounded-xl bg-stone-50 dark:bg-stone-900 border border-stone-200 dark:border-stone-700 text-xs font-medium outline-none focus:ring-2 focus:ring-[#1B5E7C]"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1">
                {tr('studioIssueTitleLabel')}
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                className="w-full px-3.5 py-2 rounded-xl bg-stone-50 dark:bg-stone-900 border border-stone-200 dark:border-stone-700 text-sm outline-none focus:ring-2 focus:ring-[#1B5E7C]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1">
                {tr('studioEditorialLabel')}
              </label>
              <textarea
                value={editorialNote}
                onChange={(e) => setEditorialNote(e.target.value)}
                placeholder={tr('studioEditorialPlaceholder')}
                rows={3}
                className="w-full px-3.5 py-2 rounded-xl bg-stone-50 dark:bg-stone-900 border border-stone-200 dark:border-stone-700 text-sm outline-none focus:ring-2 focus:ring-[#1B5E7C] resize-y"
              />
            </div>
          </div>

          {/* Theme & Expiry */}
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1.5">
                {tr('studioThemeLabel')}
              </label>
              <div className="space-y-2">
                {THEME_OPTIONS.map((opt) => {
                  const style = GAZETTE_THEME_STYLES[opt.id];
                  const active = theme === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setTheme(opt.id)}
                      className={`w-full p-2.5 rounded-2xl border flex items-center justify-between text-left cursor-pointer transition-all ${
                        active
                          ? 'border-[#1B5E7C] bg-[#1B5E7C]/8 dark:bg-teal-500/12 ring-1 ring-[#1B5E7C]'
                          : 'border-stone-200 dark:border-stone-800 bg-stone-50/70 dark:bg-stone-900/50 hover:border-stone-300'
                      }`}
                    >
                      <span className="text-xs font-semibold text-stone-800 dark:text-stone-100">
                        {tr(opt.labelKey)}
                      </span>
                      <span className="flex items-center gap-1 shrink-0">
                        <span
                          className="w-4 h-4 rounded-full border border-black/10"
                          style={{ backgroundColor: style.mastheadBg }}
                        />
                        <span
                          className="w-4 h-4 rounded-full border border-black/10"
                          style={{ backgroundColor: style.accent }}
                        />
                        <span
                          className="w-4 h-4 rounded-full border border-stone-300"
                          style={{ backgroundColor: style.surface }}
                        />
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1.5">
                {tr('studioExpiryLabel')}
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                {EXPIRY_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setExpiryPreset(opt.id)}
                    className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold cursor-pointer transition-colors ${
                      expiryPreset === opt.id
                        ? 'bg-[#1B5E7C] text-white'
                        : 'bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300'
                    }`}
                  >
                    {tr(opt.labelKey)}
                  </button>
                ))}
              </div>
            </div>

            <div className="p-3 rounded-2xl bg-amber-50/70 dark:bg-amber-950/20 border border-amber-200/80 dark:border-amber-800/50 flex items-center gap-2 text-xs text-amber-950 dark:text-amber-200">
              <Sparkles className="w-4 h-4 text-amber-600 shrink-0" />
              <span>{tr('studioSubscribersSummary', { count: activeSubscribers.length })}</span>
            </div>
          </div>
        </div>

        {/* Candidate Memories List */}
        <div className="space-y-3 pt-2 border-t border-stone-100 dark:border-stone-800">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs font-bold text-stone-800 dark:text-stone-100">
                {tr('studioSelectedSummary', {
                  selected: selectedOrderedIds.length,
                  total: orderedPosts.length,
                })}
              </p>
              <label className="inline-flex items-center gap-2 text-xs text-stone-600 dark:text-stone-400 mt-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includePublished}
                  onChange={(e) => setIncludePublished(e.target.checked)}
                  className="rounded accent-[#1B5E7C]"
                />
                <span>{tr('studioIncludePublishedLabel')}</span>
              </label>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSelectedIds(new Set(orderedPosts.map((p) => p.id)))}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-stone-100 dark:bg-stone-800 text-xs font-semibold text-stone-700 dark:text-stone-300 cursor-pointer"
              >
                <CheckSquare className="w-3.5 h-3.5" />
                {tr('studioSelectAll')}
              </button>
              <button
                type="button"
                onClick={() => setSelectedIds(new Set())}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-stone-100 dark:bg-stone-800 text-xs font-semibold text-stone-700 dark:text-stone-300 cursor-pointer"
              >
                <Square className="w-3.5 h-3.5" />
                {tr('studioClearAll')}
              </button>
            </div>
          </div>

          {orderedPosts.length === 0 ? (
            <div className="rounded-2xl bg-stone-50 dark:bg-stone-900/60 border border-dashed border-stone-300 dark:border-stone-700 p-6 text-center text-xs text-stone-500 dark:text-stone-400">
              {tr('studioEmptyCandidates')}
            </div>
          ) : (
            <div className="space-y-2 max-h-72 overflow-y-auto pr-1 custom-scrollbar">
              {orderedPosts.map((post, idx) => {
                const checked = selectedIds.has(post.id);
                const author = profilesById.get(post.authorProfileId);
                return (
                  <div
                    key={post.id}
                    className={`p-2.5 rounded-2xl border flex items-center gap-3 transition-colors ${
                      checked
                        ? 'bg-white dark:bg-[#1A1E2A] border-[#1B5E7C]/50 shadow-xs'
                        : 'bg-stone-50/70 dark:bg-stone-900/40 border-stone-200/70 dark:border-stone-800 opacity-70'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => togglePostSelected(post.id)}
                      aria-label={post.caption || post.memoryDate}
                      className="w-4 h-4 accent-[#1B5E7C] shrink-0 cursor-pointer"
                    />

                    <div className="w-12 h-12 rounded-xl overflow-hidden bg-stone-100 dark:bg-stone-800 shrink-0 flex items-center justify-center">
                      {post.mediaIds[0] ? (
                        <MediaImage
                          mediaId={post.mediaIds[0]}
                          variant="thumb"
                          alt={post.caption || ''}
                          crop={post.mediaCrops?.[post.mediaIds[0]]}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <FileText className="w-5 h-5 text-stone-400" />
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-stone-800 dark:text-stone-100 truncate">
                        {author?.avatarEmoji} {author?.name || db.settings.familyName} •{' '}
                        <span className="font-normal text-stone-500">
                          {formatMemoryDate(post.memoryDate, language)}
                        </span>
                        {post.mediaIds.length > 1 && (
                          <span className="ml-1.5 text-[10px] font-bold text-[#1B5E7C] dark:text-teal-400">
                            ({post.mediaIds.length} photos)
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-stone-600 dark:text-stone-400 truncate mt-0.5">
                        {post.caption || '—'}
                      </p>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      {post.mediaIds.length > 0 && (
                        <button
                          type="button"
                          onClick={() => togglePostFullPage(post.id)}
                          title={tr('badgeFullPage')}
                          className={`p-1.5 rounded-lg cursor-pointer transition-colors ${
                            post.fullPageFeature
                              ? 'bg-amber-500/20 text-amber-600 dark:text-amber-300'
                              : 'text-stone-400 hover:text-amber-500 hover:bg-stone-100 dark:hover:bg-stone-800'
                          }`}
                        >
                          <Star
                            className={`w-4 h-4 ${post.fullPageFeature ? 'fill-current' : ''}`}
                          />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => moveItem(idx, -1)}
                        disabled={idx === 0}
                        aria-label="Up"
                        className="p-1.5 rounded-lg text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800 disabled:opacity-30 cursor-pointer"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveItem(idx, 1)}
                        disabled={idx === orderedPosts.length - 1}
                        aria-label="Down"
                        className="p-1.5 rounded-lg text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800 disabled:opacity-30 cursor-pointer"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {error && <p className="text-xs font-semibold text-rose-600 dark:text-rose-400">{error}</p>}

        {/* Actions */}
        <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-stone-100 dark:border-stone-800">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-stone-100 hover:bg-stone-200 dark:bg-stone-800 dark:hover:bg-stone-700 text-xs font-semibold text-stone-700 dark:text-stone-200 cursor-pointer"
          >
            {tr('cancel')}
          </button>
          <button
            type="submit"
            disabled={selectedOrderedIds.length === 0}
            className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-[#1B5E7C] hover:bg-[#164b63] disabled:opacity-50 text-white text-xs sm:text-sm font-semibold shadow-sm cursor-pointer"
          >
            <Newspaper className="w-4 h-4" />
            <span>{tr('studioCompileCta', { n: issueNumber })}</span>
          </button>
        </div>
      </form>
    </Modal>
  );
};
