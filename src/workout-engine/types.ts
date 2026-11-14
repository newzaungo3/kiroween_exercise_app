import type { ExerciseTarget } from '@/catalog';

/** Where a Workout is. Ticket 07 adds paused; ticket 09 adds nothing here. */
export type Phase = 'exercising' | 'resting' | 'summary';

/** Ticket 07 adds 'partial' and 'abandoned'. */
export type WorkoutOutcome = 'completed';

/** One Set of the Workout, in order. Holds ids and numbers only. */
export interface SetSlot {
  readonly entryId: string;
  /** 1-based within its Routine step. */
  readonly setNumber: number;
  /** Sets of its Routine step. */
  readonly setCount: number;
  readonly target: ExerciseTarget;
  /** Rest after this Set, in seconds. */
  readonly restSeconds: number;
}

export interface ConfirmedSet {
  readonly slotIndex: number;
  /** null for a seconds target. */
  readonly actualReps: number | null;
}

/** Plain, JSON-safe data. Read it through workoutView. */
export interface Workout {
  readonly routineId: string;
  readonly slots: readonly SetSlot[];
  readonly startedAt: number;
  /** Latest Workout clock value seen, in ms. */
  readonly clock: number;
  readonly phase: Phase;
  /** Current slot; while resting, the slot just confirmed. */
  readonly index: number;
  /** Start of this Set, or of this Rest. */
  readonly phaseStartedAt: number;
  readonly confirmed: readonly ConfirmedSet[];
  /** Clock of the final confirm. */
  readonly finishedAt: number | null;
}

interface ViewBase {
  readonly totalSets: number;
  readonly candyEarned: number;
}

export interface ExercisingView extends ViewBase {
  readonly phase: 'exercising';
  readonly slot: SetSlot;
  /** 1-based position in the Workout. */
  readonly position: number;
  readonly timer:
    | { readonly kind: 'reps'; readonly targetReps: number; readonly defaultReps: number }
    | { readonly kind: 'seconds'; readonly targetSeconds: number; readonly remainingMs: number };
}

export interface RestingView extends ViewBase {
  readonly phase: 'resting';
  readonly restRemainingMs: number;
  readonly next: SetSlot;
  readonly nextPosition: number;
}

export interface SummaryView extends ViewBase {
  readonly phase: 'summary';
  readonly outcome: WorkoutOutcome;
  readonly setsConfirmed: number;
  readonly setsSkipped: number;
  readonly activeMs: number;
  readonly bonusIncluded: boolean;
}

export type WorkoutView = ExercisingView | RestingView | SummaryView;
