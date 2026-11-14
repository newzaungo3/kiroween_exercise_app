import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { routines } from '@/catalog';
import type { RoutineEntry } from '@/catalog';
import { validateRecord } from '@/progress-store/rules';
import { workoutView } from '@/workout-engine';
import type { SummaryView } from '@/workout-engine';
import { workoutRecordOf } from '@/ui/progress/workout-record';
import { playScript, scriptRunArbitrary, slotCount } from './support/workout';
import type { ScriptStep } from './support/workout';

const graveyardShift: RoutineEntry = (() => {
  const found = routines.find((routine) => routine.id === 'graveyard-shift');
  if (found === undefined) throw new Error('Graveyard Shift is missing from the Catalog');
  return found;
})();

function step(kind: ScriptStep['kind']): ScriptStep {
  return { kind, wait: 1000, reps: 10 };
}

/** Alternating "skip Rest, confirm" steps, enough to finish any Routine. */
function confirmAll(routine: RoutineEntry, count = slotCount(routine)): ScriptStep[] {
  const steps: ScriptStep[] = [];
  for (let i = 0; i < count; i += 1) steps.push(step('confirm'), step('skipRest'));
  return steps;
}

function summaryOf(routine: RoutineEntry, script: readonly ScriptStep[]): SummaryView {
  const run = playScript(routine, 5000, script);
  const view = workoutView(run.workout);
  if (view.phase !== 'summary') throw new Error('expected a summary');
  return view;
}

describe('the stored record of a Workout', () => {
  // Feature: candy-and-history, Property 11: A summary view maps to a valid record with the same Candy
  // Validates: Requirements 6.2, 6.4, 6.5
  it('a summary view maps to a valid record with the same Candy', () => {
    fc.assert(
      fc.property(scriptRunArbitrary, fc.integer({ min: 0, max: 4_000_000_000_000 }), (run, finishedAt) => {
        const view = workoutView(run.workout);
        fc.pre(view.phase === 'summary');
        if (view.phase !== 'summary') return;

        const record = workoutRecordOf(view, run.routine.id, finishedAt);
        expect(validateRecord(record)).toBe(true);
        expect(record.outcome).toBe(view.outcome);
        expect(record.candyEarned).toBe(view.candyEarned);
        expect(record.routineId).toBe(run.routine.id);
        expect(record.id).toBe(`${run.routine.id}:${finishedAt}`);
        if (view.outcome === 'abandoned') {
          expect(record.candyEarned).toBe(view.setsConfirmed);
        }
      }),
      { numRuns: 200 },
    );
  });

  it('a completed Graveyard Shift records 14 Candy', () => {
    const view = summaryOf(graveyardShift, confirmAll(graveyardShift));
    const record = workoutRecordOf(view, graveyardShift.id, 1_000_000);
    expect(record.outcome).toBe('completed');
    expect(record.candyEarned).toBe(14);
    expect(validateRecord(record)).toBe(true);
  });

  it('one skipped Set records 8 Candy and the outcome partial', () => {
    const view = summaryOf(graveyardShift, [
      step('skipSet'),
      step('skipRest'),
      ...confirmAll(graveyardShift),
    ]);
    const record = workoutRecordOf(view, graveyardShift.id, 1_000_000);
    expect(record.outcome).toBe('partial');
    expect(record.candyEarned).toBe(8);
    expect(validateRecord(record)).toBe(true);
  });

  it('a quit after 3 confirmed Sets records 3 Candy and the outcome abandoned', () => {
    const view = summaryOf(graveyardShift, [...confirmAll(graveyardShift, 3), step('quit')]);
    const record = workoutRecordOf(view, graveyardShift.id, 1_000_000);
    expect(record.outcome).toBe('abandoned');
    expect(record.candyEarned).toBe(3);
    expect(validateRecord(record)).toBe(true);
  });

  it('the record id is the Routine id, a colon and the finish time', () => {
    const view = summaryOf(graveyardShift, confirmAll(graveyardShift));
    expect(workoutRecordOf(view, 'graveyard-shift', 1234).id).toBe('graveyard-shift:1234');
  });
});
