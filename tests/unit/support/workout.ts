/**
 * Shared fast-check arbitraries for the Workout engine tests: a valid
 * Routine_Entry, a reachable Workout and the Property 7 player.
 * Every clock value is an argument; no real time is read.
 */
import fc from 'fast-check';
import { exercises, stretches } from '@/catalog';
import type {
  EntryOfKind,
  ExerciseEntry,
  ExerciseTarget,
  Kind,
  RoutineEntry,
  RoutineStep,
} from '@/catalog';
import {
  advance,
  autoPause,
  confirmSet,
  pauseWorkout,
  quitWorkout,
  resumeWorkout,
  skipRest,
  skipSet,
  startWorkout,
  workoutView,
} from '@/workout-engine';
import type { ExercisingView, Workout, WorkoutView } from '@/workout-engine';

/** A target in the same unit as the entry's own target. */
function targetArbitrary(entry: ExerciseEntry): fc.Arbitrary<ExerciseTarget> {
  if (entry.target.reps !== undefined) {
    return fc.integer({ min: 1, max: 200 }).map((reps) => ({ reps }));
  }
  return fc.integer({ min: 1, max: 120 }).map((seconds) => ({ seconds }));
}

function stepArbitrary(pool: readonly ExerciseEntry[]): fc.Arbitrary<RoutineStep> {
  return fc.constantFrom(...pool).chain((entry) =>
    fc.record({
      entryId: fc.constant(entry.id),
      sets: fc.integer({ min: 1, max: 10 }),
      target: targetArbitrary(entry),
      // 0 is a valid Rest and is generated often enough by the full range.
      restSeconds: fc.oneof(fc.constant(0), fc.integer({ min: 0, max: 600 })),
    }),
  );
}

function poolOf(kind: Kind): readonly ExerciseEntry[] {
  const pool: readonly EntryOfKind<Kind>[] = kind === 'exercise' ? exercises : stretches;
  return pool;
}

/**
 * A valid Routine_Entry: 1 to 4 steps of Exercises, a Cool-down of 1 to 3
 * Stretches, Sets 1 to 10, reps 1 to 200 or seconds 1 to 120, Rest 0 to 600.
 */
export const routineArbitrary: fc.Arbitrary<RoutineEntry> = fc.record({
  id: fc.constant('generated-routine'),
  slug: fc.constant('generated-routine'),
  nameId: fc.constant('routine.title' as const),
  steps: fc.array(stepArbitrary(poolOf('exercise')), { minLength: 1, maxLength: 4 }),
  coolDown: fc.array(stepArbitrary(poolOf('stretch')), { minLength: 1, maxLength: 3 }),
});

/** Total Set count of a Routine_Entry. */
export function slotCount(routine: RoutineEntry): number {
  return [...routine.steps, ...routine.coolDown].reduce((sum, step) => sum + step.sets, 0);
}

/** One command of a random command list. */
export type WorkoutCommand =
  | { readonly type: 'advance'; readonly byMs: number }
  | {
      readonly type: 'confirm';
      readonly byMs: number;
      /** Valid reps (0 to 200) or undefined for the target reps. */
      readonly reps: number | undefined;
      /** For a seconds Set: wait out the target first. */
      readonly pastTarget: boolean;
    };

const commandArbitrary: fc.Arbitrary<WorkoutCommand> = fc.oneof(
  fc.record({
    type: fc.constant('advance' as const),
    byMs: fc.integer({ min: 0, max: 700_000 }),
  }),
  fc.record({
    type: fc.constant('confirm' as const),
    byMs: fc.integer({ min: 0, max: 700_000 }),
    reps: fc.option(fc.integer({ min: 0, max: 200 }), { nil: undefined }),
    pastTarget: fc.boolean(),
  }),
);

/** A Workout reached from `startWorkout` by commands, with the Routine and the latest clock. */
export interface ReachableWorkout {
  readonly routine: RoutineEntry;
  readonly startAt: number;
  readonly workout: Workout;
  /** The latest clock value passed to the engine. */
  readonly clock: number;
}

/** Apply commands to a started Workout. Clock values never go backwards. */
export function applyCommands(
  routine: RoutineEntry,
  startAt: number,
  commands: readonly WorkoutCommand[],
): ReachableWorkout {
  let workout = startWorkout(routine, startAt);
  let clock = startAt;
  for (const command of commands) {
    clock += command.byMs;
    if (command.type === 'advance') {
      workout = advance(workout, clock);
      continue;
    }
    workout = advance(workout, clock);
    if (command.pastTarget) {
      const view = workoutView(workout);
      if (view.phase === 'exercising' && view.timer.kind === 'seconds') {
        clock += view.timer.remainingMs;
      }
    }
    workout = confirmSet(workout, clock, command.reps);
  }
  return { routine, startAt, workout, clock };
}

