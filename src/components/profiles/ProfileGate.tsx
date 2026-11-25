import React, { useState } from 'react';
import {
  CheckCircle2,
  Cloud,
  Lock,
  Moon,
  Newspaper,
  Plus,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Sun,
  Trash2,
} from 'lucide-react';
import { useFamily } from '../../store/FamilyContext';
import { isProfileAdmin } from '../../utils/admin';
import { AVATAR_THEME_MAP } from '../../utils/themes';
import { CloudSyncModal } from '../sync/CloudSyncModal';
import { PinModal } from './PinModal';
import { ProfileFormModal } from './ProfileFormModal';

export const ProfileGate: React.FC = () => {
  const {
    db,
    activeProfiles,
    pendingPinProfile,
    beginSwitchToProfile,
    cancelPendingPin,
    loadDemoFamily,
    resetToEmpty,
    syncConfig,
    theme,
    toggleTheme,
    language,
    setLanguage,
    tr,
  } = useFamily();

  const [createOpen, setCreateOpen] = useState(false);
  const [syncOpen, setSyncOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<'reload' | 'reset' | null>(null);

  const isCloudConnected = syncConfig.mode === 'apps-script';

  return (
    <div className="min-h-[100dvh] pt-[env(safe-area-inset-top)] pb-[calc(4.5rem+env(safe-area-inset-bottom))] flex flex-col relative overflow-hidden bg-[#FAF8F5] dark:bg-[#0F1117]">
      {/* Warm ambient background */}
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-40 -left-32 w-96 h-96 rounded-full bg-teal-500/15 dark:bg-teal-500/10 blur-3xl" />
        <div className="absolute top-1/3 -right-32 w-[28rem] h-[28rem] rounded-full bg-amber-400/15 dark:bg-amber-500/10 blur-3xl" />
      </div>

      {/* Top Bar */}
      <header className="relative z-10 max-w-5xl mx-auto w-full px-4 sm:px-6 py-5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#1B5E7C] via-teal-600 to-amber-500 text-white flex items-center justify-center shadow-md shadow-teal-900/20">
            <Newspaper className="w-5 h-5" />
          </div>
          <div>
            <span className="font-serif-display text-xl font-bold tracking-tight text-stone-900 dark:text-stone-100 block leading-none">
              {tr('appName')}
            </span>
            <span className="text-[11px] text-stone-500 dark:text-stone-400">
              {db.settings.familyName}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div
            role="group"
            aria-label={tr('switchLangLabel')}
            className="inline-flex items-center p-0.5 rounded-full bg-white/80 dark:bg-[#171A23]/80 border border-stone-200 dark:border-stone-800 text-xs font-bold shadow-xs"
          >
            <button
              type="button"
              onClick={() => setLanguage('fr')}
              className={`px-2.5 py-1 rounded-full transition-colors cursor-pointer ${
                language === 'fr'
                  ? 'bg-[#1B5E7C] text-white'
                  : 'text-stone-600 dark:text-stone-400'
              }`}
            >
              FR
            </button>
            <button
              type="button"
              onClick={() => setLanguage('en')}
              className={`px-2.5 py-1 rounded-full transition-colors cursor-pointer ${
                language === 'en'
                  ? 'bg-[#1B5E7C] text-white'
                  : 'text-stone-600 dark:text-stone-400'
              }`}
            >
              EN
            </button>
          </div>

          <button
            type="button"
            onClick={toggleTheme}
            aria-label={theme === 'dark' ? tr('lightMode') : tr('darkMode')}
            className="p-2 rounded-full bg-white/80 dark:bg-[#171A23]/80 border border-stone-200 dark:border-stone-800 text-stone-600 dark:text-stone-300 hover:border-[#1B5E7C]/50 transition-colors cursor-pointer shadow-xs"
          >
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="relative z-10 flex-1 max-w-4xl mx-auto w-full px-4 sm:px-6 flex flex-col justify-center py-6">
        <div className="text-center max-w-xl mx-auto mb-8">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-[#1B5E7C]/10 text-[#1B5E7C] dark:bg-teal-500/15 dark:text-teal-300 mb-3">
            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
            {tr('gateHeroBadge', { count: activeProfiles.length })}
          </span>
          <h1 className="font-serif-display text-3xl sm:text-4xl font-bold text-stone-900 dark:text-stone-100 tracking-tight">
            {tr('gateHeroTitle')}
          </h1>
          <p className="text-sm sm:text-base text-stone-600 dark:text-stone-400 mt-2.5">
            {tr('gateHeroSubtitle')}
          </p>
        </div>

        {activeProfiles.length === 0 ? (
          <div className="max-w-lg mx-auto w-full rounded-3xl bg-white/90 dark:bg-[#171A23]/90 border border-stone-200/90 dark:border-stone-800 shadow-xl p-6 sm:p-8 text-center space-y-5">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#1B5E7C] to-amber-500 text-white flex items-center justify-center text-3xl mx-auto shadow-lg">
              🏡
            </div>
            <div>
              <h2 className="font-serif-display text-2xl font-bold text-stone-900 dark:text-stone-100">
                {tr('gateNoMembersTitle')}
              </h2>
              <p className="text-sm text-stone-600 dark:text-stone-400 mt-2 leading-relaxed">
                {tr('gateNoMembersBody')}
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 pt-1">
              <button
                type="button"
                onClick={loadDemoFamily}
                className="flex-1 inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-[#1B5E7C] hover:bg-[#164b63] text-white text-sm font-semibold shadow-md shadow-teal-900/20 transition-all cursor-pointer"
              >
                <Sparkles className="w-4 h-4 text-amber-300" />
                {tr('gateLoadDemo')}
              </button>
              <button
                type="button"
                onClick={() => setCreateOpen(true)}
                className="flex-1 inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-stone-100 hover:bg-stone-200 dark:bg-stone-800 dark:hover:bg-stone-700 text-stone-800 dark:text-stone-100 text-sm font-semibold transition-all cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                {tr('gateCreateFirst')}
              </button>
            </div>
            <button
              type="button"
              onClick={() => setSyncOpen(true)}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#1B5E7C]/10 hover:bg-[#1B5E7C]/15 text-[#1B5E7C] dark:text-teal-300 text-xs font-semibold transition-colors cursor-pointer"
            >
              <Cloud className="w-4 h-4" />
              <span>{tr('gateConnectCloudBtn')}</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 xs:grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3.5 max-w-3xl mx-auto w-full">
            {activeProfiles.map((profile) => {
              const themeMeta = AVATAR_THEME_MAP[profile.avatarTheme] || AVATAR_THEME_MAP.teal;
              const isAdmin = isProfileAdmin(profile, activeProfiles);
              return (
                <button
                  key={profile.id}
                  type="button"
                  onClick={() => beginSwitchToProfile(profile.id)}
                  className="group relative flex flex-col items-center text-center p-5 rounded-3xl bg-white/90 dark:bg-[#171A23]/90 border border-stone-200/90 dark:border-stone-800 hover:border-[#1B5E7C]/60 dark:hover:border-teal-500/60 shadow-sm hover:shadow-xl hover:-translate-y-0.5 transition-all cursor-pointer"
                >
                  <div className="relative mb-3">
                    <div
                      className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${themeMeta.gradient} flex items-center justify-center text-3xl shadow-md group-hover:scale-105 transition-transform`}
                    >
                      {profile.avatarEmoji}
                    </div>
                    {profile.pinHash && (
                      <span
                        title={tr('pinProtected')}
                        className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 flex items-center justify-center shadow-xs"
                      >
                        <Lock className="w-3 h-3 text-amber-600" />
                      </span>
                    )}
                  </div>

                  <p className="font-serif-display font-bold text-lg text-stone-900 dark:text-stone-100 truncate max-w-full">
                    {profile.name}
                  </p>
                  {profile.relationLabel && (
                    <p className="text-xs text-stone-500 dark:text-stone-400 truncate max-w-full">
                      {profile.relationLabel}
                    </p>
                  )}

                  <div className="mt-2.5 flex items-center gap-1.5 flex-wrap justify-center">
                    {isAdmin && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-800 dark:text-amber-300">
                        <ShieldCheck className="w-3 h-3" /> {tr('roleAdmin')}
                      </span>
                    )}
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300">
                      {profile.language}
                    </span>
                  </div>
                </button>
              );
            })}

            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="flex flex-col items-center justify-center text-center p-5 rounded-3xl border-2 border-dashed border-stone-300 dark:border-stone-700 hover:border-[#1B5E7C] dark:hover:border-teal-400 text-stone-500 dark:text-stone-400 hover:text-[#1B5E7C] dark:hover:text-teal-300 transition-colors cursor-pointer min-h-[168px]"
            >
              <div className="w-12 h-12 rounded-2xl bg-stone-100 dark:bg-stone-800 flex items-center justify-center mb-2.5">
                <Plus className="w-6 h-6" />
              </div>
              <span className="text-sm font-semibold">{tr('gateAddMember')}</span>
            </button>
          </div>
        )}
      </main>

      <footer className="relative z-10 text-center px-4 pt-2 space-y-3">
        {activeProfiles.length > 0 && (
          <div className="max-w-xl mx-auto">
            {confirmAction === null ? (
              <div className="inline-flex flex-wrap items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => setSyncOpen(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-white/85 dark:bg-[#171A23]/85 border border-stone-200 dark:border-stone-800 text-[#1B5E7C] dark:text-teal-300 hover:border-[#1B5E7C]/60 transition-colors cursor-pointer shadow-xs"
                >
                  <Cloud className="w-3.5 h-3.5" />
                  {tr('gateConnectCloudBtn')}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmAction('reload')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-white/85 dark:bg-[#171A23]/85 border border-stone-200 dark:border-stone-800 text-stone-700 dark:text-stone-300 hover:border-[#1B5E7C]/60 transition-colors cursor-pointer shadow-xs"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-[#1B5E7C] dark:text-teal-400" />
                  {tr('reloadDemoFamily')}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmAction('reset')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-white/85 dark:bg-[#171A23]/85 border border-stone-200 dark:border-stone-800 text-rose-600 dark:text-rose-400 hover:border-rose-400/60 transition-colors cursor-pointer shadow-xs"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  {tr('resetLocalData')}
                </button>
              </div>
            ) : (
              <div className="inline-flex flex-col sm:flex-row items-center gap-2.5 px-4 py-2.5 rounded-2xl bg-white/95 dark:bg-[#171A23]/95 border border-amber-300/70 dark:border-amber-700/60 shadow-md text-xs">
                <span className="text-stone-700 dark:text-stone-200 font-medium">
                  {confirmAction === 'reload' ? tr('reloadDemoConfirm') : tr('resetLocalDataConfirm')}
                </span>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      const action = confirmAction;
                      setConfirmAction(null);
                      if (action === 'reload') {
                        loadDemoFamily();
                      } else {
                        resetToEmpty();
                      }
                    }}
                    className={`px-3 py-1 rounded-full font-semibold text-white cursor-pointer transition-colors ${
                      confirmAction === 'reload'
                        ? 'bg-[#1B5E7C] hover:bg-[#164b63]'
                        : 'bg-rose-600 hover:bg-rose-700'
                    }`}
                  >
                    {confirmAction === 'reload' ? tr('reloadDemoFamily') : tr('resetLocalData')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmAction(null)}
                    className="px-3 py-1 rounded-full font-semibold bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 hover:bg-stone-200 dark:hover:bg-stone-700 cursor-pointer transition-colors"
                  >
                    {tr('cancel')}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        <p className="inline-flex items-center gap-1.5 text-xs text-stone-500 dark:text-stone-400">
          {isCloudConnected ? (
            <>
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>{tr('gateCloudConnectedNote')}</span>
            </>
          ) : (
            <>
              <Cloud className="w-3.5 h-3.5 text-[#1B5E7C] dark:text-teal-400" />
              <span>{tr('gateCloudNote')}</span>
            </>
          )}
        </p>
      </footer>

      <ProfileFormModal open={createOpen} onClose={() => setCreateOpen(false)} />
      <CloudSyncModal open={syncOpen} onClose={() => setSyncOpen(false)} />
      {pendingPinProfile && <PinModal profile={pendingPinProfile} onCancel={cancelPendingPin} />}
    </div>
  );
};
