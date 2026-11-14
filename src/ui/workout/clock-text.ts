import { format } from '@/ui/strings';

function clockText(totalSeconds: number): string {
  const safe = Number.isFinite(totalSeconds) && totalSeconds > 0 ? totalSeconds : 0;
  return format('workout.timer.format', {
    minutes: String(Math.floor(safe / 60)),
    seconds: String(safe % 60).padStart(2, '0'),
  });
}

/** Time left as m:ss, rounded up to the next whole second. Negative input shows 0:00. */
export function formatCountdown(ms: number): string {
  return clockText(Math.ceil(ms / 1000));
}

/** Time passed as m:ss, rounded down to the whole second. Negative input shows 0:00. */
export function formatElapsed(ms: number): string {
  return clockText(Math.floor(ms / 1000));
}
