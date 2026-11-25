import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Download,
  Loader2,
  Printer,
  Share2,
  Sparkles,
  Star,
} from 'lucide-react';
import { downloadGazettePdf } from '../../services/gazettePdf';
import { useFamily } from '../../store/FamilyContext';
import type { MemoryPost, UiLanguage } from '../../types/family';
import { GAZETTE_THEME_STYLES, type ScopedGazettePayload } from '../../utils/gazette';
import { formatMemoryDate } from '../../utils/i18n';
import { CollageGrid } from '../common/CollageGrid';

interface PrintGazetteViewProps {
  payload: ScopedGazettePayload;
  lang: UiLanguage;
  onChangeLang?: (lang: UiLanguage) => void;
  onBack?: () => void;
  onOpenShare?: () => void;
  backLabel?: string;
  isPublicMode?: boolean;
  autoDownloadPdf?: boolean;
}

export const PrintGazetteView: React.FC<PrintGazetteViewProps> = ({
  payload,
  lang,
  onChangeLang,
  onBack,
  onOpenShare,
  backLabel,
  isPublicMode = false,
  autoDownloadPdf = false,
}) => {
  const { addToast, tr } = useFamily();
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const autoTriggeredRef = useRef(false);

  const { issue, familyName, posts, contributorsById, guestsById } = payload;
  const theme = GAZETTE_THEME_STYLES[issue.theme] || GAZETTE_THEME_STYLES.editorial;

  const uniqueContributors = useMemo(() => {
    const seen = new Set<string>();
    const list: Array<{ id: string; name: string; emoji: string }> = [];
    for (const post of posts) {
      const c = contributorsById[post.authorProfileId];
      if (c && !seen.has(c.id)) {
        seen.add(c.id);
        list.push({ id: c.id, name: c.name, emoji: c.avatarEmoji });
      }
    }
    return list;
  }, [posts, contributorsById]);

  const handleDownloadPdf = async () => {
    if (downloadingPdf) return;
    setDownloadingPdf(true);
    try {
      const res = await downloadGazettePdf(payload, lang);
      addToast({
        title: tr('gazettesPdfDownloadedToast', { filename: res.filename }),
        tone: 'success',
      });
    } catch {
      window.print();
    } finally {
      setDownloadingPdf(false);
    }
  };

  useEffect(() => {
    if (!autoDownloadPdf || autoTriggeredRef.current) return;
    autoTriggeredRef.current = true;
    void (async () => {
      setDownloadingPdf(true);
      try {
        const res = await downloadGazettePdf(payload, lang);
        addToast({
          title: tr('gazettesPdfDownloadedToast', { filename: res.filename }),
          tone: 'success',
        });
      } catch {
        // Fallback banner remains visible for manual tap
      } finally {
        setDownloadingPdf(false);
      }
    })();
  }, [autoDownloadPdf, addToast, lang, payload, tr]);

  const getTaggedNames = (post: MemoryPost): string[] => {
    const names: string[] = [];
    for (const pid of post.taggedProfileIds) {
      const c = contributorsById[pid];
      if (c) names.push(`${c.avatarEmoji} ${c.name}`);
    }
    for (const gid of post.taggedGuestIds || []) {
      const g = guestsById[gid];
      if (g) names.push(`${g.avatarEmoji} ${g.name}`);
    }
    return names;
  };

  return (
    <div
      className="min-h-[100dvh] flex flex-col"
      style={{ backgroundColor: theme.surface, color: theme.text }}
    >
      {/* Top Sticky Reader / Print Toolbar */}
      <header className="no-print sticky top-0 z-30 pt-[env(safe-area-inset-top)] backdrop-blur-md bg-white/92 border-b border-stone-200/90 shadow-xs">
        <div className="max-w-5xl mx-auto px-3 sm:px-6 h-14 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-800 text-xs font-semibold transition-colors cursor-pointer shrink-0"
              >
                <ArrowLeft className="w-4 h-4" />
                <span className="truncate max-w-[140px] sm:max-w-none">
                  {backLabel || (isPublicMode ? tr('readerBackToApp') : tr('readerBackToArchive'))}
                </span>
              </button>
            )}
            <span className="hidden sm:inline text-xs font-bold text-stone-500 truncate">
              {issue.title}
            </span>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {onChangeLang && (
              <div className="inline-flex items-center p-0.5 rounded-full bg-stone-100 border border-stone-200 text-[11px] font-bold">
                <button
                  type="button"
                  onClick={() => onChangeLang('fr')}
                  className={`px-2 py-1 rounded-full cursor-pointer transition-colors ${
                    lang === 'fr' ? 'bg-[#1B5E7C] text-white' : 'text-stone-600'
                  }`}
                >
                  FR
                </button>
                <button
                  type="button"
                  onClick={() => onChangeLang('en')}
                  className={`px-2 py-1 rounded-full cursor-pointer transition-colors ${
                    lang === 'en' ? 'bg-[#1B5E7C] text-white' : 'text-stone-600'
                  }`}
                >
                  EN
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={() => window.print()}
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-800 text-xs font-semibold transition-colors cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>{tr('readerPrintBtn')}</span>
            </button>

            <button
              type="button"
              onClick={handleDownloadPdf}
              disabled={downloadingPdf}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#1B5E7C] hover:bg-[#164b63] disabled:opacity-60 text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer"
            >
              {downloadingPdf ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Download className="w-3.5 h-3.5" />
              )}
              <span>{downloadingPdf ? tr('gazettesGeneratingPdf') : tr('gazettesPdfBtn')}</span>
            </button>

            {onOpenShare && (
              <button
                type="button"
                onClick={onOpenShare}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-900 text-xs font-semibold transition-colors cursor-pointer"
              >
                <Share2 className="w-3.5 h-3.5" />
                <span className="hidden xs:inline">{tr('gazettesShareBtn')}</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Auto-PDF Banner (Helpful for mobile Safari where automatic downloads can require tap) */}
      {autoDownloadPdf && (
        <div className="no-print max-w-4xl w-full mx-auto px-3 sm:px-6 pt-4">
          <div className="rounded-2xl bg-amber-50 border border-amber-200 px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs text-amber-950">
            <span className="font-medium">{tr('readerPdfAutoBanner')}</span>
            <button
              type="button"
              onClick={handleDownloadPdf}
              disabled={downloadingPdf}
              className="inline-flex items-center justify-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-semibold cursor-pointer shrink-0"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{tr('shareDownloadPdfBtn')}</span>
            </button>
          </div>
        </div>
      )}

      {/* Printable Editorial Sheet */}
      <main className="print-sheet flex-1 max-w-4xl w-full mx-auto px-3 sm:px-6 py-6 sm:py-8 pb-[calc(4rem+env(safe-area-inset-bottom))]">
        {/* Masthead */}
        <header
          className="rounded-3xl p-6 sm:p-9 text-center shadow-sm mb-6 print-avoid-break"
          style={{ backgroundColor: theme.mastheadBg, color: theme.mastheadText }}
        >
          <p className="text-[11px] sm:text-xs font-bold uppercase tracking-[0.16em] opacity-85">
            {familyName} • {tr('gazettesIssueBadge', { n: issue.issueNumber })}
          </p>
          <h1 className="font-serif-display text-2xl sm:text-4xl font-bold mt-2 leading-tight">
            {issue.title}
          </h1>
          <p className="text-xs sm:text-sm opacity-90 mt-2">
            {formatMemoryDate(issue.periodStart, lang)} → {formatMemoryDate(issue.periodEnd, lang)} •{' '}
            {tr('gazettesMemoriesCount', { count: posts.length })}
          </p>

          {uniqueContributors.length > 0 && (
            <div className="mt-4 pt-3 border-t border-white/20 flex flex-wrap items-center justify-center gap-2 text-xs">
              <span className="opacity-80">{tr('readerContributorsLabel')}</span>
              {uniqueContributors.map((c) => (
                <span
                  key={c.id}
                  className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-white/15 font-medium"
                >
                  <span>{c.emoji}</span>
                  <span>{c.name}</span>
                </span>
              ))}
            </div>
          )}
        </header>

        {/* Editorial Note */}
        {issue.editorialNote && (
          <section
            className="rounded-2xl p-5 mb-6 border-l-4 shadow-xs print-avoid-break"
            style={{
              backgroundColor: theme.accentSoft,
              borderLeftColor: theme.accent,
              color: theme.text,
            }}
          >
            <p
              className="text-[11px] font-bold uppercase tracking-wider mb-1 flex items-center gap-1.5"
              style={{ color: theme.badgeText }}
            >
              <Sparkles className="w-3.5 h-3.5" />
              {tr('readerEditorialHeading')}
            </p>
            <p className="font-serif-display text-base sm:text-lg leading-relaxed whitespace-pre-wrap">
              {issue.editorialNote}
            </p>
          </section>
        )}

        {/* Curated Memories Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 print:grid-cols-2 gap-5">
          {posts.map((post, index) => {
            const author = contributorsById[post.authorProfileId];
            const taggedNames = getTaggedNames(post);
            const hasPhotos = post.mediaIds.length > 0;
            const isFullPage = Boolean(post.fullPageFeature && hasPhotos);

            return (
              <article
                key={post.id}
                className={`rounded-3xl border shadow-xs overflow-hidden flex flex-col print-avoid-break ${
                  isFullPage
                    ? `md:col-span-2 print:col-span-2 ${index > 0 ? 'print-break-before' : ''}`
                    : ''
                }`}
                style={{
                  backgroundColor: theme.cardBg,
                  borderColor: theme.border,
                }}
              >
                {hasPhotos ? (
                  <div className={isFullPage ? 'p-4 sm:p-5 pb-0' : 'p-3.5 pb-0'}>
                    <CollageGrid
                      mediaIds={post.mediaIds}
                      layout={post.collageLayout}
                      crops={post.mediaCrops}
                      altPrefix={post.caption || author?.name || familyName}
                      variant="full"
                    />
                  </div>
                ) : null}

                <div
                  className={`p-4 sm:p-5 flex-1 flex flex-col justify-between ${
                    !hasPhotos ? 'border-l-4' : ''
                  }`}
                  style={!hasPhotos ? { borderLeftColor: theme.accent } : undefined}
                >
                  <div>
                    <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold"
                          style={{ backgroundColor: theme.badgeBg, color: theme.badgeText }}
                        >
                          <span>{author?.avatarEmoji || '👪'}</span>
                          <span className="truncate">{author?.name || familyName}</span>
                        </span>
                        <span className="text-xs font-medium" style={{ color: theme.muted }}>
                          {formatMemoryDate(post.memoryDate, lang)}
                        </span>
                      </div>

                      {isFullPage && (
                        <span
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold"
                          style={{ backgroundColor: theme.accentSoft, color: theme.badgeText }}
                        >
                          <Star className="w-3 h-3 fill-current" />
                          {tr('badgeFullPage')}
                        </span>
                      )}
                    </div>

                    {post.caption && (
                      <p
                        className={`whitespace-pre-wrap leading-relaxed ${
                          isFullPage || !hasPhotos
                            ? 'font-serif-display text-base sm:text-lg'
                            : 'text-sm sm:text-[15px]'
                        }`}
                        style={{ color: theme.text }}
                      >
                        {post.caption}
                      </p>
                    )}
                  </div>

                  {taggedNames.length > 0 && (
                    <div
                      className="mt-3 pt-2.5 border-t text-xs flex flex-wrap items-center gap-1.5"
                      style={{ borderColor: theme.border, color: theme.muted }}
                    >
                      <span className="font-semibold">{tr('taggedWith')} :</span>
                      <span>{taggedNames.join(' • ')}</span>
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>

        {/* Colophon */}
        <footer
          className="mt-8 pt-4 border-t text-center text-xs print-avoid-break"
          style={{ borderColor: theme.border, color: theme.muted }}
        >
          {tr('readerColophon', {
            app: tr('appName'),
            family: familyName,
            n: issue.issueNumber,
          })}
        </footer>
      </main>
    </div>
  );
};
