/**
 * Strings_Module: the single source of every user-facing string in the Site.
 *
 * Strings are grouped by Locale. The English Locale (`en`) is the reference:
 * its keys define the set of string identifiers. A new Locale (for example
 * Thai, `th`) is added inside this file only, through `defineLocale`, with no
 * changes to component files.
 *
 * This file imports nothing from the project.
 */

// Reference Locale. Its keys define the set of string identifiers.
const en = {
  'app.name': 'Spooky Coach',
  'app.description': 'A skeleton Coach who shows you every Exercise from every angle.',

  'home.title': 'Spooky Coach',
  'home.tagline': 'Rattle your bones with a skeleton Coach.',
  'home.nav.label': 'Spooky Coach sections',

  'section.exercises.name': 'Exercises',
  'section.exercises.message': 'Not built yet. The Coach is still rehearsing these Exercises.',
  'section.exercises.title': 'Exercises · Spooky Coach',

  'section.stretches.name': 'Stretches',
  'section.stretches.message': 'Not built yet. These Stretches are still limbering up in the dark.',
  'section.stretches.title': 'Stretches · Spooky Coach',

  'section.routines.name': 'Routines',
  'section.routines.message': 'Not built yet. The Routines are still being dug up.',
  'section.routines.title': 'Routines · Spooky Coach',

  'section.crypt.name': 'Crypt',
  'section.crypt.message': 'Not built yet. The Crypt door is still sealed shut.',
  'section.crypt.title': 'Crypt · Spooky Coach',

  'section.history.name': 'History',
  'section.history.message': 'Not built yet. No ghosts of Workouts past have appeared.',
  'section.history.title': 'History · Spooky Coach',

  'common.backHome': 'Back to the home screen',

  'notFound.heading': 'Lost in the fog',
  'notFound.message': 'No page haunts this address. Head back to the home screen.',
  'notFound.title': 'Page not found · Spooky Coach',
} as const satisfies Record<string, string>;

/** Every string identifier the Site may use. */
export type StringId = keyof typeof en;

/** The shape every Locale must have: exactly one string per identifier. */
export type LocaleStrings = { readonly [K in StringId]: string };

/**
 * Registers a Locale. Fails the Type_Check if the Locale omits an identifier
 * the English Locale defines, or defines one it does not.
 */
export function defineLocale<const T extends LocaleStrings>(
  strings: T & { readonly [K in Exclude<keyof T, StringId>]: never },
): LocaleStrings {
  return strings;
}

export const locales = {
  en: defineLocale(en),
  // th: defineLocale({ ... }),  // added by a later ticket, inside this file only
} as const;

export type Locale = keyof typeof locales;

/** The Locale the Site shows. Also used for <html lang>. */
export const activeLocale: Locale = 'en';

/** Returns the active Locale's text for a string identifier. */
export function t(id: StringId): string {
  return locales[activeLocale][id];
}
