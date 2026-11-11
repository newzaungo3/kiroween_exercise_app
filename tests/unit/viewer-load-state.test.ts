import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  CoachAssetError,
  announcementId,
  findDemoClip,
  initialLoadState,
  loadReducer,
  msUntilSlow,
  showsRetry,
  slowLoadMs,
  wantsCoachAsset,
  type LoadEvent,
  type LoadPhase,
} from '../../src/viewer/logic/load-state';

type FailedReason = Extract<LoadEvent, { type: 'failed' }>['reason'];

const failedReasons: readonly FailedReason[] = ['network', 'http', 'parse', 'missing-clip', 'code'];

function run(events: readonly LoadEvent[], from: LoadPhase = initialLoadState): LoadPhase {
  return events.reduce(loadReducer, from);
}

/** The loading phase of attempt 1, started at `startedAt`. */
function loadingFrom(startedAt: number): LoadPhase {
  return run([{ type: 'webgl', available: true, now: startedAt }]);
}

function attemptOf(state: LoadPhase): number | null {
  return state.kind === 'checking' ? null : state.attempt;
}

// ---------------------------------------------------------------------------
// Generators for Property 10
// ---------------------------------------------------------------------------

/**
 * Gaps between events. Long gaps stand for time while the page is Page_Hidden
 * (timers are throttled, so the next tick can arrive much later); the exact
 * 10-second boundary is generated on purpose.
 */
const gapArb = fc.oneof(
  fc.integer({ min: 0, max: 2_000 }),
  fc.integer({ min: 0, max: 30_000 }),
  fc.constantFrom(slowLoadMs - 1, slowLoadMs, slowLoadMs + 1),
);

const attemptArb = fc.integer({ min: 0, max: 4 });

/** An event without its timestamp; `now` is filled in from the accumulated gaps. */
type EventShape =
  | { readonly type: 'webgl'; readonly available: boolean }
  | { readonly type: 'tick' }
  | { readonly type: 'loaded'; readonly attempt: number }
  | { readonly type: 'failed'; readonly attempt: number; readonly reason: FailedReason }
  | { readonly type: 'contextLost'; readonly attempt: number }
  | { readonly type: 'retry' };

const eventShapeArb: fc.Arbitrary<EventShape> = fc.oneof(
  fc.record({ type: fc.constant('webgl' as const), available: fc.boolean() }),
  { arbitrary: fc.record({ type: fc.constant('tick' as const) }), weight: 3 },
  { arbitrary: fc.record({ type: fc.constant('loaded' as const), attempt: attemptArb }), weight: 2 },
  {
    arbitrary: fc.record({
      type: fc.constant('failed' as const),
      attempt: attemptArb,
      reason: fc.constantFrom(...failedReasons),
    }),
    weight: 2,
  },
  { arbitrary: fc.record({ type: fc.constant('contextLost' as const), attempt: attemptArb }), weight: 2 },
  { arbitrary: fc.record({ type: fc.constant('retry' as const) }), weight: 2 },
);

/** webgl(true|false) first, then any events, with non-decreasing wall-clock timestamps. */
const eventSequenceArb: fc.Arbitrary<readonly LoadEvent[]> = fc
  .tuple(
    fc.integer({ min: 0, max: 1_000_000 }),
    fc.boolean(),
    fc.array(fc.tuple(gapArb, eventShapeArb), { maxLength: 40 }),
  )
  .map(([start, available, rest]) => {
    const events: LoadEvent[] = [{ type: 'webgl', available, now: start }];
    let now = start;
    for (const [gap, shape] of rest) {
      now += gap;
      switch (shape.type) {
        case 'webgl':
          events.push({ type: 'webgl', available: shape.available, now });
          break;
        case 'tick':
        case 'retry':
          events.push({ type: shape.type, now });
          break;
        default:
          events.push(shape);
      }
    }
    return events;
  });

