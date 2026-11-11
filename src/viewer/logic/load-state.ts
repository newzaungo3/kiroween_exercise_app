/**
 * Loading_State, Slow_Load_Notice and Still_Fallback of the Viewer.
 *
 * Pure logic: no React, Three.js, DOM or storage. Time arrives as `now`
 * (wall-clock milliseconds) on the events, so tests drive it with an
 * injected clock.
 *
 * Every attempt to load the Coach_Asset has a number. Events reported by an
 * older attempt (a late answer after Retry, or the context loss R3F causes
 * when it unmounts an old canvas) are ignored.
 */

/** Wall-clock time after which the Slow_Load_Notice is added (Requirement 9.3). */
export const slowLoadMs = 10_000;

/** Why the Viewer shows the Still_Fallback. */
export type FallbackReason =
  | 'no-webgl'
  | 'network'
  | 'http'
  | 'parse'
  | 'missing-clip'
  | 'context-lost'
  | 'code';

export type LoadPhase =
  | { readonly kind: 'checking' }
  | {
      readonly kind: 'loading';
      readonly attempt: number;
      readonly startedAt: number;
      readonly slow: boolean;
    }
  | { readonly kind: 'ready'; readonly attempt: number }
  | {
      readonly kind: 'fallback';
      readonly attempt: number;
      readonly reason: FallbackReason;
      readonly canRetry: boolean;
    };

export type LoadEvent =
  | { readonly type: 'webgl'; readonly available: boolean; readonly now: number }
  | { readonly type: 'tick'; readonly now: number }
  | { readonly type: 'loaded'; readonly attempt: number }
  | {
      readonly type: 'failed';
      readonly attempt: number;
      readonly reason: Exclude<FallbackReason, 'no-webgl' | 'context-lost'>;
    }
  | { readonly type: 'contextLost'; readonly attempt: number }
  | { readonly type: 'retry'; readonly now: number };

/** The first state, on the server and during hydration. */
export const initialLoadState: LoadPhase = { kind: 'checking' };

function startAttempt(attempt: number, now: number): LoadPhase {
  return { kind: 'loading', attempt, startedAt: now, slow: false };
}

/** Applies one event. Events that do not apply to the current state return it unchanged. */
export function loadReducer(state: LoadPhase, event: LoadEvent): LoadPhase {
  switch (event.type) {
    case 'webgl':
      if (state.kind !== 'checking') return state;
      return event.available
        ? startAttempt(1, event.now)
        : { kind: 'fallback', attempt: 0, reason: 'no-webgl', canRetry: false };

    case 'tick':
      if (state.kind !== 'loading' || state.slow) return state;
      return event.now - state.startedAt >= slowLoadMs ? { ...state, slow: true } : state;

    case 'loaded':
      if (state.kind !== 'loading' || state.attempt !== event.attempt) return state;
      return { kind: 'ready', attempt: state.attempt };

    case 'failed':
      // A failure while ready covers a render error in the 3D scene after it appeared.
      if ((state.kind !== 'loading' && state.kind !== 'ready') || state.attempt !== event.attempt) {
        return state;
      }
      return { kind: 'fallback', attempt: state.attempt, reason: event.reason, canRetry: true };

    case 'contextLost':
      if (state.kind !== 'ready' || state.attempt !== event.attempt) return state;
      return { kind: 'fallback', attempt: state.attempt, reason: 'context-lost', canRetry: true };

    case 'retry':
      // Retry only where a Retry button is shown; elsewhere nothing would change.
      if (!showsRetry(state) || state.kind === 'checking') return state;
      return startAttempt(state.attempt + 1, event.now);
  }
}

/** Milliseconds until the Slow_Load_Notice is due, or null when no timer is needed. */
export function msUntilSlow(state: LoadPhase, now: number): number | null {
  if (state.kind !== 'loading' || state.slow) return null;
  return Math.max(0, state.startedAt + slowLoadMs - now);
}

/** Strings_Module identifier of the live region text, or null for an empty live region. */
export function announcementId(
  state: LoadPhase,
): 'viewer.loading' | 'viewer.slowLoad' | 'viewer.fallback.message' | null {
  switch (state.kind) {
    case 'loading':
      return state.slow ? 'viewer.slowLoad' : 'viewer.loading';
    case 'fallback':
      return 'viewer.fallback.message';
    case 'checking':
    case 'ready':
      return null;
  }
}

/** True when the Retry button is shown: with the Slow_Load_Notice, or in a retryable Still_Fallback. */
export function showsRetry(state: LoadPhase): boolean {
  return (state.kind === 'loading' && state.slow) || (state.kind === 'fallback' && state.canRetry);
}

/** True only while loading; the Coach_Asset is never requested in any other phase. */
export function wantsCoachAsset(state: LoadPhase): boolean {
  return state.kind === 'loading';
}

/** Reasons a Coach_Asset fails to load or parse. */
export type CoachAssetErrorReason = 'network' | 'http' | 'parse' | 'missing-clip';

/**
 * Error thrown by the Coach_Asset fetch (browser adapter) and parse (scene).
 * Lives here so both can share it without importing each other.
 */
export class CoachAssetError extends Error {
  readonly reason: CoachAssetErrorReason;
  /** HTTP status, set only when `reason` is `http`. */
  readonly status: number | undefined;

  constructor(reason: 'http', status: number);
  constructor(reason: Exclude<CoachAssetErrorReason, 'http'>);
  constructor(reason: CoachAssetErrorReason, status?: number) {
    super(reason === 'http' ? `Coach_Asset request failed: http ${String(status)}` : `Coach_Asset failed: ${reason}`);
    this.name = 'CoachAssetError';
    this.reason = reason;
    this.status = reason === 'http' ? status : undefined;
  }
}

/** Returns the clip whose name equals the Demo_Clip name, or undefined. */
export function findDemoClip<C extends { readonly name: string }>(
  clips: readonly C[],
  name: string,
): C | undefined {
  return clips.find((clip) => clip.name === name);
}
