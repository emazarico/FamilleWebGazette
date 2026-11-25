import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, Home, Lock, LogOut, Settings2, ShieldCheck, UserPlus } from 'lucide-react';
import { useFamily } from '../../store/FamilyContext';
import { AVATAR_THEME_MAP } from '../../utils/themes';
import { ProfileFormModal } from './ProfileFormModal';

export const ProfileSwitcher: React.FC = () => {
  const {
    activeProfile,
    activeProfiles,
    isActiveProfileAdmin,
    beginSwitchToProfile,
    logoutProfile,
    tr,
  } = useFamily();

  const [menuOpen, setMenuOpen] = useState(false);
  const [profileModalMode, setProfileModalMode] = useState<'edit' | 'create' | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    window.addEventListener('mousedown', onOutsideClick);
    return () => window.removeEventListener('mousedown', onOutsideClick);
  }, [menuOpen]);

  if (!activeProfile) return null;

  const themeMeta = AVATAR_THEME_MAP[activeProfile.avatarTheme] || AVATAR_THEME_MAP.teal;
  const otherProfiles = activeProfiles.filter((p) => p.id !== activeProfile.id);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setMenuOpen((o) => !o)}
        className="inline-flex items-center gap-2 pl-1.5 pr-2.5 py-1 rounded-full bg-stone-100/90 hover:bg-stone-200/80 dark:bg-stone-800/90 dark:hover:bg-stone-700/80 border border-stone-200/80 dark:border-stone-700 transition-colors cursor-pointer"
        aria-expanded={menuOpen}
        aria-label={tr('switchVisitor')}
      >
        <span
          className={`w-7 h-7 rounded-full bg-gradient-to-br ${themeMeta.gradient} flex items-center justify-center text-sm shadow-sm`}
        >
          {activeProfile.avatarEmoji}
        </span>
        <span className="text-sm font-semibold text-stone-800 dark:text-stone-100 max-w-[96px] truncate hidden sm:inline">
          {activeProfile.name}
        </span>
        {activeProfile.pinHash && (
          <Lock className="w-3 h-3 text-stone-400 hidden sm:inline" aria-hidden="true" />
        )}
        <ChevronDown className="w-3.5 h-3.5 text-stone-500" />
      </button>

      {menuOpen && (
        <div className="absolute right-0 mt-2 w-72 rounded-2xl bg-white dark:bg-[#1A1D27] border border-stone-200 dark:border-stone-800 shadow-2xl py-2 z-50 animate-fade-slide">
          <div className="px-3.5 py-2.5 border-b border-stone-100 dark:border-stone-800">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-stone-400">
                {tr('activeVisitor')}
              </p>
              {isActiveProfileAdmin && (
                <span className="inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-800 dark:text-amber-300">
                  <ShieldCheck className="w-3 h-3" /> {tr('roleAdmin')}
                </span>
              )}
            </div>
            <div className="flex items-center justify-between mt-1">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-base">{activeProfile.avatarEmoji}</span>
                <span className="font-semibold text-sm text-stone-900 dark:text-stone-100 truncate">
                  {activeProfile.name}
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  setProfileModalMode('edit');
                }}
                className="inline-flex items-center gap-1 text-xs font-semibold text-[#1B5E7C] dark:text-teal-400 hover:underline cursor-pointer shrink-0"
              >
                <Settings2 className="w-3.5 h-3.5" /> {tr('editProfile')}
              </button>
            </div>
          </div>

          {otherProfiles.length > 0 && (
            <div className="py-1.5 border-b border-stone-100 dark:border-stone-800 max-h-60 overflow-y-auto custom-scrollbar">
              <p className="px-3.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-stone-400">
                {tr('switchVisitor')}
              </p>
              {otherProfiles.map((p) => {
                const meta = AVATAR_THEME_MAP[p.avatarTheme] || AVATAR_THEME_MAP.teal;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      beginSwitchToProfile(p.id);
                    }}
                    className="w-full px-3.5 py-2 flex items-center justify-between hover:bg-stone-50 dark:hover:bg-stone-800/70 transition-colors cursor-pointer text-left"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span
                        className={`w-7 h-7 rounded-full bg-gradient-to-br ${meta.gradient} flex items-center justify-center text-sm shrink-0`}
                      >
                        {p.avatarEmoji}
                      </span>
                      <div className="min-w-0">
                        <span className="text-sm font-medium text-stone-800 dark:text-stone-200 truncate block">
                          {p.name}
                        </span>
                        {p.relationLabel && (
                          <span className="text-[11px] text-stone-400 truncate block">
                            {p.relationLabel}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="text-[10px] font-bold uppercase text-stone-400">
                        {p.language}
                      </span>
                      {p.pinHash && <Lock className="w-3.5 h-3.5 text-stone-400" />}
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          <div className="pt-1.5 px-1.5 space-y-0.5">
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                setProfileModalMode('create');
              }}
              className="w-full px-2.5 py-2 rounded-xl flex items-center gap-2 text-sm font-medium text-stone-700 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors cursor-pointer"
            >
              <UserPlus className="w-4 h-4 text-[#1B5E7C] dark:text-teal-400" />
              {tr('addMember')}
            </button>
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                logoutProfile();
              }}
              className="w-full px-2.5 py-2 rounded-xl flex items-center gap-2 text-sm font-medium text-stone-700 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors cursor-pointer"
            >
              <Home className="w-4 h-4 text-[#1B5E7C] dark:text-teal-400" />
              {tr('homeWelcomeScreen')}
            </button>
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                logoutProfile();
              }}
              className="w-full px-2.5 py-2 rounded-xl flex items-center gap-2 text-sm font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              {tr('lockAndSignOut')}
            </button>
          </div>
        </div>
      )}

      <ProfileFormModal
        open={profileModalMode !== null}
        onClose={() => setProfileModalMode(null)}
        editProfile={profileModalMode === 'edit' ? activeProfile : null}
      />
    </div>
  );
};
