import type {
  AvatarTheme,
  CollageLayout,
  FamilyDatabase,
  FamilySettings,
  GazetteIssue,
  GazetteTheme,
  MemoryPost,
  PhotoCrop,
} from '../types/family';
import { clampPhotoCrop } from './collage';
import { normalizeCollageLayout } from './feed';
import { normalizeAppsScriptUrl } from './syncUrls';

export type GazettePeriodPreset =
  | 'since-last'
  | 'this-month'
  | 'last-30'
  | 'all-queued'
  | 'custom';

export type GazetteExpiryPreset = '7d' | '30d' | '90d' | 'permanent';

export interface GazetteThemeTokens {
  id: GazetteTheme;
  mastheadBg: string;
  mastheadText: string;
  accent: string;
  accentSoft: string;
  surface: string;
  cardBg: string;
  border: string;
  text: string;
  muted: string;
  badgeBg: string;
  badgeText: string;
}

export const GAZETTE_THEME_STYLES: Record<GazetteTheme, GazetteThemeTokens> = {
  editorial: {
    id: 'editorial',
    mastheadBg: '#1B5E7C',
    mastheadText: '#FFFFFF',
    accent: '#D97706',
    accentSoft: '#FEF3C7',
    surface: '#FAF8F5',
    cardBg: '#FFFFFF',
    border: '#E7E5E4',
    text: '#1C1917',
    muted: '#57534E',
    badgeBg: '#E6F4F8',
    badgeText: '#1B5E7C',
  },
  classic: {
    id: 'classic',
    mastheadBg: '#292524',
    mastheadText: '#FAF7F2',
    accent: '#B45309',
    accentSoft: '#FDE68A',
    surface: '#FBF9F4',
    cardBg: '#FFFFFF',
    border: '#D6D3D1',
    text: '#1C1917',
    muted: '#57534E',
    badgeBg: '#F5F5F4',
    badgeText: '#44403C',
  },
  keepsake: {
    id: 'keepsake',
    mastheadBg: '#881337',
    mastheadText: '#FFF1F2',
    accent: '#E11D48',
    accentSoft: '#FFE4E6',
    surface: '#FFF9FA',
    cardBg: '#FFFFFF',
    border: '#FECDD3',
    text: '#1F2937',
    muted: '#6B7280',
    badgeBg: '#FFE4E6',
    badgeText: '#9F1239',
  },
};

