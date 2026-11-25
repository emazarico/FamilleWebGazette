import type { FamilyDatabase, FamilyProfile } from '../types/family';
import { normalizeAppsScriptUrl } from '../utils/syncUrls';
import type { MediaVariant } from './mediaStore';
import {
  SyncApiError,
  type ArchiveGazetteFilesRequest,
  type ArchiveGazetteFilesResult,
  type BootstrapResult,
  type LoginResult,
  type PingResult,
  type PublicGazetteRelayResult,
  type PullPushResult,
  type SendGazetteRelayRequest,
  type SendGazetteRelayResult,
  type SendReminderRelayRequest,
  type SendReminderRelayResult,
  type StorageSyncAdapter,
  type SyncErrorCode,
  type UploadMediaMetadata,
  type UploadMediaResult,
} from './syncAdapter';

export async function blobToBase64(blob: Blob): Promise<string> {
  if (typeof blob.arrayBuffer === 'function') {
    const buffer = await blob.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = '';
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    return btoa(binary);
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const commaIdx = result.indexOf(',');
      resolve(commaIdx >= 0 ? result.slice(commaIdx + 1) : result);
    };
    reader.onerror = () => reject(new Error('Failed to encode blob to base64.'));
    reader.readAsDataURL(blob);
  });
}

export function base64ToBlob(base64: string, mimeType = 'image/webp'): Blob {
  const clean = base64.replace(/^data:[^;]+;base64,/, '').trim();
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mimeType });
}

interface RawRelayResponse {
  ok: boolean;
  errorCode?: string;
  error?: string;
  [key: string]: unknown;
}

function mapErrorCode(rawCode?: string): SyncErrorCode {
  switch (rawCode) {
    case 'INVALID_INVITE_CODE':
      return 'INVALID_INVITE_CODE';
    case 'UNAUTHORIZED':
      return 'UNAUTHORIZED';
    case 'TOKEN_EXPIRED':
      return 'TOKEN_EXPIRED';
    case 'NOT_FOUND':
      return 'NOT_FOUND';
    case 'FORBIDDEN':
      return 'FORBIDDEN';
    default:
      return 'SERVER_ERROR';
  }
}

