import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { colors, themeCss, type ColorToken } from '@/ui/theme/tokens';

import { contrastRatio, hue, relativeLuminance } from './support/color';

// A token name is built from lower-case word segments, so the test knows its
// camel-case and kebab-case forms without reusing the conversion under test.
// Distinct segment lists give distinct names in both forms.
const segments = fc.array(fc.stringMatching(/^[a-z]{1,6}$/), { minLength: 1, maxLength: 4 });

const tokenName = segments.map((words) => ({
  camel: words.map((word, index) => (index === 0 ? word : word.charAt(0).toUpperCase() + word.slice(1))).join(''),
  kebab: words.join('-'),
}));

const hexColor = fc
  .tuple(
    fc.integer({ min: 0, max: 255 }),
    fc.integer({ min: 0, max: 255 }),
    fc.integer({ min: 0, max: 255 }),
  )
  .map((channels) => `#${channels.map((value) => value.toString(16).padStart(2, '0')).join('')}`);

const tokenEntries = fc.uniqueArray(fc.record({ name: tokenName, value: hexColor }), {
  selector: (entry) => entry.name.camel,
  maxLength: 12,
});

const declarationPattern = /--color-([a-z-]+):(#[0-9a-f]{6})/g;

describe('Halloween_Theme CSS', () => {
  // Feature: spooky-site-skeleton, Property 4: Theme CSS round trip
  it('emits exactly one --color- declaration per token, carrying that token value', () => {
    fc.assert(
      fc.property(tokenEntries, (entries) => {
        const tokens: Record<string, string> = Object.fromEntries(
          entries.map(({ name, value }) => [name.camel, value]),
        );
        const css = themeCss(tokens);

        const parsed = [...css.matchAll(declarationPattern)]
          .map(([, name, value]) => `${name}:${value}`)
          .sort();
        const expected = entries.map(({ name, value }) => `${name.kebab}:${value}`).sort();

        expect(parsed).toEqual(expected);
        // No other --color- declaration, well-formed or not. References such
        // as var(--color-bg) are uses, not declarations, so they don't count.
        expect(css.match(/--color-[^:;()\s]*:/g) ?? []).toHaveLength(entries.length);
      }),
      { numRuns: 200 },
    );
  });
});

type Pair = readonly [foreground: ColorToken, background: ColorToken];

/** Contrast ratio of each pair, keyed `foreground on background`, so a failure names the pair. */
function contrastByPair(pairs: readonly Pair[]): Record<string, number> {
  return Object.fromEntries(
    pairs.map(([fg, bg]) => [`${fg} on ${bg}`, contrastRatio(colors[fg], colors[bg])]),
  );
}

/** The pairs whose contrast is below `minimum`, so the failure output lists them. */
function pairsBelow(pairs: readonly Pair[], minimum: number): Record<string, number> {
  return Object.fromEntries(
    Object.entries(contrastByPair(pairs)).filter(([, ratio]) => ratio < minimum),
  );
}

describe('Halloween_Theme tokens', () => {
  it('the Halloween_Theme background is dark', () => {
    expect(relativeLuminance(colors.bg)).toBeLessThanOrEqual(0.05);
  });

  it('the orange and purple accents fall in their hue ranges', () => {
    // hue() is NaN for a grey, and NaN fails both comparisons.
    const orangeHue = hue(colors.orange);
    const purpleHue = hue(colors.purple);
    expect(orangeHue).toBeGreaterThanOrEqual(15);
    expect(orangeHue).toBeLessThanOrEqual(45);
    expect(purpleHue).toBeGreaterThanOrEqual(260);
    expect(purpleHue).toBeLessThanOrEqual(300);
  });

  it('body text has at least 4.5:1 contrast on every background it sits on', () => {
    const bodyTextPairs: readonly Pair[] = [
      ['text', 'bg'],
      ['text', 'surface'],
      ['textMuted', 'bg'],
      ['textMuted', 'surface'],
      ['orange', 'bg'],
      ['orange', 'surface'],
      ['purple', 'bg'],
    ];
    expect(pairsBelow(bodyTextPairs, 4.5)).toEqual({});
  });

  it('headings have at least 3:1 contrast', () => {
    expect(pairsBelow([['text', 'bg']], 3)).toEqual({});
  });

  it('the focus indicator has at least 3:1 contrast', () => {
    expect(
      pairsBelow(
        [
          ['focus', 'bg'],
          ['focus', 'surface'],
        ],
        3,
      ),
    ).toEqual({});
  });
});

describe('Graveyard_Scene and Viewer tokens', () => {
  it('the scene sky is dark', () => {
    expect(relativeLuminance(colors.sceneSky)).toBeLessThanOrEqual(0.05);
  });

  it('the moon stands out against the sky', () => {
    expect(pairsBelow([['sceneMoon', 'sceneSky']], 3)).toEqual({});
  });

  it('the selected Playback_Speed label is readable on its fill', () => {
    expect(pairsBelow([['onAccent', 'orange']], 4.5)).toEqual({});
  });
});