describe('Viewer load state', () => {
  // Feature: exercise-page-3d-coach, Property 10: Loading follows the attempt and the 10-second rule
  // **Validates: Requirements 9.3, 9.4, 9.5, 9.6, 9.7, 9.8**
  it('loading follows the attempt and the 10-second rule', () => {
    fc.assert(
      fc.property(eventSequenceArb, (events) => {
        let state: LoadPhase = initialLoadState;
        // Tracked by the test, independently of the reducer's fields.
        let trackedStart: number | null = null; // start of the current loading attempt
        let slowTickSeen = false; // a processed tick reached 10 s for the current attempt
        let noWebgl = false;

        for (const event of events) {
          const before = state;
          const after = loadReducer(before, event);
          const current = attemptOf(before);

          switch (event.type) {
            case 'webgl':
              if (before.kind === 'checking') {
                if (event.available) {
                  expect(after).toEqual({ kind: 'loading', attempt: 1, startedAt: event.now, slow: false });
                  trackedStart = event.now;
                  slowTickSeen = false;
                } else {
                  expect(after).toEqual({ kind: 'fallback', attempt: 0, reason: 'no-webgl', canRetry: false });
                  noWebgl = true;
                }
              } else {
                expect(after).toEqual(before);
              }
              break;

            case 'tick':
              if (before.kind === 'loading' && trackedStart !== null && event.now - trackedStart >= slowLoadMs) {
                slowTickSeen = true;
              }
              break;

            case 'loaded':
            case 'failed':
            case 'contextLost':
              if (event.attempt !== current) {
                // (b) events from another attempt change nothing
                expect(after).toEqual(before);
              } else if (event.type === 'loaded') {
                // Requirement 9.5: also from the Slow_Load_Notice
                expect(after).toEqual(
                  before.kind === 'loading' ? { kind: 'ready', attempt: event.attempt } : before,
                );
              } else if (event.type === 'failed') {
                // Requirement 9.7; a failure while ready is a render error after the scene appeared
                expect(after).toEqual(
                  before.kind === 'loading' || before.kind === 'ready'
                    ? { kind: 'fallback', attempt: event.attempt, reason: event.reason, canRetry: true }
                    : before,
                );
              } else {
                // Requirement 9.8
                expect(after).toEqual(
                  before.kind === 'ready'
                    ? { kind: 'fallback', attempt: event.attempt, reason: 'context-lost', canRetry: true }
                    : before,
                );
              }
              break;

            case 'retry': {
              // (c) Retry only from the Slow_Load_Notice or a retryable Still_Fallback
              const fromSlow = before.kind === 'loading' && before.slow;
              const fromFallback = before.kind === 'fallback' && before.canRetry;
              if ((fromSlow || fromFallback) && current !== null) {
                expect(after).toEqual({ kind: 'loading', attempt: current + 1, startedAt: event.now, slow: false });
                trackedStart = event.now;
                slowTickSeen = false;
              } else {
                expect(after).toEqual(before);
              }
              break;
            }
          }

          // (a) the Slow_Load_Notice is shown exactly when a processed tick reached 10 s
          if (after.kind === 'loading') {
            expect(after.slow).toBe(slowTickSeen);
            expect(announcementId(after)).toBe(slowTickSeen ? 'viewer.slowLoad' : 'viewer.loading');
          }
          // (d) the Coach_Asset is wanted only while loading, and never after webgl(false)
          expect(wantsCoachAsset(after)).toBe(after.kind === 'loading');
          if (noWebgl) expect(wantsCoachAsset(after)).toBe(false);

          state = after;
        }
      }),
      { numRuns: 200 },
    );
  });

  it('the Slow_Load_Notice appears at 10 seconds, not at 9.999', () => {
    const loading = loadingFrom(1_000);
    expect(msUntilSlow(loading, 1_000)).toBe(slowLoadMs);

    const almost = loadReducer(loading, { type: 'tick', now: 1_000 + 9_999 });
    expect(almost).toMatchObject({ kind: 'loading', slow: false });
    expect(showsRetry(almost)).toBe(false);

    const slow = loadReducer(almost, { type: 'tick', now: 1_000 + 10_000 });
    expect(slow).toMatchObject({ kind: 'loading', slow: true });
    expect(showsRetry(slow)).toBe(true);
    expect(wantsCoachAsset(slow)).toBe(true); // loading continues
    expect(msUntilSlow(slow, 1_000 + 10_000)).toBeNull();
  });

  it('time while the page is hidden counts towards the 10 seconds', () => {
    // No tick arrives while the page is hidden; the first tick on return is 12 s after the start.
    const loading = loadingFrom(0);
    const back = loadReducer(loading, { type: 'tick', now: 12_000 });
    expect(back).toMatchObject({ kind: 'loading', slow: true });
    expect(msUntilSlow(loading, 12_000)).toBe(0);
  });

  it('Retry clears the Slow_Load_Notice and restarts the 10-second count', () => {
    const slow = run([{ type: 'tick', now: 10_000 }], loadingFrom(0));
    const retried = loadReducer(slow, { type: 'retry', now: 15_000 });
    expect(retried).toEqual({ kind: 'loading', attempt: 2, startedAt: 15_000, slow: false });
    expect(showsRetry(retried)).toBe(false);
    expect(msUntilSlow(retried, 15_000)).toBe(slowLoadMs);

    // A late answer from the first attempt is ignored.
    expect(loadReducer(retried, { type: 'loaded', attempt: 1 })).toEqual(retried);
  });

  it('the Coach appears when a slow Coach_Asset finally arrives', () => {
    const slow = run([{ type: 'tick', now: 11_000 }], loadingFrom(0));
    expect(loadReducer(slow, { type: 'loaded', attempt: 1 })).toEqual({ kind: 'ready', attempt: 1 });
  });

  it('no WebGL2 shows the Still_Fallback without a Retry and never wants the Coach_Asset', () => {
    const state = run([{ type: 'webgl', available: false, now: 0 }]);
    expect(state).toMatchObject({ kind: 'fallback', reason: 'no-webgl', canRetry: false });
    expect(showsRetry(state)).toBe(false);
    expect(wantsCoachAsset(state)).toBe(false);
    expect(loadReducer(state, { type: 'retry', now: 1 })).toEqual(state);
  });

  it.each(failedReasons)('a %s failure shows the Still_Fallback with a Retry', (reason) => {
    const state = loadReducer(loadingFrom(0), { type: 'failed', attempt: 1, reason });
    expect(state).toEqual({ kind: 'fallback', attempt: 1, reason, canRetry: true });
    expect(showsRetry(state)).toBe(true);
    expect(wantsCoachAsset(state)).toBe(false);
    expect(loadReducer(state, { type: 'retry', now: 5 })).toEqual({
      kind: 'loading',
      attempt: 2,
      startedAt: 5,
      slow: false,
    });
  });

  it('a lost WebGL context shows the Still_Fallback with a Retry', () => {
    const ready = loadReducer(loadingFrom(0), { type: 'loaded', attempt: 1 });
    const lost = loadReducer(ready, { type: 'contextLost', attempt: 1 });
    expect(lost).toEqual({ kind: 'fallback', attempt: 1, reason: 'context-lost', canRetry: true });
    expect(showsRetry(lost)).toBe(true);
  });

  it('the live region text follows the phase', () => {
    const loading = loadingFrom(0);
    const slow = loadReducer(loading, { type: 'tick', now: slowLoadMs });
    const ready = loadReducer(loading, { type: 'loaded', attempt: 1 });
    const fallback = loadReducer(loading, { type: 'failed', attempt: 1, reason: 'network' });

    expect(announcementId(initialLoadState)).toBeNull();
    expect(announcementId(loading)).toBe('viewer.loading');
    expect(announcementId(slow)).toBe('viewer.slowLoad');
    expect(announcementId(ready)).toBeNull();
    expect(announcementId(fallback)).toBe('viewer.fallback.message');
    expect(announcementId(run([{ type: 'webgl', available: false, now: 0 }]))).toBe('viewer.fallback.message');
  });

  it('an asset without the Demo_Clip is reported as missing-clip', () => {
    const clips = [{ name: 'idle' }, { name: 'Demo_Loop' }];
    expect(findDemoClip(clips, 'demo_loop')).toBeUndefined();
    expect(findDemoClip([...clips, { name: 'demo_loop' }], 'demo_loop')).toEqual({ name: 'demo_loop' });

    const error = new CoachAssetError('missing-clip');
    expect(error.reason).toBe('missing-clip');
    expect(error.status).toBeUndefined();
  });
});
