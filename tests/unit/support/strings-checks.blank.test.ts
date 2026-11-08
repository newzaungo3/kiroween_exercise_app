import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { findBlankEntries } from './strings-checks';

// Whitespace-only building blocks, including Unicode whitespace.
const blankChars = ['', ' ', '\t', '\n', '\u00a0', '\u2003', '\u3000'] as const;

// Characters that are never whitespace: letters (Latin, accented, Thai), digits, punctuation.
const visibleChars = ['a', 'Z', 'é', 'ก', '7', '0', '.', '!', '-', '·'] as const;

const blankText = fc
  .array(fc.constantFrom(...blankChars), { maxLength: 6 })
  .map((parts) => parts.join(''));

const nonBlankText = fc
  .tuple(blankText, fc.constantFrom(...visibleChars), fc.string({ maxLength: 10 }), blankText)
  .map(([before, visible, rest, after]) => `${before}${visible}${rest}${after}`);

// Each generated value records whether it is blank, so the expected result
// does not depend on the whitespace logic under test.
const taggedValue = fc.oneof(
  blankText.map((text) => ({ text, blank: true })),
  nonBlankText.map((text) => ({ text, blank: false })),
);

// Identifier-like keys, plus keys that are awkward for plain objects:
// prototype names ("__proto__", "constructor") and integer-like keys, which
// object key order lists first.
const stringId = fc.oneof(
  fc.stringMatching(/^[a-z][a-zA-Z]*(\.[a-z][a-zA-Z]*){0,3}$/),
  fc.constantFrom('__proto__', 'constructor', 'toString', 'hasOwnProperty', '0', '42'),
);

describe('findBlankEntries', () => {
  // Feature: spooky-site-skeleton, Property 1: Blank-entry finder names exactly the blank identifiers
  it('names exactly the string identifiers whose text is blank, each once, in key order', () => {
    fc.assert(
      fc.property(fc.dictionary(stringId, taggedValue, { maxKeys: 12 }), (tagged) => {
        const keys = Object.keys(tagged);
        // Object.fromEntries defines "__proto__" as an own key, so it stays a normal entry.
        const strings: Record<string, string> = Object.fromEntries(
          keys.map((id) => [id, tagged[id]?.text ?? '']),
        );
        const expected = keys.filter((id) => tagged[id]?.blank === true);

        expect(Object.keys(strings)).toEqual(keys);
        expect(findBlankEntries(strings)).toEqual(expected);
      }),
      { numRuns: 200 },
    );
  });
});
