import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getStorageEngineInfo,
  isIndexedDbAvailable,
  loadDatabaseFromIdb,
  normalizeLoadedDatabase,
} from '../services/idbStorage';
import { saveDatabaseWithFallback, STORAGE_KEYS } from '../services/storage';
import type { FamilyDatabase } from '../types/family';
import { createEmptyDatabase } from '../utils/demoData';

function installMockLocalStorage(throwOnSet = false): Map<string, string> {
  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => {
      if (throwOnSet) {
        throw new DOMException('QuotaExceededError', 'QuotaExceededError');
      }
      store.set(k, v);
    },
    removeItem: (k: string) => {
      store.delete(k);
    },
  });
  return store;
}

function installMockIndexedDb(backingMap: Map<string, unknown>) {
  vi.stubGlobal('indexedDB', {
    open: () => {
      const req: Record<string, unknown> = {
        result: {
          objectStoreNames: { contains: () => true },
          createObjectStore: () => undefined,
          close: () => undefined,
          transaction: () => {
            const tx: Record<string, unknown> = {
              oncomplete: null,
              onerror: null,
              onabort: null,
              objectStore: () => ({
                put: (val: unknown, key: string) => {
                  backingMap.set(key, val);
                  queueMicrotask(() => {
                    if (typeof tx.oncomplete === 'function') tx.oncomplete();
                  });
                },
                get: (key: string) => {
                  const getReq: Record<string, unknown> = {};
                  queueMicrotask(() => {
                    getReq.result = backingMap.get(key);
                    if (typeof getReq.onsuccess === 'function') getReq.onsuccess();
                    if (typeof tx.oncomplete === 'function') tx.oncomplete();
                  });
                  return getReq;
                },
                delete: (key: string) => {
                  backingMap.delete(key);
                  queueMicrotask(() => {
                    if (typeof tx.oncomplete === 'function') tx.oncomplete();
                  });
                },
              }),
            };
            return tx;
          },
        },
        onsuccess: null,
        onerror: null,
        onupgradeneeded: null,
      };
      queueMicrotask(() => {
        if (typeof req.onupgradeneeded === 'function') req.onupgradeneeded();
        if (typeof req.onsuccess === 'function') req.onsuccess();
      });
      return req;
    },
  });
}

describe('IndexedDB storage engine & normalization', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('falls back gracefully to localStorage when indexedDB is unavailable', async () => {
    const lsStore = installMockLocalStorage(false);
    expect(isIndexedDbAvailable()).toBe(false);

    const db: FamilyDatabase = createEmptyDatabase();
    const res = await saveDatabaseWithFallback(db);
    expect(res).toMatchObject({ ok: true, engine: 'localstorage' });
    expect(lsStore.get(STORAGE_KEYS.DB)).toBeTruthy();

    const info = await getStorageEngineInfo(db);
    expect(info.engine).toBe('localstorage');
    expect(info.estimatedBytes).toBeGreaterThan(20);
  });

  it('writes to IndexedDB, loads cleanly, and survives localStorage QuotaExceededError', async () => {
    const idbBacking = new Map<string, unknown>();
    installMockIndexedDb(idbBacking);
    const lsStore = installMockLocalStorage(true);
    lsStore.set(STORAGE_KEYS.DB, 'stale');

    expect(isIndexedDbAvailable()).toBe(true);
    const db: FamilyDatabase = createEmptyDatabase();
    const res = await saveDatabaseWithFallback(db);

    expect(res).toEqual({
      ok: true,
      engine: 'indexeddb',
      localStorageOverflow: true,
    });
    expect(idbBacking.get('database')).toEqual(db);
    expect(lsStore.has(STORAGE_KEYS.DB)).toBe(false);

    const loaded = await loadDatabaseFromIdb();
    expect(loaded?.schemaVersion).toBe(1);
    expect(loaded?.settings.gazetteCadence).toBe('monthly');
    expect(loaded?.rememberedPeople).toEqual([]);
  });

  it('normalizes legacy/partial profile languages and rememberedPeople safely', () => {
    const raw = createEmptyDatabase();
    raw.profiles = [
      {
        id: 'p1',
        name: 'Test',
        language: 'fr',
        avatarEmoji: '🌿',
        avatarTheme: 'teal',
        role: 'admin',
        pinHash: null,
        createdAt: raw.updatedAt,
        updatedAt: raw.updatedAt,
      },
    ];
    const broken = JSON.parse(JSON.stringify(raw)) as Record<string, unknown>;
    delete ((broken.profiles as Array<Record<string, unknown>>)[0]).language;
    delete broken.rememberedPeople;

    const normalized = normalizeLoadedDatabase(broken);
    expect(normalized?.profiles[0]?.language).toBe('fr');
    expect(normalized?.rememberedPeople).toEqual([]);
    expect(normalizeLoadedDatabase({ schemaVersion: 99 })).toBeNull();
  });
});
