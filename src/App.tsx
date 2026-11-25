import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowUpRight,
  CheckCircle2,
  Cloud,
  Newspaper,
  Pencil,
  RotateCcw,
  Share2,
  ShieldCheck,
  Trash2,
  UserPlus,
  Users,
} from 'lucide-react';
import { AvatarBadge } from './components/common/AvatarBadge';
import { ToastContainer } from './components/common/ToastContainer';
import { GalleryView } from './components/gallery/GalleryView';
import { GazetteShareModal } from './components/gazettes/GazetteShareModal';
import { GazettesView } from './components/gazettes/GazettesView';
import { PrintGazetteView } from './components/gazettes/PrintGazetteView';
import { PublicGazetteReader } from './components/gazettes/PublicGazetteReader';
import { ActivityDrawer } from './components/layout/ActivityDrawer';
import { Header } from './components/layout/Header';
import { MessagesView } from './components/messages/MessagesView';
import { PinModal } from './components/profiles/PinModal';
import { ProfileFormModal } from './components/profiles/ProfileFormModal';
import { ProfileGate } from './components/profiles/ProfileGate';
import { CloudSyncModal } from './components/sync/CloudSyncModal';
import { InviteModal } from './components/sync/InviteModal';
import { FeedView } from './components/wall/FeedView';
import { FamilyProvider, useFamily } from './store/FamilyContext';
import type { AppTab, FamilyProfile, GazetteIssue, RememberedPerson } from './types/family';
import type { ActivityItem } from './utils/activity';
import { isProfileAdmin } from './utils/admin';
import {
  buildScopedGazettePayload,
  parseGazetteRoute,
  type GazetteRouteParams,
} from './utils/gazette';
import { parseJoinRoute } from './utils/syncUrls';
import { AVATAR_THEME_MAP } from './utils/themes';

