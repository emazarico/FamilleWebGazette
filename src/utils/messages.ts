import type {
  FamilyProfile,
  MessageReply,
  PrivateMessage,
} from '../types/family';

export type MessageFilterMode = 'all' | 'inbox' | 'sent' | 'unread';

export function isMessageVisibleToProfile(
  message: PrivateMessage,
  profileId: string | null,
): boolean {
  if (message.deletedAt || !profileId) return false;
  return (
    message.senderProfileId === profileId ||
    message.recipientProfileIds.includes(profileId)
  );
}

export function isMessageUnread(
  message: PrivateMessage,
  profileId: string | null,
): boolean {
  if (!isMessageVisibleToProfile(message, profileId) || !profileId) return false;
  return !message.readByProfileIds.includes(profileId);
}

export function getMessageLatestTimestamp(
  message: PrivateMessage,
  replies: MessageReply[],
): string {
  let latest = message.createdAt;
  for (const reply of replies) {
    if (!reply.deletedAt && reply.messageId === message.id && reply.createdAt > latest) {
      latest = reply.createdAt;
    }
  }
  return latest;
}

export function countUnreadMessages(
  messages: PrivateMessage[],
  profileId: string | null,
): number {
  if (!profileId) return 0;
  let count = 0;
  for (const m of messages) {
    if (isMessageUnread(m, profileId)) count++;
  }
  return count;
}

export interface FilterMessagesOptions {
  profileId: string;
  mode: MessageFilterMode;
  searchQuery: string;
  profilesById: Map<string, FamilyProfile>;
}

export function filterVisibleMessages(
  messages: PrivateMessage[],
  replies: MessageReply[],
  options: FilterMessagesOptions,
): PrivateMessage[] {
  const query = options.searchQuery.trim().toLowerCase();

  return messages
    .filter((msg) => {
      if (!isMessageVisibleToProfile(msg, options.profileId)) return false;

      if (options.mode === 'inbox' && !msg.recipientProfileIds.includes(options.profileId)) {
        return false;
      }
      if (options.mode === 'sent' && msg.senderProfileId !== options.profileId) {
        return false;
      }
      if (options.mode === 'unread' && !isMessageUnread(msg, options.profileId)) {
        return false;
      }

      if (query) {
        const sender = options.profilesById.get(msg.senderProfileId)?.name.toLowerCase() || '';
        const recipients = msg.recipientProfileIds
          .map((id) => options.profilesById.get(id)?.name.toLowerCase() || '')
          .join(' ');
        const subject = (msg.subject || '').toLowerCase();
        const body = msg.body.toLowerCase();
        const replyBodies = replies
          .filter((r) => !r.deletedAt && r.messageId === msg.id)
          .map((r) => r.body.toLowerCase())
          .join(' ');

        if (
          !sender.includes(query) &&
          !recipients.includes(query) &&
          !subject.includes(query) &&
          !body.includes(query) &&
          !replyBodies.includes(query)
        ) {
          return false;
        }
      }

      return true;
    })
    .sort((a, b) => {
      const tsA = getMessageLatestTimestamp(a, replies);
      const tsB = getMessageLatestTimestamp(b, replies);
      return tsB.localeCompare(tsA);
    });
}
