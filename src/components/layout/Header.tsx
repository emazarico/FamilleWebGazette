import React from 'react';
import {
  AlertTriangle,
  Bell,
  Cloud,
  CloudOff,
  Home,
  Images,
  MessageSquare,
  Moon,
  Newspaper,
  RefreshCw,
  Sun,
  Users,
} from 'lucide-react';
import { useFamily } from '../../store/FamilyContext';
import type { AppTab } from '../../types/family';
import type { TranslationKey } from '../../utils/i18n';
import { ProfileSwitcher } from '../profiles/ProfileSwitcher';
import { MobileNav } from './MobileNav';

interface HeaderProps {
  activeTab: AppTab;
  onSelectTab: (tab: AppTab) => void;
  onOpenActivity: () => void;
  onOpenSyncModal?: () => void;
}

export const TABS: Array<{
  id: AppTab;
  labelKey: TranslationKey;
  shortLabelKey: TranslationKey;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: 'wall', labelKey: 'navWall', shortLabelKey: 'navWallShort', icon: Home },
  { id: 'messages', labelKey: 'navMessages', shortLabelKey: 'navMessagesShort', icon: MessageSquare },
  { id: 'gallery', labelKey: 'navGallery', shortLabelKey: 'navGalleryShort', icon: Images },
  { id: 'gazettes', labelKey: 'navGazettes', shortLabelKey: 'navGazettesShort', icon: Newspaper },
  { id: 'family', labelKey: 'navFamily', shortLabelKey: 'navFamilyShort', icon: Users },
];

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  onSelectTab,
  onOpenActivity,
  onOpenSyncModal,
}) => {
  const {
    db,
    theme,
    toggleTheme,
    language,
    setLanguage,
    syncStatus,
    unreadMessagesCount,
    unreadActivityCount,
    tr,
  } = useFamily();

  const renderSyncPill = () => {
    if (syncStatus === 'syncing' || syncStatus === 'connecting') {
      return (
        <span className="inline-flex items-center gap-1.5 text-amber-700 dark:text-amber-300">
          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
          <span className="hidden lg:inline">{tr('syncSyncing')}</span>
        </span>
      );
    }
    if (syncStatus === 'synced') {
      return (
        <span className="inline-flex items-center gap-1.5 text-emerald-700 dark:text-emerald-300">
          <span className="w-2 h-2 rounded-full bg-emerald-500" />
          <span className="hidden lg:inline">{tr('syncSynced')}</span>
        </span>
      );
    }
    if (syncStatus === 'token_expired') {
      return (
        <span className="inline-flex items-center gap-1.5 text-amber-700 dark:text-amber-300">
          <AlertTriangle className="w-3.5 h-3.5" />
          <span className="hidden lg:inline">{tr('syncTokenExpired')}</span>
        </span>
      );
    }
    if (syncStatus === 'error') {
      return (
        <span className="inline-flex items-center gap-1.5 text-rose-600 dark:text-rose-400">
          <AlertTriangle className="w-3.5 h-3.5" />
          <span className="hidden lg:inline">{tr('syncError')}</span>
        </span>
      );
    }
    if (syncStatus === 'offline') {
      return (
        <span className="inline-flex items-center gap-1.5 text-stone-500">
          <CloudOff className="w-3.5 h-3.5" />
          <span className="hidden lg:inline">{tr('syncOffline')}</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 text-stone-600 dark:text-stone-300">
        <Cloud className="w-3.5 h-3.5 text-[#1B5E7C] dark:text-teal-400" />
        <span className="hidden lg:inline">{tr('syncLocal')}</span>
      </span>
    );
  };

  return (
    <header className="sticky top-0 z-30 pt-[env(safe-area-inset-top)] backdrop-blur-md bg-[#FAF8F5]/90 dark:bg-[#0F1117]/90 border-b border-stone-200/80 dark:border-stone-800/80">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 h-14 md:h-16 flex items-center justify-between gap-2">
        {/* Brand */}
        <button
          type="button"
          onClick={() => onSelectTab('wall')}
          className="flex items-center gap-2.5 cursor-pointer shrink-0 min-w-0"
        >
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#1B5E7C] via-teal-600 to-amber-500 text-white flex items-center justify-center shadow-sm shadow-teal-900/20 shrink-0">
            <Newspaper className="w-5 h-5" />
          </div>
          <div className="text-left min-w-0 hidden xs:block sm:block">
            <span className="font-serif-display text-lg lg:text-xl font-bold tracking-tight text-stone-900 dark:text-stone-100 block leading-none">
              {tr('appName')}
            </span>
            <span className="text-[10px] font-medium text-stone-500 dark:text-stone-400 truncate block mt-0.5 max-w-[140px]">
              {db.settings.familyName}
            </span>
          </div>
        </button>

        {/* Desktop / Tablet Navigation */}
        <nav
          aria-label="Primary"
          className="hidden md:flex items-center gap-1 p-1 rounded-2xl bg-stone-200/60 dark:bg-stone-800/70 border border-stone-200/70 dark:border-stone-700/60"
        >
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            const badgeCount = tab.id === 'messages' ? unreadMessagesCount : 0;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => onSelectTab(tab.id)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                  isActive
                    ? 'bg-white dark:bg-[#1A1D27] text-[#1B5E7C] dark:text-teal-300 shadow-xs'
                    : 'text-stone-600 dark:text-stone-300 hover:text-stone-900 dark:hover:text-white'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tr(tab.labelKey)}</span>
                {badgeCount > 0 && (
                  <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold inline-flex items-center justify-center">
                    {badgeCount > 9 ? '9+' : badgeCount}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Right Controls */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {/* FR | EN Language Toggle */}
          <div
            role="group"
            aria-label={tr('switchLangLabel')}
            className="inline-flex items-center p-0.5 rounded-full bg-stone-200/70 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 text-[11px] font-bold"
          >
            <button
              type="button"
              onClick={() => setLanguage('fr')}
              className={`px-2 py-1 rounded-full transition-colors cursor-pointer ${
                language === 'fr'
                  ? 'bg-[#1B5E7C] text-white shadow-xs'
                  : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-white'
              }`}
            >
              FR
            </button>
            <button
              type="button"
              onClick={() => setLanguage('en')}
              className={`px-2 py-1 rounded-full transition-colors cursor-pointer ${
                language === 'en'
                  ? 'bg-[#1B5E7C] text-white shadow-xs'
                  : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-white'
              }`}
            >
              EN
            </button>
          </div>

          <button
            type="button"
            onClick={() => (onOpenSyncModal ? onOpenSyncModal() : onSelectTab('family'))}
            aria-label={tr('syncModalTitle')}
            className="inline-flex items-center px-2 sm:px-2.5 py-1.5 rounded-full text-xs font-semibold bg-white/80 dark:bg-[#171A23]/80 border border-stone-200 dark:border-stone-800 hover:border-[#1B5E7C]/50 transition-colors cursor-pointer"
          >
            {renderSyncPill()}
          </button>

          <button
            type="button"
            onClick={onOpenActivity}
            aria-label={tr('activityButtonLabel')}
            className="relative p-2 rounded-full text-stone-600 dark:text-stone-300 hover:bg-stone-200/70 dark:hover:bg-stone-800 transition-colors cursor-pointer"
          >
            <Bell className="w-4 h-4" />
            {unreadActivityCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-rose-500 text-white text-[9px] font-bold inline-flex items-center justify-center ring-2 ring-[#FAF8F5] dark:ring-[#0F1117]">
                {unreadActivityCount > 9 ? '9+' : unreadActivityCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={toggleTheme}
            aria-label={theme === 'dark' ? tr('lightMode') : tr('darkMode')}
            className="p-2 rounded-full text-stone-600 dark:text-stone-300 hover:bg-stone-200/70 dark:hover:bg-stone-800 transition-colors cursor-pointer"
          >
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>

          <ProfileSwitcher />
        </div>
      </div>

      {/* Mobile Tab Strip rendered inside sticky top header (iPhone Safari safe) */}
      <MobileNav activeTab={activeTab} onSelectTab={onSelectTab} />
    </header>
  );
};
