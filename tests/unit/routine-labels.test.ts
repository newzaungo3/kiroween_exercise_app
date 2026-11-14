import { describe, expect, it } from 'vitest';

import { findRoutine, type RoutineEntry } from '@/catalog';
import { countLabel, lengthLabel, stepLine } from '@/ui/routines/labels';

function graveyardShift(): RoutineEntry {
  const routine = findRoutine('graveyard-shift');
  if (routine === undefined) throw new Error('Graveyard Shift is missing from the Catalog');
  return routine;
}

/** A Routine whose estimate is exactly the given seconds: one Set, no Cool-down. */
function routineOfSeconds(seconds: number): RoutineEntry {
  return {
    ...graveyardShift(),
    steps: [{ entryId: 'grave-rise', sets: 1, target: { seconds }, restSeconds: 0 }],
    coolDown: [],
  };
}

describe('Routine labels', () => {
  it("Graveyard Shift's length reads About 10 minutes", () => {
    expect(lengthLabel(graveyardShift())).toBe('About 10 minutes');
  });

  it('a Routine of 1 minute reads About 1 minute', () => {
    expect(lengthLabel(routineOfSeconds(60))).toBe('About 1 minute');
  });

  it('a Routine of another number of minutes reads minutes in the plural', () => {
    expect(lengthLabel(routineOfSeconds(120))).toBe('About 2 minutes');
  });

  it('a count of 1 reads in the singular and a count of 2 in the plural', () => {
    expect(countLabel('exercises', 1)).toBe('1 Exercise');
    expect(countLabel('exercises', 2)).toBe('2 Exercises');
    expect(countLabel('stretches', 1)).toBe('1 Stretch');
    expect(countLabel('stretches', 2)).toBe('2 Stretches');
  });

  it('a Graveyard Shift step reads its Sets, target and Rest', () => {
    const graveRise = graveyardShift().steps.find((step) => step.entryId === 'grave-rise');
    if (graveRise === undefined) throw new Error('Grave Rise is missing from the Routine');
    expect(stepLine(graveRise)).toBe('3 Sets · 10 reps · Rest 30 seconds');
  });
});
