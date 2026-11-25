import type { UiLanguage } from '../types/family';
import {
  GAZETTE_THEME_STYLES,
  getEffectivePostTileRects,
  sanitizePdfText,
  type ScopedGazettePayload,
} from '../utils/gazette';
import { formatMemoryDate } from '../utils/i18n';
import { rasterizeMediaToJpeg } from './mediaRender';

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const full = clean.length === 3 ? clean.replace(/(.)/g, '$1$1') : clean;
  const parsed = Number.parseInt(full, 16);
  if (Number.isNaN(parsed)) return [28, 25, 23];
  return [(parsed >> 16) & 255, (parsed >> 8) & 255, parsed & 255];
}

/**
 * Generates an A4 printable PDF Blob for a single scoped Gazette issue using lazy-loaded jsPDF.
 * Respects collage layouts and per-photo focal/zoom crops while keeping private messages excluded.
 */
export async function buildGazettePdfBlob(
  payload: ScopedGazettePayload,
  lang: UiLanguage,
): Promise<{ blob: Blob; filename: string; byteSize: number }> {
  const { jsPDF } = await import('jspdf');
  const { issue, familyName, posts, contributorsById, guestsById } = payload;
  const theme = GAZETTE_THEME_STYLES[issue.theme] || GAZETTE_THEME_STYLES.editorial;

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: true,
  });

  const pageW = 210;
  const pageH = 297;
  const margin = 14;
  const contentW = pageW - margin * 2; // 182mm
  const maxY = 276;

  const mastheadRgb = hexToRgb(theme.mastheadBg);
  const mastheadTextRgb = hexToRgb(theme.mastheadText);
  const accentRgb = hexToRgb(theme.accent);
  const accentSoftRgb = hexToRgb(theme.accentSoft);
  const borderRgb = hexToRgb(theme.border);
  const textRgb = hexToRgb(theme.text);
  const mutedRgb = hexToRgb(theme.muted);
  const surfaceRgb = hexToRgb(theme.surface);
  const badgeTextRgb = hexToRgb(theme.badgeText);

  let y = margin;

  // Masthead Header
  const headerH = 34;
  doc.setFillColor(...mastheadRgb);
  doc.roundedRect(margin, y, contentW, headerH, 4, 4, 'F');

  doc.setTextColor(...mastheadTextRgb);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  const subLabel = sanitizePdfText(`${familyName.toUpperCase()} - N° ${issue.issueNumber}`);
  doc.text(subLabel, pageW / 2, y + 9, { align: 'center' });

  doc.setFont('times', 'bold');
  doc.setFontSize(18);
  const safeTitle = sanitizePdfText(issue.title).slice(0, 72);
  doc.text(safeTitle, pageW / 2, y + 19, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  const periodLabel = sanitizePdfText(
    `${formatMemoryDate(issue.periodStart, lang)} -> ${formatMemoryDate(issue.periodEnd, lang)} (${
      posts.length
    } ${
      lang === 'fr'
        ? posts.length > 1
          ? 'souvenirs'
          : 'souvenir'
        : posts.length === 1
          ? 'memory'
          : 'memories'
    })`,
  );
  doc.text(periodLabel, pageW / 2, y + 27, { align: 'center' });

  y += headerH + 6;

  // Editorial Note
  if (issue.editorialNote && issue.editorialNote.trim()) {
    const cleanNote = sanitizePdfText(issue.editorialNote);
    doc.setFont('times', 'italic');
    doc.setFontSize(10.5);
    const noteLines = doc.splitTextToSize(cleanNote, contentW - 14) as string[];
    const boxH = Math.max(16, 12 + noteLines.length * 4.8);

    doc.setFillColor(...accentSoftRgb);
    doc.roundedRect(margin, y, contentW, boxH, 3, 3, 'F');
    doc.setFillColor(...accentRgb);
    doc.rect(margin, y, 2.2, boxH, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...badgeTextRgb);
    doc.text(
      sanitizePdfText(lang === 'fr' ? 'LE MOT DE LA REDACTION' : 'EDITORIAL NOTE'),
      margin + 6,
      y + 5.5,
    );

    doc.setFont('times', 'italic');
    doc.setFontSize(10.5);
    doc.setTextColor(...textRgb);
    doc.text(noteLines, margin + 6, y + 11);

    y += boxH + 7;
  }

  const ensureSpace = (neededH: number, forceBreak = false) => {
    if (forceBreak || y + neededH > maxY) {
      doc.addPage();
      y = margin;
    }
  };

  for (const post of posts) {
    const contributor = contributorsById[post.authorProfileId];
    const authorName = sanitizePdfText(
      contributor
        ? `${contributor.name}${contributor.relationLabel ? ` (${contributor.relationLabel})` : ''}`
        : familyName,
    );
    const dateText = sanitizePdfText(formatMemoryDate(post.memoryDate, lang));
    const taggedNames = [
      ...post.taggedProfileIds.map((pid) => contributorsById[pid]?.name).filter(Boolean),
      ...(post.taggedGuestIds || []).map((gid) => guestsById[gid]?.name).filter(Boolean),
    ]
      .map((n) => sanitizePdfText(n || ''))
      .filter(Boolean);

    const metaLine = sanitizePdfText(
      `${authorName} - ${dateText}${
        post.fullPageFeature && post.mediaIds.length > 0
          ? lang === 'fr'
            ? ' [Pleine page]'
            : ' [Full Page]'
          : ''
      }`,
    );

    const safeCaption = sanitizePdfText(post.caption || '');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10.5);
    const captionLines = safeCaption
      ? (doc.splitTextToSize(safeCaption, contentW - 8) as string[])
      : [];

    const taggedLine =
      taggedNames.length > 0
        ? sanitizePdfText(`${lang === 'fr' ? 'Avec :' : 'With:'} ${taggedNames.join(', ')}`)
        : '';
    doc.setFontSize(8.5);
    const taggedLines = taggedLine
      ? (doc.splitTextToSize(taggedLine, contentW - 8) as string[])
      : [];

    if (post.mediaIds.length > 0) {
      const isFullPage = Boolean(post.fullPageFeature);
      const collageH = isFullPage ? 136.5 : 92;
      const textBlockH =
        10 + captionLines.length * 4.8 + (taggedLines.length > 0 ? taggedLines.length * 4 + 3 : 0);
      const cardH = collageH + textBlockH + 8;

      if (isFullPage) {
        if (y > 54) {
          ensureSpace(cardH, true);
        }
      } else {
        ensureSpace(cardH);
      }

      // Card container
      doc.setFillColor(255, 255, 255);
      doc.setDrawColor(...borderRgb);
      doc.setLineWidth(0.35);
      doc.roundedRect(margin, y, contentW, cardH, 3.5, 3.5, 'FD');

      const pad = 4;
      const innerX = margin + pad;
      const innerY = y + pad;
      const innerW = contentW - pad * 2;
      const tiles = getEffectivePostTileRects(post, innerX, innerY, innerW, collageH, 2.2);

      for (let i = 0; i < tiles.length; i++) {
        const tile = tiles[i];
        const mediaId = post.mediaIds[i];
        if (!mediaId) continue;

        const rasterized = await rasterizeMediaToJpeg(mediaId, {
          maxEdge: isFullPage ? 1400 : 1100,
          quality: isFullPage ? 0.86 : 0.84,
          targetAspect: tile.w / Math.max(1, tile.h),
          crop: post.mediaCrops?.[mediaId],
          variant: 'full',
        });

        if (rasterized) {
          doc.addImage(
            rasterized.dataUrl,
            'JPEG',
            tile.x,
            tile.y,
            tile.w,
            tile.h,
            undefined,
            'FAST',
          );
        } else {
          doc.setFillColor(...surfaceRgb);
          doc.rect(tile.x, tile.y, tile.w, tile.h, 'F');
        }
      }

      let cursorY = innerY + collageH + 6;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(...badgeTextRgb);
      doc.text(metaLine, innerX, cursorY);
      cursorY += 5.5;

      if (captionLines.length > 0) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10.5);
        doc.setTextColor(...textRgb);
        doc.text(captionLines, innerX, cursorY);
        cursorY += captionLines.length * 4.8 + 1.5;
      }

      if (taggedLines.length > 0) {
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(8.5);
        doc.setTextColor(...mutedRgb);
        doc.text(taggedLines, innerX, cursorY);
      }

      y += cardH + 6;
    } else {
      // Story-only card
      const storyH =
        16 + captionLines.length * 5.2 + (taggedLines.length > 0 ? taggedLines.length * 4 + 3 : 0);
      ensureSpace(storyH);

      doc.setFillColor(...surfaceRgb);
      doc.setDrawColor(...borderRgb);
      doc.setLineWidth(0.35);
      doc.roundedRect(margin, y, contentW, storyH, 3.5, 3.5, 'FD');

      doc.setFillColor(...accentRgb);
      doc.rect(margin, y, 2, storyH, 'F');

      let cursorY = y + 7;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(...badgeTextRgb);
      doc.text(metaLine, margin + 6, cursorY);
      cursorY += 6;

      if (captionLines.length > 0) {
        doc.setFont('times', 'normal');
        doc.setFontSize(11);
        doc.setTextColor(...textRgb);
        doc.text(captionLines, margin + 6, cursorY);
        cursorY += captionLines.length * 5.2 + 2;
      }

      if (taggedLines.length > 0) {
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(8.5);
        doc.setTextColor(...mutedRgb);
        doc.text(taggedLines, margin + 6, cursorY);
      }

      y += storyH + 6;
    }
  }

  // Page Footers
  const totalPages = doc.getNumberOfPages();
  const safeFooterTitle = sanitizePdfText(`${issue.title} - N° ${issue.issueNumber}`);
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setDrawColor(...borderRgb);
    doc.setLineWidth(0.25);
    doc.line(margin, pageH - 12, pageW - margin, pageH - 12);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...mutedRgb);
    doc.text(safeFooterTitle, margin, pageH - 7.5);
    doc.text(`Page ${i} / ${totalPages}`, pageW - margin, pageH - 7.5, { align: 'right' });
  }

  const blob = doc.output('blob');
  const filename = `familygazette-n${issue.issueNumber}-${(issue.periodEnd || 'edition').slice(
    0,
    10,
  )}.pdf`;
  return {
    blob,
    filename,
    byteSize: blob.size,
  };
}

export async function downloadGazettePdf(
  payload: ScopedGazettePayload,
  lang: UiLanguage,
): Promise<{ filename: string; byteSize: number }> {
  const { blob, filename, byteSize } = await buildGazettePdfBlob(payload, lang);
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1500);
  return { filename, byteSize };
}
