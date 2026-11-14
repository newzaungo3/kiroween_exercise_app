/**
 * Every screen of the Site, in one list shared by the E2E specs that check
 * all screens (theme, layout, Decorations, no backend).
 *
 * The paths are built from the source modules, so a new Section, a Section
 * that stops being a Placeholder_Screen or a new Exercise_Entry in the
 * Catalog reaches every shared check without editing a spec. Only the
 * Home_Screen (`/`) and the not-found probe (`/no-such-page`) are literals.
 */
import { entries } from '@/catalog';
import { exercisePath } from '@/ui/exercises/labels';
import { placeholderSectionIds, sectionIds, sectionPath, type SectionId } from '@/ui/sections';

/** A path a visitor can request on the Site. */
export type ScreenPath = `/${string}`;

/** The Home_Screen. */
export const homeScreen: ScreenPath = '/';

/**
 * Section screens that are not Placeholder_Screens. In this ticket that is
 * the Exercise_List_Screen at `/exercises` and the Stretch_List_Screen at
 * `/stretches`.
 */
const placeholderIds: ReadonlySet<SectionId> = new Set(placeholderSectionIds);
export const sectionScreens: readonly ScreenPath[] = sectionIds
  .filter((id) => !placeholderIds.has(id))
  .map((id) => sectionPath(id));

/** The Exercise_List_Screen. */
export const exerciseListScreen: ScreenPath = sectionPath('exercises');

/** The Stretch_List_Screen. */
export const stretchListScreen: ScreenPath = sectionPath('stretches');

/**
 * Every detail screen, one per Exercise_Entry of either Kind, in Catalog
 * order. Exercises live under `/exercises`, Stretches under `/stretches`.
 */
export const exerciseDetailScreens: readonly ScreenPath[] = entries.map(
  (entry): ScreenPath => exercisePath(entry),
);

/** The Placeholder_Screens: Routines, Crypt and History. */
export const placeholderScreens: readonly ScreenPath[] = placeholderSectionIds.map((id) => sectionPath(id));

/** A path that matches no route, so the Site answers with the not-found screen. */
export const notFoundScreen: ScreenPath = '/no-such-page';

/**
 * Every screen: the Home_Screen, the Exercise_List_Screen, every
 * Exercise_Detail_Screen, the Placeholder_Screens and the not-found screen.
 */
export const screens: readonly ScreenPath[] = [
  homeScreen,
  ...sectionScreens,
  ...exerciseDetailScreens,
  ...placeholderScreens,
  notFoundScreen,
];
