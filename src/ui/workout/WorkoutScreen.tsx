'use client';

/**
 * Workout_Screen: the client island that runs one Workout.
 *
 * One Viewer sits above the panels, keyed by Exercise id, so it resets when
 * the Exercise changes and survives Set to Rest to Set of the same Exercise.
 * The summary shows none. The live region changes only when the panel heading
 * changes and never carries a timer. Nothing is written to browser storage.
 */
import { useEffect, useRef } from 'react';

import { findEntryById } from '@/catalog';
import type { ExerciseEntry, RoutineEntry } from '@/catalog';
import type { WorkoutView } from '@/workout-engine';

import { exerciseName } from '../exercises/labels';
import { routineName } from '../routines/labels';
import { format, t } from '../strings';
import { CoachViewer } from './CoachViewer';
import { PreparingPanel } from './PreparingPanel';
import { RestPanel } from './RestPanel';
import { SetPanel } from './SetPanel';
import { SummaryPanel } from './SummaryPanel';
import { useWorkoutRun } from './useWorkoutRun';
import styles from './WorkoutScreen.module.css';

export interface WorkoutScreenProps {
  readonly routine: RoutineEntry;
}

function entryOrThrow(id: string): ExerciseEntry {
  const entry = findEntryById(id);
  if (entry === undefined) throw new Error(`Unknown Catalog entry: ${id}`);
  return entry;
}

/** Identity of the active panel; changes exactly when the panel heading changes. */
function panelKey(view: WorkoutView | null): string {
  if (view === null) return 'preparing';
  if (view.phase === 'exercising') return `set-${view.position}`;
  if (view.phase === 'resting') return `rest-${view.nextPosition}`;
  return 'summary';
}

export function WorkoutScreen({ routine }: WorkoutScreenProps) {
  const { view, start, confirm } = useWorkoutRun(routine);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const shownKey = useRef<string | null>(null);
  const key = panelKey(view);

  // Move focus to the new panel heading, but not on first render.
  useEffect(() => {
    const previous = shownKey.current;
    shownKey.current = key;
    if (previous !== null && previous !== key) {
      headingRef.current?.focus({ preventScroll: true });
    }
  }, [key]);

  let viewerEntry: ExerciseEntry | null = null;
  let announcement = '';
  let panel;
  if (view === null) {
    panel = <PreparingPanel routine={routine} onStart={start} headingRef={headingRef} />;
  } else if (view.phase === 'exercising') {
    viewerEntry = entryOrThrow(view.slot.entryId);
    announcement = format('workout.announce.set', {
      number: String(view.slot.setNumber),
      count: String(view.slot.setCount),
      exercise: exerciseName(viewerEntry),
    });
    panel = (
      <SetPanel
        key={view.position}
        view={view}
        entry={viewerEntry}
        onConfirm={confirm}
        headingRef={headingRef}
      />
    );
  } else if (view.phase === 'resting') {
    viewerEntry = entryOrThrow(view.next.entryId);
    announcement = format('workout.announce.rest', { exercise: exerciseName(viewerEntry) });
    panel = <RestPanel view={view} nextEntry={viewerEntry} headingRef={headingRef} />;
  } else {
    announcement = t('workout.announce.summary');
    panel = <SummaryPanel view={view} routine={routine} headingRef={headingRef} />;
  }

  return (
    <>
      <h1 className={styles.title}>{routineName(routine)}</h1>
      <div role="status" className={styles.visuallyHidden}>
        {announcement}
      </div>
      {viewerEntry !== null ? <CoachViewer key={viewerEntry.id} exercise={viewerEntry} /> : null}
      {panel}
    </>
  );
}
