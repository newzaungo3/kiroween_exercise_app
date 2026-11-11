import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  createPlayback,
  maxFrameGapMs,
  playbackSpeeds,
  setSpeed,
  suspend,
  tick,
  togglePlay,
  type PlaybackSpeed,
  type PlaybackState,
} from '../../src/viewer/logic/playback';

/** One step of the visitor's or the browser's timeline. `dtMs` passes before the step. */
type Operation =
  | { readonly kind: 'tick'; readonly dtMs: number }
  | { readonly kind: 'toggle'; readonly dtMs: number }
  | { readonly kind: 'speed'; readonly dtMs: number; readonly speed: PlaybackSpeed }
  | { readonly kind: 'suspend'; readonly dtMs: number };

const dtArb = fc.integer({ min: 0, max: 500 });
const operationArb: fc.Arbitrary<Operation> = fc.oneof(
  fc.record({ kind: fc.constant('tick' as const), dtMs: dtArb }),
  fc.record({ kind: fc.constant('toggle' as const), dtMs: dtArb }),
  fc.record({ kind: fc.constant('speed' as const), dtMs: dtArb, speed: fc.constantFrom(...playbackSpeeds) }),
  fc.record({ kind: fc.constant('suspend' as const), dtMs: dtArb }),
);

/**
 * Reference model: the clip advances only by min(gap, 100 ms) × speed for each
 * gap between two consecutive ticks with no pause, toggle or suspension between
 * them. Clip time is kept unwrapped; the comparison wraps it by the duration.
 */
interface Model { playing: boolean; speed: PlaybackSpeed; clip: number; last: number | null }
function modelStep(m: Model, op: Operation, now: number): Model {
  switch (op.kind) {
    case 'tick':
      if (!m.playing) return { ...m, last: null };
      if (m.last === null) return { ...m, last: now };
      return { ...m, clip: m.clip + (Math.min(now - m.last, maxFrameGapMs) / 1000) * m.speed, last: now };
    case 'toggle':
      return { ...m, playing: !m.playing, last: null };
    case 'speed':
      return { ...m, speed: op.speed };
    case 'suspend':
      return { ...m, last: null };
  }
}

function applyOperation(s: PlaybackState, op: Operation, now: number): PlaybackState {
  switch (op.kind) {
    case 'tick':
      return tick(s, now);
    case 'toggle':
      return togglePlay(s);
    case 'speed':
      return setSpeed(s, op.speed);
    case 'suspend':
      return suspend(s);
  }
}

/** Distance between two clip times on the loop of length `duration`. */
function loopDistance(a: number, b: number, duration: number): number {
  const d = Math.abs(a - b) % duration;
  return Math.min(d, duration - d);
}

const tolerance = 1e-9;

describe('Demo_Clip playback clock', () => {
  it('the Demo_Clip starts at its first frame at 1×', () => {
    const s = createPlayback(2.27, false);
    expect(s.playing).toBe(true);
    expect(s.speed).toBe(1);
    expect(s.clipTime).toBe(0);
  });

  it('with reduced motion the Demo_Clip starts paused', () => {
    const s = createPlayback(2.27, true);
    expect(s.playing).toBe(false);
    expect(s.clipTime).toBe(0);
    // Frames drawn while paused do not move the Coach.
    expect(tick(tick(s, 1000), 1016).clipTime).toBe(0);
  });

  it('a long gap between two frames advances the clip by at most 100 ms', () => {
    const first = tick(createPlayback(2.27, false), 1000);
    const afterGap = tick(first, 1000 + 5000);
    expect(afterGap.clipTime).toBeCloseTo(maxFrameGapMs / 1000, 12);
  });

  // Feature: exercise-page-3d-coach, Property 7: Demo_Clip time follows drawn-frame time only
  // **Validates: Requirements 8.2, 8.3, 8.5, 8.6, 10.3, 10.4, 10.5, 10.6**
  it('Demo_Clip time follows drawn-frame time only', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0.1, max: 10, noNaN: true }),
        fc.boolean(),
        fc.integer({ min: 0, max: 1_000_000 }),
        fc.array(operationArb, { maxLength: 80 }),
        (duration, reducedMotion, startAt, operations) => {
          let state = createPlayback(duration, reducedMotion);
          let model: Model = { playing: !reducedMotion, speed: 1, clip: 0, last: null };
          let now = startAt;

          for (const op of operations) {
            now += op.dtMs;
            const before = state;
            const resuming = op.kind === 'tick' && model.playing && model.last === null;
            state = applyOperation(state, op, now);
            model = modelStep(model, op, now);

            // Matches the reference model.
            expect(state.playing).toBe(model.playing);
            expect(state.speed).toBe(model.speed);
            expect(loopDistance(state.clipTime, model.clip, duration)).toBeLessThan(tolerance);
            expect(state.clipTime).toBeGreaterThanOrEqual(0);
            expect(state.clipTime).toBeLessThan(duration);

            // A Playback_Speed change keeps the frame and the play state.
            if (op.kind === 'speed') {
              expect(state.clipTime).toBe(before.clipTime);
              expect(state.playing).toBe(before.playing);
            }
            // Pausing, resuming and suspending hold the current frame.
            if (op.kind === 'toggle' || op.kind === 'suspend') {
              expect(state.clipTime).toBe(before.clipTime);
            }
            // Frames drawn while paused do not move the Coach.
            if (op.kind === 'tick' && !before.playing) {
              expect(state.clipTime).toBe(before.clipTime);
            }
            // The first frame after a resume, pause or suspension advances by 0.
            if (resuming) {
              expect(state.clipTime).toBe(before.clipTime);
            }
          }
        },
      ),
      { numRuns: 200 },
    );
  });
});
