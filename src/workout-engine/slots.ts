import type { RoutineEntry } from '@/catalog';
import type { SetSlot } from './types';

/**
 * The Sets of a Routine in order: every step, then the Cool-down.
 * Each step yields `sets` slots numbered 1..sets.
 */
export function buildSetSlots(routine: RoutineEntry): readonly SetSlot[] {
  const slots: SetSlot[] = [];
  for (const step of [...routine.steps, ...routine.coolDown]) {
    for (let setNumber = 1; setNumber <= step.sets; setNumber += 1) {
      slots.push({
        entryId: step.entryId,
        setNumber,
        setCount: step.sets,
        target: step.target,
        restSeconds: step.restSeconds,
      });
    }
  }
  return slots;
}
