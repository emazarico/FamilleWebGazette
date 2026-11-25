export type UiLanguage = 'fr' | 'en';

export type ThemeMode = 'light' | 'dark';

export type MemberRole = 'admin' | 'member';

export type AvatarTheme =
  | 'teal'
  | 'amber'
  | 'rose'
  | 'indigo'
  | 'emerald'
  | 'violet'
  | 'coral'
  | 'slate';

export type CollageLayout =
  | 'single'
  | 'two-col'
  | 'two-row'
  | 'three-mosaic'
  | 'three-top'
  | 'three-left'
  | 'four-grid'
  | 'four-hero';

export interface PhotoCrop {
  /** Horizontal focal point percentage (0..100, default 50) */
  x: number;
  /** Vertical focal point percentage (0..100, default 50) */
  y: number;
  /** Zoom scale (1..3, default 1) */
  zoom: number;
}

export type GazetteCadence = 'monthly' | 'weekly' | 'biweekly' | 'manual';

export type GazetteTheme = 'editorial' | 'classic' | 'keepsake';

export type GazetteDeliveryMode =
  | 'digest_and_links'
  | 'digest_and_pdf_attachment'
  | 'links_only';

export type SyncMode = 'local' | 'apps-script' | 'gdrive-direct';

export type SyncStatus =
  | 'local'
  | 'connecting'
  | 'syncing'
  | 'synced'
  | 'token_expired'
  | 'offline'
  | 'error';

export type AppTab = 'wall' | 'messages' | 'gallery' | 'gazettes' | 'family';

export type WallFilterMode = 'all' | 'photos' | 'stories' | 'gazette' | 'tagged-me';

export interface FamilySettings {
  id: 'family_settings';
  familyName: string;
  inviteCode: string;
  gazetteTitle: string;
  gazetteSubtitle?: string;
  gazetteCadence: GazetteCadence;
  /** Day of month (1..28) for monthly publication */
  publishDayOfMonth: number;
  /** Days prior to publication to trigger contributor reminder emails (default 3) */
  reminderDaysBefore: number;
  /** Cycle key (e.g. "2026-12") of the last reminder email dispatched */
  lastReminderCycleKey?: string;
  gazetteTheme: GazetteTheme;
  lastCompiledIssueNumber: number;
  updatedAt: string;
  deletedAt?: string | null;
}

export interface FamilyProfile {
  id: string;
  name: string;
  relationLabel?: string;
  email?: string;
  /** Primary UI language chosen when creating or editing this user */
  language: UiLanguage;
  avatarEmoji: string;
  avatarTheme: AvatarTheme;
  avatarMediaId?: string;
  role: MemberRole;
  pinHash: string | null;
  lastSeenActivityAt?: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

/**
 * Remembered non-member person who can be tagged in "Avec / With"
 * and optionally upgraded into a full FamilyProfile later.
 */
export interface RememberedPerson {
  id: string;
  name: string;
  relationLabel?: string;
  avatarEmoji: string;
  avatarTheme: AvatarTheme;
  upgradedToProfileId?: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

export interface MediaAsset {
  id: string;
  mimeType: 'image/webp' | 'image/jpeg';
  width: number;
  height: number;
  byteSize: number;
  thumbByteSize: number;
  driveFileId?: string;
  driveThumbFileId?: string;
  uploadedByProfileId: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

export interface PostComment {
  id: string;
  postId: string;
  authorProfileId: string;
  body: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

export interface MemoryPost {
  id: string;
  authorProfileId: string;
  kind: 'photo' | 'story';
  mediaIds: string[];
  collageLayout: CollageLayout;
  mediaCrops?: Record<string, PhotoCrop>;
  caption: string;
  /** ISO date YYYY-MM-DD */
  memoryDate: string;
  taggedProfileIds: string[];
  taggedGuestIds?: string[];
  likedByProfileIds: string[];
  includeInGazette: boolean;
  fullPageFeature: boolean;
  publishedIssueIds: number[];
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

export interface MessageReply {
  id: string;
  messageId: string;
  authorProfileId: string;
  body: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

export interface PrivateMessage {
  id: string;
  senderProfileId: string;
  recipientProfileIds: string[];
  subject?: string;
  body: string;
  readByProfileIds: string[];
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

export interface GazetteSubscriber {
  id: string;
  name: string;
  email: string;
  profileId?: string;
  language: UiLanguage;
  cadence: 'monthly' | 'weekly' | 'both';
  deliveryMode: GazetteDeliveryMode;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

export interface GazetteIssue {
  id: string;
  issueNumber: number;
  title: string;
  editorialNote?: string;
  theme: GazetteTheme;
  periodStart: string;
  periodEnd: string;
  includedPostIds: string[];
  compiledByProfileId: string;
  recipientEmails: string[];
  sentAt?: string;
  deliveryChannel?: 'apps-script' | 'manual';
  /** Secret 32-char URL-safe token for ?view=gazette&issue=<id>&k=<secretKey> */
  secretKey: string;
  shareExpiresAt?: string;
  shareRevoked?: boolean;
  htmlDriveFileId?: string;
  pdfDriveFileId?: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

export interface FamilyDatabase {
  schemaVersion: 1;
  dbId: string;
  updatedAt: string;
  settings: FamilySettings;
  profiles: FamilyProfile[];
  rememberedPeople: RememberedPerson[];
  media: MediaAsset[];
  posts: MemoryPost[];
  comments: PostComment[];
  messages: PrivateMessage[];
  messageReplies: MessageReply[];
  subscribers: GazetteSubscriber[];
  gazettes: GazetteIssue[];
}

export interface SyncConfig {
  mode: SyncMode;
  appsScriptUrl: string;
  familyInviteCode: string;
  sessionToken: string | null;
  lastSyncedAt: string | null;
}

export interface ToastMessage {
  id: string;
  title: string;
  description?: string;
  tone?: 'info' | 'success' | 'error';
  undoAction?: () => void;
}
