/**
 * The Site's Sections: their identifiers, routes and texts.
 *
 * The order of `sectionIds` is the Home_Navigation order. Every text comes
 * from the Strings_Module. The string identifiers are built as template
 * literals, so a Section without its name or title string, or a Placeholder
 * Section without its message string, fails the Type_Check.
 */
import { t } from './strings';

/** Every Section, in Home_Navigation order. */
export const sectionIds = ['exercises', 'stretches', 'routines', 'crypt', 'history'] as const;

export type SectionId = (typeof sectionIds)[number];

/**
 * The Sections that show the Exercise_List_Screen. They have no
 * Placeholder_Screen message.
 */
export type ListSectionId = 'exercises' | 'stretches' | 'routines';

/** The Sections that still show a Placeholder_Screen. */
export type PlaceholderSectionId = Exclude<SectionId, ListSectionId>;

/** Every Section that still shows a Placeholder_Screen, in Home_Navigation order. */
export const placeholderSectionIds: readonly PlaceholderSectionId[] = sectionIds.filter(
  (id): id is PlaceholderSectionId => id !== 'exercises' && id !== 'stretches' && id !== 'routines',
);

/** The route that serves a Section's screen, for example `/exercises`. */
export function sectionPath(id: SectionId): `/${SectionId}` {
  return `/${id}`;
}

/** The Section's name: its Navigation_Entry label and screen heading. */
export function sectionName(id: SectionId): string {
  return t(`section.${id}.name`);
}

/** The short message shown on the Section's Placeholder_Screen. */
export function sectionMessage(id: PlaceholderSectionId): string {
  return t(`section.${id}.message`);
}

/** The document title of the Section's screen. */
export function sectionTitle(id: SectionId): string {
  return t(`section.${id}.title`);
}