async function postRelayAction<T>(
  appsScriptUrl: string,
  body: Record<string, unknown>,
): Promise<T> {
  const normalizedUrl = normalizeAppsScriptUrl(appsScriptUrl);
  if (!normalizedUrl) {
    throw new SyncApiError('SERVER_ERROR', 'Invalid Google Apps Script URL.');
  }

  let response: Response;
  try {
    response = await fetch(normalizedUrl, {
      method: 'POST',
      headers: {
        // Simple CORS request: avoids Apps Script OPTIONS preflight rejection
        'Content-Type': 'text/plain;charset=utf-8',
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw new SyncApiError(
      'NETWORK_OFFLINE',
      err instanceof Error ? err.message : 'Network error connecting to relay.',
    );
  }

  if (!response.ok) {
    throw new SyncApiError(
      'SERVER_ERROR',
      `Relay HTTP error ${response.status}`,
      response.status,
    );
  }

  let parsed: RawRelayResponse;
  try {
    parsed = (await response.json()) as RawRelayResponse;
  } catch {
    throw new SyncApiError('SERVER_ERROR', 'Relay returned non-JSON response.');
  }

  if (!parsed || parsed.ok !== true) {
    throw new SyncApiError(
      mapErrorCode(parsed?.errorCode),
      parsed?.error || 'Relay request failed.',
    );
  }

  return parsed as unknown as T;
}

export interface AppsScriptAdapterOptions {
  appsScriptUrl: string;
  inviteCode: string;
  getSessionToken: () => string | null;
}

export function createAppsScriptAdapter(
  options: AppsScriptAdapterOptions,
): StorageSyncAdapter {
  const { appsScriptUrl, inviteCode, getSessionToken } = options;

  const call = <T>(action: string, payload: Record<string, unknown> = {}) =>
    postRelayAction<T>(appsScriptUrl, {
      action,
      inviteCode,
      sessionToken: getSessionToken() || undefined,
      ...payload,
    });

  return {
    ping: () => call<PingResult>('ping'),

    bootstrap: () => call<BootstrapResult>('bootstrap'),

    login: (profileId: string, pin?: string | null, bootstrapProfile?: FamilyProfile) =>
      call<LoginResult>('login', {
        profileId,
        ...(pin ? { pin } : {}),
        ...(bootstrapProfile ? { bootstrapProfile } : {}),
      }),

    pullDb: () => call<PullPushResult>('pullDb'),

    pushDb: (db: FamilyDatabase) => call<PullPushResult>('pushDb', { db }),

    uploadMedia: async (
      mediaId: string,
      variant: MediaVariant,
      blob: Blob,
      mimeType: string,
      meta?: UploadMediaMetadata,
    ): Promise<UploadMediaResult> => {
      const base64Data = await blobToBase64(blob);
      return call<UploadMediaResult>('uploadMedia', {
        mediaId,
        variant,
        mimeType,
        base64Data,
        ...(meta?.memoryDate ? { memoryDate: meta.memoryDate } : {}),
        ...(meta?.authorName ? { authorName: meta.authorName } : {}),
      });
    },

    fetchMediaBlob: async (mediaId: string, variant: MediaVariant): Promise<Blob | undefined> => {
      try {
        const res = await call<{ ok: true; mimeType: string; base64Data: string }>('getMedia', {
          mediaId,
          variant,
        });
        if (!res.base64Data) return undefined;
        return base64ToBlob(res.base64Data, res.mimeType || 'image/webp');
      } catch (err) {
        if (err instanceof SyncApiError && err.code === 'NOT_FOUND') {
          return undefined;
        }
        throw err;
      }
    },

    fetchPublicGazette: (issueId: string, secretKey: string) =>
      fetchPublicGazetteFromRelay(appsScriptUrl, issueId, secretKey),

    sendGazette: (req: SendGazetteRelayRequest) =>
      call<SendGazetteRelayResult>('sendGazette', {
        issueId: req.issueId,
        digestsByLanguage: req.digestsByLanguage,
        cidMediaIds: req.cidMediaIds,
        ...(req.pdfBase64 ? { pdfBase64: req.pdfBase64 } : {}),
        ...(req.pdfFilename ? { pdfFilename: req.pdfFilename } : {}),
        ...(req.htmlContent ? { htmlContent: req.htmlContent } : {}),
        ...(req.htmlFilename ? { htmlFilename: req.htmlFilename } : {}),
      }),

    archiveGazetteFiles: (req: ArchiveGazetteFilesRequest) =>
      call<ArchiveGazetteFilesResult>('archiveGazetteFiles', {
        issueId: req.issueId,
        ...(req.pdfBase64 ? { pdfBase64: req.pdfBase64 } : {}),
        ...(req.pdfFilename ? { pdfFilename: req.pdfFilename } : {}),
        ...(req.htmlContent ? { htmlContent: req.htmlContent } : {}),
        ...(req.htmlFilename ? { htmlFilename: req.htmlFilename } : {}),
      }),

    sendReminder: (req: SendReminderRelayRequest) =>
      call<SendReminderRelayResult>('sendReminder', {
        cycleKey: req.cycleKey,
        remindersByLanguage: req.remindersByLanguage,
      }),
  };
}

export async function fetchPublicGazetteFromRelay(
  appsScriptUrl: string,
  issueId: string,
  secretKey: string,
): Promise<PublicGazetteRelayResult> {
  return postRelayAction<PublicGazetteRelayResult>(appsScriptUrl, {
    action: 'getPublicGazette',
    issueId,
    secretKey,
  });
}

export async function fetchPublicMediaFromRelay(
  appsScriptUrl: string,
  issueId: string,
  secretKey: string,
  mediaId: string,
  variant: MediaVariant,
): Promise<Blob | undefined> {
  try {
    const res = await postRelayAction<{ ok: true; mimeType: string; base64Data: string }>(
      appsScriptUrl,
      {
        action: 'getMedia',
        issueId,
        secretKey,
        mediaId,
        variant,
      },
    );
    if (!res.base64Data) return undefined;
    return base64ToBlob(res.base64Data, res.mimeType || 'image/webp');
  } catch {
    return undefined;
  }
}
