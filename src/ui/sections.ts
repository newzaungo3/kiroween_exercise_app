/**
 * The Site's Sections: their identifiers, routes and texts.
 *
 * The order of `sectionIds` is the Home_Navigation order. Every text comes
 * from the Strings_Module. The string identifiers are built as template
 * literals, so a Section without its name or title string fails the
 * Type_Check.
 */
import { t } from './strings';

/** Every Section, in Home_Navigation order. */
export const sectionIds = ['exercises', 'stretches', 'routines', 'crypt', 'history'] as const;

export type SectionId = (typeof sectionIds)[number];

/** The route that serves a Section's screen, for example `/exercises`. */
export function sectionPath(id: SectionId): `/${SectionId}` {
  return `/${id}`;
}

/** The Section's name: its Navigation_Entry label and screen heading. */
export function sectionName(id: SectionId): string {
  return t(`section.${id}.name`);
}

/** The document title of the Section's screen. */
export function sectionTitle(id: SectionId): string {
  return t(`section.${id}.title`);
}
