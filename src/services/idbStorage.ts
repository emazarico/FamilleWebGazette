import type { FamilyDatabase } from '../types/family';
import { generateId } from '../utils/crypto';

const DB_NAME = 'familygazette_storage_v1';
const STORE_NAME = 'kv';
const DB_KEY = 'database';

export interface StorageEngineInfo {
  engine: 'indexeddb' | 'localstorage';
  estimatedBytes: number;
  quotaBytes?: number;
}

export function isIndexedDbAvailable(): boolean {
  return typeof indexedDB !== 'undefined';
}

function openStorageDb(): Promise<IDBDatabase | null> {
  if (!isIndexedDbAvailable()) {
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

export function normalizeLoadedDatabase(raw: unknown): FamilyDatabase | null {
  if (!raw || typeof raw !== 'object') return null;
  const parsed = raw as Partial<FamilyDatabase>;
  if (parsed.schemaVersion !== 1) return null;
  if (!Array.isArray(parsed.profiles) || !Array.isArray(parsed.posts)) return null;

  const now = new Date().toISOString();
  const s = parsed.settings;

  return {
    schemaVersion: 1,
    dbId: parsed.dbId || generateId('fgdb'),
    updatedAt: parsed.updatedAt || now,
    settings: {
      id: 'family_settings',
      familyName: s?.familyName || 'Notre Famille',
      inviteCode: s?.inviteCode || '',
      gazetteTitle: s?.gazetteTitle || 'La Gazette de la Famille',
      gazetteSubtitle: s?.gazetteSubtitle,
      gazetteCadence: s?.gazetteCadence || 'monthly',
      publishDayOfMonth: s?.publishDayOfMonth || 1,
      reminderDaysBefore: s?.reminderDaysBefore ?? 3,
      lastReminderCycleKey: s?.lastReminderCycleKey,
      gazetteTheme: s?.gazetteTheme || 'editorial',
      lastCompiledIssueNumber: s?.lastCompiledIssueNumber ?? 0,
      updatedAt: s?.updatedAt || now,
      deletedAt: s?.deletedAt ?? null,
    },
    profiles: parsed.profiles.map((p) => ({
      ...p,
      language: p.language === 'en' ? 'en' : 'fr',
    })),
    rememberedPeople: Array.isArray(parsed.rememberedPeople) ? parsed.rememberedPeople : [],
    media: Array.isArray(parsed.media) ? parsed.media : [],
    posts: parsed.posts,
    comments: Array.isArray(parsed.comments) ? parsed.comments : [],
    messages: Array.isArray(parsed.messages) ? parsed.messages : [],
    messageReplies: Array.isArray(parsed.messageReplies) ? parsed.messageReplies : [],
    subscribers: Array.isArray(parsed.subscribers) ? parsed.subscribers : [],
    gazettes: Array.isArray(parsed.gazettes) ? parsed.gazettes : [],
  };
}

export async function loadDatabaseFromIdb(): Promise<FamilyDatabase | null> {
  const idb = await openStorageDb();
  if (!idb) return null;

  return new Promise((resolve) => {
    try {
      const tx = idb.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(DB_KEY);
      req.onsuccess = () => resolve(normalizeLoadedDatabase(req.result));
      req.onerror = () => resolve(null);
      tx.oncomplete = () => {
        try {
          idb.close();
        } catch {
          // ignore close errors on mock IDB
        }
      };
    } catch {
      resolve(null);
    }
  });
}

export async function saveDatabaseToIdb(
  db: FamilyDatabase,
): Promise<{ ok: boolean; error?: string }> {
  const idb = await openStorageDb();
  if (!idb) {
    return { ok: false, error: 'IndexedDB unavailable' };
  }

  return new Promise((resolve) => {
    let settled = false;
    const finish = (res: { ok: boolean; error?: string }) => {
      if (settled) return;
      settled = true;
      resolve(res);
    };

    try {
      const tx = idb.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(db, DB_KEY);
      tx.oncomplete = () => {
        try {
          idb.close();
        } catch {
          // ignore
        }
        finish({ ok: true });
      };
      tx.onerror = () => finish({ ok: false, error: tx.error?.message || 'IndexedDB write failed' });
      tx.onabort = () => finish({ ok: false, error: tx.error?.message || 'IndexedDB aborted' });
    } catch (err) {
      finish({ ok: false, error: err instanceof Error ? err.message : 'IndexedDB write error' });
    }
  });
}

export async function clearDatabaseFromIdb(): Promise<void> {
  const idb = await openStorageDb();
  if (!idb) return;

  await new Promise<void>((resolve) => {
    try {
      const tx = idb.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(DB_KEY);
      tx.oncomplete = () => {
        try {
          idb.close();
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

export async function getStorageEngineInfo(db: FamilyDatabase): Promise<StorageEngineInfo> {
  const json = JSON.stringify(db);
  const estimatedBytes =
    typeof TextEncoder !== 'undefined' ? new TextEncoder().encode(json).length : json.length;

  let quotaBytes: number | undefined;
  try {
    if (typeof navigator !== 'undefined' && navigator.storage?.estimate) {
      const est = await navigator.storage.estimate();
      if (typeof est.quota === 'number') {
        quotaBytes = est.quota;
      }
    }
  } catch {
    // ignore storage estimate errors
  }

  return {
    engine: isIndexedDbAvailable() ? 'indexeddb' : 'localstorage',
    estimatedBytes,
    quotaBytes,
  };
}
