import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { contrastRatio } from './color';

// Floating-point slack for the 1–21 bounds and the equal-colour ratio.
const tolerance = 1e-9;

const channel = fc.integer({ min: 0, max: 255 });

/** A colour in `#rrggbb` form, built from three 0–255 channels. */
const hexColor = fc
  .tuple(channel, channel, channel)
  .map((rgb) => `#${rgb.map((c) => c.toString(16).padStart(2, '0')).join('')}`);

describe('contrastRatio', () => {
  // Feature: spooky-site-skeleton, Property 3: Contrast ratio is symmetric and bounded
  // **Validates: Requirements 4.8, 4.9, 2.8**
  it('is symmetric, lies between 1 and 21, and is 1 for equal colours', () => {
    fc.assert(
      fc.property(hexColor, hexColor, (a, b) => {
        const ratio = contrastRatio(a, b);

        expect(contrastRatio(b, a)).toBe(ratio);
        expect(ratio).toBeGreaterThanOrEqual(1 - tolerance);
        expect(ratio).toBeLessThanOrEqual(21 + tolerance);
        expect(Math.abs(contrastRatio(a, a) - 1)).toBeLessThanOrEqual(tolerance);
      }),
      { numRuns: 200 },
    );
  });

  it('gives black on white the maximum ratio of 21', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 9);
  });
});
