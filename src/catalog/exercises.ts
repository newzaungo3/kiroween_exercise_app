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
    kind: 'exercise',
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
  {
    id: 'skeleton-jacks',
    slug: 'skeleton-jacks',
    kind: 'exercise',
    nameId: 'exercise.skeletonJacks.name',
    realNameId: 'exercise.skeletonJacks.realName',
    difficulty: 'beginner',
    muscleGroups: ['shoulders', 'glutes', 'calves'],
    target: { reps: 20 },
    stepIds: [
      'exercise.skeletonJacks.step1',
      'exercise.skeletonJacks.step2',
      'exercise.skeletonJacks.step3',
      'exercise.skeletonJacks.step4',
    ],
    cueIds: [
      'exercise.skeletonJacks.cue1',
      'exercise.skeletonJacks.cue2',
      'exercise.skeletonJacks.cue3',
    ],
    safetyNoteIds: ['exercise.skeletonJacks.safety1', 'exercise.skeletonJacks.safety2'],
    coach: {
      asset: '/assets/coach/coach_skeleton_jacks.glb',
      demoClip: 'demo_loop',
    },
    stills: {
      front: '/assets/coach/stills/skeleton_jacks_front.png',
      side: '/assets/coach/stills/skeleton_jacks_side.png',
      back: '/assets/coach/stills/skeleton_jacks_back.png',
    },
  },
  {
    id: 'coffin-push',
    slug: 'coffin-push',
    kind: 'exercise',
    nameId: 'exercise.coffinPush.name',
    realNameId: 'exercise.coffinPush.realName',
    difficulty: 'intermediate',
    muscleGroups: ['chest', 'triceps', 'shoulders', 'core'],
    target: { reps: 8 },
    stepIds: [
      'exercise.coffinPush.step1',
      'exercise.coffinPush.step2',
      'exercise.coffinPush.step3',
      'exercise.coffinPush.step4',
    ],
    cueIds: ['exercise.coffinPush.cue1', 'exercise.coffinPush.cue2', 'exercise.coffinPush.cue3'],
    safetyNoteIds: ['exercise.coffinPush.safety1', 'exercise.coffinPush.safety2'],
    coach: {
      asset: '/assets/coach/coach_coffin_push.glb',
      demoClip: 'demo_loop',
    },
    stills: {
      front: '/assets/coach/stills/coffin_push_front.png',
      side: '/assets/coach/stills/coffin_push_side.png',
      back: '/assets/coach/stills/coffin_push_back.png',
    },
  },
  {
    id: 'gravestone-lean',
    slug: 'gravestone-lean',
    kind: 'stretch',
    nameId: 'exercise.gravestoneLean.name',
    realNameId: 'exercise.gravestoneLean.realName',
    difficulty: 'beginner',
    muscleGroups: ['obliques', 'shoulders'],
    target: { seconds: 30 },
    stepIds: [
      'exercise.gravestoneLean.step1',
      'exercise.gravestoneLean.step2',
      'exercise.gravestoneLean.step3',
      'exercise.gravestoneLean.step4',
    ],
    cueIds: [
      'exercise.gravestoneLean.cue1',
      'exercise.gravestoneLean.cue2',
      'exercise.gravestoneLean.cue3',
    ],
    safetyNoteIds: ['exercise.gravestoneLean.safety1', 'exercise.gravestoneLean.safety2'],
    coach: {
      asset: '/assets/coach/coach_stretch_side_reach.glb',
      demoClip: 'demo_loop',
    },
    stills: {
      front: '/assets/coach/stills/stretch_side_reach_front.png',
      side: '/assets/coach/stills/stretch_side_reach_side.png',
      back: '/assets/coach/stills/stretch_side_reach_back.png',
    },
  },
  {
    id: 'bat-hang',
    slug: 'bat-hang',
    kind: 'stretch',
    nameId: 'exercise.batHang.name',
    realNameId: 'exercise.batHang.realName',
    difficulty: 'beginner',
    muscleGroups: ['hamstrings', 'back', 'calves'],
    target: { seconds: 30 },
    stepIds: [
      'exercise.batHang.step1',
      'exercise.batHang.step2',
      'exercise.batHang.step3',
      'exercise.batHang.step4',
    ],
    cueIds: ['exercise.batHang.cue1', 'exercise.batHang.cue2', 'exercise.batHang.cue3'],
    safetyNoteIds: ['exercise.batHang.safety1', 'exercise.batHang.safety2'],
    coach: {
      asset: '/assets/coach/coach_stretch_forward_fold.glb',
      demoClip: 'demo_loop',
    },
    stills: {
      front: '/assets/coach/stills/stretch_forward_fold_front.png',
      side: '/assets/coach/stills/stretch_forward_fold_side.png',
      back: '/assets/coach/stills/stretch_forward_fold_back.png',
    },
  },
] as const satisfies readonly ExerciseEntry[];
