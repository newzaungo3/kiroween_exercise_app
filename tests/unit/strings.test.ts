// Strings_Module rules, checked only through its public exports
// (`locales`, `activeLocale` and `t`). Imported through the `@/` alias,
// which also shows that the Unit_Suite resolves tsconfig paths (Requirement 7.5).
import { describe, expect, it } from 'vitest';

import { activeLocale, locales, t } from '@/ui/strings';

import { findAvoidWords, findBlankEntries } from './support/strings-checks';

type EnglishId = keyof typeof locales.en;

// Object.keys returns string[]; every key of locales.en is a string identifier.
const englishIds = Object.keys(locales.en) as EnglishId[];

// The Sections in Home_Navigation order. Kept local so this test does not
// depend on src/ui/sections.ts.
const sectionIds = ['exercises', 'stretches', 'routines', 'crypt', 'history'] as const;

describe('Strings_Module', () => {
  it('every English Locale entry has visible text', () => {
    // On failure, Vitest prints the offending string identifiers.
    expect(findBlankEntries(locales.en)).toEqual([]);
  });

  it('no English Locale entry uses a glossary Avoid word', () => {
    const offending = englishIds
      .map((id) => ({ id, words: findAvoidWords(locales.en[id]) }))
      .filter(({ words }) => words.length > 0);

    // On failure, Vitest prints each { id, words } pair.
    expect(offending).toEqual([]);
  });

  it('the five Section names are Exercises, Stretches, Routines, Crypt and History', () => {
    expect(sectionIds.map((id) => t(`section.${id}.name`))).toEqual([
      'Exercises',
      'Stretches',
      'Routines',
      'Crypt',
      'History',
    ]);
  });

  it('the tagline is one sentence of at most 80 characters', () => {
    const tagline = t('home.tagline');

    expect(tagline.length).toBeLessThanOrEqual(80);
    // One sentence: no sentence-ending mark except a single one at the end.
    expect(tagline).toMatch(/^[^.!?]+[.!?]$/u);
  });

  it('every Placeholder_Screen message is at most 160 characters', () => {
    const tooLong = sectionIds
      .map((id) => ({ id, length: t(`section.${id}.message`).length }))
      .filter(({ length }) => length > 160);

    expect(tooLong).toEqual([]);
  });

  it('every registered Locale has exactly the English identifiers', () => {
    const expected = [...englishIds].sort();

    for (const [locale, strings] of Object.entries(locales)) {
      expect({ locale, ids: Object.keys(strings).sort() }).toEqual({ locale, ids: expected });
    }
  });

  it('the Site shows the English Locale', () => {
    expect(activeLocale).toBe('en');

    for (const id of englishIds) {
      expect({ id, text: t(id) }).toEqual({ id, text: locales.en[id] });
    }
  });
});
