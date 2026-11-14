/** The date and time of a finished Workout in English, for example "Nov 20, 2026, 10:00 AM". */
export function formatWorkoutDate(ms: number, timeZone?: string): string {
  return new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone,
  }).format(ms);
}
