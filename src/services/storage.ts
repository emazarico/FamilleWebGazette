import type { FamilyDatabase, SyncConfig, ThemeMode, UiLanguage } from '../types/family';
import { createEmptyDatabase } from '../utils/demoData';
import { DEFAULT_LANGUAGE } from '../utils/i18n';
import {
  clearDatabaseFromIdb,
  isIndexedDbAvailable,
  normalizeLoadedDatabase,
  saveDatabaseToIdb,
} from './idbStorage';

export const STORAGE_KEYS = {
  DB: 'familygazette_db_v1',
  SYNC_CONFIG: 'familygazette_sync_v1',
  THEME: 'familygazette_theme',
  UI_LANG: 'familygazette_ui_lang',
  ACTIVE_PROFILE_PERSISTENT: 'familygazette_active_profile',
  ACTIVE_PROFILE_SESSION: 'familygazette_active_profile_session',
  SESSION_TOKEN_TEMP: 'familygazette_session_token_temp',
  REMEMBER_DEVICE: 'familygazette_remember_device',
} as const;

const LOCAL_STORAGE_MIRROR_LIMIT = 4_000_000;

export function loadLocalDatabase(): FamilyDatabase {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.DB);
    if (!raw) return createEmptyDatabase();
    const parsed = JSON.parse(raw) as unknown;
    return normalizeLoadedDatabase(parsed) ?? createEmptyDatabase();
  } catch {
    return createEmptyDatabase();
  }
}

export function saveLocalDatabase(db: FamilyDatabase): { ok: boolean; error?: string } {
  try {
    localStorage.setItem(STORAGE_KEYS.DB, JSON.stringify(db));
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Storage quota exceeded';
    return { ok: false, error: message };
  }
}

export interface SaveFallbackResult {
  ok: boolean;
  engine: 'indexeddb' | 'localstorage';
  localStorageOverflow?: boolean;
  error?: string;
}

/**
 * Persists FamilyDatabase in IndexedDB while keeping a synchronous localStorage mirror
 * when below 4 MB (and deleting the localStorage key if exceeded so quota stays healthy).
 */
export async function saveDatabaseWithFallback(
  db: FamilyDatabase,
): Promise<SaveFallbackResult> {
  if (isIndexedDbAvailable()) {
    const idbRes = await saveDatabaseToIdb(db);
    if (idbRes.ok) {
      const serialized = JSON.stringify(db);
      if (serialized.length < LOCAL_STORAGE_MIRROR_LIMIT) {
        try {
          localStorage.setItem(STORAGE_KEYS.DB, serialized);
          return { ok: true, engine: 'indexeddb' };
        } catch {
          try {
            localStorage.removeItem(STORAGE_KEYS.DB);
          } catch {
            // ignore
          }
          return { ok: true, engine: 'indexeddb', localStorageOverflow: true };
        }
      } else {
        try {
          localStorage.removeItem(STORAGE_KEYS.DB);
        } catch {
          // ignore
        }
        return { ok: true, engine: 'indexeddb', localStorageOverflow: true };
      }
    }
  }

  const localRes = saveLocalDatabase(db);
  return {
    ok: localRes.ok,
    engine: 'localstorage',
    error: localRes.error,
  };
}

export function clearLocalDatabase(): void {
  try {
    localStorage.removeItem(STORAGE_KEYS.DB);
    localStorage.removeItem(STORAGE_KEYS.ACTIVE_PROFILE_PERSISTENT);
    sessionStorage.removeItem(STORAGE_KEYS.ACTIVE_PROFILE_SESSION);
    sessionStorage.removeItem(STORAGE_KEYS.SESSION_TOKEN_TEMP);
  } catch {
    // ignore
  }
  void clearDatabaseFromIdb();
}

