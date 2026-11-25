import type { MemoryPost, PhotoCrop, UiLanguage } from '../types/family';
import { clampPhotoCrop } from './collage';
import { GAZETTE_THEME_STYLES, type ScopedGazettePayload } from './gazette';
import { formatMemoryDate } from './i18n';

export const EMAIL_HTML_MAX_BYTES = 80_000;

export function escapeHtml(str: string): string {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function measureUtf8Bytes(input: string): number {
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(input).length;
  }
  return unescape(encodeURIComponent(input)).length;
}

function formatPeopleTaggedLine(
  post: MemoryPost,
  payload: ScopedGazettePayload,
): string {
  const names: string[] = [];
  for (const pid of post.taggedProfileIds) {
    const c = payload.contributorsById[pid];
    if (c) names.push(c.name);
  }
  for (const gid of post.taggedGuestIds || []) {
    const g = payload.guestsById[gid];
    if (g) names.push(g.name);
  }
  return names.join(', ');
}

export interface BuildGazetteEmailDigestParams {
  payload: ScopedGazettePayload;
  lang: UiLanguage;
  htmlUrl: string;
  pdfUrl: string;
  thumbnailMode: 'cid' | 'inline-data';
  inlineThumbnailsByMediaId?: Record<string, string>;
  maxHtmlBytes?: number;
}

export interface GazetteEmailDigestResult {
  subject: string;
  html: string;
  plainText: string;
  byteSize: number;
  includedPreviewCount: number;
  omittedPreviewCount: number;
  cidMediaIds: string[];
}

