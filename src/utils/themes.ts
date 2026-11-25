import type { AvatarTheme, CollageLayout, GazetteTheme } from '../types/family';

export const AVATAR_EMOJIS = [
  '🌿',
  '🏡',
  '📷',
  '🌻',
  '🦊',
  '🦉',
  '🐻',
  '☕',
  '🎨',
  '✨',
  '🚲',
  '🥐',
];

/**
 * Extracts the first grapheme cluster (supports compound emojis like 👨‍👩‍👧‍👦 or flags).
 */
export function extractFirstGrapheme(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return '';
  if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
    try {
      const seg = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
      const first = seg.segment(trimmed)[Symbol.iterator]().next();
      if (!first.done && first.value?.segment) {
        return first.value.segment;
      }
    } catch {
      // fall through
    }
  }
  return Array.from(trimmed)[0] || '';
}

export const AVATAR_THEME_MAP: Record<
  AvatarTheme,
  {
    labelFr: string;
    labelEn: string;
    gradient: string;
    ring: string;
    softBg: string;
    text: string;
  }
> = {
  teal: {
    labelFr: 'Bleu Famille',
    labelEn: 'Famileo Teal',
    gradient: 'from-[#1B5E7C] via-teal-600 to-cyan-600',
    ring: 'ring-teal-500/50',
    softBg: 'bg-teal-500/10 dark:bg-teal-400/15',
    text: 'text-teal-800 dark:text-teal-300',
  },
  amber: {
    labelFr: 'Ambre Chaleureux',
    labelEn: 'Warm Amber',
    gradient: 'from-amber-400 via-orange-500 to-rose-500',
    ring: 'ring-amber-400/50',
    softBg: 'bg-amber-500/10 dark:bg-amber-400/15',
    text: 'text-amber-800 dark:text-amber-300',
  },
  rose: {
    labelFr: 'Rose Velours',
    labelEn: 'Velvet Rose',
    gradient: 'from-rose-400 via-pink-500 to-fuchsia-600',
    ring: 'ring-rose-400/50',
    softBg: 'bg-rose-500/10 dark:bg-rose-400/15',
    text: 'text-rose-700 dark:text-rose-300',
  },
  indigo: {
    labelFr: 'Indigo Doux',
    labelEn: 'Soft Indigo',
    gradient: 'from-indigo-400 via-blue-600 to-violet-600',
    ring: 'ring-indigo-400/50',
    softBg: 'bg-indigo-500/10 dark:bg-indigo-400/15',
    text: 'text-indigo-700 dark:text-indigo-300',
  },
  emerald: {
    labelFr: 'Sauge Forêt',
    labelEn: 'Forest Sage',
    gradient: 'from-emerald-400 via-teal-500 to-cyan-600',
    ring: 'ring-emerald-400/50',
    softBg: 'bg-emerald-500/10 dark:bg-emerald-400/15',
    text: 'text-emerald-700 dark:text-emerald-300',
  },
  violet: {
    labelFr: 'Prune Royale',
    labelEn: 'Royal Plum',
    gradient: 'from-violet-400 via-purple-600 to-indigo-700',
    ring: 'ring-violet-400/50',
    softBg: 'bg-violet-500/10 dark:bg-violet-400/15',
    text: 'text-violet-700 dark:text-violet-300',
  },
  coral: {
    labelFr: 'Terre Cuite',
    labelEn: 'Terracotta',
    gradient: 'from-orange-400 via-red-500 to-rose-600',
    ring: 'ring-orange-400/50',
    softBg: 'bg-orange-500/10 dark:bg-orange-400/15',
    text: 'text-orange-700 dark:text-orange-300',
  },
  slate: {
    labelFr: 'Encre & Ardoise',
    labelEn: 'Ink & Slate',
    gradient: 'from-slate-500 via-zinc-700 to-stone-900',
    ring: 'ring-slate-400/50',
    softBg: 'bg-slate-500/10 dark:bg-slate-400/15',
    text: 'text-slate-700 dark:text-slate-300',
  },
};

export interface CollageLayoutOption {
  id: CollageLayout;
  photoCount: number;
  labelFr: string;
  labelEn: string;
}

export const COLLAGE_LAYOUT_OPTIONS: CollageLayoutOption[] = [
  { id: 'single', photoCount: 1, labelFr: 'Pleine photo', labelEn: 'Single photo' },
  { id: 'two-col', photoCount: 2, labelFr: 'Côte à côte', labelEn: 'Side by side' },
  { id: 'two-row', photoCount: 2, labelFr: 'Haut & bas', labelEn: 'Top & bottom' },
  { id: 'three-mosaic', photoCount: 3, labelFr: 'Mosaïque 2+1', labelEn: '2+1 mosaic' },
  { id: 'three-top', photoCount: 3, labelFr: 'Mosaïque 1+2', labelEn: '1+2 mosaic' },
  { id: 'three-left', photoCount: 3, labelFr: 'Grande gauche', labelEn: 'Hero left' },
  { id: 'four-grid', photoCount: 4, labelFr: 'Grille 2×2', labelEn: '2×2 grid' },
  { id: 'four-hero', photoCount: 4, labelFr: 'Grande gauche 1+3', labelEn: 'Hero + 3' },
];

export const GAZETTE_THEME_META: Record<
  GazetteTheme,
  { labelFr: string; labelEn: string; accent: string }
> = {
  editorial: { labelFr: 'Éditorial Chaleureux', labelEn: 'Warm Editorial', accent: '#1B5E7C' },
  classic: { labelFr: 'Journal Classique', labelEn: 'Classic Newspaper', accent: '#B45309' },
  keepsake: { labelFr: 'Album Épuré', labelEn: 'Clean Keepsake', accent: '#334155' },
};
