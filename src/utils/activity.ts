import type { FamilyDatabase, FamilyProfile } from '../types/family';
import { computeNextGazetteSchedule } from './feed';
import { isMessageUnread, isMessageVisibleToProfile } from './messages';

export type ActivityFilter = 'all' | 'mentions' | 'messages' | 'gazette';

export type ActivityKind =
  | 'new_post'
  | 'tagged_in_post'
  | 'comment'
  | 'private_message'
  | 'message_reply'
  | 'gazette_reminder';

export interface ActivityItem {
  id: string;
  kind: ActivityKind;
  filterBucket: 'posts' | 'mentions' | 'messages' | 'gazette';
  actorProfileId?: string;
  targetPostId?: string;
  targetMessageId?: string;
  previewMediaId?: string;
  snippet?: string;
  createdAt: string;
  unread: boolean;
}

export function buildActivityFeed(
  db: FamilyDatabase,
  activeProfile: FamilyProfile | null,
  todayInput?: Date | string,
): ActivityItem[] {
  if (!activeProfile || activeProfile.deletedAt) return [];

  const lastSeen = activeProfile.lastSeenActivityAt || '';
  const isNewerThanSeen = (iso: string) => !lastSeen || iso > lastSeen;
  const items: ActivityItem[] = [];

  const postsById = new Map(db.posts.map((p) => [p.id, p]));

  // 1. Memory Posts & Tag Mentions
  for (const post of db.posts) {
    if (post.deletedAt) continue;
    if (post.authorProfileId === activeProfile.id) continue;

    const isTagged = post.taggedProfileIds.includes(activeProfile.id);
    items.push({
      id: `act-post-${post.id}`,
      kind: isTagged ? 'tagged_in_post' : 'new_post',
      filterBucket: isTagged ? 'mentions' : 'posts',
      actorProfileId: post.authorProfileId,
      targetPostId: post.id,
      previewMediaId: post.mediaIds[0],
      snippet: post.caption,
      createdAt: post.createdAt,
      unread: isNewerThanSeen(post.createdAt),
    });
  }

  // 2. Comments on user's posts or posts where user is tagged
  for (const cmt of db.comments) {
    if (cmt.deletedAt) continue;
    if (cmt.authorProfileId === activeProfile.id) continue;
    const post = postsById.get(cmt.postId);
    if (!post || post.deletedAt) continue;

    const relevant =
      post.authorProfileId === activeProfile.id ||
      post.taggedProfileIds.includes(activeProfile.id);
    if (!relevant) continue;

    items.push({
      id: `act-cmt-${cmt.id}`,
      kind: 'comment',
      filterBucket: 'mentions',
      actorProfileId: cmt.authorProfileId,
      targetPostId: post.id,
      previewMediaId: post.mediaIds[0],
      snippet: cmt.body,
      createdAt: cmt.createdAt,
      unread: isNewerThanSeen(cmt.createdAt),
    });
  }

  // 3. Private Messages & Replies (strictly recipient-scoped)
  for (const msg of db.messages || []) {
    if (!isMessageVisibleToProfile(msg, activeProfile.id)) continue;
    const msgUnread = isMessageUnread(msg, activeProfile.id);

    if (msg.senderProfileId !== activeProfile.id) {
      items.push({
        id: `act-msg-${msg.id}`,
        kind: 'private_message',
        filterBucket: 'messages',
        actorProfileId: msg.senderProfileId,
        targetMessageId: msg.id,
        snippet: msg.subject || msg.body,
        createdAt: msg.createdAt,
        unread: msgUnread && isNewerThanSeen(msg.createdAt),
      });
    }

    for (const reply of db.messageReplies || []) {
      if (reply.deletedAt || reply.messageId !== msg.id) continue;
      if (reply.authorProfileId === activeProfile.id) continue;

      items.push({
        id: `act-rep-${reply.id}`,
        kind: 'message_reply',
        filterBucket: 'messages',
        actorProfileId: reply.authorProfileId,
        targetMessageId: msg.id,
        snippet: reply.body,
        createdAt: reply.createdAt,
        unread: msgUnread && isNewerThanSeen(reply.createdAt),
      });
    }
  }

  // 4. Monthly Gazette 3-Day Reminder
  const schedule = computeNextGazetteSchedule(db.settings, todayInput);
  if (schedule.isInReminderWindow && schedule.reminderDate) {
    const reminderIso = `${schedule.reminderDate}T09:00:00.000Z`;
    items.push({
      id: `act-gazette-${schedule.cycleKey || schedule.reminderDate}`,
      kind: 'gazette_reminder',
      filterBucket: 'gazette',
      snippet: schedule.nextPublishDate || undefined,
      createdAt: reminderIso,
      unread: isNewerThanSeen(reminderIso),
    });
  }

  return items
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 50);
}

export function filterActivityItems(
  items: ActivityItem[],
  filter: ActivityFilter,
): ActivityItem[] {
  if (filter === 'all') return items;
  return items.filter((item) => item.filterBucket === filter);
}