export function buildGazetteEmailDigest(
  params: BuildGazetteEmailDigestParams,
): GazetteEmailDigestResult {
  const {
    payload,
    lang,
    htmlUrl,
    pdfUrl,
    thumbnailMode,
    inlineThumbnailsByMediaId = {},
    maxHtmlBytes = EMAIL_HTML_MAX_BYTES,
  } = params;

  const { issue, familyName, posts, contributorsById } = payload;
  const tokens = GAZETTE_THEME_STYLES[issue.theme] || GAZETTE_THEME_STYLES.editorial;
  const periodLabel = `${formatMemoryDate(issue.periodStart, lang)} → ${formatMemoryDate(
    issue.periodEnd,
    lang,
  )}`;

  const subject =
    lang === 'fr'
      ? `📰 ${issue.title} (N° ${issue.issueNumber}) — ${familyName}`
      : `📰 ${issue.title} (Issue #${issue.issueNumber}) — ${familyName}`;

  const renderHtmlWithLimit = (previewLimit: number): { html: string; cidMediaIds: string[] } => {
    const slice = posts.slice(0, previewLimit);
    const omittedCount = Math.max(0, posts.length - slice.length);
    const cidMediaIds: string[] = [];

    const cardsHtml = slice
      .map((post) => {
        const author = contributorsById[post.authorProfileId];
        const authorName = author ? `${author.avatarEmoji} ${author.name}` : familyName;
        const dateLabel = formatMemoryDate(post.memoryDate, lang);
        const taggedLine = formatPeopleTaggedLine(post, payload);
        const firstMediaId = post.mediaIds[0];

        let imageHtml = '';
        if (firstMediaId) {
          if (thumbnailMode === 'cid') {
            const cidIndex = cidMediaIds.length;
            cidMediaIds.push(firstMediaId);
            imageHtml = `
              <tr>
                <td style="padding:0 0 12px 0;">
                  <img src="cid:thumb_${cidIndex}" alt="${escapeHtml(
              post.caption.slice(0, 60) || authorName,
            )}" style="display:block;width:100%;max-height:260px;object-fit:cover;border-radius:10px;border:1px solid ${tokens.border};" />
                </td>
              </tr>`;
          } else {
            const dataUrl = inlineThumbnailsByMediaId[firstMediaId];
            if (dataUrl && dataUrl.startsWith('data:image/')) {
              imageHtml = `
                <tr>
                  <td style="padding:0 0 12px 0;">
                    <img src="${escapeHtml(dataUrl)}" alt="${escapeHtml(
                post.caption.slice(0, 60) || authorName,
              )}" style="display:block;width:100%;max-height:260px;object-fit:cover;border-radius:10px;border:1px solid ${tokens.border};" />
                  </td>
                </tr>`;
            }
          }
        }

        const extraPhotosNote =
          post.mediaIds.length > 1
            ? lang === 'fr'
              ? ` • ${post.mediaIds.length} photos (collage complet dans la Gazette)`
              : ` • ${post.mediaIds.length} photos (full collage inside the Gazette)`
            : '';

        const taggedHtml = taggedLine
          ? `<p style="margin:8px 0 0 0;font-size:12px;color:${tokens.muted};">${
              lang === 'fr' ? 'Avec :' : 'With:'
            } ${escapeHtml(taggedLine)}</p>`
          : '';

        return `
          <tr>
            <td style="padding:0 0 16px 0;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${tokens.cardBg};border:1px solid ${tokens.border};border-radius:14px;padding:16px;">
                ${imageHtml}
                <tr>
                  <td style="font-size:12px;font-weight:700;color:${tokens.badgeText};padding-bottom:6px;">
                    ${escapeHtml(authorName)} &bull; <span style="font-weight:500;color:${tokens.muted};">${escapeHtml(
          dateLabel,
        )}${escapeHtml(extraPhotosNote)}</span>
                  </td>
                </tr>
                <tr>
                  <td style="font-size:14px;line-height:1.55;color:${tokens.text};">
                    ${escapeHtml(post.caption || '')}
                    ${taggedHtml}
                  </td>
                </tr>
              </table>
            </td>
          </tr>`;
      })
      .join('');

    const omittedBanner =
      omittedCount > 0
        ? `
          <tr>
            <td style="padding:8px 14px;background:${tokens.badgeBg};border-radius:10px;text-align:center;font-size:13px;font-weight:600;color:${tokens.badgeText};">
              ${
                lang === 'fr'
                  ? `+ ${omittedCount} autre${omittedCount > 1 ? 's' : ''} souvenir${
                      omittedCount > 1 ? 's' : ''
                    } en pleine résolution dans la Gazette en ligne`
                  : `+ ${omittedCount} more ${
                      omittedCount === 1 ? 'memory' : 'memories'
                    } in full resolution inside the online Gazette`
              }
            </td>
          </tr>`
        : '';

    const editorialHtml = issue.editorialNote
      ? `
          <tr>
            <td style="padding:0 0 18px 0;">
              <div style="background:${tokens.accentSoft};border-left:4px solid ${tokens.accent};border-radius:10px;padding:12px 14px;font-size:14px;line-height:1.55;color:${tokens.text};">
                <strong style="display:block;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px;color:${tokens.badgeText};">${
          lang === 'fr' ? 'Le mot de la rédaction' : 'Editorial Note'
        }</strong>
                ${escapeHtml(issue.editorialNote)}
              </div>
            </td>
          </tr>`
      : '';

    const html = `<!doctype html>
<html lang="${lang}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${escapeHtml(issue.title)}</title>
</head>
<body style="margin:0;padding:0;background:${tokens.surface};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${tokens.text};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${tokens.surface};padding:20px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;">
          <tr>
            <td style="background:${tokens.mastheadBg};color:${tokens.mastheadText};border-radius:18px;padding:24px 22px;text-align:center;">
              <div style="font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;opacity:0.88;">
                ${escapeHtml(familyName)} &bull; N&deg; ${issue.issueNumber}
              </div>
              <h1 style="margin:8px 0 6px 0;font-family:Georgia,'Times New Roman',serif;font-size:24px;line-height:1.25;color:${tokens.mastheadText};">
                ${escapeHtml(issue.title)}
              </h1>
              <div style="font-size:13px;opacity:0.9;">
                ${escapeHtml(periodLabel)} &bull; ${
      lang === 'fr'
        ? `${posts.length} souvenir${posts.length > 1 ? 's' : ''}`
        : `${posts.length} ${posts.length === 1 ? 'memory' : 'memories'}`
    }
              </div>
            </td>
          </tr>
          <tr><td style="height:18px;"></td></tr>
          ${editorialHtml}
          <tr>
            <td style="padding:0 0 18px 0;text-align:center;">
              <a href="${escapeHtml(
                htmlUrl,
              )}" style="display:inline-block;margin:4px 6px;padding:12px 20px;background:${tokens.mastheadBg};color:${tokens.mastheadText};text-decoration:none;border-radius:12px;font-size:14px;font-weight:700;">
                ${
                  lang === 'fr'
                    ? 'Lire la Gazette complète (HTML)'
                    : 'Open Full-Size Online Gazette'
                }
              </a>
              <a href="${escapeHtml(
                pdfUrl,
              )}" style="display:inline-block;margin:4px 6px;padding:12px 20px;background:${tokens.cardBg};color:${tokens.mastheadBg};border:2px solid ${tokens.mastheadBg};text-decoration:none;border-radius:12px;font-size:14px;font-weight:700;">
                ${lang === 'fr' ? 'Télécharger en PDF' : 'Download PDF Edition'}
              </a>
            </td>
          </tr>
          ${cardsHtml}
          ${omittedBanner}
          <tr>
            <td style="padding:18px 8px 6px 8px;text-align:center;font-size:11px;line-height:1.5;color:${tokens.muted};">
              ${
                lang === 'fr'
                  ? 'Lien privé familial — ne partagez cette Gazette qu’avec vos proches.'
                  : 'Private family edition — share these secret links only with loved ones.'
              }
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    return { html, cidMediaIds };
  };

  let limit = posts.length;
  let rendered = renderHtmlWithLimit(limit);
  let byteSize = measureUtf8Bytes(rendered.html);

  while (byteSize > maxHtmlBytes && limit > 0) {
    limit -= 1;
    rendered = renderHtmlWithLimit(limit);
    byteSize = measureUtf8Bytes(rendered.html);
  }

  const plainLines: string[] = [
    `${issue.title} (${familyName} — N° ${issue.issueNumber})`,
    periodLabel,
    '',
  ];
  if (issue.editorialNote) {
    plainLines.push(issue.editorialNote, '');
  }
  plainLines.push(
    lang === 'fr' ? `Lire en ligne : ${htmlUrl}` : `Read online: ${htmlUrl}`,
    lang === 'fr' ? `Télécharger le PDF : ${pdfUrl}` : `Download PDF: ${pdfUrl}`,
    '',
    '---',
  );
  for (const post of posts.slice(0, 12)) {
    const author = contributorsById[post.authorProfileId]?.name || familyName;
    const snippet = post.caption.trim().slice(0, 180);
    plainLines.push(`• [${post.memoryDate}] ${author}: ${snippet}`);
  }
  if (posts.length > 12) {
    plainLines.push(
      lang === 'fr'
        ? `… et ${posts.length - 12} autres souvenirs dans la Gazette.`
        : `… and ${posts.length - 12} more memories in the full Gazette.`,
    );
  }

  return {
    subject,
    html: rendered.html,
    plainText: plainLines.join('\n'),
    byteSize,
    includedPreviewCount: limit,
    omittedPreviewCount: Math.max(0, posts.length - limit),
    cidMediaIds: rendered.cidMediaIds,
  };
}

export interface BuildReminderEmailParams {
  familyName: string;
  gazetteTitle: string;
  nextPublishDate: string;
  queuedCount: number;
  appUrl: string;
  lang: UiLanguage;
}

export function buildReminderEmailDigest(params: BuildReminderEmailParams): {
  subject: string;
  html: string;
  plainText: string;
} {
  const { familyName, gazetteTitle, nextPublishDate, queuedCount, appUrl, lang } = params;
  const formattedDate = formatMemoryDate(nextPublishDate, lang);

  const subject =
    lang === 'fr'
      ? `⏰ Rappel ${gazetteTitle} : plus que quelques jours avant le ${formattedDate}`
      : `⏰ ${gazetteTitle} Reminder: publishing on ${formattedDate}`;

  const headline =
    lang === 'fr'
      ? `La prochaine Gazette paraît le ${formattedDate}`
      : `Next Gazette publishes on ${formattedDate}`;

  const body =
    lang === 'fr'
      ? `Il est encore temps d’ajouter vos plus belles photos et nouvelles de famille sur ${familyName} ! ${queuedCount} souvenir${queuedCount > 1 ? 's sont déjà sélectionnés' : ' est déjà sélectionné'}.`
      : `There is still time to share your latest family photos and stories for ${familyName}! ${queuedCount} ${queuedCount === 1 ? 'memory is' : 'memories are'} already queued for this edition.`;

  const cta = lang === 'fr' ? 'Ajouter un souvenir' : 'Add a Memory Now';

  const html = `<!doctype html>
<html lang="${lang}">
<body style="margin:0;padding:20px;background:#FAF8F5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1C1917;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#FFFFFF;border:1px solid #E7E5E4;border-radius:16px;padding:24px;">
    <tr>
      <td>
        <p style="margin:0 0 8px 0;font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#D97706;">
          ${escapeHtml(familyName)} &bull; ${escapeHtml(gazetteTitle)}
        </p>
        <h2 style="margin:0 0 12px 0;font-family:Georgia,serif;font-size:22px;color:#1B5E7C;">
          ${escapeHtml(headline)}
        </h2>
        <p style="margin:0 0 20px 0;font-size:15px;line-height:1.55;color:#44403C;">
          ${escapeHtml(body)}
        </p>
        <a href="${escapeHtml(
          appUrl,
        )}" style="display:inline-block;padding:12px 22px;background:#1B5E7C;color:#FFFFFF;text-decoration:none;border-radius:12px;font-size:14px;font-weight:700;">
          ${escapeHtml(cta)}
        </a>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const plainText = `${gazetteTitle} — ${familyName}\n\n${headline}\n${body}\n\n${cta}: ${appUrl}`;

  return { subject, html, plainText };
}

