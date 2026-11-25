import { describe, expect, it } from 'vitest';
import type { GazetteIssue, MemoryPost } from '../types/family';
import { createDemoFamilyDatabase } from '../utils/demoData';
import {
  buildGazetteEmailDigest,
  buildReminderEmailDigest,
  buildStandaloneGazetteHtml,
  EMAIL_HTML_MAX_BYTES,
} from '../utils/emailDigest';
import { buildScopedGazettePayload } from '../utils/gazette';

describe('emailDigest and standalone HTML builders', () => {
  it('builds a bilingual email digest with cid thumbnails, secret links, and XSS escaping', () => {
    const db = createDemoFamilyDatabase();
    db.posts[0].caption = '<script>alert("xss")</script> & Souvenir à la plage';
    const issue: GazetteIssue = {
      ...db.gazettes[0],
      title: 'Gazette <Spéciale> N° 2',
      editorialNote: 'Bonne lecture "les amis" & famille',
      includedPostIds: [db.posts[0].id, db.posts[1].id],
    };

    const payload = buildScopedGazettePayload(db, issue);
    const digest = buildGazetteEmailDigest({
      payload,
      lang: 'fr',
      htmlUrl: 'https://example.org/?view=gazette&issue=g1&k=sec1',
      pdfUrl: 'https://example.org/?view=gazette&issue=g1&k=sec1&format=pdf',
      thumbnailMode: 'cid',
    });

    expect(digest.html).toContain('cid:thumb_0');
    expect(digest.cidMediaIds.length).toBeGreaterThan(0);
    expect(digest.html).toContain('view=gazette&amp;issue=g1&amp;k=sec1');
    expect(digest.html).toContain('format=pdf');
    expect(digest.html).not.toContain('<script>');
    expect(digest.html).toContain('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
    expect(digest.byteSize).toBeLessThanOrEqual(EMAIL_HTML_MAX_BYTES);
    expect(digest.plainText).toContain('https://example.org/?view=gazette&issue=g1&k=sec1&format=pdf');
  });

  it('truncates preview cards automatically to stay under 80 KB HTML ceiling', () => {
    const db = createDemoFamilyDatabase();
    const bigCaption = 'A'.repeat(2400);
    const manyPosts: MemoryPost[] = Array.from({ length: 40 }, (_, i) => ({
      id: `bulk-${i}`,
      authorProfileId: db.profiles[0].id,
      kind: 'photo',
      mediaIds: [`med-${i}`],
      collageLayout: 'single',
      caption: `${i}: ${bigCaption}`,
      memoryDate: '2026-11-15',
      taggedProfileIds: [],
      likedByProfileIds: [],
      includeInGazette: true,
      fullPageFeature: false,
      publishedIssueIds: [],
      createdAt: '2026-11-15T10:00:00.000Z',
      updatedAt: '2026-11-15T10:00:00.000Z',
    }));
    db.posts = manyPosts;

    const issue: GazetteIssue = {
      ...db.gazettes[0],
      includedPostIds: manyPosts.map((p) => p.id),
    };
    const payload = buildScopedGazettePayload(db, issue);
    const digest = buildGazetteEmailDigest({
      payload,
      lang: 'en',
      htmlUrl: 'https://example.org/?view=gazette&issue=g-bulk&k=sec',
      pdfUrl: 'https://example.org/?view=gazette&issue=g-bulk&k=sec&format=pdf',
      thumbnailMode: 'cid',
    });

    expect(digest.byteSize).toBeLessThanOrEqual(EMAIL_HTML_MAX_BYTES);
    expect(digest.omittedPreviewCount).toBeGreaterThan(0);
    expect(digest.includedPreviewCount).toBeLessThan(40);
    expect(digest.html).toContain('more memories');
  });

  it('renders localized reminder emails and standalone printable HTML documents', () => {
    const frReminder = buildReminderEmailDigest({
      familyName: 'Famille Mazarico',
      gazetteTitle: 'La Gazette',
      nextPublishDate: '2026-12-01',
      queuedCount: 5,
      appUrl: 'https://example.org/',
      lang: 'fr',
    });
    expect(frReminder.subject).toContain('La Gazette');
    expect(frReminder.html).toContain('5 souvenirs');

    const enReminder = buildReminderEmailDigest({
      familyName: 'Mazarico Family',
      gazetteTitle: 'Family Gazette',
      nextPublishDate: '2026-12-01',
      queuedCount: 1,
      appUrl: 'https://example.org/',
      lang: 'en',
    });
    expect(enReminder.html).toContain('1 memory');

    const db = createDemoFamilyDatabase();
    const payload = buildScopedGazettePayload(db, db.gazettes[0]);
    const standalone = buildStandaloneGazetteHtml({
      payload,
      lang: 'fr',
      dataUrlsByMediaId: {},
    });
    expect(standalone).toContain('<!doctype html>');
    expect(standalone).toContain('@media print');
    expect(standalone).toContain(db.gazettes[0].title);
  });
});
