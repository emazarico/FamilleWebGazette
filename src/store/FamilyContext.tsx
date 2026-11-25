import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  blobToBase64,
  createAppsScriptAdapter,
} from '../services/appsScriptSync';
import { buildGazettePdfBlob } from '../services/gazettePdf';
import {
  getStorageEngineInfo,
  loadDatabaseFromIdb,
  type StorageEngineInfo,
} from '../services/idbStorage';
import { rasterizeMediaToJpeg } from '../services/mediaRender';
import {
  getLocalMediaBlob,
  registerRemoteMediaFetcher,
} from '../services/mediaStore';
import {
  loadActiveSessionToken,
  loadInitialTheme,
  loadLocalDatabase,
  loadRememberDevicePreference,
  loadSavedActiveProfileId,
  loadStoredLanguage,
  loadSyncConfig,
  persistActiveProfileSession,
  persistSessionToken,
  saveDatabaseWithFallback,
  saveStoredLanguage,
  saveSyncConfig,
  saveTheme,
} from '../services/storage';
import {
  SyncApiError,
  type ArchiveGazetteFilesResult,
  type SendGazetteRelayResult,
  type SendReminderRelayResult,
  type StorageSyncAdapter,
} from '../services/syncAdapter';
import type {
  AvatarTheme,
  CollageLayout,
  FamilyDatabase,
  FamilyProfile,
  FamilySettings,
  GazetteDeliveryMode,
  GazetteIssue,
  GazetteSubscriber,
  GazetteTheme,
  MediaAsset,
  MemberRole,
  MemoryPost,
  MessageReply,
  PhotoCrop,
  PostComment,
  PrivateMessage,
  RememberedPerson,
  SyncConfig,
  SyncStatus,
  ThemeMode,
  ToastMessage,
  UiLanguage,
} from '../types/family';
import { type ActivityItem, buildActivityFeed } from '../utils/activity';
import { canResetProfilePin, getFamilyAdmins, isProfileAdmin } from '../utils/admin';
import { generateId, generateSecretKey, hashPin, verifyPin } from '../utils/crypto';
import { createDemoFamilyDatabase, createEmptyDatabase } from '../utils/demoData';
import { buildDriveGazetteFilenames } from '../utils/drivePaths';
import {
  buildGazetteEmailDigest,
  buildReminderEmailDigest,
  buildStandaloneGazetteHtml,
} from '../utils/emailDigest';
import { computeNextGazetteSchedule, normalizeCollageLayout } from '../utils/feed';
import {
  buildGazetteSecretUrl,
  buildScopedGazettePayload,
  type ScopedGazettePayload,
} from '../utils/gazette';
import { t, type TranslationKey } from '../utils/i18n';
import { mergeDatabases } from '../utils/merge';
import {
  countUnreadMessages,
  getMessageLatestTimestamp,
  isMessageVisibleToProfile,
} from '../utils/messages';
import {
  normalizeAppsScriptUrl,
  resolveEffectiveAppsScriptUrl,
} from '../utils/syncUrls';

export interface CreateProfileInput {
  name: string;
  relationLabel?: string;
  email?: string;
  subscribeToGazette?: boolean;
  language: UiLanguage;
  avatarEmoji: string;
  avatarTheme: AvatarTheme;
  role: MemberRole;
  pin?: string;
}

export interface UpdateProfileInput {
  name?: string;
  relationLabel?: string;
  email?: string;
  subscribeToGazette?: boolean;
  language?: UiLanguage;
  avatarEmoji?: string;
  avatarTheme?: AvatarTheme;
  role?: MemberRole;
  /** undefined = keep existing, null = remove PIN, string = set new PIN */
  newPin?: string | null;
}

export interface CreateMemoryInput {
  mediaAssets?: MediaAsset[];
  mediaIds: string[];
  collageLayout: CollageLayout;
  mediaCrops?: Record<string, PhotoCrop>;
  caption: string;
  memoryDate: string;
  taggedProfileIds: string[];
  taggedGuestIds?: string[];
  includeInGazette: boolean;
  fullPageFeature: boolean;
}

export interface UpdateMemoryInput {
  mediaAssets?: MediaAsset[];
  mediaIds?: string[];
  collageLayout?: CollageLayout;
  mediaCrops?: Record<string, PhotoCrop>;
  caption?: string;
  memoryDate?: string;
  taggedProfileIds?: string[];
  taggedGuestIds?: string[];
  includeInGazette?: boolean;
  fullPageFeature?: boolean;
}

export interface CreatePrivateMessageInput {
  recipientProfileIds: string[];
  subject?: string;
  body: string;
}

export interface CompileGazetteInput {
  issueNumber: number;
  title: string;
  editorialNote?: string;
  theme: GazetteTheme;
  periodStart: string;
  periodEnd: string;
  includedPostIds: string[];
  shareExpiresAt?: string;
  recipientEmails?: string[];
}

export interface UpsertSubscriberInput {
  id?: string;
  name: string;
  email: string;
  language: UiLanguage;
  cadence?: 'monthly' | 'weekly' | 'both';
  deliveryMode?: GazetteDeliveryMode;
  active?: boolean;
}

interface FamilyContextValue {
  db: FamilyDatabase;
  hydrated: boolean;
  storageInfo: StorageEngineInfo;
  theme: ThemeMode;
  toggleTheme: () => void;
  language: UiLanguage;
  setLanguage: (lang: UiLanguage) => void;
  tr: (key: TranslationKey, params?: Record<string, string | number>) => string;
  syncStatus: SyncStatus;
  syncConfig: SyncConfig;
  updateSyncConfig: (patch: Partial<SyncConfig>) => void;
  connectCloudSync: (
    appsScriptUrl: string,
    inviteCode: string,
  ) => Promise<{ ok: boolean; familyName?: string; error?: string }>;
  disconnectCloudSync: () => void;
  syncNow: () => Promise<boolean>;

  activeProfiles: FamilyProfile[];
  adminProfiles: FamilyProfile[];
  activeProfile: FamilyProfile | null;
  isActiveProfileAdmin: boolean;
  pendingPinProfile: FamilyProfile | null;
  beginSwitchToProfile: (profileId: string) => void;
  cancelPendingPin: () => void;
  verifyPendingPin: (pin: string, rememberOnDevice?: boolean) => Promise<boolean>;
  logoutProfile: () => void;

  createProfile: (input: CreateProfileInput, autoLogin?: boolean) => Promise<FamilyProfile>;
  updateProfile: (profileId: string, input: UpdateProfileInput) => Promise<void>;
  deleteProfile: (profileId: string) => void;
  isProfileSubscribedToGazette: (profileId: string) => boolean;
  adminResetUserPin: (
    adminProfileId: string,
    adminPin: string | null,
    targetProfileId: string,
    newPin: string | null,
    autoLoginAfterReset?: boolean,
  ) => Promise<{ ok: boolean; error?: string }>;

  activeRememberedPeople: RememberedPerson[];
  rememberedPeopleById: Map<string, RememberedPerson>;
  createRememberedPerson: (
    name: string,
    relationLabel?: string,
    avatarEmoji?: string,
    avatarTheme?: AvatarTheme,
  ) => RememberedPerson;
  deleteRememberedPerson: (guestId: string) => void;
  upgradePersonToMember: (
    guestId: string,
    input: CreateProfileInput,
    autoLogin?: boolean,
  ) => Promise<FamilyProfile>;

  activePosts: MemoryPost[];
  activeComments: PostComment[];
  activeGazettes: GazetteIssue[];
  activeSubscribers: GazetteSubscriber[];
  queuedGazettePosts: MemoryPost[];
  profilesById: Map<string, FamilyProfile>;

  activeMessages: PrivateMessage[];
  activeMessageReplies: MessageReply[];
  visibleMessages: PrivateMessage[];
  unreadMessagesCount: number;
  activityItems: ActivityItem[];
  unreadActivityCount: number;

  createMemoryPost: (input: CreateMemoryInput) => MemoryPost | null;
  updateMemoryPost: (postId: string, input: UpdateMemoryInput) => void;
  deleteMemoryPost: (postId: string) => void;
  togglePostLike: (postId: string) => void;
  togglePostGazetteFlag: (postId: string) => void;
  togglePostFullPage: (postId: string) => void;
  addPostComment: (postId: string, body: string) => PostComment | null;
  deletePostComment: (commentId: string) => void;

  createPrivateMessage: (input: CreatePrivateMessageInput) => PrivateMessage | null;
  replyToPrivateMessage: (messageId: string, body: string) => MessageReply | null;
  markPrivateMessageRead: (messageId: string) => void;
  deletePrivateMessage: (messageId: string) => void;
  deleteMessageReply: (replyId: string) => void;
  markAllActivityRead: () => void;

  compileGazetteIssue: (input: CompileGazetteInput) => GazetteIssue | null;
  updateGazetteIssue: (
    issueId: string,
    patch: Partial<
      Pick<
        GazetteIssue,
        | 'title'
        | 'editorialNote'
        | 'theme'
        | 'shareExpiresAt'
        | 'shareRevoked'
        | 'sentAt'
        | 'deliveryChannel'
        | 'recipientEmails'
        | 'pdfDriveFileId'
        | 'htmlDriveFileId'
      >
    >,
  ) => void;
  rotateGazetteSecretKey: (issueId: string) => string | null;
  deleteGazetteIssue: (issueId: string) => void;
  upsertSubscriber: (input: UpsertSubscriberInput) => GazetteSubscriber | null;
  toggleSubscriberActive: (subscriberId: string) => void;
  deleteSubscriber: (subscriberId: string) => void;
  markReminderCycleSent: (cycleKey: string) => void;

