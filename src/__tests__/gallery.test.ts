import { describe, expect, it } from 'vitest';
import type { MemoryPost } from '../types/family';
import {
  extractGalleryPhotos,
  filterGalleryPhotos,
  groupGalleryPhotosByMonth,
} from '../utils/gallery';

function makePost(overrides: Partial<MemoryPost> = {}): MemoryPost {
  return {
    id: 'post-1',
    authorProfileId: 'prof-erwan',
    kind: 'photo',
    mediaIds: ['med-1'],
    collageLayout: 'single',
    caption: 'Vacances à la mer',
    memoryDate: '2026-11-15',
    taggedProfileIds: ['prof-mamie'],
    taggedGuestIds: ['guest-leo'],
    likedByProfileIds: [],
    includeInGazette: true,
    fullPageFeature: false,
    publishedIssueIds: [],
    createdAt: '2026-11-15T14:00:00.000Z',
    updatedAt: '2026-11-15T14:00:00.000Z',
    ...overrides,
  };
}

describe('gallery utilities', () => {
  it('flattens multi-photo collage posts, skips story/deleted posts, and preserves crop metadata', () => {
    const posts: MemoryPost[] = [
      makePost({
        id: 'p-collage',
        mediaIds: ['med-a', 'med-b'],
        collageLayout: 'two-col',
        memoryDate: '2026-10-12',
        mediaCrops: { 'med-b': { x: 25, y: 75, zoom: 1.5 } },
      }),
      makePost({
        id: 'p-story',
        kind: 'story',
        mediaIds: [],
        memoryDate: '2026-11-22',
      }),
      makePost({
        id: 'p-deleted',
        mediaIds: ['med-gone'],
        memoryDate: '2026-11-23',
        deletedAt: '2026-11-24T00:00:00.000Z',
      }),
      makePost({
        id: 'p-nov',
        mediaIds: ['med-c'],
        memoryDate: '2026-11-20',
      }),
    ];

    const photos = extractGalleryPhotos(posts);
    expect(photos).toHaveLength(3);
    expect(photos.map((p) => p.mediaId)).toEqual(['med-c', 'med-a', 'med-b']);
    expect(photos[1]?.photoIndexInPost).toBe(0);
    expect(photos[2]?.photoIndexInPost).toBe(1);
    expect(photos[2]?.crop).toEqual({ x: 25, y: 75, zoom: 1.5 });
  });

  it('filters by member (author or tagged), remembered guest, year, and gazette selection', () => {
    const posts: MemoryPost[] = [
      makePost({
        id: 'p1',
        authorProfileId: 'prof-erwan',
        taggedProfileIds: ['prof-mamie'],
        taggedGuestIds: ['guest-leo'],
        mediaIds: ['m1'],
        memoryDate: '2026-11-10',
        includeInGazette: true,
      }),
      makePost({
        id: 'p2',
        authorProfileId: 'prof-helene',
        taggedProfileIds: ['prof-sarah'],
        taggedGuestIds: [],
        mediaIds: ['m2'],
        memoryDate: '2025-12-24',
        includeInGazette: false,
      }),
    ];

    const all = extractGalleryPhotos(posts);

    expect(
      filterGalleryPhotos(all, { personFilter: 'profile:prof-mamie', yearFilter: 'all', gazetteOnly: false })
        .map((p) => p.mediaId),
    ).toEqual(['m1']);

    expect(
      filterGalleryPhotos(all, { personFilter: 'profile:prof-helene', yearFilter: 'all', gazetteOnly: false })
        .map((p) => p.mediaId),
    ).toEqual(['m2']);

    expect(
      filterGalleryPhotos(all, { personFilter: 'guest:guest-leo', yearFilter: 'all', gazetteOnly: false })
        .map((p) => p.mediaId),
    ).toEqual(['m1']);

    expect(
      filterGalleryPhotos(all, { personFilter: 'all', yearFilter: '2025', gazetteOnly: false })
        .map((p) => p.mediaId),
    ).toEqual(['m2']);

    expect(
      filterGalleryPhotos(all, { personFilter: 'all', yearFilter: 'all', gazetteOnly: true })
        .map((p) => p.mediaId),
    ).toEqual(['m1']);
  });

  it('groups photos by month newest-first with localized labels', () => {
    const items = extractGalleryPhotos([
      makePost({ id: 'p-oct', mediaIds: ['m-oct'], memoryDate: '2026-10-05' }),
      makePost({ id: 'p-nov-1', mediaIds: ['m-n1'], memoryDate: '2026-11-01' }),
      makePost({ id: 'p-nov-2', mediaIds: ['m-n2'], memoryDate: '2026-11-20' }),
    ]);

    const frGroups = groupGalleryPhotosByMonth(items, 'fr');
    expect(frGroups.map((g) => g.monthKey)).toEqual(['2026-11', '2026-10']);
    expect(frGroups[0]?.items).toHaveLength(2);
    expect(frGroups[0]?.label.toLowerCase()).toContain('novembre');
    expect(frGroups[0]?.label).toContain('2026');

    const enGroups = groupGalleryPhotosByMonth(items, 'en');
    expect(enGroups[0]?.label.toLowerCase()).toContain('november');
  });
});
