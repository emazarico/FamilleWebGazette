import { useEffect, useState } from 'react';
import type { MediaAsset } from '../types/family';
import { generateId } from '../utils/crypto';
import { compressPhotoPair } from './mediaProcessor';

const DB_NAME = 'familygazette_media_v1';
const STORE_NAME = 'blobs';
const MAX_CONCURRENT_MEDIA_FETCHES = 4;

export type MediaVariant = 'full' | 'thumb';

export type RemoteMediaFetcher = (
  mediaId: string,
  variant: MediaVariant,
) => Promise<Blob | undefined>;

const memoryBlobCache = new Map<string, Blob>();
const inflightRemoteFetches = new Map<string, Promise<Blob | undefined>>();
const remoteWaitQueue: Array<() => void> = [];
let activeRemoteFetches = 0;
let remoteMediaFetcher: RemoteMediaFetcher | null = null;
let fetcherGeneration = 0;
const fetcherListeners = new Set<() => void>();

export function registerRemoteMediaFetcher(fetcher: RemoteMediaFetcher | null): void {
  remoteMediaFetcher = fetcher;
  fetcherGeneration += 1;
  for (const listener of fetcherListeners) {
    listener();
  }
}

function runWithRemoteConcurrencyLimit<T>(fn: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const run = () => {
      activeRemoteFetches += 1;
      void fn()
        .then(resolve, reject)
        .finally(() => {
          activeRemoteFetches = Math.max(0, activeRemoteFetches - 1);
          const next = remoteWaitQueue.shift();
          if (next) next();
        });
    };

    if (activeRemoteFetches < MAX_CONCURRENT_MEDIA_FETCHES) {
      run();
    } else {
      remoteWaitQueue.push(run);
    }
  });
}

const DEMO_ARTWORK: Record<
  string,
  { bg1: string; bg2: string; accent: string; title: string; emoji: string }
> = {
  'med-demo-1': {
    bg1: '#1B5E7C',
    bg2: '#0F766E',
    accent: '#F59E0B',
    title: 'Lanternes de Noël',
    emoji: '🏮',
  },
  'med-demo-2': {
    bg1: '#334155',
    bg2: '#1E293B',
    accent: '#38BDF8',
    title: 'Premiers flocons',
    emoji: '❄️',
  },
  'med-demo-3': {
    bg1: '#0F766E',
    bg2: '#115E59',
    accent: '#FBBF24',
    title: 'Marché d’hiver',
    emoji: '🎄',
  },
  'med-demo-4': {
    bg1: '#B45309',
    bg2: '#7C2D12',
    accent: '#FDE68A',
    title: 'Lecture au coin du feu',
    emoji: '📚',
  },
  'med-demo-5': {
    bg1: '#C2410C',
    bg2: '#9A3412',
    accent: '#FDBA74',
    title: 'Ridge Trail',
    emoji: '🍂',
  },
  'med-demo-6': {
    bg1: '#4338CA',
    bg2: '#312E81',
    accent: '#F59E0B',
    title: 'Warm Cider',
    emoji: '🍎',
  },
};

export function demoMediaSvgDataUrl(mediaId: string): string | undefined {
  const art = DEMO_ARTWORK[mediaId];
  if (!art) return undefined;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600">
    <defs>
      <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${art.bg1}" />
        <stop offset="100%" stop-color="${art.bg2}" />
      </linearGradient>
    </defs>
    <rect width="800" height="600" fill="url(#g)" />
    <circle cx="650" cy="130" r="140" fill="${art.accent}" fill-opacity="0.22" />
    <circle cx="140" cy="480" r="180" fill="#ffffff" fill-opacity="0.08" />
    <path d="M0 470 Q 220 370 430 450 T 800 410 L 800 600 L 0 600 Z" fill="#000000" fill-opacity="0.16" />
    <text x="400" y="290" text-anchor="middle" font-size="112">${art.emoji}</text>
    <text x="400" y="390" text-anchor="middle" font-family="Georgia, serif" font-size="34" font-weight="bold" fill="#ffffff" fill-opacity="0.92">${art.title}</text>
  </svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function mediaKey(mediaId: string, variant: MediaVariant): string {
  return `${mediaId}:${variant}`;
}

function openMediaDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function idbPutBlob(key: string, blob: Blob): Promise<void> {
  const db = await openMediaDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(blob, key);
      tx.oncomplete = () => {
        try {
          db.close();
        } catch {
          // ignore
        }
        resolve();
      };
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

async function idbGetBlob(key: string): Promise<Blob | undefined> {
  const db = await openMediaDb();
  if (!db) return undefined;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(key);
      req.onsuccess = () => resolve(req.result instanceof Blob ? req.result : undefined);
      req.onerror = () => resolve(undefined);
      tx.oncomplete = () => {
        try {
          db.close();
        } catch {
          // ignore
        }
      };
    } catch {
      resolve(undefined);
    }
  });
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Failed to read media blob.'));
    reader.readAsDataURL(blob);
  });
}

