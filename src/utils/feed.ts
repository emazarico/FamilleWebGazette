import type {
  CollageLayout,
  FamilyProfile,
  FamilySettings,
  GazetteCadence,
  MemoryPost,
  RememberedPerson,
  WallFilterMode,
} from '../types/family';

export function normalizeCollageLayout(
  photoCount: number,
  preferred?: CollageLayout,
): CollageLayout {
  if (photoCount <= 1) return 'single';
  if (photoCount === 2) {
    return preferred === 'two-row' ? 'two-row' : 'two-col';
  }
  if (photoCount === 3) {
    if (preferred === 'three-left') return 'three-left';
    if (preferred === 'three-top') return 'three-top';
    return 'three-mosaic';
  }
  return preferred === 'four-hero' ? 'four-hero' : 'four-grid';
}

export interface FilterPostsOptions {
  filter: WallFilterMode;
  activeProfileId: string | null;
  authorFilterId: string | 'all';
  searchQuery: string;
  profilesById: Map<string, FamilyProfile>;
  rememberedPeopleById?: Map<string, RememberedPerson>;
}

export function filterMemoryPosts(
  posts: MemoryPost[],
  options: FilterPostsOptions,
): MemoryPost[] {
  const query = options.searchQuery.trim().toLowerCase();

  return posts
    .filter((post) => {
      if (post.deletedAt) return false;
      if (options.authorFilterId !== 'all' && post.authorProfileId !== options.authorFilterId) {
        return false;
      }
      if (options.filter === 'photos' && post.mediaIds.length === 0) return false;
      if (options.filter === 'stories' && (post.kind !== 'story' || post.mediaIds.length > 0)) {
        return false;
      }
      if (options.filter === 'gazette' && !post.includeInGazette) return false;
      if (
        options.filter === 'tagged-me' &&
        (!options.activeProfileId || !post.taggedProfileIds.includes(options.activeProfileId))
      ) {
        return false;
      }

      if (query) {
        const author = options.profilesById.get(post.authorProfileId);
        const authorName = author?.name.toLowerCase() || '';
        const relation = author?.relationLabel?.toLowerCase() || '';
        const caption = post.caption.toLowerCase();
        const taggedMemberNames = post.taggedProfileIds
          .map((id) => options.profilesById.get(id)?.name.toLowerCase() || '')
          .join(' ');
        const taggedGuestNames = (post.taggedGuestIds || [])
          .map((id) => options.rememberedPeopleById?.get(id)?.name.toLowerCase() || '')
          .join(' ');

        if (
          !caption.includes(query) &&
          !authorName.includes(query) &&
          !relation.includes(query) &&
          !taggedMemberNames.includes(query) &&
          !taggedGuestNames.includes(query)
        ) {
          return false;
        }
      }
      return true;
    })
    .sort((a, b) => {
      const dateCmp = (b.memoryDate || '').localeCompare(a.memoryDate || '');
      if (dateCmp !== 0) return dateCmp;
      return (b.createdAt || '').localeCompare(a.createdAt || '');
    });
}

export interface GazetteScheduleInfo {
  cadence: GazetteCadence;
  nextPublishDate: string | null;
  reminderDate: string | null;
  cycleKey: string | null;
  daysUntilPublish: number | null;
  isDueToday: boolean;
  isInReminderWindow: boolean;
  isReminderDueToday: boolean;
  reminderAlreadySentForCycle: boolean;
}

function toUtcDate(year: number, monthIndex0: number, day: number): Date {
  return new Date(Date.UTC(year, monthIndex0, day));
}

function formatUtcIsoDate(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function addUtcDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}

function parseTodayInput(input?: Date | string): Date {
  if (typeof input === 'string') {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(input.trim());
    if (match) {
      return toUtcDate(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    }
  }
  const source = input instanceof Date ? input : new Date();
  return toUtcDate(source.getFullYear(), source.getMonth(), source.getDate());
}

/**
 * Computes the next scheduled Gazette publication date, 3-day advance reminder date,
 * and reminder window flags using pure UTC calendar-day math.
 */
export function computeNextGazetteSchedule(
  settings: Pick<
    FamilySettings,
    'gazetteCadence' | 'publishDayOfMonth' | 'reminderDaysBefore' | 'lastReminderCycleKey'
  >,
  todayInput?: Date | string,
): GazetteScheduleInfo {
  const cadence = settings.gazetteCadence || 'monthly';
  if (cadence === 'manual') {
    return {
      cadence,
      nextPublishDate: null,
      reminderDate: null,
      cycleKey: null,
      daysUntilPublish: null,
      isDueToday: false,
      isInReminderWindow: false,
      isReminderDueToday: false,
      reminderAlreadySentForCycle: false,
    };
  }

  const today = parseTodayInput(todayInput);
  const todayIso = formatUtcIsoDate(today);
  const reminderDays = Math.min(14, Math.max(0, settings.reminderDaysBefore ?? 3));

  let nextDate: Date;
  if (cadence === 'monthly') {
    const targetDay = Math.min(28, Math.max(1, settings.publishDayOfMonth || 1));
    const currentDay = today.getUTCDate();
    if (currentDay <= targetDay) {
      nextDate = toUtcDate(today.getUTCFullYear(), today.getUTCMonth(), targetDay);
    } else {
      nextDate = toUtcDate(today.getUTCFullYear(), today.getUTCMonth() + 1, targetDay);
    }
  } else {
    const dayOfWeek = today.getUTCDay();
    const daysToSunday = (7 - dayOfWeek) % 7;
    nextDate = addUtcDays(today, daysToSunday);
  }

  const nextIso = formatUtcIsoDate(nextDate);
  const reminderDateObj = addUtcDays(nextDate, -reminderDays);
  const reminderIso = formatUtcIsoDate(reminderDateObj);
  const daysUntilPublish = Math.round((nextDate.getTime() - today.getTime()) / 86_400_000);
  const cycleKey = cadence === 'monthly' ? nextIso.slice(0, 7) : nextIso;
  const reminderAlreadySentForCycle = settings.lastReminderCycleKey === cycleKey;

  return {
    cadence,
    nextPublishDate: nextIso,
    reminderDate: reminderIso,
    cycleKey,
    daysUntilPublish,
    isDueToday: daysUntilPublish === 0,
    isInReminderWindow: daysUntilPublish >= 0 && daysUntilPublish <= reminderDays,
    isReminderDueToday: todayIso === reminderIso && !reminderAlreadySentForCycle,
    reminderAlreadySentForCycle,
  };
}
