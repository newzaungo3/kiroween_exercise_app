import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { coachNameMaxLength, normaliseCoachName } from '@/progress-store';

const numRuns = 200;

const nameLike = fc
  .array(
    fc.oneof(
      fc.stringMatching(/^[A-Za-z0-9]{1,8}$/),
      fc.constantFrom('Bone', 'Ñandú', 'ก็', 'สวัสดี', "O'Neil", 'O’Neil', 'Mr.', 'a-b', '...', '😀', '<b>'),
    ),
    { minLength: 0, maxLength: 5 },
  )
  .chain((words) =>
    fc
      .array(fc.constantFrom(' ', '  ', '\t', '\n', '\u00a0', '\u3000'), {
        minLength: words.length + 1,
        maxLength: words.length + 1,
      })
      .map((gaps) => gaps.map((gap, index) => gap + (words[index] ?? '')).join('')),
  );

const textArbitrary = fc.oneof(
  fc.string(),
  fc.string({ unit: 'binary' }),
  fc.string({ unit: 'grapheme' }),
  nameLike,
);

describe('Coach_Name_Rule', () => {
  it('Property 8: is idempotent and safe', () => {
    // Feature: the-crypt, Property 8: The Coach_Name_Rule is idempotent and safe
    // **Validates: Requirements 5.1, 5.2, 5.6, 5.7**
    fc.assert(
      fc.property(textArbitrary, (text) => {
        const result = normaliseCoachName(text);
        if (result === null || result === 'invalid') return;
        const length = [...result].length;
        expect(length).toBeGreaterThanOrEqual(1);
        expect(length).toBeLessThanOrEqual(coachNameMaxLength);
        expect(result).toBe(result.normalize('NFC'));
        expect(result).toBe(result.trim());
        expect(result).not.toMatch(/ {2}/u);
        expect(result).toMatch(/[\p{L}\p{N}]/u);
        expect(result).not.toMatch(/[<>&"{}]/u);
        expect(result).not.toMatch(/[\p{Cc}\n\r\u2028\u2029]/u);
        expect(normaliseCoachName(result)).toBe(result);
      }),
      { numRuns },
    );
  });

  it('keeps an ordinary name', () => {
    expect(normaliseCoachName('Count Rattle')).toBe('Count Rattle');
  });

  it('collapses runs of spaces and trims', () => {
    expect(normaliseCoachName('  Bone   Bob ')).toBe('Bone Bob');
  });

  it('turns a tab or newline between words into one space', () => {
    expect(normaliseCoachName('Bone\t\nBob')).toBe('Bone Bob');
  });

  it('accepts a Thai name with combining marks', () => {
    expect(normaliseCoachName('สวัสดี')).toBe('สวัสดี');
  });

  it('accepts 20 code points and rejects 21', () => {
    expect(coachNameMaxLength).toBe(20);
    expect(normaliseCoachName('a'.repeat(20))).toBe('a'.repeat(20));
    expect(normaliseCoachName('a'.repeat(21))).toBe('invalid');
  });

  it('rejects markup', () => {
    expect(normaliseCoachName('<b>x</b>')).toBe('invalid');
  });

  it('rejects an emoji', () => {
    expect(normaliseCoachName('Bones 💀')).toBe('invalid');
  });

  it('gives null for white space only', () => {
    expect(normaliseCoachName('')).toBeNull();
    expect(normaliseCoachName(' \t\n ')).toBeNull();
  });

  it('accepts a curly apostrophe', () => {
    expect(normaliseCoachName('O’Neil')).toBe('O’Neil');
  });

  it('rejects a name with only punctuation', () => {
    expect(normaliseCoachName('...')).toBe('invalid');
  });
});