export function buildStandaloneGazetteHtml(params: {
  payload: ScopedGazettePayload;
  lang: UiLanguage;
  dataUrlsByMediaId: Record<string, string>;
}): string {
  const { payload, lang, dataUrlsByMediaId } = params;
  const { issue, familyName, posts, contributorsById } = payload;
  const tokens = GAZETTE_THEME_STYLES[issue.theme] || GAZETTE_THEME_STYLES.editorial;
  const periodLabel = `${formatMemoryDate(issue.periodStart, lang)} → ${formatMemoryDate(
    issue.periodEnd,
    lang,
  )}`;

  const renderTile = (mediaId: string, crop?: PhotoCrop) => {
    const src = dataUrlsByMediaId[mediaId];
    if (!src) return '';
    const clamped = clampPhotoCrop(crop);
    const transform =
      clamped.zoom > 1
        ? `transform:scale(${clamped.zoom});transform-origin:${clamped.x}% ${clamped.y}%;`
        : '';
    return `<div style="position:relative;overflow:hidden;border-radius:10px;background:#f5f5f4;width:100%;height:100%;">
      <img src="${escapeHtml(src)}" alt="" style="width:100%;height:100%;object-fit:cover;object-position:${clamped.x}% ${clamped.y}%;${transform}display:block;" />
    </div>`;
  };

  const renderGrid = (post: MemoryPost): string => {
    const ids = post.mediaIds.filter((id) => Boolean(dataUrlsByMediaId[id])).slice(0, 4);
    if (ids.length === 0) return '';
    const crops = post.mediaCrops || {};
    if (ids.length === 1) {
      return `<div style="aspect-ratio:4/3;overflow:hidden;border-radius:12px;">${renderTile(ids[0], crops[ids[0]])}</div>`;
    }
    const cols = ids.length === 2 && post.collageLayout === 'two-row' ? '1fr' : '1fr 1fr';
    return `<div style="display:grid;grid-template-columns:${cols};gap:6px;aspect-ratio:4/3;overflow:hidden;border-radius:12px;">
      ${ids.map((id) => renderTile(id, crops[id])).join('')}
    </div>`;
  };

  const articles = posts
    .map((post) => {
      const author = contributorsById[post.authorProfileId];
      const authorLabel = author ? `${author.avatarEmoji} ${author.name}` : familyName;
      const tagged = formatPeopleTaggedLine(post, payload);
      const grid = renderGrid(post);
      const breakClass = post.fullPageFeature ? 'page-break' : '';

      return `<article class="card ${breakClass}">
        ${grid}
        <div class="meta">${escapeHtml(authorLabel)} &bull; ${escapeHtml(
        formatMemoryDate(post.memoryDate, lang),
      )}${post.fullPageFeature ? ` &bull; ★ ${lang === 'fr' ? 'Pleine page' : 'Full Page'}` : ''}</div>
        <p class="caption">${escapeHtml(post.caption)}</p>
        ${
          tagged
            ? `<div class="tagged">${lang === 'fr' ? 'Avec :' : 'With:'} ${escapeHtml(tagged)}</div>`
            : ''
        }
      </article>`;
    })
    .join('\n');

  return `<!doctype html>
<html lang="${lang}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${escapeHtml(issue.title)}</title>
  <style>
    @page { size: A4 portrait; margin: 14mm; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: ${tokens.surface}; color: ${tokens.text}; padding: 24px; }
    .sheet { max-width: 900px; margin: 0 auto; }
    .masthead { background: ${tokens.mastheadBg}; color: ${tokens.mastheadText}; border-radius: 20px; padding: 28px; text-align: center; margin-bottom: 24px; }
    .masthead h1 { font-family: Georgia, serif; font-size: 32px; margin: 8px 0; }
    .editorial { background: ${tokens.accentSoft}; border-left: 4px solid ${tokens.accent}; padding: 14px 18px; border-radius: 12px; margin-bottom: 24px; line-height: 1.55; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 18px; }
    .card { background: ${tokens.cardBg}; border: 1px solid ${tokens.border}; border-radius: 16px; padding: 16px; break-inside: avoid; page-break-inside: avoid; }
    .card.page-break { grid-column: 1 / -1; }
    .meta { font-size: 12px; font-weight: 700; color: ${tokens.badgeText}; margin-top: 10px; }
    .caption { font-size: 14px; line-height: 1.55; margin: 6px 0 0 0; white-space: pre-wrap; }
    .tagged { font-size: 12px; color: ${tokens.muted}; margin-top: 8px; }
    @media print { body { background: #fff; padding: 0; } .card.page-break { break-before: page; page-break-before: always; } }
  </style>
</head>
<body>
  <div class="sheet">
    <header class="masthead">
      <div style="font-size:12px;letter-spacing:0.12em;text-transform:uppercase;font-weight:700;">${escapeHtml(
        familyName,
      )} &bull; N&deg; ${issue.issueNumber}</div>
      <h1>${escapeHtml(issue.title)}</h1>
      <div style="font-size:13px;opacity:0.9;">${escapeHtml(periodLabel)}</div>
    </header>
    ${
      issue.editorialNote
        ? `<div class="editorial">${escapeHtml(issue.editorialNote)}</div>`
        : ''
    }
    <section class="grid">${articles}</section>
  </div>
</body>
</html>`;
}
