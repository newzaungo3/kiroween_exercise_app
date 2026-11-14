import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { format, t, type StringId, type TemplateId } from '../../src/ui/strings';

/**
 * `format` is typed by template identifier, so the property runs through every
 * real template the Site ships. Each one holds exactly one `{exercise}`
 * placeholder, so the expected text is the template split around it.
 */
const templateIds: readonly TemplateId[] = [
  'exercise.title',
  'viewer.coachLabel',
  'viewer.still.front.alt',
  'viewer.still.side.alt',
  'viewer.still.back.alt',
  'pager.previous',
  'pager.next',
];

// Values contain no `{`, so a replacement can never form a new placeholder.
const valueArb = fc.string().filter((s) => !s.includes('{'));

describe('format()', () => {
  it('format leaves text without placeholders unchanged', () => {
    // 'viewer.play' has no placeholder; it is not a TemplateId, so the cast is
    // needed to reach the runtime path.
    const id = 'viewer.play' as StringId as TemplateId;
    expect(format(id, {} as never)).toBe(t('viewer.play'));
  });

  // Feature: exercise-page-3d-coach, Property 12: format() fills every placeholder
  // **Validates: Requirements 5.7, 9.9, 4.9, 12.7**
  it('format fills every placeholder and keeps every literal piece in order', () => {
    fc.assert(
      fc.property(fc.constantFrom(...templateIds), valueArb, (id, value) => {
        const template = t(id);
        const pieces = template.split('{exercise}');
        expect(pieces.length).toBeGreaterThan(1);
        const result = format(id, { exercise: value } as never);
        expect(result).toBe(pieces.join(value));
        expect(result).not.toContain('{exercise}');
      }),
      { numRuns: 200 },
    );
  });
});