/** A reachable Workout: a random command list applied to a Workout on a random Routine. */
export const reachableWorkoutArbitrary: fc.Arbitrary<ReachableWorkout> = fc
  .record({
    routine: routineArbitrary,
    startAt: fc.integer({ min: 0, max: 1_000_000 }),
    commands: fc.array(commandArbitrary, { maxLength: 150 }),
  })
  .map(({ routine, startAt, commands }) => applyCommands(routine, startAt, commands));

/** What the Property 7 player does for one Set. */
export interface PlayerStep {
  /** Time waited before confirming, on top of any wait the target needs. */
  readonly waitMs: number;
  /** Extra time waited after the Rest has ended. */
  readonly restExtraMs: number;
  /** Actual reps, 0 to 200; ignored on a seconds Set. */
  readonly reps: number;
}

/** A player plan long enough for any generated Routine (at most 7 steps of 10 Sets). */
export interface PlayerPlan {
  readonly startAt: number;
  readonly steps: readonly PlayerStep[];
}

export const playerPlanArbitrary: fc.Arbitrary<PlayerPlan> = fc.record({
  startAt: fc.integer({ min: 0, max: 1_000_000 }),
  steps: fc.array(
    fc.record({
      waitMs: fc.integer({ min: 0, max: 60_000 }),
      restExtraMs: fc.integer({ min: 0, max: 60_000 }),
      reps: fc.integer({ min: 0, max: 200 }),
    }),
    { minLength: 70, maxLength: 70 },
  ),
});

/** One confirmed Set as the player saw it. */
export interface PlayedSet {
  readonly slotIndex: number;
  /** The view just before the confirm. */
  readonly before: ExercisingView;
  /** The view just after the confirm. */
  readonly after: WorkoutView;
  /** The view after waiting out the Rest, when there was one. */
  readonly afterRest: WorkoutView | null;
  /** Candy earned before and after the confirm. */
  readonly candyBefore: number;
}

/** The result of a driven Workout. */
export interface PlayedWorkout {
  readonly routine: RoutineEntry;
  readonly workout: Workout;
  readonly played: readonly PlayedSet[];
  /** The player's clock at the start. */
  readonly startClock: number;
  /** The player's clock at the final confirm. */
  readonly finalConfirmClock: number;
}

/**
 * Drive a Routine to the end. At each Set the player waits a generated time,
 * waits out a seconds target, confirms with its reps, then waits out any Rest
 * plus a generated extra. It keeps its own clock.
 */
export function playWorkout(routine: RoutineEntry, plan: PlayerPlan): PlayedWorkout {
  const total = slotCount(routine);
  if (plan.steps.length < total) throw new Error('Player plan is shorter than the Routine');

  let clock = plan.startAt;
  let workout = startWorkout(routine, clock);
  const played: PlayedSet[] = [];
  let finalConfirmClock = clock;

  for (let i = 0; i < total; i += 1) {
    const step = plan.steps[i];
    if (step === undefined) throw new Error('missing player step');

    clock += step.waitMs;
    workout = advance(workout, clock);
    const before = workoutView(workout);
    if (before.phase !== 'exercising') throw new Error('player expected an exercising Workout');
    if (before.timer.kind === 'seconds') {
      clock += before.timer.remainingMs;
    }
    const confirmed = confirmSet(workout, clock, before.timer.kind === 'reps' ? step.reps : undefined);
    const candyBefore = before.candyEarned;
    workout = confirmed;
    const after = workoutView(workout);
    finalConfirmClock = clock;

    let afterRest: WorkoutView | null = null;
    if (after.phase === 'resting') {
      clock += after.restRemainingMs + step.restExtraMs;
      workout = advance(workout, clock);
      afterRest = workoutView(workout);
    }
    played.push({ slotIndex: i, before, after, afterRest, candyBefore });
  }

  return { routine, workout, played, startClock: plan.startAt, finalConfirmClock };
}

/** The kinds of command a script step can issue. */
export type ScriptKind =
  | 'confirm'
  | 'skipSet'
  | 'skipRest'
  | 'pause'
  | 'autoPause'
  | 'resume'
  | 'quit'
  | 'advance';

