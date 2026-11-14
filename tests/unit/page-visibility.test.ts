import { describe, expect, it } from 'vitest';
import { shouldAutoPause } from '@/ui/workout/usePageHidden';

// The Vitest environment is 'node' (no DOM), so the hook's listener wiring is
// not tested here. It is covered by the Playwright spec of task 7.2.

describe('page visibility auto-pause', () => {
  const table: ReadonlyArray<readonly [DocumentVisibilityState, boolean, boolean]> = [
    ['hidden', true, true],
    ['visible', true, false],
    ['hidden', false, false],
    ['visible', false, false],
  ];

  it.each(table)(
    'a %s page with auto-pause enabled=%s gives %s',
    (visibilityState, enabled, expected) => {
      expect(shouldAutoPause(visibilityState, enabled)).toBe(expected);
    },
  );
});
