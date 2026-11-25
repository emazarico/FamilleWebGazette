import React from 'react';
import type { FamilyProfile } from '../../types/family';
import { AVATAR_THEME_MAP } from '../../utils/themes';

interface AvatarBadgeProps {
  profile?: FamilyProfile | null;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
}

const SIZE_CLASSES: Record<NonNullable<AvatarBadgeProps['size']>, string> = {
  xs: 'w-6 h-6 text-xs rounded-full',
  sm: 'w-8 h-8 text-sm rounded-full',
  md: 'w-10 h-10 text-lg rounded-2xl',
  lg: 'w-14 h-14 text-2xl rounded-2xl',
};

export const AvatarBadge: React.FC<AvatarBadgeProps> = ({
  profile,
  size = 'md',
  className = '',
}) => {
  const theme = (profile && AVATAR_THEME_MAP[profile.avatarTheme]) || AVATAR_THEME_MAP.teal;
  return (
    <span
      className={`inline-flex items-center justify-center bg-gradient-to-br ${theme.gradient} text-white shadow-sm shrink-0 select-none ${SIZE_CLASSES[size]} ${className}`}
      aria-hidden="true"
    >
      {profile?.avatarEmoji || '🌿'}
    </span>
  );
};
