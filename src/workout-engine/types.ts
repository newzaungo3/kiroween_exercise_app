import type { ExerciseTarget } from '@/catalog';

/** Where a Workout is. Ticket 09 adds nothing here. */
export type Phase = 'exercising' | 'resting' | 'paused' | 'summary';

export type WorkoutOutcome = 'completed' | 'partial' | 'abandoned';

/** Who paused the Workout: the user, or the page becoming hidden. */
export type PauseCause = 'user' | 'auto';

/** What one Set slot shows in the views. 'notReached' appears only after a quit. */
export type SetResult = 'confirmed' | 'skipped' | 'notReached' | 'pending';

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

export interface PauseState {
  readonly cause: PauseCause;
  /** The phase held while paused; resume returns to it. */
  readonly from: 'exercising' | 'resting';
  /** Workout clock value of the pause, in ms. */
  readonly at: number;
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
  /** Clock at the end of the Workout: final confirm or skip, or the quit. */
  readonly finishedAt: number | null;
  /** Non-null exactly while phase is 'paused'. */
  readonly pause: PauseState | null;
  /** Total paused time of finished pauses, in ms. */
  readonly pausedMs: number;
  /** Slot indices of skipped Sets, in order. Disjoint from `confirmed`. */
  readonly skipped: readonly number[];
  /** Non-null exactly in 'summary'. */
  readonly outcome: WorkoutOutcome | null;
}

interface ViewBase {
  readonly totalSets: number;
  readonly candyEarned: number;
  /** One entry per Set slot, in Workout order. */
  readonly results: readonly SetResult[];
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

export interface PausedView extends ViewBase {
  readonly phase: 'paused';
  readonly cause: PauseCause;
  /** The view of the phase that was frozen, with timers as they were at the pause. */
  readonly held: ExercisingView | RestingView;
}

export interface SummaryView extends ViewBase {
  readonly phase: 'summary';
  readonly outcome: WorkoutOutcome;
  readonly setsConfirmed: number;
  /** Skipped Sets only. */
  readonly setsSkipped: number;
  /** 0 unless the Workout was abandoned. */
  readonly setsNotReached: number;
  readonly activeMs: number;
  /** True only when every Set was confirmed. */
  readonly bonusIncluded: boolean;
  /** Same as `results`, typed without 'pending'. */
  readonly results: readonly Exclude<SetResult, 'pending'>[];
}

export type WorkoutView = ExercisingView | RestingView | PausedView | SummaryView;
