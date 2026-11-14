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

// The Sections that still show a Placeholder_Screen. Exercises and Stretches
// and Routines have a list screen instead, so they have no Placeholder_Screen message.
const placeholderSectionIds = ['crypt'] as const;

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
    const tooLong = placeholderSectionIds
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

  it('no string claims or implies that the user\'s form is correct', () => {
    const formClaim = /\b(perfect|flawless|correct form|good form|right form|proper form)\b/i;
    const offending = englishIds.filter((id) => formClaim.test(locales.en[id]));

    // On failure, Vitest prints the offending string identifiers.
    expect(offending).toEqual([]);
  });

  it('the Safety_Message says the Coach demonstrates but cannot see the user or check their form', () => {
    const message = t('safety.coachMessage');

    expect(message).toContain('I demonstrate');
    expect(message).toContain("can't see you");
    expect(message).toContain('check your form');
  });

  it('no Exercise, Stretch, Viewer or Safety_Message string mentions Candy or a reward', () => {
    const prefixes = ['exercise.', 'viewer.', 'safety.', 'pager.', 'routine.'];
    const rewardWord = /\b(candy|reward|rewards|earn|earns|earned)\b/i;
    const offending = englishIds.filter(
      (id) => prefixes.some((prefix) => id.startsWith(prefix)) && rewardWord.test(locales.en[id]),
    );

    // On failure, Vitest prints the offending string identifiers.
    expect(offending).toEqual([]);
  });

  it('no Workout, Summary, Routine or Safety_Message string says the Candy was saved or added to a balance', () => {
    const prefixes = ['workout.', 'summary.', 'routine.', 'safety.'];
    const savedClaim = /\b(saved?|saving|kept|stored?|balance|banked?|wallet|added to)\b/i;
    // Ticket 08 (candy-and-history) supersedes this rule for exactly one line:
    // the Summary_Panel shows the new Candy balance in `summary.balance`.
    const offending = englishIds.filter(
      (id) =>
        id !== 'summary.balance' &&
        prefixes.some((prefix) => id.startsWith(prefix)) &&
        savedClaim.test(locales.en[id]),
    );

    // On failure, Vitest prints the offending string identifiers.
    expect(offending).toEqual([]);
  });

  it('the Workout outcome word and the Set result word exist for every value', () => {
    const ids = [
      'summary.outcome.completed',
      'summary.outcome.partial',
      'summary.outcome.abandoned',
      'summary.result.confirmed',
      'summary.result.skipped',
      'summary.result.notReached',
    ] as const;

    for (const id of ids) {
      expect({ id, blank: t(id).trim() === '' }).toEqual({ id, blank: false });
    }
  });

  it('no pause, skip, quit, dialog or summary string blames or shames the user', () => {
    const blame = /\b(lazy|fail(ed|ure)?|gave up|give up|weak|quitter|shame)\b/i;
    const prefixes = ['workout.', 'home.', 'history.', 'progress.', 'summary.', 'resume.'];
    const offending = englishIds.filter(
      (id) => prefixes.some((prefix) => id.startsWith(prefix)) && blame.test(locales.en[id]),
    );

    expect(offending).toEqual([]);
  });

  it('every new identifier is non-blank', () => {
    const ids = [
      'home.candy.loading',
      'home.candy.balance',
      'home.candy.welcome',
      'progress.unavailable',
      'summary.balance',
      'history.loading',
      'history.total',
      'history.list.label',
      'history.empty',
      'history.empty.link',
      'history.entry.unknownRoutine',
    ] as const;

    for (const id of ids) {
      expect({ id, blank: t(id).trim() === '' }).toEqual({ id, blank: false });
    }
  });

  it('the empty History text and the loading texts contain no digit', () => {
    const ids = ['history.empty', 'history.loading', 'home.candy.loading'] as const;

    for (const id of ids) {
      expect({ id, hasDigit: /\d/.test(t(id)) }).toEqual({ id, hasDigit: false });
    }
  });

  it('a hidden-page pause text differs from a user pause text', () => {
    expect(t('workout.paused.auto')).not.toBe(t('workout.paused.user'));
    expect(t('workout.announce.paused.auto')).not.toBe(t('workout.announce.paused.user'));
  });

  it('every new resume identifier is non-blank', () => {
    const ids = [
      'resume.loading',
      'resume.heading',
      'resume.text',
      'resume.text.rest',
      'resume.awayNote',
      'resume.question',
      'resume.resume',
      'resume.discard',
      'resume.discard.hint',
      'resume.discarded',
      'workout.paused.restored',
      'workout.announce.paused.restored',
    ] as const;

    for (const id of ids) {
      expect({ id, blank: t(id).trim() === '' }).toEqual({ id, blank: false });
    }
  });

  it('the restored pause text and announcement differ from the user and auto texts', () => {
    for (const other of ['user', 'auto'] as const) {
      expect(t('workout.paused.restored')).not.toBe(t(`workout.paused.${other}`));
      expect(t('workout.announce.paused.restored')).not.toBe(t(`workout.announce.paused.${other}`));
    }
  });

  it('the restored pause text says the time away does not count', () => {
    expect(t('workout.paused.restored')).toContain('The time you were away does not count');
  });

  it('every registered Locale keeps the English placeholders', () => {
    // Same placeholder syntax that format() replaces.
    const placeholdersOf = (text: string): string[] =>
      [...text.matchAll(/\{([a-z][a-zA-Z]*)\}/g)].map((match) => match[1] ?? '').sort();

    for (const [locale, strings] of Object.entries(locales)) {
      for (const id of englishIds) {
        expect({ locale, id, placeholders: placeholdersOf(strings[id]) }).toEqual({
          locale,
          id,
          placeholders: placeholdersOf(locales.en[id]),
        });
      }
    }
  });

  it('the Site shows the English Locale', () => {
    expect(activeLocale).toBe('en');

    for (const id of englishIds) {
      expect({ id, text: t(id) }).toEqual({ id, text: locales.en[id] });
    }
  });
});