export function loadSavedActiveProfileId(): string | null {
  try {
    const sessionId = sessionStorage.getItem(STORAGE_KEYS.ACTIVE_PROFILE_SESSION);
    if (sessionId) return sessionId;
    return localStorage.getItem(STORAGE_KEYS.ACTIVE_PROFILE_PERSISTENT);
  } catch {
    return null;
  }
}

export function persistActiveProfileSession(
  profileId: string | null,
  rememberOnDevice: boolean,
): void {
  try {
    localStorage.removeItem(STORAGE_KEYS.ACTIVE_PROFILE_PERSISTENT);
    sessionStorage.removeItem(STORAGE_KEYS.ACTIVE_PROFILE_SESSION);
    if (!profileId) return;
    localStorage.setItem(STORAGE_KEYS.REMEMBER_DEVICE, rememberOnDevice ? '1' : '0');
    if (rememberOnDevice) {
      localStorage.setItem(STORAGE_KEYS.ACTIVE_PROFILE_PERSISTENT, profileId);
    } else {
      sessionStorage.setItem(STORAGE_KEYS.ACTIVE_PROFILE_SESSION, profileId);
    }
  } catch {
    // ignore
  }
}

export function loadRememberDevicePreference(): boolean {
  try {
    const saved = localStorage.getItem(STORAGE_KEYS.REMEMBER_DEVICE);
    return saved !== '0';
  } catch {
    return true;
  }
}

export function persistSessionToken(token: string | null, rememberOnDevice: boolean): void {
  try {
    sessionStorage.removeItem(STORAGE_KEYS.SESSION_TOKEN_TEMP);
    if (token && !rememberOnDevice) {
      sessionStorage.setItem(STORAGE_KEYS.SESSION_TOKEN_TEMP, token);
    }
  } catch {
    // ignore
  }
}

export function loadActiveSessionToken(syncConfig: SyncConfig): string | null {
  try {
    const temp = sessionStorage.getItem(STORAGE_KEYS.SESSION_TOKEN_TEMP);
    if (temp) return temp;
  } catch {
    // ignore
  }
  return syncConfig.sessionToken || null;
}

export function loadInitialTheme(): ThemeMode {
  try {
    const saved = localStorage.getItem(STORAGE_KEYS.THEME);
    if (saved === 'dark' || saved === 'light') return saved;
    if (
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-color-scheme: dark)').matches
    ) {
      return 'dark';
    }
  } catch {
    // ignore
  }
  return 'light';
}

export function saveTheme(theme: ThemeMode): void {
  try {
    localStorage.setItem(STORAGE_KEYS.THEME, theme);
  } catch {
    // ignore
  }
}

export function loadStoredLanguage(): UiLanguage {
  try {
    const saved = localStorage.getItem(STORAGE_KEYS.UI_LANG);
    if (saved === 'en' || saved === 'fr') return saved;
  } catch {
    // ignore
  }
  return DEFAULT_LANGUAGE;
}

export function saveStoredLanguage(lang: UiLanguage): void {
  try {
    localStorage.setItem(STORAGE_KEYS.UI_LANG, lang);
    if (typeof document !== 'undefined') {
      document.documentElement.lang = lang;
    }
  } catch {
    // ignore
  }
}

export function loadSyncConfig(): SyncConfig {
  const fallback: SyncConfig = {
    mode: 'local',
    appsScriptUrl: '',
    familyInviteCode: '',
    sessionToken: null,
    lastSyncedAt: null,
  };
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.SYNC_CONFIG);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<SyncConfig>;
    return {
      mode: parsed.mode || 'local',
      appsScriptUrl: parsed.appsScriptUrl || '',
      familyInviteCode: parsed.familyInviteCode || '',
      sessionToken: parsed.sessionToken ?? null,
      lastSyncedAt: parsed.lastSyncedAt ?? null,
    };
  } catch {
    return fallback;
  }
}

export function saveSyncConfig(config: SyncConfig): void {
  try {
    localStorage.setItem(STORAGE_KEYS.SYNC_CONFIG, JSON.stringify(config));
  } catch {
    // ignore
  }
}
