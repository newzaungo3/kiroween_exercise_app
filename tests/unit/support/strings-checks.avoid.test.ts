import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { avoidWordPlurals, avoidWords, findAvoidWords } from './strings-checks';

// Feature: spooky-site-skeleton, Property 2: Avoid-word matcher finds whole words only
// **Validates: Requirements 6.7**

// Characters that are never letters: spaces, punctuation, digits, line breaks.
const nonLetterChars = [' ', '\t', '\n', '.', ',', '!', '?', '-', '_', "'", '"', '(', ')', ':', ';', '0', '1', '7', '9'];

// Letters to join onto an Avoid word. Includes non-ASCII letters, but none that
// Unicode case folding maps onto an ASCII letter (such as U+017F long s or U+212A Kelvin sign).
const joinLetters = ['a', 'e', 'k', 'q', 's', 'x', 'z', 'B', 'R', 'S', 'Y', 'é', 'ß', 'ж', 'λ'];

// Every singular and plural Avoid word form, lower-cased.
const avoidForms = new Set(
  avoidWords.flatMap((word) => [word.toLowerCase(), avoidWordPlurals[word].toLowerCase()]),
);

const filler = fc
  .array(fc.constantFrom(...nonLetterChars), { maxLength: 12 })
  .map((chars) => chars.join(''));

// An Avoid word, singular or plural, with a random letter case per character.
const avoidOccurrence = fc
  .record({
    word: fc.constantFrom(...avoidWords),
    plural: fc.boolean(),
    caseMask: fc.array(fc.boolean(), { minLength: 12, maxLength: 12 }),
  })
  .map(({ word, plural, caseMask }) => {
    const form = plural ? avoidWordPlurals[word] : word;
    const text = Array.from(form)
      .map((char, index) => (caseMask[index] ? char.toUpperCase() : char.toLowerCase()))
      .join('');
    return { word, text };
  });

const joinedLetters = (maxLength: number) =>
  fc.array(fc.constantFrom(...joinLetters), { maxLength }).map((chars) => chars.join(''));

describe('findAvoidWords', () => {
  it('reports an Avoid word that stands as a whole word in any letter case, singular or plural', () => {
    fc.assert(
      fc.property(filler, avoidOccurrence, filler, (before, occurrence, after) => {
        const text = `${before}${occurrence.text}${after}`;
        expect(findAvoidWords(text)).toContain(occurrence.word);
      }),
      { numRuns: 200 },
    );
  });

  it('does not report an Avoid word that is part of a longer word', () => {
    const joined = fc
      .record({ prefix: joinedLetters(3), occurrence: avoidOccurrence, suffix: joinedLetters(3) })
      .filter(({ prefix, suffix }) => prefix.length + suffix.length > 0)
      // "plan" + "s" is the Avoid word "plans", which must be reported, so skip
      // any joined word that is itself an Avoid word form.
      .filter(
        ({ prefix, occurrence, suffix }) =>
          !avoidForms.has(`${prefix}${occurrence.text}${suffix}`.toLowerCase()),
      );

    fc.assert(
      fc.property(filler, joined, filler, (before, { prefix, occurrence, suffix }, after) => {
        // The filler holds no letters, so the joined word is the only word in the text.
        const text = `${before}${prefix}${occurrence.text}${suffix}${after}`;
        expect(findAvoidWords(text)).toEqual([]);
      }),
      { numRuns: 200 },
    );
  });
});
