/**
 * Demo_Clip playback clock for the Viewer.
 *
 * Pure logic: no React, Three.js, DOM or storage. Time arrives as an argument
 * (`now`, in milliseconds), so tests drive it with an injected clock.
 *
 * The clip advances only by the gap between two consecutive drawn-frame ticks,
 * clamped to `maxFrameGapMs` and scaled by the Playback_Speed. Pausing,
 * toggling and suspending (Page_Hidden or Viewer_Area out of view) forget the
 * last tick, so the first tick afterwards advances the clip by 0. Time spent
 * paused, hidden or scrolled away therefore never moves the Coach forward.
 *
 * Playback_Speed only scales the clip-time increment here. The Viewer owns no
 * shared clock, so a speed change cannot affect Workout time.
 */

/** Rate of the Demo_Clip as a fraction of its authored speed. */
export type PlaybackSpeed = 0.5 | 0.75 | 1;

/** The Playback_Speed buttons, in display order. */
export const playbackSpeeds: readonly PlaybackSpeed[] = [0.5, 0.75, 1];

/** Largest gap between two drawn frames that may advance the Demo_Clip. */
export const maxFrameGapMs = 100;

export interface PlaybackState {
  readonly playing: boolean;
  readonly speed: PlaybackSpeed;
  /** Seconds, 0 <= clipTime < duration. */
  readonly clipTime: number;
  /** Demo_Clip length in seconds, > 0. */
  readonly duration: number;
  /** Milliseconds of the last counted tick; null right after create, pause, suspend or resume. */
  readonly lastTickAt: number | null;
}

/** Wraps a clip time into [0, duration). */
function wrapClipTime(time: number, duration: number): number {
  const wrapped = time % duration;
  const positive = wrapped < 0 ? wrapped + duration : wrapped;
  // Guards the floating-point edge where adding `duration` rounds up to it.
  return positive >= duration ? 0 : positive;
}

/**
 * Starts the Demo_Clip at its first frame at 1×, playing unless the
 * Reduced_Motion_Preference is set.
 */
export function createPlayback(duration: number, reducedMotion: boolean): PlaybackState {
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new RangeError(`Demo_Clip duration must be a finite number > 0, got ${duration}`);
  }
  return { playing: !reducedMotion, speed: 1, clipTime: 0, duration, lastTickAt: null };
}

/** Records a drawn frame at `now` and advances the clip if playing. */
export function tick(s: PlaybackState, now: number): PlaybackState {
  if (!s.playing) {
    return s.lastTickAt === null ? s : { ...s, lastTickAt: null };
  }
  if (s.lastTickAt === null) {
    return { ...s, lastTickAt: now };
  }
  const gapMs = Math.min(Math.max(now - s.lastTickAt, 0), maxFrameGapMs);
  const clipTime = wrapClipTime(s.clipTime + (gapMs / 1000) * s.speed, s.duration);
  return { ...s, clipTime, lastTickAt: now };
}

/** Pauses on the current frame, or resumes from it. */
export function togglePlay(s: PlaybackState): PlaybackState {
  return { ...s, playing: !s.playing, lastTickAt: null };
}

/** Changes the Playback_Speed, keeping the current frame and the play state. */
export function setSpeed(s: PlaybackState, speed: PlaybackSpeed): PlaybackState {
  return { ...s, speed };
}

/** Holds the current frame while Page_Hidden or out of view; the next tick advances by 0. */
export function suspend(s: PlaybackState): PlaybackState {
  return s.lastTickAt === null ? s : { ...s, lastTickAt: null };
}
