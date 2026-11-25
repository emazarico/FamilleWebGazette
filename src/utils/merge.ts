import type {
  FamilyDatabase,
  FamilyProfile,
  FamilySettings,
  GazetteIssue,
  GazetteSubscriber,
  MediaAsset,
  MemoryPost,
  MessageReply,
  PostComment,
  PrivateMessage,
  RememberedPerson,
} from '../types/family';

type TimestampedRecord = {
  id: string;
  updatedAt: string;
  deletedAt?: string | null;
};

function parseTime(iso?: string | null): number {
  if (!iso) return 0;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? 0 : ms;
}

function mergeRecordArrays<T extends TimestampedRecord>(localArr: T[], remoteArr: T[]): T[] {
  const map = new Map<string, T>();

  for (const item of remoteArr) {
    if (item && item.id) {
      map.set(item.id, item);
    }
  }

  for (const localItem of localArr) {
    if (!localItem || !localItem.id) continue;
    const remoteItem = map.get(localItem.id);
    if (!remoteItem) {
      map.set(localItem.id, localItem);
      continue;
    }

    const localTs = Math.max(parseTime(localItem.updatedAt), parseTime(localItem.deletedAt));
    const remoteTs = Math.max(parseTime(remoteItem.updatedAt), parseTime(remoteItem.deletedAt));

    if (localTs >= remoteTs) {
      map.set(localItem.id, localItem);
    }
  }

  return Array.from(map.values());
}

function mergeSettings(local: FamilySettings, remote: FamilySettings): FamilySettings {
  const localTs = Math.max(parseTime(local?.updatedAt), parseTime(local?.deletedAt));
  const remoteTs = Math.max(parseTime(remote?.updatedAt), parseTime(remote?.deletedAt));
  return localTs >= remoteTs ? local : remote;
}

/**
 * Deterministic per-record Last-Write-Wins (LWW) merge across two FamilyDatabase snapshots.
 * Preserves deletedAt tombstones so deletions propagate cleanly across devices.
 */
export function mergeDatabases(
  local: FamilyDatabase,
  remote: FamilyDatabase,
): FamilyDatabase {
  const settings = mergeSettings(local.settings, remote.settings);
  const profiles = mergeRecordArrays<FamilyProfile>(local.profiles || [], remote.profiles || []);
  const rememberedPeople = mergeRecordArrays<RememberedPerson>(
    local.rememberedPeople || [],
    remote.rememberedPeople || [],
  );
  const media = mergeRecordArrays<MediaAsset>(local.media || [], remote.media || []);
  const posts = mergeRecordArrays<MemoryPost>(local.posts || [], remote.posts || []);
  const comments = mergeRecordArrays<PostComment>(local.comments || [], remote.comments || []);
  const messages = mergeRecordArrays<PrivateMessage>(local.messages || [], remote.messages || []);
  const messageReplies = mergeRecordArrays<MessageReply>(
    local.messageReplies || [],
    remote.messageReplies || [],
  );
  const subscribers = mergeRecordArrays<GazetteSubscriber>(
    local.subscribers || [],
    remote.subscribers || [],
  );
  const gazettes = mergeRecordArrays<GazetteIssue>(local.gazettes || [], remote.gazettes || []);

  const localDbTime = parseTime(local.updatedAt);
  const remoteDbTime = parseTime(remote.updatedAt);
  const latestMs = Math.max(localDbTime, remoteDbTime, Date.now());

  return {
    schemaVersion: 1,
    dbId: remote.dbId || local.dbId,
    updatedAt: new Date(latestMs).toISOString(),
    settings,
    profiles,
    rememberedPeople,
    media,
    posts,
    comments,
    messages,
    messageReplies,
    subscribers,
    gazettes,
  };
}