  dispatchGazetteViaRelay: (issue: GazetteIssue) => Promise<SendGazetteRelayResult | null>;
  archiveGazetteToDrive: (issue: GazetteIssue) => Promise<ArchiveGazetteFilesResult | null>;
  dispatchReminderViaRelay: () => Promise<SendReminderRelayResult | null>;

  updateFamilySettings: (patch: Partial<FamilySettings>) => void;

  loadDemoFamily: () => void;
  resetToEmpty: () => void;

  toasts: ToastMessage[];
  addToast: (toast: Omit<ToastMessage, 'id'>) => void;
  dismissToast: (id: string) => void;
}

const FamilyContext = createContext<FamilyContextValue | null>(null);

const GUEST_EMOJIS = ['🧸', '🦁', '🚀', '🌸', '⚽', '🎵', '🎨', '🚲'];
const GUEST_THEMES: AvatarTheme[] = [
  'amber',
  'indigo',
  'rose',
  'emerald',
  'teal',
  'violet',
  'coral',
  'slate',
];

function syncSubscriberListForProfile(
  subscribers: GazetteSubscriber[],
  profile: FamilyProfile,
  subscribe: boolean | undefined,
  now: string,
): GazetteSubscriber[] {
  const cleanEmail = profile.email?.trim() || '';
  const existingIdx = subscribers.findIndex((s) => s.profileId === profile.id);

  if (!cleanEmail) {
    if (existingIdx === -1) return subscribers;
    return subscribers.map((s, idx) =>
      idx === existingIdx ? { ...s, active: false, deletedAt: now, updatedAt: now } : s,
    );
  }

  if (existingIdx !== -1) {
    const existing = subscribers[existingIdx];
    const nextActive = subscribe ?? existing.active;
    return subscribers.map((s, idx) =>
      idx === existingIdx
        ? {
            ...s,
            name: profile.name,
            email: cleanEmail,
            language: profile.language,
            active: nextActive,
            deletedAt: null,
            updatedAt: now,
          }
        : s,
    );
  }

  if (subscribe === false) {
    return subscribers;
  }

  const created: GazetteSubscriber = {
    id: generateId('sub'),
    name: profile.name,
    email: cleanEmail,
    profileId: profile.id,
    language: profile.language,
    cadence: 'monthly',
    deliveryMode: 'digest_and_links',
    active: true,
    createdAt: now,
    updatedAt: now,
  };
  return [...subscribers, created];
}

async function buildStandaloneHtmlForPayload(
  payload: ScopedGazettePayload,
  lang: UiLanguage,
): Promise<string> {
  const dataUrlsByMediaId: Record<string, string> = {};
  for (const post of payload.posts) {
    for (const mediaId of post.mediaIds) {
      if (dataUrlsByMediaId[mediaId]) continue;
      const rendered = await rasterizeMediaToJpeg(mediaId, {
        maxEdge: 1200,
        quality: 0.84,
        crop: post.mediaCrops?.[mediaId],
        variant: 'full',
      });
      if (rendered) {
        dataUrlsByMediaId[mediaId] = rendered.dataUrl;
      }
    }
  }
  return buildStandaloneGazetteHtml({
    payload,
    lang,
    dataUrlsByMediaId,
  });
}

