/**
 * Type-level fixtures for the Strings_Module.
 *
 * `tsc --noEmit` checks this file; Vitest does not collect it (the name does
 * not end in `.test.ts`). Each `@ts-expect-error` line below must stay a type
 * error. If the Strings_Module stops rejecting one of these cases, the
 * directive becomes unused and the Type_Check fails.
 *
 * The fixtures sit inside a function that is never called, so importing this
 * file runs nothing.
 */
import { defineLocale, format, locales, t } from '@/ui/strings';

export function stringsTypeFixtures(): void {
  // @ts-expect-error an unknown string identifier fails the Type_Check
  t('home.noSuchString');

  // @ts-expect-error a Locale missing an English identifier fails the Type_Check
  defineLocale({ 'app.name': 'Spooky Coach' });

  // @ts-expect-error a Locale with an identifier English does not define fails the Type_Check
  defineLocale({ ...locales.en, 'extra.string': 'Boo' });

  // A template with every placeholder value passes, so the three lines below
  // fail for the reason they name and not because `format` rejects everything.
  format('viewer.coachLabel', { exercise: 'Grave Rise' });

  // @ts-expect-error format needs a value for every placeholder
  format('viewer.coachLabel', {});

  // @ts-expect-error format rejects a placeholder the template does not have
  format('viewer.coachLabel', { exercise: 'Grave Rise', extra: 'x' });

  // @ts-expect-error format accepts only templates
  format('app.name', {});
}
