import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  base64ToBlob,
  blobToBase64,
  createAppsScriptAdapter,
  fetchPublicGazetteFromRelay,
  fetchPublicMediaFromRelay,
} from '../services/appsScriptSync';
import { SyncApiError } from '../services/syncAdapter';
import { createDemoFamilyDatabase } from '../utils/demoData';

const VALID_RELAY_URL = 'https://script.google.com/macros/s/AKfycbMockRelay/exec';

function makeJsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('appsScriptSync service', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('encodes and decodes binary blobs via base64 roundtrip', async () => {
    const bytes = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x00, 0xfe, 0x80, 0x11]);
    const original = new Blob([bytes], { type: 'image/webp' });
    const encoded = await blobToBase64(original);
    const decoded = base64ToBlob(encoded, 'image/webp');
    const decodedBytes = new Uint8Array(await decoded.arrayBuffer());

    expect(decoded.type).toBe('image/webp');
    expect(Array.from(decodedBytes)).toEqual(Array.from(bytes));
  });

  it('posts simple text/plain CORS requests and handles ping, login, uploadMedia, and archiveGazetteFiles', async () => {
    const mockFetch = vi.fn(async (_url: unknown, init?: RequestInit) => {
      const parsed = JSON.parse(String(init?.body || '{}')) as Record<string, unknown>;
      if (parsed.action === 'ping') {
        return makeJsonResponse({ ok: true, configured: true, familyName: 'Famille Test' });
      }
      if (parsed.action === 'uploadMedia') {
        return makeJsonResponse({
          ok: true,
          mediaId: parsed.mediaId,
          variant: parsed.variant,
          driveFileId: 'drive-photo-99',
        });
      }
      if (parsed.action === 'archiveGazetteFiles') {
        return makeJsonResponse({
          ok: true,
          pdfDriveFileId: 'drive-pdf-1',
          htmlDriveFileId: 'drive-html-1',
        });
      }
      return makeJsonResponse({ ok: true });
    });

    vi.stubGlobal('fetch', mockFetch);

    const adapter = createAppsScriptAdapter({
      appsScriptUrl: VALID_RELAY_URL,
      inviteCode: 'FAM-2026',
      getSessionToken: () => 'tok-signed-123',
    });

    const ping = await adapter.ping();
    expect(ping).toEqual({ ok: true, configured: true, familyName: 'Famille Test' });

    const blob = new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'image/webp' });
    const uploaded = await adapter.uploadMedia('med-123', 'full', blob, 'image/webp', {
      memoryDate: '2026-11-18',
      authorName: 'Hélène',
    });
    expect(uploaded.driveFileId).toBe('drive-photo-99');

    const archived = await adapter.archiveGazetteFiles({
      issueId: 'gaz-1',
      pdfBase64: 'JVBERi0x',
      pdfFilename: '2026-11_N01_Gazette.pdf',
      htmlContent: '<html><body>Gazette</body></html>',
      htmlFilename: '2026-11_N01_Gazette.html',
    });
    expect(archived).toMatchObject({
      pdfDriveFileId: 'drive-pdf-1',
      htmlDriveFileId: 'drive-html-1',
    });

    // Verify simple CORS Content-Type and sent payloads
    expect(mockFetch).toHaveBeenCalledTimes(3);
    const [, uploadInit] = mockFetch.mock.calls[1];
    expect(uploadInit?.method).toBe('POST');
    expect((uploadInit?.headers as Record<string, string>)['Content-Type']).toBe(
      'text/plain;charset=utf-8',
    );
    const uploadBody = JSON.parse(String(uploadInit?.body)) as Record<string, unknown>;
    expect(uploadBody.inviteCode).toBe('FAM-2026');
    expect(uploadBody.sessionToken).toBe('tok-signed-123');
    expect(uploadBody.memoryDate).toBe('2026-11-18');
    expect(uploadBody.authorName).toBe('Hélène');
  });

  it('fetches public Gazettes & scoped media unauthenticated and maps sync errors cleanly', async () => {
    const sampleDb = createDemoFamilyDatabase();
    const issue = sampleDb.gazettes[0];

    const mockFetch = vi.fn(async (_url: unknown, init?: RequestInit) => {
      const parsed = JSON.parse(String(init?.body || '{}')) as Record<string, unknown>;
      if (parsed.action === 'getPublicGazette') {
        return makeJsonResponse({
          ok: true,
          payload: {
            issue,
            familyName: sampleDb.settings.familyName,
            posts: [],
            contributorsById: {},
            guestsById: {},
            mediaById: {},
          },
        });
      }
      if (parsed.action === 'getMedia' && parsed.mediaId === 'med-ok') {
        return makeJsonResponse({
          ok: true,
          mimeType: 'image/webp',
          base64Data: 'AQID',
        });
      }
      if (parsed.action === 'pullDb') {
        return makeJsonResponse({
          ok: false,
          errorCode: 'TOKEN_EXPIRED',
          error: 'Session token expired.',
        });
      }
      return makeJsonResponse({
        ok: false,
        errorCode: 'NOT_FOUND',
        error: 'Not found',
      });
    });

    vi.stubGlobal('fetch', mockFetch);

    const publicRes = await fetchPublicGazetteFromRelay(VALID_RELAY_URL, issue.id, issue.secretKey);
    expect(publicRes.payload.issue.id).toBe(issue.id);

    const mediaBlob = await fetchPublicMediaFromRelay(
      VALID_RELAY_URL,
      issue.id,
      issue.secretKey,
      'med-ok',
      'full',
    );
    expect(mediaBlob).toBeDefined();
    expect(Array.from(new Uint8Array(await mediaBlob!.arrayBuffer()))).toEqual([1, 2, 3]);

    const missingBlob = await fetchPublicMediaFromRelay(
      VALID_RELAY_URL,
      issue.id,
      issue.secretKey,
      'med-missing',
      'thumb',
    );
    expect(missingBlob).toBeUndefined();

    const adapter = createAppsScriptAdapter({
      appsScriptUrl: VALID_RELAY_URL,
      inviteCode: 'FAM-2026',
      getSessionToken: () => 'expired-tok',
    });

    await expect(adapter.pullDb()).rejects.toMatchObject({
      name: 'SyncApiError',
      code: 'TOKEN_EXPIRED',
    });

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }),
    );

    await expect(adapter.ping()).rejects.toBeInstanceOf(SyncApiError);
    await expect(adapter.ping()).rejects.toMatchObject({ code: 'NETWORK_OFFLINE' });
  });
});