export async function putLocalMediaBlob(
  mediaId: string,
  variant: MediaVariant,
  blob: Blob,
): Promise<void> {
  const key = mediaKey(mediaId, variant);
  memoryBlobCache.set(key, blob);
  await idbPutBlob(key, blob);
}

export async function saveLocalPhotoAsset(
  file: Blob,
  uploadedByProfileId: string,
): Promise<MediaAsset> {
  const pair = await compressPhotoPair(file);
  const mediaId = generateId('med');
  const now = new Date().toISOString();

  await putLocalMediaBlob(mediaId, 'full', pair.fullBlob);
  await putLocalMediaBlob(mediaId, 'thumb', pair.thumbBlob);

  return {
    id: mediaId,
    mimeType: pair.mimeType,
    width: Math.max(1, Math.round(pair.width)),
    height: Math.max(1, Math.round(pair.height)),
    byteSize: pair.byteSize,
    thumbByteSize: pair.thumbByteSize,
    uploadedByProfileId,
    createdAt: now,
    updatedAt: now,
  };
}

export async function getLocalMediaBlob(
  mediaId: string,
  variant: MediaVariant = 'full',
): Promise<Blob | undefined> {
  const exactKey = mediaKey(mediaId, variant);
  const memExact = memoryBlobCache.get(exactKey);
  if (memExact) return memExact;

  const exact = await idbGetBlob(exactKey);
  if (exact) {
    memoryBlobCache.set(exactKey, exact);
    return exact;
  }

  if (variant === 'thumb') {
    const memFull = memoryBlobCache.get(mediaKey(mediaId, 'full'));
    if (memFull) return memFull;
    const full = await idbGetBlob(mediaKey(mediaId, 'full'));
    if (full) {
      memoryBlobCache.set(mediaKey(mediaId, 'full'), full);
      return full;
    }
  }

  // Lazy remote fetch through deduplicated max-4 concurrent queue
  const fetcher = remoteMediaFetcher;
  if (fetcher && !demoMediaSvgDataUrl(mediaId)) {
    const inflight = inflightRemoteFetches.get(exactKey);
    if (inflight) return inflight;

    const fetchPromise = runWithRemoteConcurrencyLimit(async () => {
      try {
        const fetched = await fetcher(mediaId, variant);
        if (fetched && fetched.size > 0) {
          await putLocalMediaBlob(mediaId, variant, fetched);
          return fetched;
        }
        return undefined;
      } catch {
        return undefined;
      } finally {
        inflightRemoteFetches.delete(exactKey);
      }
    });

    inflightRemoteFetches.set(exactKey, fetchPromise);
    return fetchPromise;
  }

  return undefined;
}

/**
 * Resolves a MediaAsset ID into a renderable image URL with clean object-URL revocation.
 * Built-in demo illustrations resolve synchronously with zero network access;
 * remote blobs are fetched lazily and cached in IndexedDB.
 */
export function useResolvedMedia(
  mediaId?: string,
  variant: MediaVariant = 'thumb',
): { url: string | undefined; loading: boolean } {
  const demoUrl = mediaId ? demoMediaSvgDataUrl(mediaId) : undefined;
  const [url, setUrl] = useState<string | undefined>(demoUrl);
  const [loading, setLoading] = useState<boolean>(() => Boolean(mediaId && !demoUrl));
  const [fetchRev, setFetchRev] = useState<number>(() => fetcherGeneration);

  useEffect(() => {
    const onFetcherChange = () => {
      setFetchRev(fetcherGeneration);
    };
    fetcherListeners.add(onFetcherChange);
    return () => {
      fetcherListeners.delete(onFetcherChange);
    };
  }, []);

  useEffect(() => {
    if (!mediaId) {
      setUrl(undefined);
      setLoading(false);
      return;
    }
    if (demoUrl) {
      setUrl(demoUrl);
      setLoading(false);
      return;
    }

    let cancelled = false;
    let createdObjectUrl: string | null = null;
    setLoading(true);

    void getLocalMediaBlob(mediaId, variant).then(async (blob) => {
      if (cancelled) return;
      if (!blob) {
        setUrl(undefined);
        setLoading(false);
        return;
      }

      if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
        createdObjectUrl = URL.createObjectURL(blob);
        setUrl(createdObjectUrl);
        setLoading(false);
      } else {
        const dataUrl = await blobToDataUrl(blob);
        if (!cancelled) {
          setUrl(dataUrl);
          setLoading(false);
        }
      }
    });

    return () => {
      cancelled = true;
      if (createdObjectUrl && typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
        URL.revokeObjectURL(createdObjectUrl);
      }
    };
  }, [mediaId, variant, demoUrl, fetchRev]);

  return { url, loading };
}
