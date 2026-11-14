/**
 * The Resume_Intent: the Routine id the user chose to resume on the Home_Screen.
 * Page memory only, so a reload clears it and the question is asked again.
 */
let intent: string | null = null;

export function setResumeIntent(routineId: string): void {
  intent = routineId;
}

export function peekResumeIntent(): string | null {
  return intent;
}

export function clearResumeIntent(): void {
  intent = null;
}
