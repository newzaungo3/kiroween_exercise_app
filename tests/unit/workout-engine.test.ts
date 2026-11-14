import { describe, expect, it } from 'vitest';

import { findRoutine } from '@/catalog';
import type { RoutineEntry } from '@/catalog';
import {
  advance,
  confirmSet,
  startWorkout,
  workoutView,
} from '@/workout-engine';
import type { SummaryView, Workout } from '@/workout-engine';

const found = findRoutine('graveyard-shift');
if (found === undefined) throw new Error('Graveyard Shift is missing from the Catalog');
const graveyardShift: RoutineEntry = found;

/** A copy of Graveyard Shift with the same Rest after every Set. */
function withRest(restSeconds: number): RoutineEntry {
  return {
    ...graveyardShift,
    steps: graveyardShift.steps.map((step) => ({ ...step, restSeconds })),
    coolDown: graveyardShift.coolDown.map((step) => ({ ...step, restSeconds })),
  };
}

/** A Routine of one step of two timed Sets with a 30 s Rest. */
const timedRoutine: RoutineEntry = {
  ...graveyardShift,
  steps: [
    {
      entryId: graveyardShift.coolDown[0]!.entryId,
      sets: 2,
      target: { seconds: 30 },
      restSeconds: 30,
    },
  ],
  coolDown: [],
};

function exercisingView(w: Workout) {
  const view = workoutView(w);
  if (view.phase !== 'exercising') throw new Error(`expected exercising, got ${view.phase}`);
  return view;
}

describe('the Workout engine', () => {
  it('a confirm without reps records the target reps', () => {
    const w = confirmSet(startWorkout(graveyardShift, 0), 1000);
    expect(w.confirmed).toHaveLength(1);
    expect(w.confirmed[0]?.actualReps).toBe(20);
  });

  it('a confirm during Rest changes nothing', () => {
    const resting = confirmSet(startWorkout(graveyardShift, 0), 1000);
    expect(workoutView(resting).phase).toBe('resting');
    // 5 s later, still inside the 30 s Rest
    expect(confirmSet(resting, 6000)).toBe(resting);
    expect(confirmSet(resting, 6000, 12)).toBe(resting);
  });

  it('a Rest of 0 goes straight to the next Set', () => {
    const w = confirmSet(startWorkout(withRest(0), 0), 1000);
    const view = exercisingView(w);
    expect(view.position).toBe(2);
    expect(view.slot.setNumber).toBe(2);
  });

  it('a late advance counts the time after the Rest end as time of the next Set', () => {
    const started = startWorkout(timedRoutine, 0);
    const resting = confirmSet(started, 30_000); // Rest ends at 60 000
    expect(workoutView(resting).phase).toBe('resting');

    const late = advance(resting, 70_000);
    const view = exercisingView(late);
    expect(view.position).toBe(2);
    expect(view.timer).toMatchObject({ kind: 'seconds', remainingMs: 20_000 });
  });

  it('the final Set is followed by no Rest', () => {
    const lastOfOne: RoutineEntry = {
      ...graveyardShift,
      steps: [{ ...graveyardShift.steps[0]!, sets: 1, restSeconds: 30 }],
      coolDown: [],
    };
    const done = confirmSet(startWorkout(lastOfOne, 0), 1000);
    expect(workoutView(done).phase).toBe('summary');
  });

  it('a Set of Graveyard Shift earns 1 Candy whatever the reps', () => {
    for (const reps of [undefined, 0, 7, 200]) {
      const w = confirmSet(startWorkout(graveyardShift, 0), 1000, reps);
      expect(workoutView(w).candyEarned).toBe(1);
    }
  });

  it('a full Graveyard Shift run earns 14 Candy and ends with 9 Sets confirmed', () => {
    let clock = 0;
    let w = startWorkout(graveyardShift, clock);
    for (let guard = 0; guard < 100; guard += 1) {
      const view = workoutView(w);
      if (view.phase === 'summary') break;
      if (view.phase === 'resting') {
        clock += view.restRemainingMs;
        w = advance(w, clock);
        continue;
      }
      if (view.phase !== 'exercising') throw new Error(`unexpected phase ${view.phase}`);
      clock += 1000;
      if (view.timer.kind === 'seconds') clock += view.timer.remainingMs;
      w = confirmSet(w, clock);
    }
    const summary = workoutView(w) as SummaryView;
    expect(summary.phase).toBe('summary');
    expect(summary.setsConfirmed).toBe(9);
    expect(summary.setsSkipped).toBe(0);
    expect(summary.candyEarned).toBe(14);
    expect(summary.outcome).toBe('completed');
  });

  it('a rep Set with 0 reps is confirmed', () => {
    const start = startWorkout(graveyardShift, 0);
    const w = confirmSet(start, 1000, 0);
    expect(w).not.toBe(start);
    expect(w.confirmed[0]?.actualReps).toBe(0);
    expect(workoutView(w).candyEarned).toBe(1);
  });
});
