import { describe, expect, it } from 'vitest';
import type { FamilyDatabase, FamilyProfile } from '../types/family';
import { createEmptyDatabase } from '../utils/demoData';
import { buildActivityFeed, filterActivityItems } from '../utils/activity';

function makeProfile(id: string, name: string, lastSeenActivityAt?: string): FamilyProfile {
  return {
    id,
    name,
    language: 'fr',
    avatarEmoji: '🙂',
    avatarTheme: 'teal',
    role: 'member',
    pinHash: null,
    lastSeenActivityAt,
    createdAt: '2026-11-01T08:00:00.000Z',
    updatedAt: '2026-11-01T08:00:00.000Z',
  };
}

describe('activity feed utilities', () => {
  it('builds derived activity scoped to mentions, comments on relevant posts, recipient messages, and reminder window', () => {
    const db: FamilyDatabase = createEmptyDatabase();
    db.settings.gazetteCadence = 'monthly';
    db.settings.publishDayOfMonth = 28;
    db.settings.reminderDaysBefore = 3;

    const erwan = makeProfile('prof-erwan', 'Erwan', '2026-11-20T00:00:00.000Z');
    const helene = makeProfile('prof-helene', 'Hélène');
    const sarah = makeProfile('prof-sarah', 'Aunt Sarah');
    db.profiles = [erwan, helene, sarah];

    db.posts = [
      {
        id: 'post-own',
        authorProfileId: 'prof-erwan',
        kind: 'photo',
        mediaIds: ['med-own'],
        collageLayout: 'single',
        caption: 'Mon souvenir',
        memoryDate: '2026-11-21',
        taggedProfileIds: [],
        likedByProfileIds: [],
        includeInGazette: true,
        fullPageFeature: false,
        publishedIssueIds: [],
        createdAt: '2026-11-21T10:00:00.000Z',
        updatedAt: '2026-11-21T10:00:00.000Z',
      },
      {
        id: 'post-tagged',
        authorProfileId: 'prof-helene',
        kind: 'photo',
        mediaIds: ['med-tag'],
        collageLayout: 'single',
        caption: 'Avec Erwan au parc',
        memoryDate: '2026-11-21',
        taggedProfileIds: ['prof-erwan'],
        likedByProfileIds: [],
        includeInGazette: true,
        fullPageFeature: false,
        publishedIssueIds: [],
        createdAt: '2026-11-21T12:00:00.000Z',
        updatedAt: '2026-11-21T12:00:00.000Z',
      },
      {
        id: 'post-other',
        authorProfileId: 'prof-sarah',
        kind: 'story',
        mediaIds: [],
        collageLayout: 'single',
        caption: 'Histoire ancienne déjà vue',
        memoryDate: '2026-11-18',
        taggedProfileIds: [],
        likedByProfileIds: [],
        includeInGazette: true,
        fullPageFeature: false,
        publishedIssueIds: [],
        createdAt: '2026-11-18T12:00:00.000Z',
        updatedAt: '2026-11-18T12:00:00.000Z',
      },
    ];

    db.comments = [
      {
        id: 'cmt-on-own',
        postId: 'post-own',
        authorProfileId: 'prof-helene',
        body: 'Super photo !',
        createdAt: '2026-11-21T13:00:00.000Z',
        updatedAt: '2026-11-21T13:00:00.000Z',
      },
      {
        id: 'cmt-on-unrelated',
        postId: 'post-other',
        authorProfileId: 'prof-helene',
        body: 'Commentaire sur autre post',
        createdAt: '2026-11-21T14:00:00.000Z',
        updatedAt: '2026-11-21T14:00:00.000Z',
      },
    ];

    db.messages = [
      {
        id: 'msg-for-erwan',
        senderProfileId: 'prof-helene',
        recipientProfileIds: ['prof-erwan'],
        subject: 'Surprise',
        body: 'Mot pour Erwan',
        readByProfileIds: ['prof-helene'],
        createdAt: '2026-11-22T09:00:00.000Z',
        updatedAt: '2026-11-22T09:00:00.000Z',
      },
      {
        id: 'msg-private-other',
        senderProfileId: 'prof-helene',
        recipientProfileIds: ['prof-sarah'],
        subject: 'Secret',
        body: 'Mot entre Hélène et Sarah uniquement',
        readByProfileIds: ['prof-helene'],
        createdAt: '2026-11-22T10:00:00.000Z',
        updatedAt: '2026-11-22T10:00:00.000Z',
      },
    ];

    db.messageReplies = [
      {
        id: 'rep-1',
        messageId: 'msg-for-erwan',
        authorProfileId: 'prof-helene',
        body: 'N’oublie pas demain',
        createdAt: '2026-11-22T11:00:00.000Z',
        updatedAt: '2026-11-22T11:00:00.000Z',
      },
      {
        id: 'rep-secret',
        messageId: 'msg-private-other',
        authorProfileId: 'prof-sarah',
        body: 'Bien reçu',
        createdAt: '2026-11-22T12:00:00.000Z',
        updatedAt: '2026-11-22T12:00:00.000Z',
      },
    ];

    // Inside reminder window (Nov 26 for Nov 28 publish with 3 days ahead)
    const items = buildActivityFeed(db, erwan, '2026-11-26T10:00:00.000Z');
    const ids = items.map((i) => i.id);

    // Excludes own post, unrelated comment, and non-recipient private message/reply
    expect(ids).not.toContain('act-post-post-own');
    expect(ids).not.toContain('act-cmt-cmt-on-unrelated');
    expect(ids).not.toContain('act-msg-msg-private-other');
    expect(ids).not.toContain('act-rep-rep-secret');

    // Includes tagged post, comment on own post, older post (read), visible DM + reply, and gazette reminder
    expect(ids).toContain('act-post-post-tagged');
    expect(ids).toContain('act-post-post-other');
    expect(ids).toContain('act-cmt-cmt-on-own');
    expect(ids).toContain('act-msg-msg-for-erwan');
    expect(ids).toContain('act-rep-rep-1');
    expect(items.some((i) => i.kind === 'gazette_reminder')).toBe(true);

    // Unread check against lastSeenActivityAt ('2026-11-20T00:00:00.000Z')
    const olderItem = items.find((i) => i.id === 'act-post-post-other');
    const taggedItem = items.find((i) => i.id === 'act-post-post-tagged');
    expect(olderItem?.unread).toBe(false);
    expect(taggedItem?.unread).toBe(true);

    // Filter buckets
    expect(filterActivityItems(items, 'mentions').map((i) => i.kind)).toEqual(
      expect.arrayContaining(['tagged_in_post', 'comment']),
    );
    expect(filterActivityItems(items, 'messages').map((i) => i.targetMessageId)).toEqual([
      'msg-for-erwan',
      'msg-for-erwan',
    ]);
    expect(filterActivityItems(items, 'gazette').map((i) => i.kind)).toEqual([
      'gazette_reminder',
    ]);

    // Outside reminder window (Nov 10)
    const outsideWindow = buildActivityFeed(db, erwan, '2026-11-10T10:00:00.000Z');
    expect(outsideWindow.some((i) => i.kind === 'gazette_reminder')).toBe(false);
  });
});