export const FamilyProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [db, setDb] = useState<FamilyDatabase>(() => loadLocalDatabase());
  const [hydrated, setHydrated] = useState(false);
  const [theme, setTheme] = useState<ThemeMode>(() => loadInitialTheme());
  const [language, setLanguageState] = useState<UiLanguage>(() => loadStoredLanguage());
  const [syncConfig, setSyncConfig] = useState<SyncConfig>(() => {
    const loaded = loadSyncConfig();
    if (!loaded.appsScriptUrl) {
      const envUrl = resolveEffectiveAppsScriptUrl(null, null, import.meta.env.VITE_APPS_SCRIPT_URL);
      if (envUrl) {
        return { ...loaded, appsScriptUrl: envUrl };
      }
    }
    return loaded;
  });

  const [sessionTokenState, setSessionTokenState] = useState<string | null>(() =>
    loadActiveSessionToken(loadSyncConfig()),
  );
  const sessionTokenRef = useRef<string | null>(sessionTokenState);
  sessionTokenRef.current = sessionTokenState;

  const rememberDeviceRef = useRef<boolean>(loadRememberDevicePreference());

  const [syncStatus, setSyncStatus] = useState<SyncStatus>(() => {
    const initialCfg = loadSyncConfig();
    if (initialCfg.mode === 'apps-script') {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return 'offline';
      return initialCfg.lastSyncedAt ? 'synced' : 'local';
    }
    return 'local';
  });

  const [storageInfo, setStorageInfo] = useState<StorageEngineInfo>({
    engine: 'indexeddb',
    estimatedBytes: 0,
  });

  const [activeProfileId, setActiveProfileId] = useState<string | null>(() =>
    loadSavedActiveProfileId(),
  );
  const [pendingPinProfileId, setPendingPinProfileId] = useState<string | null>(null);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const isApplyingRemoteRef = useRef(false);
  const syncTimerRef = useRef<number | null>(null);
  const dbRef = useRef(db);
  dbRef.current = db;
  const syncConfigRef = useRef(syncConfig);
  syncConfigRef.current = syncConfig;

  const updateSyncConfig = useCallback((patch: Partial<SyncConfig>) => {
    setSyncConfig((prev) => {
      const next = { ...prev, ...patch };
      saveSyncConfig(next);
      return next;
    });
  }, []);

  const applySessionToken = useCallback(
    (token: string | null, rememberOnDevice: boolean) => {
      rememberDeviceRef.current = rememberOnDevice;
      sessionTokenRef.current = token;
      setSessionTokenState(token);
      persistSessionToken(token, rememberOnDevice);
      updateSyncConfig({ sessionToken: rememberOnDevice ? token : null });
    },
    [updateSyncConfig],
  );

  const addToast = useCallback((toast: Omit<ToastMessage, 'id'>) => {
    const id = generateId('toast');
    setToasts((prev) => [...prev.slice(-3), { ...toast, id }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((item) => item.id !== id));
    }, 5200);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const createAdapterFor = useCallback(
    (cfg: SyncConfig = syncConfigRef.current): StorageSyncAdapter | null => {
      if (cfg.mode !== 'apps-script') return null;
      const url = normalizeAppsScriptUrl(cfg.appsScriptUrl);
      const code = cfg.familyInviteCode.trim();
      if (!url || !code) return null;
      return createAppsScriptAdapter({
        appsScriptUrl: url,
        inviteCode: code,
        getSessionToken: () => sessionTokenRef.current,
      });
    },
    [],
  );

  const applyMergedRemoteDb = useCallback(
    (remoteDb: FamilyDatabase, syncedAt?: string) => {
      isApplyingRemoteRef.current = true;
      setDb((prev) => mergeDatabases(prev, remoteDb));
      if (syncedAt) {
        updateSyncConfig({ lastSyncedAt: syncedAt });
      }
    },
    [updateSyncConfig],
  );

  const uploadPendingMediaAssets = useCallback(
    async (adapter: StorageSyncAdapter, targetDb: FamilyDatabase) => {
      const candidates = targetDb.media.filter(
        (m) => !m.deletedAt && (!m.driveFileId || !m.driveThumbFileId),
      );
      if (candidates.length === 0) return;

      const profilesLookup = new Map(targetDb.profiles.map((p) => [p.id, p]));
      const uploadedUpdates = new Map<
        string,
        { driveFileId?: string; driveThumbFileId?: string }
      >();

      for (const asset of candidates) {
        try {
          const linkedPost = targetDb.posts.find(
            (p) => !p.deletedAt && p.mediaIds.includes(asset.id),
          );
          const memoryDate =
            linkedPost?.memoryDate?.slice(0, 10) || asset.createdAt?.slice(0, 10);
          const uploader =
            profilesLookup.get(linkedPost?.authorProfileId || asset.uploadedByProfileId);
          const meta = {
            memoryDate,
            authorName: uploader?.name,
          };

          let fullId = asset.driveFileId;
          let thumbId = asset.driveThumbFileId;

          if (!fullId) {
            const fullBlob = await getLocalMediaBlob(asset.id, 'full');
            if (fullBlob) {
              const res = await adapter.uploadMedia(
                asset.id,
                'full',
                fullBlob,
                asset.mimeType,
                meta,
              );
              fullId = res.driveFileId;
            }
          }
          if (!thumbId) {
            const thumbBlob = await getLocalMediaBlob(asset.id, 'thumb');
            if (thumbBlob) {
              const res = await adapter.uploadMedia(
                asset.id,
                'thumb',
                thumbBlob,
                asset.mimeType,
                meta,
              );
              thumbId = res.driveFileId;
            }
          }
          if (fullId !== asset.driveFileId || thumbId !== asset.driveThumbFileId) {
            uploadedUpdates.set(asset.id, { driveFileId: fullId, driveThumbFileId: thumbId });
          }
        } catch {
          // Retry on next sync pass
        }
      }

      if (uploadedUpdates.size > 0) {
        const now = new Date().toISOString();
        setDb((prev) => ({
          ...prev,
          updatedAt: now,
          media: prev.media.map((m) => {
            const patch = uploadedUpdates.get(m.id);
            return patch ? { ...m, ...patch, updatedAt: now } : m;
          }),
        }));
      }
    },
    [],
  );

  const handleSyncError = useCallback(
    (err: unknown) => {
      if (err instanceof SyncApiError) {
        if (err.code === 'NETWORK_OFFLINE') {
          setSyncStatus('offline');
          return;
        }
        if (err.code === 'TOKEN_EXPIRED' || err.code === 'UNAUTHORIZED') {
          applySessionToken(null, rememberDeviceRef.current);
          setSyncStatus('token_expired');
          addToast({ title: t(language, 'syncTokenExpiredToast'), tone: 'info' });
          return;
        }
      }
      setSyncStatus('error');
    },
    [addToast, applySessionToken, language],
  );

  const syncNow = useCallback(async (): Promise<boolean> => {
    const adapter = createAdapterFor(syncConfigRef.current);
    if (!adapter) return false;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setSyncStatus('offline');
      return false;
    }

    setSyncStatus('syncing');
    try {
      const currentProfile = dbRef.current.profiles.find(
        (p) => !p.deletedAt && p.id === activeProfileId,
      );

      if (!sessionTokenRef.current && currentProfile && !currentProfile.pinHash) {
        const loginRes = await adapter.login(currentProfile.id, null, currentProfile);
        applySessionToken(loginRes.sessionToken, rememberDeviceRef.current);
        applyMergedRemoteDb(loginRes.db, loginRes.syncedAt);
      }

      if (!sessionTokenRef.current) {
        const boot = await adapter.bootstrap();
        applyMergedRemoteDb(boot.db, boot.syncedAt);
        setSyncStatus('synced');
        return true;
      }

      await uploadPendingMediaAssets(adapter, dbRef.current);
      const pushed = await adapter.pushDb(mergeDatabases(dbRef.current, dbRef.current));
      applyMergedRemoteDb(pushed.db, pushed.syncedAt);
      setSyncStatus('synced');
      return true;
    } catch (err) {
      handleSyncError(err);
      return false;
    }
  }, [
    activeProfileId,
    applyMergedRemoteDb,
    applySessionToken,
    createAdapterFor,
    handleSyncError,
    uploadPendingMediaAssets,
  ]);

  const connectCloudSync = useCallback(
    async (
      appsScriptUrl: string,
      inviteCode: string,
    ): Promise<{ ok: boolean; familyName?: string; error?: string }> => {
      const normalizedUrl = normalizeAppsScriptUrl(appsScriptUrl);
      const cleanCode = inviteCode.trim();
      if (!normalizedUrl) {
        return { ok: false, error: t(language, 'syncInvalidUrlError') };
      }
      if (!cleanCode) {
        return { ok: false, error: t(language, 'syncInvalidInviteError') };
      }

      setSyncStatus('connecting');
      const tempAdapter = createAppsScriptAdapter({
        appsScriptUrl: normalizedUrl,
        inviteCode: cleanCode,
        getSessionToken: () => sessionTokenRef.current,
      });

      try {
        const pingRes = await tempAdapter.ping();
        const bootRes = await tempAdapter.bootstrap();

        applySessionToken(null, rememberDeviceRef.current);
        const nextCfg: SyncConfig = {
          mode: 'apps-script',
          appsScriptUrl: normalizedUrl,
          familyInviteCode: cleanCode,
          sessionToken: null,
          lastSyncedAt: bootRes.syncedAt,
        };
        saveSyncConfig(nextCfg);
        setSyncConfig(nextCfg);
        syncConfigRef.current = nextCfg;

        const mergedAfterBoot = mergeDatabases(dbRef.current, bootRes.db);
        isApplyingRemoteRef.current = true;
        setDb(mergedAfterBoot);

        const currentProfile = mergedAfterBoot.profiles.find(
          (p) => !p.deletedAt && p.id === activeProfileId,
        );
        if (currentProfile && !currentProfile.pinHash) {
          const loginRes = await tempAdapter.login(currentProfile.id, null, currentProfile);
          applySessionToken(loginRes.sessionToken, rememberDeviceRef.current);
          await uploadPendingMediaAssets(tempAdapter, mergedAfterBoot);
          const pushed = await tempAdapter.pushDb(mergedAfterBoot);
          applyMergedRemoteDb(pushed.db, pushed.syncedAt);
        } else if (currentProfile && currentProfile.pinHash) {
          setActiveProfileId(null);
          persistActiveProfileSession(null, rememberDeviceRef.current);
          setPendingPinProfileId(currentProfile.id);
        }

        setSyncStatus('synced');
        const resolvedName =
          pingRes.familyName || mergedAfterBoot.settings.familyName || 'FamilyGazette';
        return { ok: true, familyName: resolvedName };
      } catch (err) {
        setSyncStatus(
          err instanceof SyncApiError && err.code === 'NETWORK_OFFLINE' ? 'offline' : 'error',
        );
        const message = err instanceof Error ? err.message : t(language, 'syncError');
        return { ok: false, error: message };
      }
    },
    [
      activeProfileId,
      applyMergedRemoteDb,
      applySessionToken,
      language,
      uploadPendingMediaAssets,
    ],
  );

  const disconnectCloudSync = useCallback(() => {
    if (syncTimerRef.current) {
      window.clearTimeout(syncTimerRef.current);
      syncTimerRef.current = null;
    }
    applySessionToken(null, rememberDeviceRef.current);
    const localCfg: SyncConfig = {
      ...syncConfigRef.current,
      mode: 'local',
      sessionToken: null,
      lastSyncedAt: null,
    };
    saveSyncConfig(localCfg);
    setSyncConfig(localCfg);
    setSyncStatus('local');
    addToast({ title: t(language, 'syncDisconnectedToast'), tone: 'info' });
  }, [addToast, applySessionToken, language]);

  // Initial IDB hydration + background pull when connected
  useEffect(() => {
    let cancelled = false;
    void loadDatabaseFromIdb().then(async (idbDb) => {
      if (cancelled) return;
      if (idbDb) {
        isApplyingRemoteRef.current = true;
        setDb(idbDb);
      }
      setHydrated(true);

      const adapter = createAdapterFor(syncConfigRef.current);
      if (adapter && (typeof navigator === 'undefined' || navigator.onLine !== false)) {
        try {
          if (sessionTokenRef.current) {
            const pulled = await adapter.pullDb();
            if (!cancelled) {
              applyMergedRemoteDb(pulled.db, pulled.syncedAt);
              setSyncStatus('synced');
            }
          } else {
            const boot = await adapter.bootstrap();
            if (!cancelled) {
              applyMergedRemoteDb(boot.db, boot.syncedAt);
              setSyncStatus('synced');
            }
          }
        } catch (err) {
          if (!cancelled) {
            handleSyncError(err);
          }
        }
      }
    });
    return () => {
      cancelled = true;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Register lazy remote Drive media fetcher whenever Cloud Sync + token are active
  useEffect(() => {
    const adapter = createAdapterFor(syncConfig);
    if (!adapter || !sessionTokenState) {
      registerRemoteMediaFetcher(null);
      return;
    }
    registerRemoteMediaFetcher((mediaId, variant) => adapter.fetchMediaBlob(mediaId, variant));
    return () => {
      registerRemoteMediaFetcher(null);
    };
  }, [createAdapterFor, syncConfig, sessionTokenState]);

  // Persist DB locally and schedule debounced cloud push on local mutations
  useEffect(() => {
    if (!hydrated) return;
    void saveDatabaseWithFallback(db);
    void getStorageEngineInfo(db).then(setStorageInfo);

    if (isApplyingRemoteRef.current) {
      isApplyingRemoteRef.current = false;
      return;
    }

    const adapter = createAdapterFor(syncConfigRef.current);
    if (!adapter || !sessionTokenRef.current) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setSyncStatus('offline');
      return;
    }

    if (syncTimerRef.current) {
      window.clearTimeout(syncTimerRef.current);
    }
    syncTimerRef.current = window.setTimeout(() => {
      syncTimerRef.current = null;
      void syncNow();
    }, 1500);

    return () => {
      if (syncTimerRef.current) {
        window.clearTimeout(syncTimerRef.current);
      }
    };
  }, [db, hydrated, createAdapterFor, syncNow]);

  // Network online/offline reactivity
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onOffline = () => {
      if (syncConfigRef.current.mode === 'apps-script') {
        setSyncStatus('offline');
      }
    };
    const onOnline = () => {
      if (syncConfigRef.current.mode === 'apps-script') {
        void syncNow();
      }
    };
    window.addEventListener('offline', onOffline);
    window.addEventListener('online', onOnline);
    return () => {
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('online', onOnline);
    };
  }, [syncNow]);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    saveTheme(theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  }, []);

  const activeProfiles = useMemo(
    () => db.profiles.filter((p) => !p.deletedAt),
    [db.profiles],
  );

  const adminProfiles = useMemo(
    () => getFamilyAdmins(activeProfiles),
    [activeProfiles],
  );

  const profilesById = useMemo(() => {
    const map = new Map<string, FamilyProfile>();
    for (const p of db.profiles) {
      map.set(p.id, p);
    }
    return map;
  }, [db.profiles]);

  const activeRememberedPeople = useMemo(
    () => (db.rememberedPeople || []).filter((g) => !g.deletedAt && !g.upgradedToProfileId),
    [db.rememberedPeople],
  );

  const rememberedPeopleById = useMemo(() => {
    const map = new Map<string, RememberedPerson>();
    for (const g of db.rememberedPeople || []) {
      map.set(g.id, g);
    }
    return map;
  }, [db.rememberedPeople]);

  const activeProfile = useMemo(
    () => activeProfiles.find((p) => p.id === activeProfileId) || null,
    [activeProfiles, activeProfileId],
  );

  const pendingPinProfile = useMemo(
    () => activeProfiles.find((p) => p.id === pendingPinProfileId) || null,
    [activeProfiles, pendingPinProfileId],
  );

  const isActiveProfileAdmin = useMemo(
    () => (activeProfile ? isProfileAdmin(activeProfile, activeProfiles) : false),
    [activeProfile, activeProfiles],
  );

  useEffect(() => {
    if (activeProfileId && !activeProfiles.some((p) => p.id === activeProfileId)) {
      setActiveProfileId(null);
      persistActiveProfileSession(null, rememberDeviceRef.current);
    }
  }, [activeProfileId, activeProfiles]);

  useEffect(() => {
    if (activeProfile) {
      const targetLang: UiLanguage = activeProfile.language === 'en' ? 'en' : 'fr';
      setLanguageState(targetLang);
      saveStoredLanguage(targetLang);
    }
  }, [activeProfile?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const setLanguage = useCallback(
    (nextLang: UiLanguage) => {
      setLanguageState(nextLang);
      saveStoredLanguage(nextLang);
      if (activeProfileId) {
        const now = new Date().toISOString();
        setDb((prev) => ({
          ...prev,
          updatedAt: now,
          profiles: prev.profiles.map((p) =>
            p.id === activeProfileId && !p.deletedAt
              ? { ...p, language: nextLang, updatedAt: now }
              : p,
          ),
        }));
      }
    },
    [activeProfileId],
  );

  const tr = useCallback(
    (key: TranslationKey, params?: Record<string, string | number>) => t(language, key, params),
    [language],
  );

  const beginSwitchToProfile = useCallback(
    (profileId: string) => {
      const target = activeProfiles.find((p) => p.id === profileId);
      if (!target) return;
      if (target.pinHash) {
        setActiveProfileId(null);
        persistActiveProfileSession(null, rememberDeviceRef.current);
        applySessionToken(null, rememberDeviceRef.current);
        setPendingPinProfileId(target.id);
      } else {
        setPendingPinProfileId(null);
        setActiveProfileId(target.id);
        persistActiveProfileSession(target.id, true);

        const adapter = createAdapterFor(syncConfigRef.current);
        if (adapter && (typeof navigator === 'undefined' || navigator.onLine !== false)) {
          setSyncStatus('syncing');
          void adapter
            .login(target.id, null, target)
            .then((res) => {
              applySessionToken(res.sessionToken, true);
              applyMergedRemoteDb(res.db, res.syncedAt);
              setSyncStatus('synced');
            })
            .catch(handleSyncError);
        }
      }
    },
    [activeProfiles, applyMergedRemoteDb, applySessionToken, createAdapterFor, handleSyncError],
  );

  const cancelPendingPin = useCallback(() => {
    setPendingPinProfileId(null);
  }, []);

  const verifyPendingPin = useCallback(
    async (pin: string, rememberOnDevice = true): Promise<boolean> => {
      if (!pendingPinProfile) return false;
      if (pendingPinProfile.pinHash) {
        const okLocal = await verifyPin(
          pendingPinProfile.id,
          pin,
          pendingPinProfile.pinHash,
        );
        if (!okLocal) return false;
      }

      const adapter = createAdapterFor(syncConfigRef.current);
      if (adapter && (typeof navigator === 'undefined' || navigator.onLine !== false)) {
        setSyncStatus('syncing');
        try {
          const res = await adapter.login(pendingPinProfile.id, pin, pendingPinProfile);
          applySessionToken(res.sessionToken, rememberOnDevice);
          applyMergedRemoteDb(res.db, res.syncedAt);
          setSyncStatus('synced');
        } catch (err) {
          if (err instanceof SyncApiError && err.code === 'UNAUTHORIZED') {
            setSyncStatus('error');
            return false;
          }
          handleSyncError(err);
        }
      }

      setActiveProfileId(pendingPinProfile.id);
      persistActiveProfileSession(pendingPinProfile.id, rememberOnDevice);
      setPendingPinProfileId(null);
      return true;
    },
    [
      applyMergedRemoteDb,
      applySessionToken,
      createAdapterFor,
      handleSyncError,
      pendingPinProfile,
    ],
  );

  const logoutProfile = useCallback(() => {
    setActiveProfileId(null);
    setPendingPinProfileId(null);
    persistActiveProfileSession(null, rememberDeviceRef.current);
    applySessionToken(null, false);
  }, [applySessionToken]);

  const activeSubscribers = useMemo(
    () => db.subscribers.filter((s) => !s.deletedAt && s.active),
    [db.subscribers],
  );

  const isProfileSubscribedToGazette = useCallback(
    (profileId: string): boolean => {
      const sub = db.subscribers.find((s) => !s.deletedAt && s.profileId === profileId);
      return Boolean(sub?.active);
    },
    [db.subscribers],
  );

  const createProfile = useCallback(
    async (input: CreateProfileInput, autoLogin = true): Promise<FamilyProfile> => {
      const id = generateId('prof');
      const now = new Date().toISOString();
      const pinHash = input.pin ? await hashPin(id, input.pin) : null;
      const profile: FamilyProfile = {
        id,
        name: input.name.trim(),
        relationLabel: input.relationLabel?.trim() || undefined,
        email: input.email?.trim() || undefined,
        language: input.language || 'fr',
        avatarEmoji: input.avatarEmoji,
        avatarTheme: input.avatarTheme,
        role: input.role,
        pinHash,
        createdAt: now,
        updatedAt: now,
      };

      setDb((prev) => ({
        ...prev,
        updatedAt: now,
        profiles: [...prev.profiles, profile],
        subscribers: syncSubscriberListForProfile(
          prev.subscribers,
          profile,
          input.subscribeToGazette ?? Boolean(profile.email),
          now,
        ),
      }));

      if (autoLogin) {
        const remember = true;
        setActiveProfileId(profile.id);
        persistActiveProfileSession(profile.id, remember);
        setLanguageState(profile.language);
        saveStoredLanguage(profile.language);

        const adapter = createAdapterFor(syncConfigRef.current);
        if (adapter && (typeof navigator === 'undefined' || navigator.onLine !== false)) {
          setSyncStatus('syncing');
          void adapter
            .login(profile.id, input.pin || null, profile)
            .then((res) => {
              applySessionToken(res.sessionToken, remember);
              applyMergedRemoteDb(res.db, res.syncedAt);
              setSyncStatus('synced');
            })
            .catch(handleSyncError);
        }
      }

      addToast({
        title: t(autoLogin ? profile.language : language, 'profileCreatedToast', {
          name: profile.name,
        }),
        tone: 'success',
      });
      return profile;
    },
    [addToast, applyMergedRemoteDb, applySessionToken, createAdapterFor, handleSyncError, language],
  );

  const updateProfile = useCallback(
    async (profileId: string, input: UpdateProfileInput): Promise<void> => {
      const target = db.profiles.find((p) => p.id === profileId);
      if (!target) return;
      const now = new Date().toISOString();
      let nextPinHash = target.pinHash;
      if (input.newPin === null) {
        nextPinHash = null;
      } else if (typeof input.newPin === 'string' && input.newPin.trim().length >= 4) {
        nextPinHash = await hashPin(profileId, input.newPin);
      }

      const nextLanguage = input.language ?? target.language;
      const updated: FamilyProfile = {
        ...target,
        name: input.name !== undefined ? input.name.trim() : target.name,
        relationLabel:
          input.relationLabel !== undefined
            ? input.relationLabel.trim() || undefined
            : target.relationLabel,
        email: input.email !== undefined ? input.email.trim() || undefined : target.email,
        language: nextLanguage,
        avatarEmoji: input.avatarEmoji ?? target.avatarEmoji,
        avatarTheme: input.avatarTheme ?? target.avatarTheme,
        role: input.role ?? target.role,
        pinHash: nextPinHash,
        updatedAt: now,
      };

      setDb((prev) => ({
        ...prev,
        updatedAt: now,
        profiles: prev.profiles.map((p) => (p.id === profileId ? updated : p)),
        subscribers: syncSubscriberListForProfile(
          prev.subscribers,
          updated,
          input.subscribeToGazette,
          now,
        ),
      }));

      if (profileId === activeProfileId) {
        persistActiveProfileSession(profileId, rememberDeviceRef.current);
        if (input.language && input.language !== language) {
          setLanguageState(input.language);
          saveStoredLanguage(input.language);
        }
      }

      addToast({ title: t(nextLanguage, 'profileSavedToast'), tone: 'success' });
    },
    [activeProfileId, addToast, db.profiles, language],
  );

  const deleteProfile = useCallback(
    (profileId: string) => {
      const now = new Date().toISOString();
      setDb((prev) => ({
        ...prev,
        updatedAt: now,
        profiles: prev.profiles.map((p) =>
          p.id === profileId ? { ...p, deletedAt: now, updatedAt: now } : p,
        ),
        subscribers: prev.subscribers.map((s) =>
          s.profileId === profileId ? { ...s, active: false, deletedAt: now, updatedAt: now } : s,
        ),
      }));
      if (activeProfileId === profileId) {
        setActiveProfileId(null);
        persistActiveProfileSession(null, false);
        applySessionToken(null, false);
      }
      addToast({ title: tr('profileDeletedToast'), tone: 'info' });
    },
    [activeProfileId, addToast, applySessionToken, tr],
  );

  const createRememberedPerson = useCallback(
    (
      name: string,
      relationLabel?: string,
      avatarEmoji?: string,
      avatarTheme?: AvatarTheme,
    ): RememberedPerson => {
      const cleanName = name.trim();
      const existing = activeRememberedPeople.find(
        (g) => g.name.trim().toLowerCase() === cleanName.toLowerCase(),
      );
      if (existing) return existing;

      const now = new Date().toISOString();
      const idx = (db.rememberedPeople || []).length;
      const guest: RememberedPerson = {
        id: generateId('guest'),
        name: cleanName,
        relationLabel: relationLabel?.trim() || undefined,
        avatarEmoji: avatarEmoji || GUEST_EMOJIS[idx % GUEST_EMOJIS.length],
        avatarTheme: avatarTheme || GUEST_THEMES[idx % GUEST_THEMES.length],
        createdAt: now,
        updatedAt: now,
      };

      setDb((prev) => ({
        ...prev,
        updatedAt: now,
        rememberedPeople: [...(prev.rememberedPeople || []), guest],
      }));
      addToast({ title: tr('guestAddedToast', { name: guest.name }), tone: 'success' });
      return guest;
    },
    [activeRememberedPeople, addToast, db.rememberedPeople, tr],
  );

  const deleteRememberedPerson = useCallback((guestId: string) => {
    const now = new Date().toISOString();
    setDb((prev) => ({
      ...prev,
      updatedAt: now,
      rememberedPeople: (prev.rememberedPeople || []).map((g) =>
        g.id === guestId ? { ...g, deletedAt: now, updatedAt: now } : g,
      ),
    }));
  }, []);

  const upgradePersonToMember = useCallback(
    async (
      guestId: string,
      input: CreateProfileInput,
      autoLogin = false,
    ): Promise<FamilyProfile> => {
      const id = generateId('prof');
      const now = new Date().toISOString();
      const pinHash = input.pin ? await hashPin(id, input.pin) : null;
      const newProfile: FamilyProfile = {
        id,
        name: input.name.trim(),
        relationLabel: input.relationLabel?.trim() || undefined,
        email: input.email?.trim() || undefined,
        language: input.language || 'fr',
        avatarEmoji: input.avatarEmoji,
        avatarTheme: input.avatarTheme,
        role: input.role,
        pinHash,
        createdAt: now,
        updatedAt: now,
      };

      setDb((prev) => ({
        ...prev,
        updatedAt: now,
        profiles: [...prev.profiles, newProfile],
        subscribers: syncSubscriberListForProfile(
          prev.subscribers,
          newProfile,
          input.subscribeToGazette ?? Boolean(newProfile.email),
          now,
        ),
        rememberedPeople: (prev.rememberedPeople || []).map((g) =>
          g.id === guestId
            ? { ...g, upgradedToProfileId: newProfile.id, deletedAt: now, updatedAt: now }
            : g,
        ),
        posts: prev.posts.map((post) => {
          if (post.deletedAt || !post.taggedGuestIds?.includes(guestId)) return post;
          return {
            ...post,
            taggedGuestIds: post.taggedGuestIds.filter((gid) => gid !== guestId),
            taggedProfileIds: Array.from(new Set([...post.taggedProfileIds, newProfile.id])),
            updatedAt: now,
          };
        }),
      }));

      if (autoLogin) {
        setActiveProfileId(newProfile.id);
        persistActiveProfileSession(newProfile.id, true);
      }

      addToast({
        title: tr('guestUpgradedToast', { name: newProfile.name }),
        tone: 'success',
      });
      return newProfile;
    },
    [addToast, tr],
  );

  const adminResetUserPin = useCallback(
    async (
      adminProfileId: string,
      adminPin: string | null,
      targetProfileId: string,
      newPin: string | null,
      autoLoginAfterReset = false,
    ): Promise<{ ok: boolean; error?: string }> => {
      const admin = activeProfiles.find((p) => p.id === adminProfileId);
      const target = activeProfiles.find((p) => p.id === targetProfileId);
      if (!admin || !target || !canResetProfilePin(admin, target, activeProfiles)) {
        return { ok: false, error: tr('pinResetError') };
      }

      if (admin.pinHash) {
        if (!adminPin) {
          return { ok: false, error: tr('pinIncorrect') };
        }
        const ok = await verifyPin(admin.id, adminPin, admin.pinHash);
        if (!ok) {
          return { ok: false, error: tr('pinIncorrect') };
        }
      }

      const nextHash = newPin ? await hashPin(target.id, newPin) : null;
      const now = new Date().toISOString();
      setDb((prev) => ({
        ...prev,
        updatedAt: now,
        profiles: prev.profiles.map((p) =>
          p.id === target.id ? { ...p, pinHash: nextHash, updatedAt: now } : p,
        ),
      }));

      if (autoLoginAfterReset) {
        setPendingPinProfileId(null);
        setActiveProfileId(target.id);
        persistActiveProfileSession(target.id, true);
      }

      addToast({ title: tr('pinResetSuccess', { name: target.name }), tone: 'success' });
      return { ok: true };
    },
    [activeProfiles, addToast, tr],
  );

  const activePosts = useMemo(
    () => db.posts.filter((p) => !p.deletedAt),
    [db.posts],
  );

  const activeComments = useMemo(
    () => db.comments.filter((c) => !c.deletedAt),
    [db.comments],
  );

  const activeGazettes = useMemo(
    () =>
      db.gazettes
        .filter((g) => !g.deletedAt)
        .sort((a, b) => b.issueNumber - a.issueNumber),
    [db.gazettes],
  );

  const queuedGazettePosts = useMemo(
    () =>
      activePosts.filter(
        (p) => p.includeInGazette && (!p.publishedIssueIds || p.publishedIssueIds.length === 0),
      ),
    [activePosts],
  );

  const activeMessages = useMemo(
    () => (db.messages || []).filter((m) => !m.deletedAt),
    [db.messages],
  );

  const activeMessageReplies = useMemo(
    () => (db.messageReplies || []).filter((r) => !r.deletedAt),
    [db.messageReplies],
  );

  const visibleMessages = useMemo(() => {
    if (!activeProfile) return [];
    return activeMessages
      .filter((m) => isMessageVisibleToProfile(m, activeProfile.id))
      .sort((a, b) =>
        getMessageLatestTimestamp(b, activeMessageReplies).localeCompare(
          getMessageLatestTimestamp(a, activeMessageReplies),
        ),
      );
  }, [activeMessages, activeMessageReplies, activeProfile]);

  const unreadMessagesCount = useMemo(
    () => countUnreadMessages(visibleMessages, activeProfile?.id || null),
    [visibleMessages, activeProfile?.id],
  );

  const activityItems = useMemo(
    () => buildActivityFeed(db, activeProfile),
    [db, activeProfile],
  );

  const unreadActivityCount = useMemo(
    () => activityItems.filter((item) => item.unread).length,
    [activityItems],
  );

  const createMemoryPost = useCallback(
    (input: CreateMemoryInput): MemoryPost | null => {
      if (!activeProfile) return null;
      const now = new Date().toISOString();
      const mediaIds = input.mediaIds.slice(0, 4);
      const post: MemoryPost = {
        id: generateId('post'),
        authorProfileId: activeProfile.id,
        kind: mediaIds.length > 0 ? 'photo' : 'story',
        mediaIds,
        collageLayout: normalizeCollageLayout(mediaIds.length, input.collageLayout),
        mediaCrops: input.mediaCrops,
        caption: input.caption.trim(),
        memoryDate: input.memoryDate || now.slice(0, 10),
        taggedProfileIds: Array.from(new Set(input.taggedProfileIds)),
        taggedGuestIds: Array.from(new Set(input.taggedGuestIds || [])),
        likedByProfileIds: [],
        includeInGazette: input.includeInGazette,
        fullPageFeature: mediaIds.length > 0 ? input.fullPageFeature : false,
        publishedIssueIds: [],
        createdAt: now,
        updatedAt: now,
      };

      setDb((prev) => {
        const existingMediaIds = new Set(prev.media.map((m) => m.id));
        const newMedia = (input.mediaAssets || []).filter((m) => !existingMediaIds.has(m.id));
        return {
          ...prev,
          updatedAt: now,
          media: [...prev.media, ...newMedia],
          posts: [post, ...prev.posts],
        };
      });

      addToast({ title: tr('memoryPublishedToast'), tone: 'success' });
      return post;
    },
    [activeProfile, addToast, tr],
  );

  const updateMemoryPost = useCallback(
    (postId: string, input: UpdateMemoryInput) => {
      const now = new Date().toISOString();
      setDb((prev) => {
        const existingMediaIds = new Set(prev.media.map((m) => m.id));
        const newMedia = (input.mediaAssets || []).filter((m) => !existingMediaIds.has(m.id));
        return {
          ...prev,
          updatedAt: now,
          media: [...prev.media, ...newMedia],
          posts: prev.posts.map((p) => {
            if (p.id !== postId || p.deletedAt) return p;
            const nextMediaIds = (input.mediaIds ?? p.mediaIds).slice(0, 4);
            return {
              ...p,
              mediaIds: nextMediaIds,
              kind: nextMediaIds.length > 0 ? 'photo' : 'story',
              collageLayout: normalizeCollageLayout(
                nextMediaIds.length,
                input.collageLayout ?? p.collageLayout,
              ),
              mediaCrops: input.mediaCrops !== undefined ? input.mediaCrops : p.mediaCrops,
              caption: input.caption !== undefined ? input.caption.trim() : p.caption,
              memoryDate: input.memoryDate ?? p.memoryDate,
              taggedProfileIds:
                input.taggedProfileIds !== undefined
                  ? Array.from(new Set(input.taggedProfileIds))
                  : p.taggedProfileIds,
              taggedGuestIds:
                input.taggedGuestIds !== undefined
                  ? Array.from(new Set(input.taggedGuestIds))
                  : p.taggedGuestIds,
              includeInGazette: input.includeInGazette ?? p.includeInGazette,
              fullPageFeature:
                nextMediaIds.length > 0
                  ? (input.fullPageFeature ?? p.fullPageFeature)
                  : false,
              updatedAt: now,
            };
          }),
        };
      });
      addToast({ title: tr('memoryUpdatedToast'), tone: 'success' });
    },
    [addToast, tr],
  );

  const deleteMemoryPost = useCallback(
    (postId: string) => {
      const now = new Date().toISOString();
      setDb((prev) => ({
        ...prev,
        updatedAt: now,
        posts: prev.posts.map((p) =>
          p.id === postId ? { ...p, deletedAt: now, updatedAt: now } : p,
        ),
      }));
      addToast({
        title: tr('postDeletedToast'),
        tone: 'info',
        undoAction: () => {
          const restoreAt = new Date().toISOString();
          setDb((prev) => ({
            ...prev,
            updatedAt: restoreAt,
            posts: prev.posts.map((p) =>
              p.id === postId ? { ...p, deletedAt: null, updatedAt: restoreAt } : p,
            ),
          }));
        },
      });
    },
    [addToast, tr],
  );

  const togglePostLike = useCallback(
    (postId: string) => {
      if (!activeProfile) return;
      const now = new Date().toISOString();
      setDb((prev) => ({
        ...prev,
        updatedAt: now,
        posts: prev.posts.map((p) => {
          if (p.id !== postId || p.deletedAt) return p;
          const has = p.likedByProfileIds.includes(activeProfile.id);
          const likedByProfileIds = has
            ? p.likedByProfileIds.filter((id) => id !== activeProfile.id)
            : [...p.likedByProfileIds, activeProfile.id];
          return { ...p, likedByProfileIds, updatedAt: now };
        }),
      }));
    },
    [activeProfile],
  );

  const togglePostGazetteFlag = useCallback((postId: string) => {
    const now = new Date().toISOString();
    setDb((prev) => ({
      ...prev,
      updatedAt: now,
      posts: prev.posts.map((p) =>
        p.id === postId && !p.deletedAt
          ? { ...p, includeInGazette: !p.includeInGazette, updatedAt: now }
          : p,
      ),
    }));
  }, []);

  const togglePostFullPage = useCallback((postId: string) => {
    const now = new Date().toISOString();
    setDb((prev) => ({
      ...prev,
      updatedAt: now,
      posts: prev.posts.map((p) =>
        p.id === postId && !p.deletedAt
          ? { ...p, fullPageFeature: !p.fullPageFeature, updatedAt: now }
          : p,
      ),
    }));
  }, []);

  const addPostComment = useCallback(
    (postId: string, body: string): PostComment | null => {
      if (!activeProfile) return null;
      const clean = body.trim();
      if (!clean) return null;
      const now = new Date().toISOString();
      const comment: PostComment = {
        id: generateId('cmt'),
        postId,
        authorProfileId: activeProfile.id,
        body: clean,
        createdAt: now,
        updatedAt: now,
      };
      setDb((prev) => ({
        ...prev,
        updatedAt: now,
        comments: [...prev.comments, comment],
      }));
      return comment;
    },
    [activeProfile],
  );

  const deletePostComment = useCallback((commentId: string) => {
    const now = new Date().toISOString();
    setDb((prev) => ({
      ...prev,
      updatedAt: now,
      comments: prev.comments.map((c) =>
        c.id === commentId ? { ...c, deletedAt: now, updatedAt: now } : c,
      ),
    }));
  }, []);

  const createPrivateMessage = useCallback(
    (input: CreatePrivateMessageInput): PrivateMessage | null => {
      if (!activeProfile) return null;
      const cleanBody = input.body.trim();
      const recipientIds = Array.from(new Set(input.recipientProfileIds)).filter(
        (id) => id !== activeProfile.id,
      );
      if (!cleanBody || recipientIds.length === 0) return null;

      const now = new Date().toISOString();
      const msg: PrivateMessage = {
        id: generateId('msg'),
        senderProfileId: activeProfile.id,
        recipientProfileIds: recipientIds,
        subject: input.subject?.trim() || undefined,
        body: cleanBody,
        readByProfileIds: [activeProfile.id],
        createdAt: now,
        updatedAt: now,
      };

      setDb((prev) => ({
        ...prev,
        updatedAt: now,
        messages: [msg, ...(prev.messages || [])],
      }));

      addToast({ title: tr('messagesSentToast'), tone: 'success' });
      return msg;
    },
    [activeProfile, addToast, tr],
  );

  const replyToPrivateMessage = useCallback(
    (messageId: string, body: string): MessageReply | null => {
      if (!activeProfile) return null;
      const clean = body.trim();
      if (!clean) return null;
      const now = new Date().toISOString();
      const reply: MessageReply = {
        id: generateId('mrep'),
        messageId,
        authorProfileId: activeProfile.id,
        body: clean,
        createdAt: now,
        updatedAt: now,
      };

      setDb((prev) => ({
        ...prev,
        updatedAt: now,
        messageReplies: [...(prev.messageReplies || []), reply],
        messages: (prev.messages || []).map((m) =>
          m.id === messageId && !m.deletedAt
            ? { ...m, readByProfileIds: [activeProfile.id], updatedAt: now }
            : m,
        ),
      }));
      return reply;
    },
    [activeProfile],
  );

  const markPrivateMessageRead = useCallback(
    (messageId: string) => {
      if (!activeProfile) return;
      const target = (db.messages || []).find((m) => m.id === messageId);
      if (!target || target.deletedAt || target.readByProfileIds.includes(activeProfile.id)) {
        return;
      }
      const now = new Date().toISOString();
      setDb((prev) => ({
        ...prev,
        updatedAt: now,
        messages: (prev.messages || []).map((m) =>
          m.id === messageId && !m.readByProfileIds.includes(activeProfile.id)
            ? {
                ...m,
                readByProfileIds: [...m.readByProfileIds, activeProfile.id],
                updatedAt: now,
              }
            : m,
        ),
      }));
    },
    [activeProfile, db.messages],
  );

  const deletePrivateMessage = useCallback(
    (messageId: string) => {
      const now = new Date().toISOString();
      setDb((prev) => ({
        ...prev,
        updatedAt: now,
        messages: (prev.messages || []).map((m) =>
          m.id === messageId ? { ...m, deletedAt: now, updatedAt: now } : m,
        ),
      }));
      addToast({
        title: tr('messagesDeletedToast'),
        tone: 'info',
        undoAction: () => {
          const restoreAt = new Date().toISOString();
          setDb((prev) => ({
            ...prev,
            updatedAt: restoreAt,
            messages: (prev.messages || []).map((m) =>
              m.id === messageId ? { ...m, deletedAt: null, updatedAt: restoreAt } : m,
            ),
          }));
        },
      });
    },
    [addToast, tr],
  );

  const deleteMessageReply = useCallback((replyId: string) => {
    const now = new Date().toISOString();
    setDb((prev) => ({
      ...prev,
      updatedAt: now,
      messageReplies: (prev.messageReplies || []).map((r) =>
        r.id === replyId ? { ...r, deletedAt: now, updatedAt: now } : r,
      ),
    }));
  }, []);

  const markAllActivityRead = useCallback(() => {
    if (!activeProfile) return;
    const now = new Date().toISOString();
    setDb((prev) => ({
      ...prev,
      updatedAt: now,
      profiles: prev.profiles.map((p) =>
        p.id === activeProfile.id ? { ...p, lastSeenActivityAt: now, updatedAt: now } : p,
      ),
      messages: (prev.messages || []).map((m) =>
        isMessageVisibleToProfile(m, activeProfile.id) &&
        !m.readByProfileIds.includes(activeProfile.id)
          ? {
              ...m,
              readByProfileIds: [...m.readByProfileIds, activeProfile.id],
              updatedAt: now,
            }
          : m,
      ),
    }));
  }, [activeProfile]);

  const compileGazetteIssue = useCallback(
    (input: CompileGazetteInput): GazetteIssue | null => {
      if (!activeProfile || !isActiveProfileAdmin) return null;
      const includedIds = Array.from(new Set(input.includedPostIds));
      if (includedIds.length === 0) return null;

      const now = new Date().toISOString();
      const issueNumber = Math.max(1, Math.round(input.issueNumber));
      const recipientEmails =
        input.recipientEmails ??
        activeSubscribers.map((s) => s.email).filter(Boolean);

      const issue: GazetteIssue = {
        id: generateId('gaz'),
        issueNumber,
        title: input.title.trim() || `${db.settings.gazetteTitle} — N° ${issueNumber}`,
        editorialNote: input.editorialNote?.trim() || undefined,
        theme: input.theme,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        includedPostIds: includedIds,
        compiledByProfileId: activeProfile.id,
        recipientEmails,
        deliveryChannel: 'manual',
        secretKey: generateSecretKey(24),
        shareExpiresAt: input.shareExpiresAt,
        shareRevoked: false,
        createdAt: now,
        updatedAt: now,
      };

      const includedSet = new Set(includedIds);
      setDb((prev) => ({
        ...prev,
        updatedAt: now,
        settings: {
          ...prev.settings,
          lastCompiledIssueNumber: Math.max(
            prev.settings.lastCompiledIssueNumber || 0,
            issueNumber,
          ),
          updatedAt: now,
        },
        gazettes: [issue, ...prev.gazettes],
        posts: prev.posts.map((p) => {
          if (!includedSet.has(p.id) || p.deletedAt) return p;
          const nextIssueNums = Array.from(new Set([...(p.publishedIssueIds || []), issueNumber]));
          return { ...p, publishedIssueIds: nextIssueNums, updatedAt: now };
        }),
      }));

      addToast({
        title: tr('gazettesCompiledToast', { n: issueNumber }),
        tone: 'success',
      });
      return issue;
    },
    [
      activeProfile,
      activeSubscribers,
      addToast,
      db.settings.gazetteTitle,
      isActiveProfileAdmin,
      tr,
    ],
  );

  const updateGazetteIssue = useCallback(
    (
      issueId: string,
      patch: Partial<
        Pick<
          GazetteIssue,
          | 'title'
          | 'editorialNote'
          | 'theme'
          | 'shareExpiresAt'
          | 'shareRevoked'
          | 'sentAt'
          | 'deliveryChannel'
          | 'recipientEmails'
          | 'pdfDriveFileId'
          | 'htmlDriveFileId'
        >
      >,
    ) => {
      const now = new Date().toISOString();
      setDb((prev) => ({
        ...prev,
        updatedAt: now,
        gazettes: prev.gazettes.map((g) =>
          g.id === issueId && !g.deletedAt ? { ...g, ...patch, updatedAt: now } : g,
        ),
      }));
    },
    [],
  );

  const rotateGazetteSecretKey = useCallback(
    (issueId: string): string | null => {
      if (!isActiveProfileAdmin) return null;
      const newKey = generateSecretKey(24);
      const now = new Date().toISOString();
      setDb((prev) => ({
        ...prev,
        updatedAt: now,
        gazettes: prev.gazettes.map((g) =>
          g.id === issueId && !g.deletedAt
            ? { ...g, secretKey: newKey, shareRevoked: false, updatedAt: now }
            : g,
        ),
      }));
      addToast({ title: tr('shareRotateKeyToast'), tone: 'info' });
      return newKey;
    },
    [addToast, isActiveProfileAdmin, tr],
  );

  const deleteGazetteIssue = useCallback(
    (issueId: string) => {
      if (!isActiveProfileAdmin) return;
      const now = new Date().toISOString();
      setDb((prev) => ({
        ...prev,
        updatedAt: now,
        gazettes: prev.gazettes.map((g) =>
          g.id === issueId ? { ...g, deletedAt: now, updatedAt: now } : g,
        ),
      }));
      addToast({
        title: tr('gazettesDeletedToast'),
        tone: 'info',
        undoAction: () => {
          const restoreAt = new Date().toISOString();
          setDb((prev) => ({
            ...prev,
            updatedAt: restoreAt,
            gazettes: prev.gazettes.map((g) =>
              g.id === issueId ? { ...g, deletedAt: null, updatedAt: restoreAt } : g,
            ),
          }));
        },
      });
    },
    [addToast, isActiveProfileAdmin, tr],
  );

  const upsertSubscriber = useCallback(
    (input: UpsertSubscriberInput): GazetteSubscriber | null => {
      const cleanName = input.name.trim();
      const cleanEmail = input.email.trim();
      if (!cleanName || !cleanEmail.includes('@')) return null;

      const now = new Date().toISOString();
      let savedRecord: GazetteSubscriber | null = null;

      setDb((prev) => {
        const existingIdx = input.id
          ? prev.subscribers.findIndex((s) => s.id === input.id)
          : prev.subscribers.findIndex(
              (s) => !s.deletedAt && s.email.toLowerCase() === cleanEmail.toLowerCase(),
            );

        if (existingIdx !== -1) {
          const updated: GazetteSubscriber = {
            ...prev.subscribers[existingIdx],
            name: cleanName,
            email: cleanEmail,
            language: input.language,
            cadence: input.cadence ?? prev.subscribers[existingIdx].cadence,
            deliveryMode: input.deliveryMode ?? prev.subscribers[existingIdx].deliveryMode,
            active: input.active ?? prev.subscribers[existingIdx].active,
            deletedAt: null,
            updatedAt: now,
          };
          savedRecord = updated;
          return {
            ...prev,
            updatedAt: now,
            subscribers: prev.subscribers.map((s, i) => (i === existingIdx ? updated : s)),
          };
        }

        const created: GazetteSubscriber = {
          id: generateId('sub'),
          name: cleanName,
          email: cleanEmail,
          language: input.language,
          cadence: input.cadence ?? 'monthly',
          deliveryMode: input.deliveryMode ?? 'digest_and_links',
          active: input.active ?? true,
          createdAt: now,
          updatedAt: now,
        };
        savedRecord = created;
        return {
          ...prev,
          updatedAt: now,
          subscribers: [...prev.subscribers, created],
        };
      });

      addToast({ title: tr('subscribersSavedToast'), tone: 'success' });
      return savedRecord;
    },
    [addToast, tr],
  );

  const toggleSubscriberActive = useCallback((subscriberId: string) => {
    const now = new Date().toISOString();
    setDb((prev) => ({
      ...prev,
      updatedAt: now,
      subscribers: prev.subscribers.map((s) =>
        s.id === subscriberId && !s.deletedAt
          ? { ...s, active: !s.active, updatedAt: now }
          : s,
      ),
    }));
  }, []);

  const deleteSubscriber = useCallback(
    (subscriberId: string) => {
      const now = new Date().toISOString();
      setDb((prev) => ({
        ...prev,
        updatedAt: now,
        subscribers: prev.subscribers.map((s) =>
          s.id === subscriberId ? { ...s, active: false, deletedAt: now, updatedAt: now } : s,
        ),
      }));
      addToast({ title: tr('subscribersSavedToast'), tone: 'info' });
    },
    [addToast, tr],
  );

  const markReminderCycleSent = useCallback(
    (cycleKey: string) => {
      const now = new Date().toISOString();
      setDb((prev) => ({
        ...prev,
        updatedAt: now,
        settings: {
          ...prev.settings,
          lastReminderCycleKey: cycleKey,
          updatedAt: now,
        },
      }));
      addToast({ title: tr('gazettesReminderMarkedToast', { cycle: cycleKey }), tone: 'success' });
    },
    [addToast, tr],
  );

  const archiveGazetteToDrive = useCallback(
    async (issue: GazetteIssue): Promise<ArchiveGazetteFilesResult | null> => {
      if (!isActiveProfileAdmin) return null;
      const adapter = createAdapterFor(syncConfigRef.current);
      if (!adapter) return null;

      setSyncStatus('syncing');
      try {
        await uploadPendingMediaAssets(adapter, dbRef.current);
        await adapter.pushDb(dbRef.current);

        const scopedPayload = buildScopedGazettePayload(dbRef.current, issue);
        const { pdfName, htmlName } = buildDriveGazetteFilenames(issue);

        const builtPdf = await buildGazettePdfBlob(scopedPayload, language);
        const pdfBase64 =
          builtPdf.byteSize < 20_000_000 ? await blobToBase64(builtPdf.blob) : undefined;
        const htmlContent = await buildStandaloneHtmlForPayload(scopedPayload, language);

        const res = await adapter.archiveGazetteFiles({
          issueId: issue.id,
          pdfBase64,
          pdfFilename: pdfName,
          htmlContent,
          htmlFilename: htmlName,
        });

        const now = new Date().toISOString();
        setDb((prev) => ({
          ...prev,
          updatedAt: now,
          gazettes: prev.gazettes.map((g) =>
            g.id === issue.id
              ? {
                  ...g,
                  pdfDriveFileId: res.pdfDriveFileId ?? g.pdfDriveFileId,
                  htmlDriveFileId: res.htmlDriveFileId ?? g.htmlDriveFileId,
                  updatedAt: now,
                }
              : g,
          ),
        }));
        updateSyncConfig({ lastSyncedAt: now });
        setSyncStatus('synced');
        addToast({ title: tr('gazettesArchivedDriveToast'), tone: 'success' });
        return res;
      } catch (err) {
        handleSyncError(err);
        addToast({
          title: err instanceof Error ? err.message : tr('syncError'),
          tone: 'error',
        });
        return null;
      }
    },
    [
      addToast,
      createAdapterFor,
      handleSyncError,
      isActiveProfileAdmin,
      language,
      tr,
      updateSyncConfig,
      uploadPendingMediaAssets,
    ],
  );

  const dispatchGazetteViaRelay = useCallback(
    async (issue: GazetteIssue): Promise<SendGazetteRelayResult | null> => {
      if (!isActiveProfileAdmin) return null;
      const adapter = createAdapterFor(syncConfigRef.current);
      if (!adapter) return null;

      setSyncStatus('syncing');
      try {
        await uploadPendingMediaAssets(adapter, dbRef.current);
        await adapter.pushDb(dbRef.current);

        const scopedPayload = buildScopedGazettePayload(dbRef.current, issue);
        const baseAppUrl =
          typeof window !== 'undefined'
            ? `${window.location.origin}${window.location.pathname}`
            : 'https://familygazette.example/';
        const apiUrl = syncConfigRef.current.appsScriptUrl;
        const htmlUrl = buildGazetteSecretUrl(baseAppUrl, issue.id, issue.secretKey, 'html', apiUrl);
        const pdfUrl = buildGazetteSecretUrl(baseAppUrl, issue.id, issue.secretKey, 'pdf', apiUrl);

        const frDigest = buildGazetteEmailDigest({
          payload: scopedPayload,
          lang: 'fr',
          htmlUrl,
          pdfUrl,
          thumbnailMode: 'cid',
        });
        const enDigest = buildGazetteEmailDigest({
          payload: scopedPayload,
          lang: 'en',
          htmlUrl,
          pdfUrl,
          thumbnailMode: 'cid',
        });

        const { pdfName, htmlName } = buildDriveGazetteFilenames(issue);
        const builtPdf = await buildGazettePdfBlob(scopedPayload, language);
        const pdfBase64 =
          builtPdf.byteSize < 20_000_000 ? await blobToBase64(builtPdf.blob) : undefined;
        const htmlContent = await buildStandaloneHtmlForPayload(scopedPayload, language);

        const result = await adapter.sendGazette({
          issueId: issue.id,
          digestsByLanguage: {
            fr: { subject: frDigest.subject, html: frDigest.html, plainText: frDigest.plainText },
            en: { subject: enDigest.subject, html: enDigest.html, plainText: enDigest.plainText },
          },
          cidMediaIds: frDigest.cidMediaIds,
          pdfBase64,
          pdfFilename: pdfName,
          htmlContent,
          htmlFilename: htmlName,
        });

        const now = result.sentAt || new Date().toISOString();
        setDb((prev) => ({
          ...prev,
          updatedAt: now,
          gazettes: prev.gazettes.map((g) =>
            g.id === issue.id
              ? {
                  ...g,
                  sentAt: now,
                  deliveryChannel: 'apps-script',
                  pdfDriveFileId: result.pdfDriveFileId ?? g.pdfDriveFileId,
                  htmlDriveFileId: result.htmlDriveFileId ?? g.htmlDriveFileId,
                  updatedAt: now,
                }
              : g,
          ),
        }));
        updateSyncConfig({ lastSyncedAt: now });
        setSyncStatus('synced');

        addToast({
          title: tr('shareRelaySentToast', {
            count: result.sentCount,
            quota: result.remainingQuota,
          }),
          tone: 'success',
        });
        return result;
      } catch (err) {
        handleSyncError(err);
        addToast({
          title: err instanceof Error ? err.message : tr('syncError'),
          tone: 'error',
        });
        return null;
      }
    },
    [
      addToast,
      createAdapterFor,
      handleSyncError,
      isActiveProfileAdmin,
      language,
      tr,
      updateSyncConfig,
      uploadPendingMediaAssets,
    ],
  );

  const dispatchReminderViaRelay = useCallback(async (): Promise<SendReminderRelayResult | null> => {
    if (!isActiveProfileAdmin) return null;
    const adapter = createAdapterFor(syncConfigRef.current);
    if (!adapter) return null;

    const schedule = computeNextGazetteSchedule(dbRef.current.settings);
    if (!schedule.nextPublishDate || !schedule.cycleKey) return null;

    setSyncStatus('syncing');
    try {
      const appUrl =
        typeof window !== 'undefined'
          ? `${window.location.origin}${window.location.pathname}`
          : 'https://familygazette.example/';
      const frRem = buildReminderEmailDigest({
        familyName: dbRef.current.settings.familyName,
        gazetteTitle: dbRef.current.settings.gazetteTitle,
        nextPublishDate: schedule.nextPublishDate,
        queuedCount: queuedGazettePosts.length,
        appUrl,
        lang: 'fr',
      });
      const enRem = buildReminderEmailDigest({
        familyName: dbRef.current.settings.familyName,
        gazetteTitle: dbRef.current.settings.gazetteTitle,
        nextPublishDate: schedule.nextPublishDate,
        queuedCount: queuedGazettePosts.length,
        appUrl,
        lang: 'en',
      });

      const res = await adapter.sendReminder({
        cycleKey: schedule.cycleKey,
        remindersByLanguage: {
          fr: frRem,
          en: enRem,
        },
      });

      const now = new Date().toISOString();
      setDb((prev) => ({
        ...prev,
        updatedAt: now,
        settings: {
          ...prev.settings,
          lastReminderCycleKey: schedule.cycleKey || prev.settings.lastReminderCycleKey,
          updatedAt: now,
        },
      }));
      updateSyncConfig({ lastSyncedAt: now });
      setSyncStatus('synced');
      addToast({
        title: tr('gazettesReminderRelaySentToast', {
          count: res.sentCount,
          quota: res.remainingQuota,
        }),
        tone: 'success',
      });
      return res;
    } catch (err) {
      handleSyncError(err);
      addToast({
        title: err instanceof Error ? err.message : tr('syncError'),
        tone: 'error',
      });
      return null;
    }
  }, [
    addToast,
    createAdapterFor,
    handleSyncError,
    isActiveProfileAdmin,
    queuedGazettePosts.length,
    tr,
    updateSyncConfig,
  ]);

  const updateFamilySettings = useCallback(
    (patch: Partial<FamilySettings>) => {
      const now = new Date().toISOString();
      setDb((prev) => ({
        ...prev,
        updatedAt: now,
        settings: {
          ...prev.settings,
          ...patch,
          id: 'family_settings',
          updatedAt: now,
        },
      }));
      if (patch.inviteCode !== undefined && syncConfigRef.current.mode === 'apps-script') {
        updateSyncConfig({ familyInviteCode: patch.inviteCode.trim() });
      }
    },
    [updateSyncConfig],
  );

  const loadDemoFamily = useCallback(() => {
    const demo = createDemoFamilyDatabase();
    setDb(demo);
    setActiveProfileId(null);
    setPendingPinProfileId(null);
    persistActiveProfileSession(null, false);
    applySessionToken(null, false);
    addToast({
      title: tr('gateDemoLoadedTitle'),
      description: tr('gateDemoLoadedDesc'),
      tone: 'success',
    });
  }, [addToast, applySessionToken, tr]);

  const resetToEmpty = useCallback(() => {
    const empty = createEmptyDatabase();
    setDb(empty);
    setActiveProfileId(null);
    setPendingPinProfileId(null);
    persistActiveProfileSession(null, false);
    applySessionToken(null, false);
    addToast({ title: tr('dataResetToast'), tone: 'info' });
  }, [addToast, applySessionToken, tr]);

  const value: FamilyContextValue = {
    db,
    hydrated,
    storageInfo,
    theme,
    toggleTheme,
    language,
    setLanguage,
    tr,
    syncStatus,
    syncConfig,
    updateSyncConfig,
    connectCloudSync,
    disconnectCloudSync,
    syncNow,
    activeProfiles,
    adminProfiles,
    activeProfile,
    isActiveProfileAdmin,
    pendingPinProfile,
    beginSwitchToProfile,
    cancelPendingPin,
    verifyPendingPin,
    logoutProfile,
    createProfile,
    updateProfile,
    deleteProfile,
    isProfileSubscribedToGazette,
    adminResetUserPin,
    activeRememberedPeople,
    rememberedPeopleById,
    createRememberedPerson,
    deleteRememberedPerson,
    upgradePersonToMember,
    activePosts,
    activeComments,
    activeGazettes,
    activeSubscribers,
    queuedGazettePosts,
    profilesById,
    activeMessages,
    activeMessageReplies,
    visibleMessages,
    unreadMessagesCount,
    activityItems,
    unreadActivityCount,
    createMemoryPost,
    updateMemoryPost,
    deleteMemoryPost,
    togglePostLike,
    togglePostGazetteFlag,
    togglePostFullPage,
    addPostComment,
    deletePostComment,
    createPrivateMessage,
    replyToPrivateMessage,
    markPrivateMessageRead,
    deletePrivateMessage,
    deleteMessageReply,
    markAllActivityRead,
    compileGazetteIssue,
    updateGazetteIssue,
    rotateGazetteSecretKey,
    deleteGazetteIssue,
    upsertSubscriber,
    toggleSubscriberActive,
    deleteSubscriber,
    markReminderCycleSent,
    dispatchGazetteViaRelay,
    archiveGazetteToDrive,
    dispatchReminderViaRelay,
    updateFamilySettings,
    loadDemoFamily,
    resetToEmpty,
    toasts,
    addToast,
    dismissToast,
  };

  return <FamilyContext.Provider value={value}>{children}</FamilyContext.Provider>;
};

export function useFamily(): FamilyContextValue {
  const ctx = useContext(FamilyContext);
  if (!ctx) {
    throw new Error('useFamily must be used inside a FamilyProvider.');
  }
  return ctx;
}
