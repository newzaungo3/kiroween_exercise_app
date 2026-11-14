import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { findRoutine } from '@/catalog';
import { initialRunState, runReducer } from '@/ui/workout/run';
import { formatCountdown, formatElapsed } from '@/ui/workout/clock-text';
import { parseActualReps } from '@/ui/workout/reps-field';
import { dialogApplies } from '@/ui/workout/dialogs';
import { workoutView } from '@/workout-engine';

describe('the dialog rule', () => {
  it('skip Set applies only while exercising and quit while exercising, resting or paused', () => {
    // **Validates: Requirements 10.10**
    const table = [
      ['exercising', true, true],
      ['resting', false, true],
      ['paused', false, true],
      ['summary', false, false],
    ] as const;
    for (const [phase, skipSet, quit] of table) {
      expect(dialogApplies('skipSet', phase)).toBe(skipSet);
      expect(dialogApplies('quit', phase)).toBe(quit);
    }
  });
});

/** Reads "m:ss" back into whole seconds, or null when the text has another shape. */
function secondsOf(text: string): number | null {
  const match = /^(\d+):(\d{2})$/.exec(text);
  if (match === null) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

describe('the clock text', () => {
  // Feature: happy-path-workout, Property 8: Clock text matches whole seconds
  it('shows a countdown rounded up and an elapsed time rounded down, negative as 0:00', () => {
    // **Validates: Requirements 11.4, 11.5, 11.7, 12.1, 13.1**
    fc.assert(
      fc.property(
        fc.oneof(
          fc.integer({ min: -100_000, max: 10_000_000 }),
          fc.double({ min: -100_000, max: 10_000_000, noNaN: true }),
        ),
        (ms) => {
          const expectedCountdown = Math.max(0, Math.ceil(ms / 1000));
          const expectedElapsed = Math.max(0, Math.floor(ms / 1000));
          expect(secondsOf(formatCountdown(ms))).toBe(expectedCountdown);
          expect(secondsOf(formatElapsed(ms))).toBe(expectedElapsed);
          if (ms < 0) {
            expect(formatCountdown(ms)).toBe('0:00');
            expect(formatElapsed(ms)).toBe('0:00');
          }
        },
      ),
      { numRuns: 200 },
    );
  });
});

/** The oracle: trimmed text of one to three ASCII digits whose number is at most 200. */
function namesZeroToTwoHundred(text: string): number | null {
  const trimmed = text.trim();
  if (trimmed.length < 1 || trimmed.length > 3) return null;
  for (const char of trimmed) {
    if (char < '0' || char > '9') return null;
  }
  const value = parseInt(trimmed, 10);
  return value <= 200 ? value : null;
}

describe('the rep field text', () => {
  // Feature: happy-path-workout, Property 9: Rep field text is accepted exactly when it names 0 to 200
  it('is accepted exactly when it names a whole number from 0 to 200', () => {
    // **Validates: Requirements 11.4, 11.5, 11.7, 12.1, 13.1**
    const digits = fc.stringMatching(/^[0-9]{0,5}$/);
    const padded = fc
      .tuple(fc.constantFrom('', ' ', '\t', '\n'), digits, fc.constantFrom('', ' ', '\t'))
      .map(([a, b, c]) => `${a}${b}${c}`);
    const signed = fc
      .tuple(fc.constantFrom('+', '-'), fc.integer({ min: 0, max: 250 }))
      .map(([sign, n]) => `${sign}${n}`);
    const decimal = fc
      .tuple(fc.integer({ min: 0, max: 250 }), fc.integer({ min: 0, max: 99 }))
      .map(([whole, part]) => `${whole}.${part}`);
    const exponent = fc
      .tuple(fc.integer({ min: 0, max: 20 }), fc.integer({ min: 0, max: 3 }))
      .map(([base, power]) => `${base}e${power}`);
    const boundary = fc.constantFrom('0', '00', '000', '007', '199', '200', '201', '999', '1000', '', ' ');

    fc.assert(
      fc.property(
        fc.oneof(fc.string(), padded, signed, decimal, exponent, boundary),
        (text) => {
          expect(parseActualReps(text)).toBe(namesZeroToTwoHundred(text));
        },
      ),
      { numRuns: 200 },
    );
  });
});

describe('the run reducer', () => {
  const routine = findRoutine('graveyard-shift');
  if (routine === undefined) throw new Error('Graveyard Shift is missing from the Catalog');

  it('a tick or a confirm before the start changes nothing', () => {
    // **Validates: Requirements 10.1, 10.3**
    expect(runReducer(initialRunState, { type: 'tick', now: 1000 })).toBe(initialRunState);
    expect(runReducer(initialRunState, { type: 'confirm', now: 1000, actualReps: 5 })).toBe(
      initialRunState,
    );
    expect(initialRunState.workout).toBeNull();
  });

  it('a second start does not restart the Workout', () => {
    // **Validates: Requirements 10.1, 10.3**
    const started = runReducer(initialRunState, { type: 'start', routine, now: 0 });
    expect(started.workout).not.toBeNull();
    const again = runReducer(started, { type: 'start', routine, now: 5000 });
    expect(again).toBe(started);
  });

  it('a start then a confirm with 12 reps records 12', () => {
    // **Validates: Requirements 10.1, 11.6**
    const started = runReducer(initialRunState, { type: 'start', routine, now: 0 });
    const confirmed = runReducer(started, { type: 'confirm', now: 1000, actualReps: 12 });
    expect(confirmed.workout?.confirmed).toHaveLength(1);
    expect(confirmed.workout?.confirmed[0]?.actualReps).toBe(12);
  });

  it('the pause, skip, resume and quit actions are ignored before the start', () => {
    // **Validates: Requirements 10.3, 11.4, 11.9**
    for (const type of ['pause', 'autoPause', 'skipSet', 'skipRest', 'resume', 'quit'] as const) {
      expect(runReducer(initialRunState, { type, now: 1000 })).toBe(initialRunState);
    }
  });

  it('a rejected skip Set keeps the state and the notice', () => {
    // **Validates: Requirements 11.4, 13.3**
    const started = runReducer(initialRunState, { type: 'start', routine, now: 0 });
    const paused = runReducer(started, { type: 'pause', now: 1000 });
    const resumed = runReducer(paused, { type: 'resume', now: 2000 });
    expect(resumed.notice).toBe('resumed');
    // Skip Rest is rejected while exercising; the notice stays.
    expect(runReducer(resumed, { type: 'skipRest', now: 3000 })).toBe(resumed);
    // Skip Set is rejected while paused.
    const pausedAgain = runReducer(resumed, { type: 'pause', now: 3000 });
    expect(runReducer(pausedAgain, { type: 'skipSet', now: 4000 })).toBe(pausedAgain);
  });

  it('an accepted skip Rest sets the notice and a later confirm clears it', () => {
    // **Validates: Requirements 11.4, 13.3, 13.4**
    const started = runReducer(initialRunState, { type: 'start', routine, now: 0 });
    const resting = runReducer(started, { type: 'confirm', now: 1000, actualReps: 10 });
    if (resting.workout === null) throw new Error('expected a Workout');
    expect(workoutView(resting.workout).phase).toBe('resting');
    const skipped = runReducer(resting, { type: 'skipRest', now: 2000 });
    expect(skipped.notice).toBe('skippedRest');
    const confirmed = runReducer(skipped, { type: 'confirm', now: 3000, actualReps: 10 });
    expect(confirmed.notice).toBeNull();
  });

  it('a resume sets the resumed notice', () => {
    // **Validates: Requirements 11.9, 13.3**
    const started = runReducer(initialRunState, { type: 'start', routine, now: 0 });
    const paused = runReducer(started, { type: 'pause', now: 1000 });
    expect(paused.notice).toBeNull();
    const resumed = runReducer(paused, { type: 'resume', now: 2000 });
    expect(resumed.notice).toBe('resumed');
  });

  it('an Auto_Pause after a user pause keeps the cause user', () => {
    // **Validates: Requirements 5.2**
    const started = runReducer(initialRunState, { type: 'start', routine, now: 0 });
    const paused = runReducer(started, { type: 'pause', now: 1000 });
    const again = runReducer(paused, { type: 'autoPause', now: 2000 });
    if (again.workout === null) throw new Error('expected a Workout');
    const view = workoutView(again.workout);
    expect(view.phase).toBe('paused');
    if (view.phase === 'paused') expect(view.cause).toBe('user');
  });

  it('the reducer file imports nothing from React', () => {
    // **Validates: Requirements 10.1, 10.3**
    const source = readFileSync(join(process.cwd(), 'src/ui/workout/run.ts'), 'utf8');
    expect(source).not.toMatch(/from\s+['"]react(\/[^'"]*)?['"]/);
    expect(source).not.toMatch(/require\(\s*['"]react/);
  });
});
