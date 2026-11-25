import { describe, expect, it } from 'vitest';
import type {
  FamilyDatabase,
  GazetteIssue,
  GazetteSubscriber,
  MemoryPost,
  MessageReply,
  PostComment,
  PrivateMessage,
  RememberedPerson,
} from '../types/family';
import { createEmptyDatabase } from '../utils/demoData';
import { mergeDatabases } from '../utils/merge';

function makePost(id: string, updatedAt: string, caption: string, deletedAt?: string | null): MemoryPost {
  return {
    id,
    authorProfileId: 'prof-1',
    kind: 'story',
    mediaIds: [],
    collageLayout: 'single',
    caption,
    memoryDate: '2026-11-20',
    taggedProfileIds: [],
    likedByProfileIds: [],
    includeInGazette: true,
    fullPageFeature: false,
    publishedIssueIds: [],
    createdAt: '2026-11-20T10:00:00.000Z',
    updatedAt,
    deletedAt,
  };
}

describe('mergeDatabases (LWW + soft-delete tombstones)', () => {
  it('picks newest updatedAt record across local and remote snapshots', () => {
    const local: FamilyDatabase = createEmptyDatabase();
    local.posts = [
      makePost('p1', '2026-11-20T12:00:00.000Z', 'Local newer caption'),
      makePost('p2', '2026-11-20T09:00:00.000Z', 'Local older caption'),
    ];

    const remote: FamilyDatabase = createEmptyDatabase();
    remote.posts = [
      makePost('p1', '2026-11-20T11:00:00.000Z', 'Remote older caption'),
      makePost('p2', '2026-11-20T13:00:00.000Z', 'Remote newer caption'),
      makePost('p3', '2026-11-20T14:00:00.000Z', 'Remote only post'),
    ];

    const merged = mergeDatabases(local, remote);
    const byId = new Map(merged.posts.map((p) => [p.id, p]));
    expect(byId.get('p1')?.caption).toBe('Local newer caption');
    expect(byId.get('p2')?.caption).toBe('Remote newer caption');
    expect(byId.get('p3')?.caption).toBe('Remote only post');
  });

  it('propagates deletedAt tombstones and merges rememberedPeople, messages, messageReplies, gazettes, and subscribers cleanly', () => {
    const local = createEmptyDatabase();
    local.posts = [makePost('p1', '2026-11-20T10:00:00.000Z', 'Active locally')];

    const guestLocal: RememberedPerson = {
      id: 'g1',
      name: 'Léo',
      avatarEmoji: '🦁',
      avatarTheme: 'amber',
      createdAt: '2026-11-20T10:00:00.000Z',
      updatedAt: '2026-11-20T12:00:00.000Z',
    };
    const guestRemote: RememberedPerson = {
      ...guestLocal,
      upgradedToProfileId: 'prof-leo',
      updatedAt: '2026-11-20T15:00:00.000Z',
      deletedAt: '2026-11-20T15:00:00.000Z',
    };
    local.rememberedPeople = [guestLocal];

    const remote = createEmptyDatabase();
    remote.rememberedPeople = [guestRemote];
    remote.posts = [
      makePost('p1', '2026-11-20T15:00:00.000Z', 'Active locally', '2026-11-20T15:00:00.000Z'),
    ];

    const cLocal: PostComment = {
      id: 'c1',
      postId: 'p1',
      authorProfileId: 'prof-1',
      body: 'Deleted locally',
      createdAt: '2026-11-20T10:00:00.000Z',
      updatedAt: '2026-11-20T16:00:00.000Z',
      deletedAt: '2026-11-20T16:00:00.000Z',
    };
    const cRemote: PostComment = {
      ...cLocal,
      updatedAt: '2026-11-20T11:00:00.000Z',
      deletedAt: null,
    };
    local.comments = [cLocal];
    remote.comments = [cRemote];

    const msgLocal: PrivateMessage = {
      id: 'msg-1',
      senderProfileId: 'prof-helene',
      recipientProfileIds: ['prof-erwan'],
      subject: 'Ancien',
      body: 'Message initial',
      readByProfileIds: ['prof-helene'],
      createdAt: '2026-11-20T10:00:00.000Z',
      updatedAt: '2026-11-20T11:00:00.000Z',
    };
    const msgRemote: PrivateMessage = {
      ...msgLocal,
      readByProfileIds: ['prof-helene', 'prof-erwan'],
      updatedAt: '2026-11-20T17:00:00.000Z',
    };
    local.messages = [msgLocal];
    remote.messages = [msgRemote];

    const replyLocal: MessageReply = {
      id: 'mrep-1',
      messageId: 'msg-1',
      authorProfileId: 'prof-erwan',
      body: 'Réponse supprimée localement',
      createdAt: '2026-11-20T12:00:00.000Z',
      updatedAt: '2026-11-20T18:00:00.000Z',
      deletedAt: '2026-11-20T18:00:00.000Z',
    };
    const replyRemote: MessageReply = {
      ...replyLocal,
      updatedAt: '2026-11-20T12:30:00.000Z',
      deletedAt: null,
    };
    local.messageReplies = [replyLocal];
    remote.messageReplies = [replyRemote];

    const gazLocal: GazetteIssue = {
      id: 'gaz-1',
      issueNumber: 1,
      title: 'Gazette N° 1',
      theme: 'editorial',
      periodStart: '2026-11-01',
      periodEnd: '2026-11-20',
      includedPostIds: ['p1'],
      compiledByProfileId: 'prof-1',
      recipientEmails: [],
      secretKey: 'secret-1',
      shareRevoked: false,
      createdAt: '2026-11-20T10:00:00.000Z',
      updatedAt: '2026-11-20T10:00:00.000Z',
    };
    const gazRemote: GazetteIssue = {
      ...gazLocal,
      shareRevoked: true,
      deletedAt: '2026-11-20T19:00:00.000Z',
      updatedAt: '2026-11-20T19:00:00.000Z',
    };
    local.gazettes = [gazLocal];
    remote.gazettes = [gazRemote];

    const subLocal: GazetteSubscriber = {
      id: 'sub-1',
      name: 'Oncle Paul',
      email: 'paul@famille.example',
      language: 'fr',
      cadence: 'monthly',
      deliveryMode: 'digest_and_links',
      active: true,
      createdAt: '2026-11-20T10:00:00.000Z',
      updatedAt: '2026-11-20T20:00:00.000Z',
    };
    const subRemote: GazetteSubscriber = {
      ...subLocal,
      active: false,
      updatedAt: '2026-11-20T12:00:00.000Z',
    };
    local.subscribers = [subLocal];
    remote.subscribers = [subRemote];

    const merged = mergeDatabases(local, remote);
    expect(merged.posts[0]?.deletedAt).toBe('2026-11-20T15:00:00.000Z');
    expect(merged.comments[0]?.deletedAt).toBe('2026-11-20T16:00:00.000Z');
    expect(merged.rememberedPeople[0]?.upgradedToProfileId).toBe('prof-leo');
    expect(merged.rememberedPeople[0]?.deletedAt).toBe('2026-11-20T15:00:00.000Z');
    expect(merged.messages[0]?.readByProfileIds).toEqual(['prof-helene', 'prof-erwan']);
    expect(merged.messageReplies[0]?.deletedAt).toBe('2026-11-20T18:00:00.000Z');
    expect(merged.gazettes[0]?.shareRevoked).toBe(true);
    expect(merged.gazettes[0]?.deletedAt).toBe('2026-11-20T19:00:00.000Z');
    expect(merged.subscribers[0]?.active).toBe(true);
  });
});
