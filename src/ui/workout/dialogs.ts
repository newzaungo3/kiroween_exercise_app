import type { WorkoutView } from '@/workout-engine';

export type DialogKind = 'skipSet' | 'quit';

/** Whether a dialog still applies to the Workout's phase (Requirement 10.10). */
export function dialogApplies(kind: DialogKind, phase: WorkoutView['phase']): boolean {
  switch (kind) {
    case 'skipSet':
      return phase === 'exercising';
    case 'quit':
      return phase === 'exercising' || phase === 'resting' || phase === 'paused';
  }
}
