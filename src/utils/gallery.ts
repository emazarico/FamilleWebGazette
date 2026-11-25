import type { MemoryPost, PhotoCrop, UiLanguage } from '../types/family';

export interface GalleryPhotoItem {
  id: string;
  mediaId: string;
  postId: string;
  photoIndexInPost: number;
  memoryDate: string;
  monthKey: string;
  caption: string;
  authorProfileId: string;
  taggedProfileIds: string[];
  taggedGuestIds: string[];
  includeInGazette: boolean;
  fullPageFeature: boolean;
  crop?: PhotoCrop;
  createdAt: string;
}

export interface GalleryMonthGroup {
  monthKey: string;
  label: string;
  items: GalleryPhotoItem[];
}

export function extractGalleryPhotos(posts: MemoryPost[]): GalleryPhotoItem[] {
  const sortedPosts = posts
    .filter((p) => !p.deletedAt && p.mediaIds.length > 0)
    .slice()
    .sort((a, b) => {
      const dateCmp = (b.memoryDate || '').localeCompare(a.memoryDate || '');
      if (dateCmp !== 0) return dateCmp;
      return (b.createdAt || '').localeCompare(a.createdAt || '');
    });

  const items: GalleryPhotoItem[] = [];
  for (const post of sortedPosts) {
    const date = (post.memoryDate || post.createdAt || '').slice(0, 10);
    const monthKey = date.slice(0, 7) || '0000-00';
    post.mediaIds.forEach((mediaId, idx) => {
      items.push({
        id: `${post.id}:${idx}:${mediaId}`,
        mediaId,
        postId: post.id,
        photoIndexInPost: idx,
        memoryDate: date,
        monthKey,
        caption: post.caption,
        authorProfileId: post.authorProfileId,
        taggedProfileIds: post.taggedProfileIds,
        taggedGuestIds: post.taggedGuestIds || [],
        includeInGazette: post.includeInGazette,
        fullPageFeature: post.fullPageFeature,
        crop: post.mediaCrops?.[mediaId],
        createdAt: post.createdAt,
      });
    });
  }
  return items;
}

export interface FilterGalleryOptions {
  /** 'all' | 'profile:<id>' | 'guest:<id>' */
  personFilter: string;
  /** 'all' | 'YYYY' */
  yearFilter: string;
  gazetteOnly: boolean;
}

export function filterGalleryPhotos(
  items: GalleryPhotoItem[],
  options: FilterGalleryOptions,
): GalleryPhotoItem[] {
  return items.filter((item) => {
    if (options.gazetteOnly && !item.includeInGazette) return false;
    if (options.yearFilter !== 'all' && !item.memoryDate.startsWith(options.yearFilter)) {
      return false;
    }

    if (options.personFilter.startsWith('profile:')) {
      const pid = options.personFilter.slice('profile:'.length);
      if (item.authorProfileId !== pid && !item.taggedProfileIds.includes(pid)) {
        return false;
      }
    } else if (options.personFilter.startsWith('guest:')) {
      const gid = options.personFilter.slice('guest:'.length);
      if (!item.taggedGuestIds.includes(gid)) {
        return false;
      }
    }

    return true;
  });
}

function formatMonthLabel(monthKey: string, lang: UiLanguage): string {
  const match = /^(\d{4})-(\d{2})$/.exec(monthKey);
  if (!match) return monthKey;
  const dateObj = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1));
  try {
    const raw = new Intl.DateTimeFormat(lang === 'fr' ? 'fr-FR' : 'en-US', {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(dateObj);
    return raw.charAt(0).toUpperCase() + raw.slice(1);
  } catch {
    return monthKey;
  }
}

export function groupGalleryPhotosByMonth(
  items: GalleryPhotoItem[],
  lang: UiLanguage,
): GalleryMonthGroup[] {
  const groups = new Map<string, GalleryPhotoItem[]>();
  for (const item of items) {
    const bucket = groups.get(item.monthKey);
    if (bucket) {
      bucket.push(item);
    } else {
      groups.set(item.monthKey, [item]);
    }
  }

  return Array.from(groups.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([monthKey, bucket]) => ({
      monthKey,
      label: formatMonthLabel(monthKey, lang),
      items: bucket,
    }));
}
