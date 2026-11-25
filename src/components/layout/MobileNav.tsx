import React from 'react';
import { useFamily } from '../../store/FamilyContext';
import type { AppTab } from '../../types/family';
import { TABS } from './Header';

interface MobileNavProps {
  activeTab: AppTab;
  onSelectTab: (tab: AppTab) => void;
}

export const MobileNav: React.FC<MobileNavProps> = ({ activeTab, onSelectTab }) => {
  const { unreadMessagesCount, tr } = useFamily();

  return (
    <nav
      aria-label="Mobile Navigation"
      className="md:hidden border-t border-stone-200/70 dark:border-stone-800/70 px-2 py-1.5"
    >
      <div className="max-w-7xl mx-auto grid grid-cols-5 gap-1">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          const badgeCount = tab.id === 'messages' ? unreadMessagesCount : 0;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onSelectTab(tab.id)}
              aria-current={isActive ? 'page' : undefined}
              className={`min-h-[44px] flex flex-col items-center justify-center gap-0.5 px-1 py-1.5 rounded-xl text-[11px] font-semibold transition-colors cursor-pointer ${
                isActive
                  ? 'bg-[#1B5E7C]/12 text-[#1B5E7C] dark:bg-teal-500/15 dark:text-teal-300'
                  : 'text-stone-600 dark:text-stone-400 hover:bg-stone-100/80 dark:hover:bg-stone-800/60'
              }`}
            >
              <span className="relative inline-flex">
                <Icon className="w-4 h-4 shrink-0" />
                {badgeCount > 0 && (
                  <span className="absolute -top-1.5 -right-2 min-w-[15px] h-[15px] px-0.5 rounded-full bg-rose-500 text-white text-[9px] font-bold inline-flex items-center justify-center">
                    {badgeCount > 9 ? '9+' : badgeCount}
                  </span>
                )}
              </span>
              <span className="truncate max-w-full">{tr(tab.shortLabelKey)}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
