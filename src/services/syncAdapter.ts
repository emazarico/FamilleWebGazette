import type {
  FamilyDatabase,
  FamilyProfile,
  UiLanguage,
} from '../types/family';
import type { ScopedGazettePayload } from '../utils/gazette';
import type { MediaVariant } from './mediaStore';

export type SyncErrorCode =
  | 'NETWORK_OFFLINE'
  | 'INVALID_INVITE_CODE'
  | 'UNAUTHORIZED'
  | 'TOKEN_EXPIRED'
  | 'NOT_FOUND'
  | 'FORBIDDEN'
  | 'SERVER_ERROR';

export class SyncApiError extends Error {
  readonly code: SyncErrorCode;
  readonly status?: number;

  constructor(code: SyncErrorCode, message: string, status?: number) {
    super(message);
    this.name = 'SyncApiError';
    this.code = code;
    this.status = status;
  }
}

export interface PingResult {
  ok: true;
  configured: boolean;
  familyName?: string;
}

export interface BootstrapResult {
  db: FamilyDatabase;
  syncedAt: string;
}

export interface LoginResult {
  profileId: string;
  sessionToken: string;
  db: FamilyDatabase;
  syncedAt: string;
}

export interface PullPushResult {
  db: FamilyDatabase;
  syncedAt: string;
}

export interface UploadMediaMetadata {
  memoryDate?: string;
  authorName?: string;
}

export interface UploadMediaResult {
  mediaId: string;
  variant: MediaVariant;
  driveFileId: string;
}

export interface PublicGazetteRelayResult {
  payload: ScopedGazettePayload;
}

export interface SendGazetteRelayRequest {
  issueId: string;
  digestsByLanguage: Record<UiLanguage, { subject: string; html: string; plainText: string }>;
  cidMediaIds: string[];
  pdfBase64?: string;
  pdfFilename?: string;
  htmlContent?: string;
  htmlFilename?: string;
}

export interface SendGazetteRelayResult {
  sentCount: number;
  skippedCount: number;
  remainingQuota: number;
  pdfDriveFileId?: string;
  htmlDriveFileId?: string;
  sentAt: string;
}

export interface ArchiveGazetteFilesRequest {
  issueId: string;
  pdfBase64?: string;
  pdfFilename?: string;
  htmlContent?: string;
  htmlFilename?: string;
}

export interface ArchiveGazetteFilesResult {
  pdfDriveFileId?: string;
  htmlDriveFileId?: string;
}

export interface SendReminderRelayRequest {
  cycleKey: string;
  remindersByLanguage: Record<UiLanguage, { subject: string; html: string; plainText: string }>;
}

export interface SendReminderRelayResult {
  sentCount: number;
  skippedCount: number;
  remainingQuota: number;
  cycleKey: string;
}

export interface StorageSyncAdapter {
  ping(): Promise<PingResult>;
  bootstrap(): Promise<BootstrapResult>;
  login(
    profileId: string,
    pin?: string | null,
    bootstrapProfile?: FamilyProfile,
  ): Promise<LoginResult>;
  pullDb(): Promise<PullPushResult>;
  pushDb(db: FamilyDatabase): Promise<PullPushResult>;
  uploadMedia(
    mediaId: string,
    variant: MediaVariant,
    blob: Blob,
    mimeType: string,
    meta?: UploadMediaMetadata,
  ): Promise<UploadMediaResult>;
  fetchMediaBlob(mediaId: string, variant: MediaVariant): Promise<Blob | undefined>;
  fetchPublicGazette(issueId: string, secretKey: string): Promise<PublicGazetteRelayResult>;
  sendGazette(req: SendGazetteRelayRequest): Promise<SendGazetteRelayResult>;
  archiveGazetteFiles(req: ArchiveGazetteFilesRequest): Promise<ArchiveGazetteFilesResult>;
  sendReminder(req: SendReminderRelayRequest): Promise<SendReminderRelayResult>;
}