const FamilyShell: React.FC = () => {
  const {
    db,
    hydrated,
    activeProfile,
    activeProfiles,
    activeRememberedPeople,
    activePosts,
    activeGazettes,
    activeSubscribers,
    isActiveProfileAdmin,
    deleteRememberedPerson,
    pendingPinProfile,
    cancelPendingPin,
    syncConfig,
    connectCloudSync,
    loadDemoFamily,
    resetToEmpty,
    storageInfo,
    language,
    setLanguage,
    tr,
    addToast,
  } = useFamily();

  const [gazetteRoute, setGazetteRoute] = useState<GazetteRouteParams | null>(() =>
    typeof window !== 'undefined' ? parseGazetteRoute(window.location.search) : null,
  );
  const [activeTab, setActiveTab] = useState<AppTab>('wall');
  const [readingGazetteId, setReadingGazetteId] = useState<string | null>(null);
  const [readerShareIssue, setReaderShareIssue] = useState<GazetteIssue | null>(null);

  const [memberModalOpen, setMemberModalOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<FamilyProfile | null>(null);
  const [upgradingGuest, setUpgradingGuest] = useState<RememberedPerson | null>(null);

  const [syncModalOpen, setSyncModalOpen] = useState(false);
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const [deepLinkPost, setDeepLinkPost] = useState<{
    postId: string;
    photoIdx: number;
  } | null>(null);
  const [deepLinkMessageId, setDeepLinkMessageId] = useState<string | null>(null);
  const [familyDataConfirm, setFamilyDataConfirm] = useState<'reload' | 'reset' | null>(null);

  const handledJoinRef = useRef(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onPopState = () => {
      setGazetteRoute(parseGazetteRoute(window.location.search));
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  // Process Magic Invite Link (?join=1&api=...&code=...) automatically on launch
  useEffect(() => {
    if (typeof window === 'undefined' || !hydrated || handledJoinRef.current) return;
    const joinRoute = parseJoinRoute(window.location.search);
    if (!joinRoute) return;
    handledJoinRef.current = true;
    window.history.replaceState({}, '', window.location.pathname);

    void connectCloudSync(joinRoute.appsScriptUrl, joinRoute.inviteCode).then((res) => {
      if (res.ok) {
        addToast({
          title: tr('joinLinkConnectedToast', {
            family: res.familyName || 'FamilyGazette',
          }),
          tone: 'success',
        });
      } else {
        addToast({
          title: tr('joinLinkFailedToast'),
          description: res.error,
          tone: 'error',
        });
      }
    });
  }, [addToast, connectCloudSync, hydrated, tr]);

  const handleExitPublicGazette = useCallback(() => {
    if (typeof window !== 'undefined') {
      window.history.replaceState({}, '', window.location.pathname);
    }
    setGazetteRoute(null);
  }, []);

  const clearDeepLinkPost = useCallback(() => setDeepLinkPost(null), []);
  const clearDeepLinkMessage = useCallback(() => setDeepLinkMessageId(null), []);

  const handleOpenMemoryPost = useCallback((postId: string, photoIndex = 0) => {
    setDeepLinkPost({ postId, photoIdx: photoIndex });
    setActiveTab('wall');
  }, []);

  const handleSelectActivity = useCallback((item: ActivityItem) => {
    setActivityOpen(false);
    if (item.targetMessageId) {
      setDeepLinkMessageId(item.targetMessageId);
      setActiveTab('messages');
      return;
    }
    if (item.targetPostId) {
      setDeepLinkPost({ postId: item.targetPostId, photoIdx: 0 });
      setActiveTab('wall');
      return;
    }
    if (item.kind === 'gazette_reminder' || item.filterBucket === 'gazette') {
      setActiveTab('gazettes');
    }
  }, []);

  const readingIssue = useMemo(
    () => (readingGazetteId ? activeGazettes.find((g) => g.id === readingGazetteId) || null : null),
    [activeGazettes, readingGazetteId],
  );

  const readingPayload = useMemo(
    () => (readingIssue ? buildScopedGazettePayload(db, readingIssue) : null),
    [db, readingIssue],
  );

  const guestPostCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const post of activePosts) {
      for (const gid of post.taggedGuestIds || []) {
        map.set(gid, (map.get(gid) || 0) + 1);
      }
    }
    return map;
  }, [activePosts]);

  // 1. Standalone Public Secret-Key Gazette Reader (?view=gazette&issue=...&k=...)
  if (gazetteRoute) {
    return (
      <>
        <PublicGazetteReader route={gazetteRoute} onExitToApp={handleExitPublicGazette} />
        <ToastContainer />
      </>
    );
  }

  // 2. Family Profile Chooser Gate
  if (!activeProfile) {
    return (
      <>
        <ProfileGate />
        {pendingPinProfile && <PinModal profile={pendingPinProfile} onCancel={cancelPendingPin} />}
        <ToastContainer />
      </>
    );
  }

  // 3. Dedicated Print/Reader Mode for logged-in member (clean A4 print without app chrome)
  if (readingIssue && readingPayload) {
    return (
      <>
        <PrintGazetteView
          payload={readingPayload}
          lang={language}
          onChangeLang={setLanguage}
          onBack={() => setReadingGazetteId(null)}
          onOpenShare={() => setReaderShareIssue(readingIssue)}
          backLabel={tr('readerBackToArchive')}
        />
        <GazetteShareModal
          issue={readerShareIssue}
          onClose={() => setReaderShareIssue(null)}
        />
        <ToastContainer />
      </>
    );
  }

  const isCloudConnected = syncConfig.mode === 'apps-script';
  const lastSyncFormatted = syncConfig.lastSyncedAt
    ? new Date(syncConfig.lastSyncedAt).toLocaleString(language === 'fr' ? 'fr-FR' : 'en-US', {
        dateStyle: 'medium',
        timeStyle: 'short',
      })
    : tr('syncNeverSynced');

  return (
    <div className="min-h-[100dvh] flex flex-col bg-[#FAF8F5] dark:bg-[#0F1117] text-stone-900 dark:text-stone-100">
      <Header
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        onOpenActivity={() => setActivityOpen(true)}
        onOpenSyncModal={() => setSyncModalOpen(true)}
      />

      <main className="flex-1 w-full max-w-6xl mx-auto px-3 sm:px-6 py-5 sm:py-7 pb-[calc(4.5rem+env(safe-area-inset-bottom))]">
        {activeTab === 'wall' && (
          <FeedView
            onNavigateTab={setActiveTab}
            externalOpenPost={deepLinkPost}
            onClearExternalOpenPost={clearDeepLinkPost}
          />
        )}

        {activeTab === 'messages' && (
          <MessagesView
            initialOpenMessageId={deepLinkMessageId}
            onClearInitialMessage={clearDeepLinkMessage}
          />
        )}

        {activeTab === 'gallery' && (
          <GalleryView onOpenMemoryPost={handleOpenMemoryPost} />
        )}

        {activeTab === 'gazettes' && (
          <GazettesView onOpenReader={(issueId) => setReadingGazetteId(issueId)} />
        )}

        {activeTab === 'family' && (
          <div className="max-w-3xl mx-auto space-y-5">
            {/* Cloud Sync & Family Invites Card */}
            <section className="rounded-3xl bg-white dark:bg-[#171A23] border border-stone-200 dark:border-stone-800 p-5 sm:p-6 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-start gap-3 min-w-0">
                <span
                  className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${
                    isCloudConnected
                      ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                      : 'bg-[#1B5E7C]/12 text-[#1B5E7C] dark:text-teal-300'
                  }`}
                >
                  {isCloudConnected ? <CheckCircle2 className="w-5 h-5" /> : <Cloud className="w-5 h-5" />}
                </span>
                <div className="min-w-0">
                  <h2 className="font-serif-display text-lg font-bold text-stone-900 dark:text-stone-100">
                    {tr('familyCloudSyncTitle')}
                  </h2>
                  <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
                    {isCloudConnected
                      ? tr('familyCloudSyncConnectedDesc', { date: lastSyncFormatted })
                      : tr('familyCloudSyncLocalDesc')}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setInviteModalOpen(true)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-900 dark:text-amber-200 text-xs font-semibold cursor-pointer"
                >
                  <Share2 className="w-3.5 h-3.5" />
                  <span>{tr('familyInviteBtn')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSyncModalOpen(true)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#1B5E7C] hover:bg-[#164b63] text-white text-xs font-semibold shadow-xs cursor-pointer"
                >
                  <Cloud className="w-3.5 h-3.5" />
                  <span>{tr('familyCloudSyncManageBtn')}</span>
                </button>
              </div>
            </section>

            {/* Family Members Directory */}
            <section className="rounded-3xl bg-white dark:bg-[#171A23] border border-stone-200 dark:border-stone-800 p-5 sm:p-6 space-y-4 shadow-xs">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <h2 className="font-serif-display text-xl font-bold flex items-center gap-2">
                    <Users className="w-5 h-5 text-[#1B5E7C] dark:text-teal-400" />
                    {tr('familySectionTitle', { count: activeProfiles.length })}
                  </h2>
                  <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
                    {tr('familyManageDesc')}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setEditingMember(null);
                    setUpgradingGuest(null);
                    setMemberModalOpen(true);
                  }}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#1B5E7C] hover:bg-[#164b63] text-white text-xs font-semibold shadow-xs cursor-pointer"
                >
                  <UserPlus className="w-4 h-4" />
                  <span>{tr('addMember')}</span>
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {activeProfiles.map((member) => {
                  const memberIsAdmin = isProfileAdmin(member, activeProfiles);
                  const canEditMember =
                    isActiveProfileAdmin || member.id === activeProfile.id;
                  return (
                    <div
                      key={member.id}
                      className="p-3.5 rounded-2xl bg-stone-50 dark:bg-stone-900/60 border border-stone-200/80 dark:border-stone-800 flex items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <AvatarBadge profile={member} size="md" />
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <p className="text-sm font-bold truncate">{member.name}</p>
                            {memberIsAdmin && (
                              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-800 dark:text-amber-300">
                                <ShieldCheck className="w-3 h-3" /> {tr('roleAdmin')}
                              </span>
                            )}
                            <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-stone-200/70 dark:bg-stone-800 text-stone-600 dark:text-stone-300">
                              {member.language}
                            </span>
                          </div>
                          <p className="text-xs text-stone-500 dark:text-stone-400 truncate">
                            {[member.relationLabel, member.email].filter(Boolean).join(' • ') ||
                              (memberIsAdmin ? tr('roleAdmin') : tr('roleMember'))}
                          </p>
                        </div>
                      </div>

                      {canEditMember && (
                        <button
                          type="button"
                          onClick={() => {
                            setEditingMember(member);
                            setUpgradingGuest(null);
                            setMemberModalOpen(true);
                          }}
                          aria-label={tr('editProfile')}
                          className="p-2 rounded-lg text-stone-400 hover:text-stone-800 dark:hover:text-stone-100 hover:bg-stone-200/60 dark:hover:bg-stone-800 cursor-pointer shrink-0"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Remembered Non-Member People (Upgradable to Full Members) */}
            <section className="rounded-3xl bg-white dark:bg-[#171A23] border border-stone-200 dark:border-stone-800 p-5 sm:p-6 space-y-4 shadow-xs">
              <div>
                <h3 className="font-serif-display text-lg font-bold">
                  {tr('familyGuestsTitle', { count: activeRememberedPeople.length })}
                </h3>
                <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
                  {tr('familyGuestsDesc')}
                </p>
              </div>

              {activeRememberedPeople.length === 0 ? (
                <p className="text-sm text-stone-500 dark:text-stone-400 italic">
                  {tr('familyGuestsEmpty')}
                </p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {activeRememberedPeople.map((guest) => {
                    const theme = AVATAR_THEME_MAP[guest.avatarTheme] || AVATAR_THEME_MAP.amber;
                    const count = guestPostCounts.get(guest.id) || 0;
                    return (
                      <div
                        key={guest.id}
                        className="p-3.5 rounded-2xl bg-stone-50 dark:bg-stone-900/60 border border-dashed border-stone-300 dark:border-stone-700 flex items-center justify-between gap-2.5"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <span
                            className={`w-10 h-10 rounded-2xl bg-gradient-to-br ${theme.gradient} flex items-center justify-center text-lg text-white shrink-0`}
                          >
                            {guest.avatarEmoji}
                          </span>
                          <div className="min-w-0">
                            <p className="text-sm font-bold truncate">{guest.name}</p>
                            <p className="text-xs text-stone-500 dark:text-stone-400 truncate">
                              {[
                                guest.relationLabel,
                                tr('familyGuestMemoriesCount', { count }),
                              ]
                                .filter(Boolean)
                                .join(' • ')}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingMember(null);
                              setUpgradingGuest(guest);
                              setMemberModalOpen(true);
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-[#1B5E7C]/12 hover:bg-[#1B5E7C]/20 text-[#1B5E7C] dark:text-teal-300 text-xs font-semibold cursor-pointer"
                          >
                            <ArrowUpRight className="w-3.5 h-3.5" />
                            <span>{tr('familyGuestUpgradeBtn')}</span>
                          </button>

                          {isActiveProfileAdmin && (
                            <button
                              type="button"
                              onClick={() => deleteRememberedPerson(guest.id)}
                              aria-label={tr('postDelete')}
                              className="p-2 rounded-lg text-stone-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {/* Monthly Schedule & Storage Info */}
            <section className="rounded-3xl bg-white dark:bg-[#171A23] border border-stone-200 dark:border-stone-800 p-5 sm:p-6 space-y-3 shadow-xs">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <h3 className="font-serif-display text-lg font-bold">
                  {tr('familyGazetteSettingsTitle')}
                </h3>
                <button
                  type="button"
                  onClick={() => setActiveTab('gazettes')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#1B5E7C]/12 hover:bg-[#1B5E7C]/20 text-[#1B5E7C] dark:text-teal-300 text-xs font-semibold cursor-pointer"
                >
                  <Newspaper className="w-3.5 h-3.5" />
                  <span>{tr('gazetteBannerOpenStudio')}</span>
                </button>
              </div>
              <p className="text-sm text-stone-600 dark:text-stone-300">
                {tr('familyCadenceLabel', { day: db.settings.publishDayOfMonth })}
              </p>
              <p className="text-sm text-stone-600 dark:text-stone-300">
                {tr('familyReminderLabel', { days: db.settings.reminderDaysBefore })}
              </p>
              <p className="text-sm text-stone-600 dark:text-stone-300">
                {tr('familySubscribersLabel', { count: activeSubscribers.length })}
              </p>
              <p className="text-xs text-stone-500 dark:text-stone-400 pt-2 border-t border-stone-100 dark:border-stone-800">
                {tr('familySyncLabel', { engine: storageInfo.engine, mode: syncConfig.mode })} (
                {Math.round(storageInfo.estimatedBytes / 1024)} KB)
              </p>
            </section>

            {/* Admin Demo Data & Local Reset Tools */}
            {isActiveProfileAdmin && (
              <section className="rounded-3xl bg-white dark:bg-[#171A23] border border-stone-200 dark:border-stone-800 p-5 sm:p-6 space-y-4 shadow-xs">
                <div>
                  <h3 className="font-serif-display text-lg font-bold">
                    {tr('familyDataToolsTitle')}
                  </h3>
                  <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
                    {tr('familyDataToolsDesc')}
                  </p>
                </div>

                {familyDataConfirm === null ? (
                  <div className="flex flex-wrap gap-2.5">
                    <button
                      type="button"
                      onClick={() => setFamilyDataConfirm('reload')}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-stone-100 hover:bg-stone-200 dark:bg-stone-800 dark:hover:bg-stone-700 text-stone-800 dark:text-stone-100 text-xs font-semibold transition-colors cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5 text-[#1B5E7C] dark:text-teal-400" />
                      <span>{tr('reloadDemoFamily')}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setFamilyDataConfirm('reset')}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/30 dark:hover:bg-rose-950/50 text-rose-700 dark:text-rose-300 border border-rose-200/80 dark:border-rose-800/60 text-xs font-semibold transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>{tr('resetLocalData')}</span>
                    </button>
                  </div>
                ) : (
                  <div className="p-3.5 rounded-2xl bg-amber-50/80 dark:bg-amber-950/20 border border-amber-300/80 dark:border-amber-700/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <p className="text-xs font-medium text-stone-800 dark:text-stone-200">
                      {familyDataConfirm === 'reload'
                        ? tr('reloadDemoConfirm')
                        : tr('resetLocalDataConfirm')}
                    </p>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          const action = familyDataConfirm;
                          setFamilyDataConfirm(null);
                          if (action === 'reload') {
                            loadDemoFamily();
                          } else {
                            resetToEmpty();
                          }
                        }}
                        className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold text-white cursor-pointer transition-colors ${
                          familyDataConfirm === 'reload'
                            ? 'bg-[#1B5E7C] hover:bg-[#164b63]'
                            : 'bg-rose-600 hover:bg-rose-700'
                        }`}
                      >
                        {familyDataConfirm === 'reload'
                          ? tr('reloadDemoFamily')
                          : tr('resetLocalData')}
                      </button>
                      <button
                        type="button"
                        onClick={() => setFamilyDataConfirm(null)}
                        className="px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 text-stone-700 dark:text-stone-200 cursor-pointer"
                      >
                        {tr('cancel')}
                      </button>
                    </div>
                  </div>
                )}
              </section>
            )}
          </div>
        )}
      </main>

      <ProfileFormModal
        open={memberModalOpen}
        onClose={() => {
          setMemberModalOpen(false);
          setEditingMember(null);
          setUpgradingGuest(null);
        }}
        editProfile={editingMember}
        upgradeGuest={upgradingGuest}
        adminOverride={Boolean(
          editingMember && isActiveProfileAdmin && editingMember.id !== activeProfile.id,
        )}
        autoLoginOnCreate={false}
      />

      <ActivityDrawer
        open={activityOpen}
        onClose={() => setActivityOpen(false)}
        onSelectActivity={handleSelectActivity}
      />

      <CloudSyncModal open={syncModalOpen} onClose={() => setSyncModalOpen(false)} />

      <InviteModal
        open={inviteModalOpen}
        onClose={() => setInviteModalOpen(false)}
        onOpenSyncSetup={() => setSyncModalOpen(true)}
      />

      {pendingPinProfile && <PinModal profile={pendingPinProfile} onCancel={cancelPendingPin} />}
      <ToastContainer />
    </div>
  );
};

export default function App() {
  return (
    <FamilyProvider>
      <FamilyShell />
    </FamilyProvider>
  );
}
