import { describe, expect, it } from 'vitest';
import type { FamilyProfile, MessageReply, PrivateMessage } from '../types/family';
import { createDemoFamilyDatabase } from '../utils/demoData';
import {
  countUnreadMessages,
  filterVisibleMessages,
  getMessageLatestTimestamp,
  isMessageUnread,
  isMessageVisibleToProfile,
} from '../utils/messages';

function makeProfile(id: string, name: string): FamilyProfile {
  return {
    id,
    name,
    language: 'fr',
    avatarEmoji: '🙂',
    avatarTheme: 'teal',
    role: 'member',
    pinHash: null,
    createdAt: '2026-11-01T10:00:00.000Z',
    updatedAt: '2026-11-01T10:00:00.000Z',
  };
}

function makeMessage(overrides: Partial<PrivateMessage> = {}): PrivateMessage {
  return {
    id: 'm1',
    senderProfileId: 'p-erwan',
    recipientProfileIds: ['p-sarah'],
    subject: 'Cadeau Noël',
    body: 'On prépare la surprise pour Mamie.',
    readByProfileIds: ['p-erwan'],
    createdAt: '2026-11-20T10:00:00.000Z',
    updatedAt: '2026-11-20T10:00:00.000Z',
    ...overrides,
  };
}

describe('messages utilities', () => {
  it('enforces recipient-scoped visibility and hides soft-deleted notes', () => {
    const msg = makeMessage({
      id: 'm-secret',
      senderProfileId: 'p-helene',
      recipientProfileIds: ['p-erwan', 'p-sarah'],
    });

    expect(isMessageVisibleToProfile(msg, 'p-helene')).toBe(true);
    expect(isMessageVisibleToProfile(msg, 'p-erwan')).toBe(true);
    expect(isMessageVisibleToProfile(msg, 'p-sarah')).toBe(true);
    expect(isMessageVisibleToProfile(msg, 'p-mamie')).toBe(false);
    expect(isMessageVisibleToProfile(msg, null)).toBe(false);

    const deleted = makeMessage({ ...msg, deletedAt: '2026-11-21T08:00:00.000Z' });
    expect(isMessageVisibleToProfile(deleted, 'p-erwan')).toBe(false);
  });

  it('tracks unread counts per visible profile only', () => {
    const messages = [
      makeMessage({
        id: 'm1',
        senderProfileId: 'p-helene',
        recipientProfileIds: ['p-erwan'],
        readByProfileIds: ['p-helene'],
      }),
      makeMessage({
        id: 'm2',
        senderProfileId: 'p-mamie',
        recipientProfileIds: ['p-erwan', 'p-sarah'],
        readByProfileIds: ['p-mamie', 'p-erwan'],
      }),
      makeMessage({
        id: 'm3-hidden',
        senderProfileId: 'p-helene',
        recipientProfileIds: ['p-sarah'],
        readByProfileIds: ['p-helene'],
      }),
    ];

    expect(isMessageUnread(messages[0], 'p-erwan')).toBe(true);
    expect(isMessageUnread(messages[1], 'p-erwan')).toBe(false);
    expect(countUnreadMessages(messages, 'p-erwan')).toBe(1);
    expect(countUnreadMessages(messages, 'p-sarah')).toBe(2);
    expect(countUnreadMessages(messages, null)).toBe(0);
  });

  it('filters by mode and search across subject, body, names, and replies, sorting by latest activity', () => {
    const profiles = [
      makeProfile('p-erwan', 'Erwan'),
      makeProfile('p-helene', 'Hélène'),
      makeProfile('p-sarah', 'Aunt Sarah'),
    ];
    const profilesById = new Map(profiles.map((p) => [p.id, p]));

    const msgOldWithRecentReply = makeMessage({
      id: 'm-old',
      senderProfileId: 'p-helene',
      recipientProfileIds: ['p-erwan'],
      subject: 'Recette galette',
      body: 'Tu as les proportions ?',
      readByProfileIds: ['p-helene', 'p-erwan'],
      createdAt: '2026-11-10T09:00:00.000Z',
    });

    const msgNewerSent = makeMessage({
      id: 'm-sent',
      senderProfileId: 'p-erwan',
      recipientProfileIds: ['p-sarah'],
      subject: 'Album photos',
      body: 'J’ai ajouté les photos d’automne.',
      readByProfileIds: ['p-erwan'],
      createdAt: '2026-11-18T12:00:00.000Z',
    });

    const msgUnreadInbox = makeMessage({
      id: 'm-unread',
      senderProfileId: 'p-sarah',
      recipientProfileIds: ['p-erwan'],
      subject: 'Weekend',
      body: 'On arrive samedi matin !',
      readByProfileIds: ['p-sarah'],
      createdAt: '2026-11-19T08:00:00.000Z',
    });

    const replies: MessageReply[] = [
      {
        id: 'r1',
        messageId: 'm-old',
        authorProfileId: 'p-erwan',
        body: 'Oui, avec de la poudre d’amandes.',
        createdAt: '2026-11-22T15:00:00.000Z',
        updatedAt: '2026-11-22T15:00:00.000Z',
      },
      {
        id: 'r2-deleted',
        messageId: 'm-sent',
        authorProfileId: 'p-sarah',
        body: 'mot-supprime',
        createdAt: '2026-11-23T15:00:00.000Z',
        updatedAt: '2026-11-23T15:00:00.000Z',
        deletedAt: '2026-11-23T16:00:00.000Z',
      },
    ];

    expect(getMessageLatestTimestamp(msgOldWithRecentReply, replies)).toBe('2026-11-22T15:00:00.000Z');
    expect(getMessageLatestTimestamp(msgNewerSent, replies)).toBe('2026-11-18T12:00:00.000Z');

    const allErwan = filterVisibleMessages(
      [msgOldWithRecentReply, msgNewerSent, msgUnreadInbox],
      replies,
      { profileId: 'p-erwan', mode: 'all', searchQuery: '', profilesById },
    );
    expect(allErwan.map((m) => m.id)).toEqual(['m-old', 'm-unread', 'm-sent']);

    const inboxErwan = filterVisibleMessages(
      [msgOldWithRecentReply, msgNewerSent, msgUnreadInbox],
      replies,
      { profileId: 'p-erwan', mode: 'inbox', searchQuery: '', profilesById },
    );
    expect(inboxErwan.map((m) => m.id)).toEqual(['m-old', 'm-unread']);

    const sentErwan = filterVisibleMessages(
      [msgOldWithRecentReply, msgNewerSent, msgUnreadInbox],
      replies,
      { profileId: 'p-erwan', mode: 'sent', searchQuery: '', profilesById },
    );
    expect(sentErwan.map((m) => m.id)).toEqual(['m-sent']);

    const unreadErwan = filterVisibleMessages(
      [msgOldWithRecentReply, msgNewerSent, msgUnreadInbox],
      replies,
      { profileId: 'p-erwan', mode: 'unread', searchQuery: '', profilesById },
    );
    expect(unreadErwan.map((m) => m.id)).toEqual(['m-unread']);

    const replySearch = filterVisibleMessages(
      [msgOldWithRecentReply, msgNewerSent, msgUnreadInbox],
      replies,
      { profileId: 'p-erwan', mode: 'all', searchQuery: 'amandes', profilesById },
    );
    expect(replySearch.map((m) => m.id)).toEqual(['m-old']);

    const deletedReplySearch = filterVisibleMessages(
      [msgOldWithRecentReply, msgNewerSent, msgUnreadInbox],
      replies,
      { profileId: 'p-erwan', mode: 'all', searchQuery: 'mot-supprime', profilesById },
    );
    expect(deletedReplySearch).toHaveLength(0);
  });

  it('ships demo family messages with strict recipient isolation', () => {
    const demo = createDemoFamilyDatabase();
    const demoMsg1 = demo.messages.find((m) => m.id === 'msg-demo-1');
    const demoMsg2 = demo.messages.find((m) => m.id === 'msg-demo-2');
    expect(demoMsg1).toBeDefined();
    expect(demoMsg2).toBeDefined();

    if (demoMsg1 && demoMsg2) {
      expect(isMessageVisibleToProfile(demoMsg1, 'prof-demo-erwan')).toBe(true);
      expect(isMessageVisibleToProfile(demoMsg1, 'prof-demo-sarah')).toBe(true);
      expect(isMessageVisibleToProfile(demoMsg1, 'prof-demo-mamie')).toBe(false);

      expect(isMessageVisibleToProfile(demoMsg2, 'prof-demo-mamie')).toBe(true);
      expect(isMessageVisibleToProfile(demoMsg2, 'prof-demo-erwan')).toBe(true);
      expect(isMessageVisibleToProfile(demoMsg2, 'prof-demo-sarah')).toBe(false);
    }
  });
});
