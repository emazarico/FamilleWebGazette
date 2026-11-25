import type { GazetteIssue } from '../types/family';

export function slugifyDriveSegment(
  input: string,
  fallback = 'Item',
  maxLen = 36,
): string {
  const normalized = String(input || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, maxLen)
    .replace(/-+$/, '');
  return normalized || fallback;
}

export interface BuildDrivePhotoPathParams {
  mediaId: string;
  memoryDate?: string;
  authorName?: string;
  mimeType?: string;
}

export interface DrivePhotoPathInfo {
  year: string;
  yearMonth: string;
  fileName: string;
  relativePath: string;
}

export function buildDrivePhotoPath(
  params: BuildDrivePhotoPathParams,
): DrivePhotoPathInfo {
  const rawDate = (params.memoryDate || '').slice(0, 10);
  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(rawDate)
    ? rawDate
    : new Date().toISOString().slice(0, 10);

  const year = validDate.slice(0, 4);
  const yearMonth = validDate.slice(0, 7);
  const authorSlug = slugifyDriveSegment(params.authorName || '', 'Famille', 24);
  const strippedId = String(params.mediaId || '')
    .replace(/^med-/, '')
    .replace(/[^A-Za-z0-9]/g, '');
  const shortId = (strippedId.slice(0, 8) || 'photo').toLowerCase();
  const ext = params.mimeType === 'image/jpeg' ? 'jpg' : 'webp';

  const fileName = `${validDate}_${authorSlug}_${shortId}.${ext}`;
  const relativePath = `Photos/${year}/${yearMonth}/${fileName}`;

  return {
    year,
    yearMonth,
    fileName,
    relativePath,
  };
}

export function buildDriveGazetteFilenames(
  issue: Pick<GazetteIssue, 'issueNumber' | 'title' | 'periodEnd'>,
): { pdfName: string; htmlName: string } {
  const rawEnd = (issue.periodEnd || '').slice(0, 7);
  const ym = /^\d{4}-\d{2}$/.test(rawEnd) ? rawEnd : new Date().toISOString().slice(0, 7);
  const paddedNum = String(Math.max(1, Math.round(issue.issueNumber || 1))).padStart(2, '0');
  const titleSlug = slugifyDriveSegment(issue.title || '', 'Gazette', 40);
  const baseName = `${ym}_N${paddedNum}_${titleSlug}`;

  return {
    pdfName: `${baseName}.pdf`,
    htmlName: `${baseName}.html`,
  };
}

export function buildDriveFileViewUrl(driveFileId: string): string {
  return `https://drive.google.com/file/d/${encodeURIComponent(driveFileId)}/view`;
}
