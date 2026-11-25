import React, { useMemo, useState } from 'react';
import { Images, Newspaper, Star } from 'lucide-react';
import { useFamily } from '../../store/FamilyContext';
import {
  extractGalleryPhotos,
  filterGalleryPhotos,
  groupGalleryPhotosByMonth,
} from '../../utils/gallery';
import { formatMemoryDate } from '../../utils/i18n';
import { MediaImage } from '../common/MediaImage';
import { PhotoLightboxModal } from './PhotoLightboxModal';

interface GalleryViewProps {
  onOpenMemoryPost: (postId: string, photoIndex?: number) => void;
}

export const GalleryView: React.FC<GalleryViewProps> = ({ onOpenMemoryPost }) => {
  const {
    activePosts,
    activeProfiles,
    activeRememberedPeople,
    language,
    tr,
  } = useFamily();

  const [personFilter, setPersonFilter] = useState<string>('all');
  const [yearFilter, setYearFilter] = useState<string>('all');
  const [gazetteOnly, setGazetteOnly] = useState(false);
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);

  const allItems = useMemo(() => extractGalleryPhotos(activePosts), [activePosts]);

  const availableYears = useMemo(() => {
    const years = new Set<string>();
    for (const item of allItems) {
      const y = item.memoryDate.slice(0, 4);
      if (/^\d{4}$/.test(y)) years.add(y);
    }
    return Array.from(years).sort((a, b) => b.localeCompare(a));
  }, [allItems]);

  const filteredItems = useMemo(
    () =>
      filterGalleryPhotos(allItems, {
        personFilter,
        yearFilter,
        gazetteOnly,
      }),
    [allItems, personFilter, yearFilter, gazetteOnly],
  );

  const monthGroups = useMemo(
    () => groupGalleryPhotosByMonth(filteredItems, language),
    [filteredItems, language],
  );

  const indexById = useMemo(() => {
    const map = new Map<string, number>();
    filteredItems.forEach((item, idx) => map.set(item.id, idx));
    return map;
  }, [filteredItems]);

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      {/* Header */}
      <div className="rounded-3xl bg-white dark:bg-[#171A23] border border-stone-200/85 dark:border-stone-800 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-2xl bg-[#1B5E7C]/12 text-[#1B5E7C] dark:bg-teal-500/15 dark:text-teal-300 flex items-center justify-center shrink-0">
            <Images className="w-5 h-5" />
          </div>
          <div>
            <h1 className="font-serif-display text-xl font-bold text-stone-900 dark:text-stone-100">
              {tr('galleryTitle')}
            </h1>
            <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
              {tr('gallerySubtitle')}
            </p>
          </div>
        </div>

        <span className="inline-flex items-center self-start sm:self-center px-3 py-1 rounded-full text-xs font-bold bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300">
          {tr('galleryPhotosCount', { count: filteredItems.length })}
        </span>
      </div>

      {/* Filters */}
      <div className="space-y-2.5">
        <div className="flex items-center gap-2 flex-wrap">
          {availableYears.length > 1 && (
            <select
              value={yearFilter}
              onChange={(e) => setYearFilter(e.target.value)}
              aria-label={tr('galleryFilterAllYears')}
              className="px-3.5 py-2 rounded-xl bg-white dark:bg-[#171A23] border border-stone-200 dark:border-stone-800 text-xs font-semibold text-stone-700 dark:text-stone-200 outline-none focus:ring-2 focus:ring-[#1B5E7C]"
            >
              <option value="all">{tr('galleryFilterAllYears')}</option>
              {availableYears.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          )}

          <button
            type="button"
            onClick={() => setGazetteOnly((g) => !g)}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border text-xs font-semibold transition-colors cursor-pointer ${
              gazetteOnly
                ? 'bg-[#1B5E7C] text-white border-[#1B5E7C] shadow-xs'
                : 'bg-white dark:bg-[#171A23] border-stone-200 dark:border-stone-800 text-stone-600 dark:text-stone-300'
            }`}
          >
            <Newspaper className="w-3.5 h-3.5" />
            <span>{tr('galleryGazetteOnly')}</span>
          </button>
        </div>

        <div className="flex gap-1.5 overflow-x-auto pb-1">
          <button
            type="button"
            onClick={() => setPersonFilter('all')}
            className={`px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
              personFilter === 'all'
                ? 'bg-[#1B5E7C] text-white shadow-xs'
                : 'bg-white dark:bg-[#171A23] border border-stone-200 dark:border-stone-800 text-stone-600 dark:text-stone-300'
            }`}
          >
            {tr('galleryFilterAllPeople')}
          </button>

          {activeProfiles.map((member) => {
            const key = `profile:${member.id}`;
            const active = personFilter === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setPersonFilter(active ? 'all' : key)}
                className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                  active
                    ? 'bg-[#1B5E7C] text-white shadow-xs'
                    : 'bg-white dark:bg-[#171A23] border border-stone-200 dark:border-stone-800 text-stone-600 dark:text-stone-300'
                }`}
              >
                <span>{member.avatarEmoji}</span>
                <span>{member.name}</span>
              </button>
            );
          })}

          {activeRememberedPeople.map((guest) => {
            const key = `guest:${guest.id}`;
            const active = personFilter === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setPersonFilter(active ? 'all' : key)}
                className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-full border border-dashed text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                  active
                    ? 'bg-amber-500 text-white border-amber-500 shadow-xs'
                    : 'bg-white dark:bg-[#171A23] border-stone-300 dark:border-stone-700 text-stone-600 dark:text-stone-300'
                }`}
              >
                <span>{guest.avatarEmoji}</span>
                <span>{guest.name}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Month Groups */}
      {monthGroups.length === 0 ? (
        <div className="rounded-3xl bg-white dark:bg-[#171A23] border border-stone-200 dark:border-stone-800 p-8 text-center space-y-2.5">
          <div className="w-12 h-12 rounded-2xl bg-[#1B5E7C]/10 text-[#1B5E7C] dark:text-teal-300 flex items-center justify-center mx-auto">
            <Images className="w-6 h-6" />
          </div>
          <h3 className="font-serif-display text-xl font-bold">{tr('galleryEmptyTitle')}</h3>
          <p className="text-sm text-stone-500 dark:text-stone-400">{tr('galleryEmptyBody')}</p>
        </div>
      ) : (
        <div className="space-y-6">
          {monthGroups.map((group) => (
            <section key={group.monthKey} className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="font-serif-display text-lg font-bold text-stone-900 dark:text-stone-100">
                  {group.label}
                </h2>
                <span className="text-xs font-semibold text-stone-400">
                  {tr('galleryPhotosCount', { count: group.items.length })}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
                {group.items.map((item) => {
                  const idx = indexById.get(item.id) ?? 0;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setLightboxIdx(idx)}
                      className="group relative aspect-square rounded-2xl overflow-hidden bg-stone-100 dark:bg-stone-800 border border-stone-200/70 dark:border-stone-800 shadow-xs hover:shadow-md transition-all cursor-pointer text-left"
                    >
                      <MediaImage
                        mediaId={item.mediaId}
                        variant="thumb"
                        crop={item.crop}
                        alt={item.caption || 'Photo'}
                        className="w-full h-full object-cover group-hover:brightness-[1.04] transition-[filter]"
                      />

                      {item.fullPageFeature && (
                        <span className="absolute top-2 right-2 w-6 h-6 rounded-full bg-amber-500/90 text-white flex items-center justify-center shadow-sm">
                          <Star className="w-3.5 h-3.5 fill-current" />
                        </span>
                      )}

                      <div className="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-black/70 via-black/30 to-transparent opacity-90 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                        <p className="text-[11px] font-semibold text-white truncate">
                          {formatMemoryDate(item.memoryDate, language)}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}

      <PhotoLightboxModal
        items={filteredItems}
        currentIndex={lightboxIdx}
        onClose={() => setLightboxIdx(null)}
        onChangeIndex={setLightboxIdx}
        onOpenPost={(postId, photoIndexInPost) => onOpenMemoryPost(postId, photoIndexInPost)}
      />
    </div>
  );
};
