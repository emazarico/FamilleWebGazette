import { describe, expect, it } from 'vitest';
import type { CollageLayout, GazetteIssue, MemoryPost } from '../types/family';
import { createDemoFamilyDatabase } from '../utils/demoData';
import {
  buildGazetteSecretUrl,
  buildScopedGazettePayload,
  computeCropSourceRect,
  computeGazettePeriodRange,
  getCollageTileRects,
  getNextIssueNumber,
  parseGazetteRoute,
  sanitizePdfText,
  selectGazetteCandidatePosts,
  validateGazetteSecretAccess,
} from '../utils/gazette';

function makePost(overrides: Partial<MemoryPost> = {}): MemoryPost {
  return {
    id: 'p1',
    authorProfileId: 'prof-demo-erwan',
    kind: 'photo',
    mediaIds: ['med-demo-1'],
    collageLayout: 'single',
    caption: 'Souvenir de famille',
    memoryDate: '2026-11-15',
    taggedProfileIds: [],
    likedByProfileIds: [],
    includeInGazette: true,
    fullPageFeature: false,
    publishedIssueIds: [],
    createdAt: '2026-11-15T10:00:00.000Z',
    updatedAt: '2026-11-15T10:00:00.000Z',
    ...overrides,
  };
}

describe('gazette utilities', () => {
  it('selects Gazette-eligible posts chronologically while respecting date bounds and published flags', () => {
    const posts: MemoryPost[] = [
      makePost({ id: 'later', memoryDate: '2026-11-20', includeInGazette: true }),
      makePost({ id: 'earlier', memoryDate: '2026-11-05', includeInGazette: true }),
      makePost({ id: 'excluded', memoryDate: '2026-11-12', includeInGazette: false }),
      makePost({
        id: 'deleted',
        memoryDate: '2026-11-10',
        includeInGazette: true,
        deletedAt: '2026-11-11T00:00:00.000Z',
      }),
      makePost({
        id: 'already-pub',
        memoryDate: '2026-11-08',
        includeInGazette: true,
        publishedIssueIds: [1],
      }),
      makePost({ id: 'out-of-range', memoryDate: '2026-10-01', includeInGazette: true }),
    ];

    const queued = selectGazetteCandidatePosts(posts, {
      periodStart: '2026-11-01',
      periodEnd: '2026-11-30',
    });
    expect(queued.map((p) => p.id)).toEqual(['earlier', 'later']);

    const withRepublish = selectGazetteCandidatePosts(posts, {
      periodStart: '2026-11-01',
      periodEnd: '2026-11-30',
      includeAlreadyPublished: true,
    });
    expect(withRepublish.map((p) => p.id)).toEqual(['earlier', 'already-pub', 'later']);
  });

  it('builds and parses secret-key HTML and PDF URLs cleanly (including optional relay api)', () => {
    const htmlUrl = buildGazetteSecretUrl(
      'https://family.example.org/gazette/?ignored=1#hash',
      'gaz-42',
      'secretKey_ABC-123',
      'html',
    );
    expect(htmlUrl).toBe(
      'https://family.example.org/gazette/?view=gazette&issue=gaz-42&k=secretKey_ABC-123',
    );

    const parsedHtml = parseGazetteRoute(new URL(htmlUrl).search);
    expect(parsedHtml).toEqual({
      view: 'gazette',
      issueId: 'gaz-42',
      secretKey: 'secretKey_ABC-123',
      format: 'html',
    });

    const api = 'https://script.google.com/macros/s/relay123/exec';
    const pdfUrl = buildGazetteSecretUrl(
      'https://family.example.org/gazette/',
      'gaz-42',
      'secretKey_ABC-123',
      'pdf',
      api,
    );
    const parsedPdf = parseGazetteRoute(new URL(pdfUrl).search);
    expect(parsedPdf).toEqual({
      view: 'gazette',
      issueId: 'gaz-42',
      secretKey: 'secretKey_ABC-123',
      format: 'pdf',
      apiUrl: api,
    });

    expect(parseGazetteRoute('')).toBeNull();
    expect(parseGazetteRoute('?view=other&issue=gaz-1&k=abc')).toBeNull();
    expect(parseGazetteRoute('?view=gazette&issue=gaz-1')).toBeNull();
  });

  it('validates secret-key access against missing, wrong key, revoked, and expired states', () => {
    const baseIssue: GazetteIssue = {
      id: 'gaz-1',
      issueNumber: 1,
      title: 'Gazette N° 1',
      theme: 'editorial',
      periodStart: '2026-11-01',
      periodEnd: '2026-11-24',
      includedPostIds: ['post-1'],
      compiledByProfileId: 'prof-erwan',
      recipientEmails: [],
      secretKey: 'valid-secret-key',
      shareExpiresAt: '2026-12-01T00:00:00.000Z',
      shareRevoked: false,
      createdAt: '2026-11-24T00:00:00.000Z',
      updatedAt: '2026-11-24T00:00:00.000Z',
    };

    expect(
      validateGazetteSecretAccess(baseIssue, 'valid-secret-key', '2026-11-25T10:00:00.000Z'),
    ).toEqual({ ok: true });

    expect(validateGazetteSecretAccess(null, 'valid-secret-key')).toEqual({
      ok: false,
      reason: 'not_found',
    });
    expect(
      validateGazetteSecretAccess({ ...baseIssue, deletedAt: '2026-11-24T12:00:00.000Z' }, 'valid-secret-key'),
    ).toEqual({ ok: false, reason: 'not_found' });
    expect(validateGazetteSecretAccess(baseIssue, 'wrong-key')).toEqual({
      ok: false,
      reason: 'invalid_key',
    });
    expect(validateGazetteSecretAccess({ ...baseIssue, shareRevoked: true }, 'valid-secret-key')).toEqual({
      ok: false,
      reason: 'revoked',
    });
    expect(
      validateGazetteSecretAccess(baseIssue, 'valid-secret-key', '2026-12-02T00:00:00.000Z'),
    ).toEqual({ ok: false, reason: 'expired' });
  });

  it('isolates scoped Gazette payload without emails, PIN hashes, or private messages', () => {
    const db = createDemoFamilyDatabase();
    const issue: GazetteIssue = {
      ...db.gazettes[0],
      includedPostIds: ['post-demo-2', 'post-demo-1', 'nonexistent'],
    };

    const payload = buildScopedGazettePayload(db, issue);
    expect(payload.posts.map((p) => p.id)).toEqual(['post-demo-2', 'post-demo-1']);
    expect((payload as unknown as Record<string, unknown>).messages).toBeUndefined();

    const contributors = Object.values(payload.contributorsById);
    expect(contributors.length).toBeGreaterThan(0);
    for (const contributor of contributors) {
      const record = contributor as unknown as Record<string, unknown>;
      expect(record.email).toBeUndefined();
      expect(record.pinHash).toBeUndefined();
      expect(record.role).toBeUndefined();
    }
  });

  it('computes crop source rects, collage tile rects for all 8 layouts, periods, and sanitized PDF text', () => {
    const landscapeCropped = computeCropSourceRect(1600, 800, 1, { x: 100, y: 50, zoom: 2 });
    expect(landscapeCropped.sw).toBe(400);
    expect(landscapeCropped.sh).toBe(400);
    expect(landscapeCropped.sx).toBe(1200);
    expect(landscapeCropped.sy).toBe(200);

    const layouts: Array<[CollageLayout, number]> = [
      ['single', 1],
      ['two-col', 2],
      ['two-row', 2],
      ['three-mosaic', 3],
      ['three-top', 3],
      ['three-left', 3],
      ['four-grid', 4],
      ['four-hero', 4],
    ];
    for (const [layout, expectedCount] of layouts) {
      const rects = getCollageTileRects(layout, 10, 20, 180, 120, 2);
      expect(rects).toHaveLength(expectedCount);
      for (const rect of rects) {
        expect(rect.x).toBeGreaterThanOrEqual(10);
        expect(rect.y).toBeGreaterThanOrEqual(20);
        expect(rect.x + rect.w).toBeLessThanOrEqual(190.001);
        expect(rect.y + rect.h).toBeLessThanOrEqual(140.001);
      }
    }

    const range = computeGazettePeriodRange('this-month', [], '2026-11-24');
    expect(range).toEqual({ periodStart: '2026-11-01', periodEnd: '2026-11-24' });

    const nextNum = getNextIssueNumber({ lastCompiledIssueNumber: 2 }, [
      { ...createDemoFamilyDatabase().gazettes[0], issueNumber: 4 },
    ]);
    expect(nextNum).toBe(5);

    const cleaned = sanitizePdfText('Cœur joyeux 😊 — « Souvenir… » à l’école');
    expect(cleaned).toBe('Coeur joyeux - « Souvenir... » à l\'école');
  });
});
