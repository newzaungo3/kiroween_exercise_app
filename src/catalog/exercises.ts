/**
 * Exercise content. Read-only at runtime.
 *
 * Every text is a Strings_Module identifier; the Catalog never resolves text.
 * Asset paths point at files the Asset_Pipeline delivers under
 * `public/assets/` (ADR 0004); app code only references them.
 */
import type { ExerciseEntry } from './types';

export const exerciseContent = [
  {
    id: 'grave-rise',
    slug: 'grave-rise',
    nameId: 'exercise.graveRise.name',
    realNameId: 'exercise.graveRise.realName',
    difficulty: 'beginner',
    muscleGroups: ['quads', 'glutes', 'core'],
    // Tunable content.
    target: { reps: 10 },
    stepIds: [
      'exercise.graveRise.step1',
      'exercise.graveRise.step2',
      'exercise.graveRise.step3',
      'exercise.graveRise.step4',
    ],
    cueIds: ['exercise.graveRise.cue1', 'exercise.graveRise.cue2', 'exercise.graveRise.cue3'],
    safetyNoteIds: ['exercise.graveRise.safety1', 'exercise.graveRise.safety2'],
    coach: {
      asset: '/assets/coach/coach_grave_rise.glb',
      demoClip: 'demo_loop',
    },
    stills: {
      front: '/assets/coach/stills/grave_rise_front.png',
      side: '/assets/coach/stills/grave_rise_side.png',
      back: '/assets/coach/stills/grave_rise_back.png',
    },
  },
] as const satisfies readonly ExerciseEntry[];
