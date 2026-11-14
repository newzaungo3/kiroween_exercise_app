/** The Coach_Name_Rule. Pure: no DOM, no storage. */

/** In Unicode code points. */
export const coachNameMaxLength = 20;

const allowed = /^[\p{L}\p{M}\p{N} '’.\-]+$/u;
const hasLetterOrDigit = /[\p{L}\p{N}]/u;

/** The normalised name, null when empty after normalisation, or 'invalid'. */
export function normaliseCoachName(text: string): string | null | 'invalid' {
  const name = text.normalize('NFC').replace(/\s+/gu, ' ').trim();
  if (name === '') return null;
  if ([...name].length > coachNameMaxLength) return 'invalid';
  if (!allowed.test(name)) return 'invalid';
  if (!hasLetterOrDigit.test(name)) return 'invalid';
  return name;
}