/** One script step: wait `wait` ms on the player's clock, then issue `kind`. */
export interface ScriptStep {
  readonly kind: ScriptKind;
  readonly wait: number;
  /** Actual reps (0 to 200) for a confirm on a rep Set; ignored otherwise. */
  readonly reps: number;
}

const scriptKinds: readonly ScriptKind[] = [
  'confirm',
  'skipSet',
  'skipRest',
  'pause',
  'autoPause',
  'resume',
  'quit',
  'advance',
];

/** A command script of 0 to `maxLength` steps; waits are 0 to 700 000 ms. */
export function commandScriptArbitrary(maxLength = 150): fc.Arbitrary<readonly ScriptStep[]> {
  return fc.array(
    fc.record({
      kind: fc.constantFrom(...scriptKinds),
      wait: fc.oneof(fc.constant(0), fc.integer({ min: 0, max: 700_000 })),
      reps: fc.integer({ min: 0, max: 200 }),
    }),
    { maxLength },
  );
}

/** A command the engine accepted (returned a new Workout object). */
export interface AcceptedCommand {
  readonly kind: ScriptKind;
  /** The player's clock when the command was issued. */
  readonly at: number;
  /** Index into the script. */
  readonly step: number;
}

/** A span of paused time on the player's clock; `end` is null while still paused. */
export interface PausedSpan {
  readonly start: number;
  readonly end: number | null;
}

export interface ScriptRun {
  readonly routine: RoutineEntry;
  readonly startAt: number;
  readonly workout: Workout;
  /** The player's clock after the last step. */
  readonly clock: number;
  readonly accepted: readonly AcceptedCommand[];
  readonly pausedSpans: readonly PausedSpan[];
}

/**
 * Apply a script to a Routine_Entry. The player keeps its own clock (it never
 * goes backwards), records each accepted command (the engine returned a new
 * object) and the paused spans, and returns the final Workout. A confirm on a
 * seconds Set first waits out the Set_Timer.
 */
export function playScript(
  routine: RoutineEntry,
  startAt: number,
  script: readonly ScriptStep[],
): ScriptRun {
  let workout = startWorkout(routine, startAt);
  let clock = startAt;
  const accepted: AcceptedCommand[] = [];
  const spans: { start: number; end: number | null }[] = [];

  script.forEach((step, index) => {
    clock += step.wait;
    if (step.kind === 'confirm') {
      const view = workoutView(advance(workout, clock));
      if (view.phase === 'exercising' && view.timer.kind === 'seconds') {
        clock += view.timer.remainingMs;
      }
    }

    const before = workout;
    switch (step.kind) {
      case 'advance':
        workout = advance(workout, clock);
        return;
      case 'confirm': {
        const view = workoutView(advance(workout, clock));
        const reps =
          view.phase === 'exercising' && view.timer.kind === 'reps' ? step.reps : undefined;
        workout = confirmSet(workout, clock, reps);
        break;
      }
      case 'skipSet':
        workout = skipSet(workout, clock);
        break;
      case 'skipRest':
        workout = skipRest(workout, clock);
        break;
      case 'pause':
        workout = pauseWorkout(workout, clock);
        break;
      case 'autoPause':
        workout = autoPause(workout, clock);
        break;
      case 'resume':
        workout = resumeWorkout(workout, clock);
        break;
      case 'quit':
        workout = quitWorkout(workout, clock);
        break;
    }

    if (workout === before) return;
    accepted.push({ kind: step.kind, at: clock, step: index });
    if (before.phase !== 'paused' && workout.phase === 'paused') {
      // The engine pauses at its own advanced clock, which is the player's clock.
      spans.push({ start: clock, end: null });
    } else if (before.phase === 'paused') {
      const open = spans[spans.length - 1];
      if (open !== undefined && open.end === null && workout.phase !== 'summary') {
        open.end = clock;
      }
    }
  });

  return { routine, startAt, workout, clock, accepted, pausedSpans: spans };
}

/** A generated Routine_Entry, start clock and script, played. */
export const scriptRunArbitrary: fc.Arbitrary<ScriptRun> = fc
  .record({
    routine: routineArbitrary,
    startAt: fc.integer({ min: 0, max: 1_000_000 }),
    script: commandScriptArbitrary(),
  })
  .map(({ routine, startAt, script }) => playScript(routine, startAt, script));
