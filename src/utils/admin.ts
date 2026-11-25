import type { FamilyProfile } from '../types/family';

/**
 * Determines whether a profile holds Family Admin / Editor-in-Chief permissions.
 * Falls back to the earliest active profile if no profile explicitly carries role === 'admin'
 * so older backups without roles remain recoverable.
 */
export function isProfileAdmin(
  profile: FamilyProfile,
  activeProfiles: FamilyProfile[],
): boolean {
  if (profile.deletedAt) return false;
  if (profile.role === 'admin') return true;
  const nonDeleted = activeProfiles.filter((p) => !p.deletedAt);
  const hasExplicitAdmin = nonDeleted.some((p) => p.role === 'admin');
  if (!hasExplicitAdmin) {
    return nonDeleted[0]?.id === profile.id;
  }
  return false;
}

export function getFamilyAdmins(activeProfiles: FamilyProfile[]): FamilyProfile[] {
  return activeProfiles.filter((p) => isProfileAdmin(p, activeProfiles));
}

export function canResetProfilePin(
  adminProfile: FamilyProfile,
  targetProfile: FamilyProfile,
  activeProfiles: FamilyProfile[],
): boolean {
  if (adminProfile.deletedAt || targetProfile.deletedAt) return false;
  if (adminProfile.id === targetProfile.id) return false;
  return isProfileAdmin(adminProfile, activeProfiles);
}
