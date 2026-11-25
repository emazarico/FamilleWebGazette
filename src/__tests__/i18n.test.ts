import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LANGUAGE,
  formatMemoryDate,
  t,
  TRANSLATIONS,
} from '../utils/i18n';

describe('bilingual French/English i18n dictionary', () => {
  it('defaults to French and maintains 100% key parity between fr and en', () => {
    expect(DEFAULT_LANGUAGE).toBe('fr');
    const frKeys = Object.keys(TRANSLATIONS.fr).sort();
    const enKeys = Object.keys(TRANSLATIONS.en).sort();
    expect(enKeys).toEqual(frKeys);

    for (const key of frKeys) {
      expect(TRANSLATIONS.fr[key as keyof typeof TRANSLATIONS.fr].trim().length).toBeGreaterThan(0);
      expect(TRANSLATIONS.en[key as keyof typeof TRANSLATIONS.en].trim().length).toBeGreaterThan(0);
    }
  });

  it('interpolates template parameters and formats dates cleanly in both languages', () => {
    expect(t('fr', 'gateHeroBadge', { count: 12 })).toContain('12');
    expect(t('en', 'gateHeroBadge', { count: 12 })).toContain('12');
    expect(formatMemoryDate('2026-11-23', 'fr').length).toBeGreaterThan(4);
    expect(formatMemoryDate('2026-11-23', 'en')).toContain('2026');
  });
});
