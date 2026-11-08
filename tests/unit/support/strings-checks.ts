// Test-only helpers for checking Strings_Module content.
// Pure functions: no imports from src/, no I/O.

/**
 * The glossary "Avoid" words (Requirement 6.7), in the order the requirements list them.
 * User-facing copy must not contain any of them as a whole word.
 */
export const avoidWords = [
  'avatar',
  'trainer',
  'model',
  'character',
  'item',
  'cosmetic',
  'skin',
  'move',
  'pose',
  'activity',
  'program',
  'plan',
  'playlist',
  'session',
  'training',
  'status',
  'result',
  'points',
  'coins',
  'score',
  'XP',
  'buy',
  'purchase',
] as const;

export type AvoidWord = (typeof avoidWords)[number];

/**
 * The plural form of each Avoid word. "points" and "coins" are already plural,
 * so their plural form is the word itself.
 */
export const avoidWordPlurals: { readonly [W in AvoidWord]: string } = {
  avatar: 'avatars',
  trainer: 'trainers',
  model: 'models',
  character: 'characters',
  item: 'items',
  cosmetic: 'cosmetics',
  skin: 'skins',
  move: 'moves',
  pose: 'poses',
  activity: 'activities',
  program: 'programs',
  plan: 'plans',
  playlist: 'playlists',
  session: 'sessions',
  training: 'trainings',
  status: 'statuses',
  result: 'results',
  points: 'points',
  coins: 'coins',
  score: 'scores',
  XP: 'XPs',
  buy: 'buys',
  purchase: 'purchases',
};

/**
 * Returns the identifiers whose value contains no non-whitespace character
 * (empty, or only whitespace including Unicode whitespace such as U+00A0 and U+3000),
 * each once, in the map's key order.
 */
export function findBlankEntries(strings: Readonly<Record<string, string>>): string[] {
  return Object.keys(strings).filter((id) => !/\S/u.test(strings[id] ?? ''));
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// A whole-word occurrence: the characters directly before and after are
// non-letters or the text boundary. Digits and punctuation count as boundaries.
const avoidWordPatterns: ReadonlyArray<readonly [AvoidWord, RegExp]> = avoidWords.map(
  (word) =>
    [
      word,
      new RegExp(
        `(?<!\\p{L})(?:${escapeRegExp(avoidWordPlurals[word])}|${escapeRegExp(word)})(?!\\p{L})`,
        'iu',
      ),
    ] as const,
);

/**
 * Returns the glossary Avoid words that occur in `text` as whole words,
 * in any letter case, singular or plural. Each Avoid word is reported once,
 * in the order of `avoidWords`, using its listed (singular) spelling.
 */
export function findAvoidWords(text: string): AvoidWord[] {
  return avoidWordPatterns.filter(([, pattern]) => pattern.test(text)).map(([word]) => word);
}
