import { describe, expect, it } from 'vitest';
import type { FamilyProfile, RememberedPerson } from '../types/family';
import { createDemoFamilyDatabase } from '../utils/demoData';
import {
  computeNextGazetteSchedule,
  filterMemoryPosts,
  normalizeCollageLayout,
} from '../utils/feed';

describe('feed filtering, collage layouts & monthly Gazette schedule', () => {
  it('normalizes all 8 collage layouts strictly to photo count', () => {
    expect(normalizeCollageLayout(0, 'four-grid')).toBe('single');
    expect(normalizeCollageLayout(1, 'two-col')).toBe('single');
    expect(normalizeCollageLayout(2, 'two-row')).toBe('two-row');
    expect(normalizeCollageLayout(2, 'four-grid')).toBe('two-col');
    expect(normalizeCollageLayout(3, 'three-left')).toBe('three-left');
    expect(normalizeCollageLayout(3, 'three-top')).toBe('three-top');
    expect(normalizeCollageLayout(3, 'two-col')).toBe('three-mosaic');
    expect(normalizeCollageLayout(4, 'four-hero')).toBe('four-hero');
    expect(normalizeCollageLayout(4, 'single')).toBe('four-grid');
  });

  it('includes 4 subscribers for all 4 demo members and filters by remembered guests too', () => {
    const demo = createDemoFamilyDatabase();
    expect(demo.profiles).toHaveLength(4);
    expect(demo.subscribers.filter((s) => s.active)).toHaveLength(4);
    expect(demo.rememberedPeople).toHaveLength(2);

    const map = new Map<string, FamilyProfile>(demo.profiles.map((p) => [p.id, p]));
    const guestMap = new Map<string, RememberedPerson>(
      demo.rememberedPeople.map((g) => [g.id, g]),
    );

    const all = filterMemoryPosts(demo.posts, {
      filter: 'all',
      activeProfileId: 'prof-demo-erwan',
      authorFilterId: 'all',
      searchQuery: '',
      profilesById: map,
      rememberedPeopleById: guestMap,
    });
    expect(all).toHaveLength(4);

    const stories = filterMemoryPosts(demo.posts, {
      filter: 'stories',
      activeProfileId: 'prof-demo-erwan',
      authorFilterId: 'all',
      searchQuery: '',
      profilesById: map,
      rememberedPeopleById: guestMap,
    });
    expect(stories).toHaveLength(1);
    expect(stories[0]?.id).toBe('post-demo-4');

    const byGuest = filterMemoryPosts(demo.posts, {
      filter: 'all',
      activeProfileId: 'prof-demo-erwan',
      authorFilterId: 'all',
      searchQuery: 'léo',
      profilesById: map,
      rememberedPeopleById: guestMap,
    });
    expect(byGuest).toHaveLength(2);
  });

  it('computes 3-day monthly Gazette reminders accurately across month rollovers and leap years', () => {
    const baseSettings = {
      gazetteCadence: 'monthly' as const,
      publishDayOfMonth: 1,
      reminderDaysBefore: 3,
      lastReminderCycleKey: undefined,
    };

    const feb26 = computeNextGazetteSchedule(baseSettings, '2026-02-26');
    expect(feb26.nextPublishDate).toBe('2026-03-01');
    expect(feb26.reminderDate).toBe('2026-02-26');
    expect(feb26.daysUntilPublish).toBe(3);
    expect(feb26.isInReminderWindow).toBe(true);
    expect(feb26.isReminderDueToday).toBe(true);

    const leapFeb26 = computeNextGazetteSchedule(baseSettings, '2024-02-26');
    expect(leapFeb26.daysUntilPublish).toBe(4);
    expect(leapFeb26.isInReminderWindow).toBe(false);
    expect(leapFeb26.isReminderDueToday).toBe(false);

    const leapFeb27 = computeNextGazetteSchedule(baseSettings, '2024-02-27');
    expect(leapFeb27.daysUntilPublish).toBe(3);
    expect(leapFeb27.isReminderDueToday).toBe(true);

    const dec29 = computeNextGazetteSchedule(baseSettings, '2026-12-29');
    expect(dec29.nextPublishDate).toBe('2027-01-01');
    expect(dec29.cycleKey).toBe('2027-01');
    expect(dec29.isReminderDueToday).toBe(true);

    const alreadySent = computeNextGazetteSchedule(
      { ...baseSettings, lastReminderCycleKey: '2027-01' },
      '2026-12-29',
    );
    expect(alreadySent.reminderAlreadySentForCycle).toBe(true);
    expect(alreadySent.isReminderDueToday).toBe(false);
  });
});
