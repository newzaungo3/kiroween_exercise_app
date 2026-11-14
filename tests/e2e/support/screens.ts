/**
 * Every screen of the Site, in one list shared by the E2E specs that check
 * all screens (theme, layout, Decorations, no backend).
 *
 * The paths are built from the source modules, so a new Section or a new Exercise_Entry in the
 * Catalog reaches every shared check without editing a spec. Only the
 * Home_Screen (`/`) and the not-found probe (`/no-such-page`) are literals.
 */
import { entries, routines } from '@/catalog';
import { exercisePath } from '@/ui/exercises/labels';
import { routinePath, workoutPath } from '@/ui/routines/labels';
import { sectionIds, sectionPath } from '@/ui/sections';

/** A path a visitor can request on the Site. */
export type ScreenPath = `/${string}`;

/** The Home_Screen. */
export const homeScreen: ScreenPath = '/';

/**
 * Every Section screen, in Home_Navigation order: Exercises, Stretches,
 * Routines, Crypt and History. Each has an `h1` and a link back home.
 */
export const sectionScreens: readonly ScreenPath[] = sectionIds.map((id) => sectionPath(id));

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

/** The Routine_List_Screen (already part of `sectionScreens`). */
export const routineListScreen: ScreenPath = sectionPath('routines');

/**
 * Every Routine_Detail_Screen, one per Routine_Entry, in Catalog order.
 * These show no Viewer, so they load no 3D code.
 */
export const routineDetailScreens: readonly ScreenPath[] = routines.map(
  (routine): ScreenPath => routinePath(routine),
);

/**
 * Every Workout_Screen, one per Routine_Entry, in Catalog order. Its first
 * panel (the Preparing_Panel) shows no Viewer, so it loads no 3D code.
 */
export const workoutScreens: readonly ScreenPath[] = routines.map(
  (routine): ScreenPath => workoutPath(routine),
);

/** A path that matches no route, so the Site answers with the not-found screen. */
export const notFoundScreen: ScreenPath = '/no-such-page';

/**
 * Every screen: the Home_Screen, the list screens (Exercises, Stretches,
 * Routines), every Exercise_Detail_Screen, every Routine_Detail_Screen,
 * every Workout_Screen and the not-found screen. The Section screens include
 * Crypt and History.
 */
export const screens: readonly ScreenPath[] = [
  homeScreen,
  ...sectionScreens,
  ...exerciseDetailScreens,
  ...routineDetailScreens,
  ...workoutScreens,
  notFoundScreen,
];
