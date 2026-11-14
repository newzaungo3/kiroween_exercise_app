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
  'section.exercises.title': 'Exercises · Spooky Coach',

  'section.stretches.name': 'Stretches',
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

  'exercise.title': '{exercise} · Spooky Coach',
  'exercise.backToList': 'Back to Exercises',
  'exercise.backToStretches': 'Back to Stretches',
  'exercise.facts.targetReps': 'Target reps',
  'exercise.facts.targetSeconds': 'Target seconds',
  'exercise.facts.realName': 'Everyday name',
  'exercise.facts.difficulty': 'Difficulty',
  'exercise.facts.muscleGroups': 'Muscle groups',
  'exercise.steps.heading': 'How to do it',
  'exercise.cues.heading': 'Focus on',
  'exercise.safetyNotes.heading': 'Stay safe',

  'pager.label': 'Previous and next',
  'pager.previous': 'Previous: {exercise}',
  'pager.next': 'Next: {exercise}',

  'safety.heading': 'A word from your Coach',
  'safety.coachMessage':
    "I demonstrate every Exercise, but I can't see you and I can't check your form. Listen to your body and stop if anything hurts.",

  'difficulty.beginner.name': 'Beginner',
  'difficulty.intermediate.name': 'Intermediate',
  'difficulty.advanced.name': 'Advanced',

  'muscleGroup.quads.name': 'Quads',
  'muscleGroup.glutes.name': 'Glutes',
  'muscleGroup.core.name': 'Core',
  'muscleGroup.shoulders.name': 'Shoulders',
  'muscleGroup.calves.name': 'Calves',
  'muscleGroup.chest.name': 'Chest',
  'muscleGroup.triceps.name': 'Triceps',
  'muscleGroup.obliques.name': 'Obliques',
  'muscleGroup.hamstrings.name': 'Hamstrings',
  'muscleGroup.back.name': 'Back',

  'routine.graveyardShift.name': 'Graveyard Shift',

  'exercise.graveRise.name': 'Grave Rise',
  'exercise.graveRise.realName': 'Air squat',
  'exercise.graveRise.step1':
    'Stand with your feet about shoulder-width apart and your toes turned out a little.',
  'exercise.graveRise.step2':
    'Push your hips back and bend your knees to lower yourself, keeping your chest up.',
  'exercise.graveRise.step3':
    'Go down until your thighs are about level with the floor, or as low as feels comfortable.',
  'exercise.graveRise.step4': 'Push through your whole foot to rise back up to standing.',
  'exercise.graveRise.cue1': 'Knees track over your toes.',
  'exercise.graveRise.cue2': 'Keep your heels on the ground.',
  'exercise.graveRise.cue3': 'Chest up, back long.',
  'exercise.graveRise.safety1': 'Stop if your knees, hips or back hurt.',
  'exercise.graveRise.safety2': 'Only go as low as you can with your heels down.',

  'exercise.skeletonJacks.name': 'Skeleton Jacks',
  'exercise.skeletonJacks.realName': 'Jumping jacks',
  'exercise.skeletonJacks.step1': 'Stand tall with your feet together and your arms by your sides.',
  'exercise.skeletonJacks.step2':
    'Jump your feet out wide while you swing your arms up overhead.',
  'exercise.skeletonJacks.step3': 'Jump your feet back together and bring your arms down.',
  'exercise.skeletonJacks.step4': 'Repeat at a steady, easy rhythm.',
  'exercise.skeletonJacks.cue1': 'Land softly on the balls of your feet.',
  'exercise.skeletonJacks.cue2': 'Keep a small bend in your knees.',
  'exercise.skeletonJacks.cue3': 'Breathe steadily.',
  'exercise.skeletonJacks.safety1': 'Stop if your ankles, knees or shoulders hurt.',
  'exercise.skeletonJacks.safety2': 'March on the spot instead if jumping is too much.',

  'exercise.coffinPush.name': 'Coffin Push',
  'exercise.coffinPush.realName': 'Push-up',
  'exercise.coffinPush.step1':
    'Start on your hands and toes with your hands just wider than your shoulders.',
  'exercise.coffinPush.step2': 'Keep your body in one long line from head to heels.',
  'exercise.coffinPush.step3': 'Bend your elbows to lower your chest toward the floor.',
  'exercise.coffinPush.step4': 'Push the floor away to straighten your arms.',
  'exercise.coffinPush.cue1': 'Elbows angle back, not straight out.',
  'exercise.coffinPush.cue2': 'Squeeze your belly and glutes.',
  'exercise.coffinPush.cue3': 'Look at a spot just ahead of your hands.',
  'exercise.coffinPush.safety1': 'Stop if your wrists, shoulders or lower back hurt.',
  'exercise.coffinPush.safety2': 'Rest your knees on the floor if a full push-up is too hard.',

  'exercise.gravestoneLean.name': 'Gravestone Lean',
  'exercise.gravestoneLean.realName': 'Standing side reach',
  'exercise.gravestoneLean.step1':
    'Stand with your feet hip-width apart and your arms by your sides.',
  'exercise.gravestoneLean.step2': 'Raise one arm overhead.',
  'exercise.gravestoneLean.step3':
    'Lean gently to the other side until you feel a mild pull along your side.',
  'exercise.gravestoneLean.step4': 'Hold for the full time, then come back to standing.',
  'exercise.gravestoneLean.cue1': 'Breathe slowly.',
  'exercise.gravestoneLean.cue2': 'Keep both feet flat on the ground.',
  'exercise.gravestoneLean.cue3': 'Keep your chest facing forward.',
  'exercise.gravestoneLean.safety1': 'Stretch only to a gentle pull and stop if you feel pain.',
  'exercise.gravestoneLean.safety2': 'Skip this stretch if your shoulder or back is injured.',

  'exercise.batHang.name': 'Bat Hang',
  'exercise.batHang.realName': 'Standing forward fold',
  'exercise.batHang.step1': 'Stand with your feet hip-width apart.',
  'exercise.batHang.step2': 'Bend your knees a little and fold forward from your hips.',
  'exercise.batHang.step3': 'Let your head and arms hang loose toward the floor.',
  'exercise.batHang.step4': 'Hold for the full time, then roll up slowly.',
  'exercise.batHang.cue1': 'Keep a soft bend in your knees.',
  'exercise.batHang.cue2': 'Let your neck relax.',
  'exercise.batHang.cue3': 'Breathe slowly.',
  'exercise.batHang.safety1': 'Stretch only to a gentle pull and stop if you feel pain.',
  'exercise.batHang.safety2': 'Roll up slowly so you do not feel dizzy.',

  'viewer.region.label': 'Coach demonstration',
  'viewer.coachLabel': 'The skeleton Coach demonstrating {exercise}',
  'viewer.loading': 'Summoning the Coach from the crypt…',
  'viewer.slowLoad': 'Still loading. The Coach is taking the long way through the fog.',
  'viewer.retry': 'Try again',
  'viewer.fallback.message':
    'The 3D Coach could not load. Here are still pictures of the Coach instead.',
  'viewer.view.front': 'Front',
  'viewer.view.side': 'Side',
  'viewer.view.back': 'Back',
  'viewer.still.front.alt': 'The Coach demonstrating {exercise}, seen from the front',
  'viewer.still.side.alt': 'The Coach demonstrating {exercise}, seen from the side',
  'viewer.still.back.alt': 'The Coach demonstrating {exercise}, seen from the back',
  'viewer.play': 'Play',
  'viewer.pause': 'Pause',
  'viewer.speed.label': 'Playback speed',
  'viewer.speed.half': '0.5×',
  'viewer.speed.threeQuarters': '0.75×',
  'viewer.speed.normal': '1×',
  'viewer.views.label': 'Camera views',
  'viewer.camera.label': 'Camera controls',
  'viewer.rotateLeft': 'Rotate left',
  'viewer.rotateRight': 'Rotate right',
  'viewer.tiltUp': 'Tilt up',
  'viewer.tiltDown': 'Tilt down',
  'viewer.zoomIn': 'Zoom in',
  'viewer.zoomOut': 'Zoom out',
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

/** `{name}` placeholders in a string type, e.g. 'A {x} b {y}' gives 'x' | 'y'. */
type Placeholders<S extends string> = S extends `${string}{${infer Name}}${infer Rest}`
  ? Name | Placeholders<Rest>
  : never;

/** Identifiers whose English text has at least one placeholder. */
export type TemplateId = {
  [K in StringId]: [Placeholders<(typeof en)[K]>] extends [never] ? never : K;
}[StringId];

/**
 * Returns the active Locale's text for a template identifier with every
 * `{name}` replaced by values[name]. A missing or extra value fails the
 * Type_Check. Unknown placeholders are left untouched.
 */
export function format<I extends TemplateId>(
  id: I,
  values: { readonly [P in Placeholders<(typeof en)[I]>]: string },
): string {
  const lookup: Readonly<Record<string, string | undefined>> = values;
  return locales[activeLocale][id].replace(
    /\{([a-z][a-zA-Z]*)\}/g,
    (match, name: string) => (Object.hasOwn(lookup, name) ? (lookup[name] ?? match) : match),
  );
}
