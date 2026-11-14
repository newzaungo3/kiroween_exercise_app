'use client';

import { ResumePanel } from './ResumePanel';
import { useUnfinishedWorkout } from './useUnfinishedWorkout';

/**
 * The Resume_Prompt of the Home_Screen: a client island. Renders nothing while
 * the browser reads storage or when no Workout is unfinished. Moves no focus.
 */
export function ResumePrompt() {
  const { status, info, resume, discard } = useUnfinishedWorkout();
  if (status !== 'prompt' || info === null) return null;
  return <ResumePanel info={info} onResume={resume} onDiscard={discard} />;
}
