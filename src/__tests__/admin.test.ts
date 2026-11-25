import { describe, expect, it } from 'vitest';
import type { FamilyProfile } from '../types/family';
import { canResetProfilePin, getFamilyAdmins, isProfileAdmin } from '../utils/admin';

function makeProfile(id: string, role: 'admin' | 'member', deletedAt?: string): FamilyProfile {
  return {
    id,
    name: id,
    language: 'fr',
    avatarEmoji: '🌿',
    avatarTheme: 'teal',
    role,
    pinHash: null,
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-01T00:00:00.000Z',
    deletedAt,
  };
}

describe('admin role & PIN recovery permissions', () => {
  it('identifies admins and blocks deleted profiles', () => {
    const admin = makeProfile('p1', 'admin');
    const member = makeProfile('p2', 'member');
    const deletedAdmin = makeProfile('p3', 'admin', '2026-11-10T00:00:00.000Z');
    const list = [admin, member, deletedAdmin];

    expect(isProfileAdmin(admin, list)).toBe(true);
    expect(isProfileAdmin(member, list)).toBe(false);
    expect(isProfileAdmin(deletedAdmin, list)).toBe(false);
    expect(getFamilyAdmins(list).map((p) => p.id)).toEqual(['p1']);
  });

  it('allows an admin to reset another member PIN but not via non-admin', () => {
    const admin = makeProfile('p1', 'admin');
    const member = makeProfile('p2', 'member');
    const list = [admin, member];

    expect(canResetProfilePin(admin, member, list)).toBe(true);
    expect(canResetProfilePin(admin, admin, list)).toBe(false);
    expect(canResetProfilePin(member, admin, list)).toBe(false);
  });
});