function todayUtcIsoDate(now?: Date): string {
  const d = now || new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addCalendarDaysIso(isoDate: string, deltaDays: number): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate.trim());
  if (!match) return isoDate;
  const utc = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  const shifted = new Date(utc + deltaDays * 86_400_000);
  const y = shifted.getUTCFullYear();
  const m = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  const d = String(shifted.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function computeGazettePeriodRange(
  preset: GazettePeriodPreset,
  gazettes: GazetteIssue[],
  todayIso?: string,
  queuedPosts?: MemoryPost[],
): { periodStart: string; periodEnd: string } {
  const end = (todayIso || todayUtcIsoDate()).slice(0, 10);

  if (preset === 'this-month') {
    return { periodStart: `${end.slice(0, 7)}-01`, periodEnd: end };
  }

  if (preset === 'last-30' || preset === 'custom') {
    return { periodStart: addCalendarDaysIso(end, -30), periodEnd: end };
  }

  if (preset === 'all-queued') {
    const validDates = (queuedPosts || [])
      .filter((p) => !p.deletedAt && p.includeInGazette && (p.publishedIssueIds || []).length === 0)
      .map((p) => p.memoryDate.slice(0, 10))
      .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
      .sort();
    const earliest = validDates[0] || addCalendarDaysIso(end, -30);
    return {
      periodStart: earliest <= end ? earliest : end,
      periodEnd: end,
    };
  }

  // 'since-last'
  const activeIssues = gazettes
    .filter((g) => !g.deletedAt && /^\d{4}-\d{2}-\d{2}$/.test((g.periodEnd || '').slice(0, 10)))
    .slice()
    .sort((a, b) => {
      const endCmp = b.periodEnd.localeCompare(a.periodEnd);
      if (endCmp !== 0) return endCmp;
      return (b.issueNumber || 0) - (a.issueNumber || 0);
    });

  if (activeIssues.length > 0) {
    const dayAfterLast = addCalendarDaysIso(activeIssues[0].periodEnd.slice(0, 10), 1);
    return {
      periodStart: dayAfterLast <= end ? dayAfterLast : end,
      periodEnd: end,
    };
  }

  return { periodStart: addCalendarDaysIso(end, -30), periodEnd: end };
}

export function computeShareExpiryIso(
  preset: GazetteExpiryPreset,
  now: Date = new Date(),
): string | undefined {
  if (preset === 'permanent') return undefined;
  const days = preset === '7d' ? 7 : preset === '30d' ? 30 : 90;
  return new Date(now.getTime() + days * 86_400_000).toISOString();
}

export interface SelectGazetteCandidatesOptions {
  periodStart?: string;
  periodEnd?: string;
  includeAlreadyPublished?: boolean;
}

/**
 * Selects memories eligible for Gazette compilation.
 * Strictly ignores private messages and respects includeInGazette + deletedAt.
 */
export function selectGazetteCandidatePosts(
  posts: MemoryPost[],
  options: SelectGazetteCandidatesOptions = {},
): MemoryPost[] {
  const { periodStart, periodEnd, includeAlreadyPublished = false } = options;

  return posts
    .filter((post) => {
      if (post.deletedAt || !post.includeInGazette) return false;
      if (!includeAlreadyPublished && (post.publishedIssueIds || []).length > 0) {
        return false;
      }
      const dateKey = (post.memoryDate || '').slice(0, 10);
      if (periodStart && dateKey && dateKey < periodStart) return false;
      if (periodEnd && dateKey && dateKey > periodEnd) return false;
      return true;
    })
    .slice()
    .sort((a, b) => {
      const dateCmp = (a.memoryDate || '').localeCompare(b.memoryDate || '');
      if (dateCmp !== 0) return dateCmp;
      return (a.createdAt || '').localeCompare(b.createdAt || '');
    });
}

export function getNextIssueNumber(
  settings: Pick<FamilySettings, 'lastCompiledIssueNumber'>,
  gazettes: GazetteIssue[],
): number {
  const activeMax = gazettes
    .filter((g) => !g.deletedAt)
    .reduce((max, g) => Math.max(max, g.issueNumber || 0), 0);
  return Math.max(settings.lastCompiledIssueNumber || 0, activeMax, 0) + 1;
}

export function buildGazetteSecretUrl(
  baseOriginAndPath: string,
  issueId: string,
  secretKey: string,
  format: 'html' | 'pdf' = 'html',
  apiUrl?: string,
): string {
  const cleanBase = baseOriginAndPath.split('#')[0].split('?')[0];
  const params = new URLSearchParams();
  params.set('view', 'gazette');
  params.set('issue', issueId);
  params.set('k', secretKey);
  if (format === 'pdf') {
    params.set('format', 'pdf');
  }
  const normalizedApi = apiUrl ? normalizeAppsScriptUrl(apiUrl) : '';
  if (normalizedApi) {
    params.set('api', normalizedApi);
  }
  return `${cleanBase}?${params.toString()}`;
}

export interface GazetteRouteParams {
  view: 'gazette';
  issueId: string;
  secretKey: string;
  format: 'html' | 'pdf';
  apiUrl?: string;
}

export function parseGazetteRoute(search: string): GazetteRouteParams | null {
  const trimmed = search.trim();
  if (!trimmed) return null;
  const query = trimmed.startsWith('?') ? trimmed.slice(1) : trimmed;
  const params = new URLSearchParams(query);
  if (params.get('view') !== 'gazette') return null;

  const issueId = (params.get('issue') || '').trim();
  const secretKey = (params.get('k') || '').trim();
  if (!issueId || !secretKey) return null;

  const apiUrl = normalizeAppsScriptUrl(params.get('api') || '') || undefined;

  return {
    view: 'gazette',
    issueId,
    secretKey,
    format: params.get('format') === 'pdf' ? 'pdf' : 'html',
    ...(apiUrl ? { apiUrl } : {}),
  };
}

export type GazetteAccessResult =
  | { ok: true }
  | { ok: false; reason: 'not_found' | 'invalid_key' | 'revoked' | 'expired' };

export function validateGazetteSecretAccess(
  issue: GazetteIssue | undefined | null,
  secretKey: string,
  nowIso: string = new Date().toISOString(),
): GazetteAccessResult {
  if (!issue || issue.deletedAt) {
    return { ok: false, reason: 'not_found' };
  }
  if (!secretKey || !issue.secretKey || issue.secretKey !== secretKey) {
    return { ok: false, reason: 'invalid_key' };
  }
  if (issue.shareRevoked) {
    return { ok: false, reason: 'revoked' };
  }
  if (issue.shareExpiresAt) {
    const expMs = Date.parse(issue.shareExpiresAt);
    const nowMs = Date.parse(nowIso);
    if (!Number.isNaN(expMs) && !Number.isNaN(nowMs)) {
      if (nowMs > expMs) return { ok: false, reason: 'expired' };
    } else if (nowIso > issue.shareExpiresAt) {
      return { ok: false, reason: 'expired' };
    }
  }
  return { ok: true };
}

export interface ScopedContributor {
  id: string;
  name: string;
  relationLabel?: string;
  avatarEmoji: string;
  avatarTheme: AvatarTheme;
}

export interface ScopedGuest {
  id: string;
  name: string;
  relationLabel?: string;
  avatarEmoji: string;
}

export interface ScopedGazettePayload {
  issue: GazetteIssue;
  familyName: string;
  gazetteSubtitle?: string;
  posts: MemoryPost[];
  contributorsById: Record<string, ScopedContributor>;
  guestsById: Record<string, ScopedGuest>;
}

/**
 * Extracts a strictly isolated payload for a single Gazette issue.
 * Only curated post records and non-sensitive contributor display names are included;
 * emails, PIN hashes, member directories, and private messages are never copied.
 */
export function buildScopedGazettePayload(
  db: FamilyDatabase,
  issue: GazetteIssue,
): ScopedGazettePayload {
  const postsById = new Map(db.posts.map((p) => [p.id, p]));
  const profilesById = new Map(db.profiles.map((p) => [p.id, p]));
  const rememberedById = new Map((db.rememberedPeople || []).map((g) => [g.id, g]));

  const posts: MemoryPost[] = [];
  const contributorsById: Record<string, ScopedContributor> = {};
  const guestsById: Record<string, ScopedGuest> = {};

  const attachContributor = (profileId: string) => {
    if (!profileId || contributorsById[profileId]) return;
    const p = profilesById.get(profileId);
    if (!p) return;
    contributorsById[profileId] = {
      id: p.id,
      name: p.name,
      relationLabel: p.relationLabel,
      avatarEmoji: p.avatarEmoji,
      avatarTheme: p.avatarTheme,
    };
  };

  for (const postId of issue.includedPostIds) {
    const post = postsById.get(postId);
    if (!post || post.deletedAt) continue;
    posts.push(post);

    attachContributor(post.authorProfileId);
    for (const taggedId of post.taggedProfileIds) {
      attachContributor(taggedId);
    }
    for (const guestId of post.taggedGuestIds || []) {
      if (guestsById[guestId]) continue;
      const g = rememberedById.get(guestId);
      if (g) {
        guestsById[guestId] = {
          id: g.id,
          name: g.name,
          relationLabel: g.relationLabel,
          avatarEmoji: g.avatarEmoji,
        };
      }
    }
  }

  return {
    issue,
    familyName: db.settings.familyName,
    gazetteSubtitle: db.settings.gazetteSubtitle,
    posts,
    contributorsById,
    guestsById,
  };
}

export function computeCropSourceRect(
  srcW: number,
  srcH: number,
  targetAspect: number,
  crop?: Partial<PhotoCrop> | null,
): { sx: number; sy: number; sw: number; sh: number } {
  const safeSrcW = Math.max(1, srcW);
  const safeSrcH = Math.max(1, srcH);
  const safeAspect = Math.max(0.05, targetAspect);
  const { x, y, zoom } = clampPhotoCrop(crop);

  let baseW: number;
  let baseH: number;
  if (safeSrcW / safeSrcH > safeAspect) {
    baseH = safeSrcH;
    baseW = safeSrcH * safeAspect;
  } else {
    baseW = safeSrcW;
    baseH = safeSrcW / safeAspect;
  }

  const sw = Math.min(safeSrcW, baseW / zoom);
  const sh = Math.min(safeSrcH, baseH / zoom);
  const maxOffsetX = Math.max(0, safeSrcW - sw);
  const maxOffsetY = Math.max(0, safeSrcH - sh);

  const sx = Math.min(maxOffsetX, Math.max(0, (maxOffsetX * x) / 100));
  const sy = Math.min(maxOffsetY, Math.max(0, (maxOffsetY * y) / 100));

  return { sx, sy, sw, sh };
}

export interface TileRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function getCollageTileRects(
  layout: CollageLayout,
  x: number,
  y: number,
  w: number,
  h: number,
  gap: number,
): TileRect[] {
  const safeGap = Math.max(0, gap);
  const colW = Math.max(1, (w - safeGap) / 2);
  const rowH = Math.max(1, (h - safeGap) / 2);

  if (layout === 'single') {
    return [{ x, y, w, h }];
  }

  if (layout === 'two-col') {
    return [
      { x, y, w: colW, h },
      { x: x + colW + safeGap, y, w: colW, h },
    ];
  }

  if (layout === 'two-row') {
    return [
      { x, y, w, h: rowH },
      { x, y: y + rowH + safeGap, w, h: rowH },
    ];
  }

  if (layout === 'three-mosaic') {
    return [
      { x, y, w: colW, h: rowH },
      { x: x + colW + safeGap, y, w: colW, h: rowH },
      { x, y: y + rowH + safeGap, w, h: rowH },
    ];
  }

  if (layout === 'three-top') {
    return [
      { x, y, w, h: rowH },
      { x, y: y + rowH + safeGap, w: colW, h: rowH },
      { x: x + colW + safeGap, y: y + rowH + safeGap, w: colW, h: rowH },
    ];
  }

  if (layout === 'three-left') {
    return [
      { x, y, w: colW, h },
      { x: x + colW + safeGap, y, w: colW, h: rowH },
      { x: x + colW + safeGap, y: y + rowH + safeGap, w: colW, h: rowH },
    ];
  }

  if (layout === 'four-hero') {
    const colUnit = Math.max(1, (w - 2 * safeGap) / 3);
    const rowUnit = Math.max(1, (h - 2 * safeGap) / 3);
    const rightX = x + 2 * (colUnit + safeGap);
    return [
      { x, y, w: 2 * colUnit + safeGap, h },
      { x: rightX, y, w: colUnit, h: rowUnit },
      { x: rightX, y: y + rowUnit + safeGap, w: colUnit, h: rowUnit },
      { x: rightX, y: y + 2 * (rowUnit + safeGap), w: colUnit, h: rowUnit },
    ];
  }

  // 'four-grid'
  return [
    { x, y, w: colW, h: rowH },
    { x: x + colW + safeGap, y, w: colW, h: rowH },
    { x, y: y + rowH + safeGap, w: colW, h: rowH },
    { x: x + colW + safeGap, y: y + rowH + safeGap, w: colW, h: rowH },
  ];
}

export function getEffectivePostTileRects(
  post: Pick<MemoryPost, 'mediaIds' | 'collageLayout'>,
  x: number,
  y: number,
  w: number,
  h: number,
  gap: number,
): TileRect[] {
  const effective = normalizeCollageLayout(post.mediaIds.length, post.collageLayout);
  const count = Math.min(4, post.mediaIds.length);
  return getCollageTileRects(effective, x, y, w, h, gap).slice(0, count);
}

/**
 * Normalizes text for jsPDF built-in Helvetica / Times WinAnsi encoding
 * while preserving accented French letters (àâäéèêëîïôöùûüçÀÂÄÉÈÊËÎÏÔÖÙÛÜÇ«»).
 */
export function sanitizePdfText(input: string): string {
  if (!input) return '';
  const replaced = input
    .replace(/\r\n?/g, '\n')
    .replace(/œ/g, 'oe')
    .replace(/Œ/g, 'OE')
    .replace(/æ/g, 'ae')
    .replace(/Æ/g, 'AE')
    .replace(/[‘’‚]/g, "'")
    .replace(/[“”„]/g, '"')
    .replace(/…/g, '...')
    .replace(/[–—−]/g, '-')
    .replace(/→/g, '->')
    .replace(/[•·]/g, '-')
    .replace(/\u202F|\u00A0/g, ' ');

  let out = '';
  for (const ch of replaced) {
    const code = ch.codePointAt(0) ?? 0;
    if (
      ch === '\n' ||
      (code >= 0x0020 && code <= 0x007e) ||
      (code >= 0x00a0 && code <= 0x00ff)
    ) {
      out += ch;
    }
  }

  return out
    .split('\n')
    .map((line) => line.replace(/[ \t]{2,}/g, ' ').trim())
    .join('\n')
    .trim();
}
