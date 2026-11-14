import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { checkpointIntervalMs, checkpointKey } from '@/ui/workout/checkpoint-plan';
import { advance, pauseWorkout, resumeWorkout, startWorkout } from '@/workout-engine';
import { routines } from '@/catalog';
import { commandScriptArbitrary, playScript, routineArbitrary } from './support/workout';

describe('checkpoint plan', () => {
  it('the interval is 5000 ms', () => {
    expect(checkpointIntervalMs).toBe(5000);
  });

  it('a pause and a resume change the key', () => {
    const routine = routines[0];
    if (routine === undefined) throw new Error('the Catalog holds no Routine');
    const started = startWorkout(routine, 1000);
    const paused = pauseWorkout(started, 2000);
    const resumed = resumeWorkout(paused, 3000);
    expect(checkpointKey(paused)).not.toBe(checkpointKey(started));
    expect(checkpointKey(resumed)).not.toBe(checkpointKey(paused));
  });

  it('the key ignores a clock-only tick', () => {
    const routine = routines[0];
    if (routine === undefined) throw new Error('the Catalog holds no Routine');
    const started = startWorkout(routine, 1000);
    expect(checkpointKey(advance(started, 1001))).toBe(checkpointKey(started));
  });

  // Feature: resume-after-refresh, Property 13: Checkpoint moments follow commands, not ticks
  // **Validates: Requirements 7.1, 7.2, 7.4, 7.10**
  it('the key changes after each accepted command and each Rest ended by time, and only then', () => {
    fc.assert(
      fc.property(
        routineArbitrary,
        fc.integer({ min: 0, max: 1_000_000 }),
        commandScriptArbitrary(40),
        (routine, startAt, script) => {
          let before = playScript(routine, startAt, []);
          for (let i = 0; i < script.length; i += 1) {
            const after = playScript(routine, startAt, script.slice(0, i + 1));
            const step = script[i];
            if (step === undefined) throw new Error('missing step');
            const keyBefore = checkpointKey(before.workout);
            const keyAfter = checkpointKey(after.workout);
            // A rejected command may still return a Workout with a newer clock, so
            // "accepted" means: the player saw a new object and more than the clock changed.
            const withoutClock = (w: object): string =>
              JSON.stringify({ ...w, clock: 0 });
            const acceptedNow =
              after.accepted.length > before.accepted.length &&
              withoutClock(after.workout) !== withoutClock(before.workout);

            if (step.kind === 'advance') {
              const restEnded =
                before.workout.phase === 'resting' && after.workout.phase !== 'resting';
              if (restEnded) expect(keyAfter).not.toBe(keyBefore);
              else expect(keyAfter).toBe(keyBefore);
            } else if (acceptedNow) {
              expect(keyAfter).not.toBe(keyBefore);
            } else {
              expect(keyAfter).toBe(keyBefore);
            }
            before = after;
          }
        },
      ),
      { numRuns: 200 },
    );
  });
});
