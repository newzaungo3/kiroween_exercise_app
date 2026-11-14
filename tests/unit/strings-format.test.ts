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

/**
 * The Workout templates, listed by hand with the placeholders the design gives
 * each one. A template holds exactly these placeholders, no more, no fewer.
 */
const workoutTemplates: ReadonlyArray<readonly [TemplateId, readonly string[]]> = [
  ['routine.title', ['routine']],
  ['routine.length.one', ['minutes']],
  ['routine.length.other', ['minutes']],
  ['routine.count.exercises.one', ['count']],
  ['routine.count.exercises.other', ['count']],
  ['routine.count.stretches.one', ['count']],
  ['routine.count.stretches.other', ['count']],
  ['routine.sets.one', ['count']],
  ['routine.sets.other', ['count']],
  ['routine.target.reps', ['reps']],
  ['routine.target.seconds', ['seconds']],
  ['routine.rest', ['seconds']],
  ['workout.title', ['routine']],
  ['workout.set.of', ['number', 'count']],
  ['workout.set.position', ['position', 'total']],
  ['workout.set.targetReps', ['reps']],
  ['workout.set.targetSeconds', ['seconds']],
  ['workout.timer.format', ['minutes', 'seconds']],
  ['workout.rest.next', ['exercise', 'number', 'count', 'target']],
  ['workout.announce.set', ['number', 'count', 'exercise']],
  ['workout.announce.rest', ['exercise']],
  ['summary.outcome', ['outcome']],
  ['summary.setsConfirmed', ['count']],
  ['summary.setsSkipped', ['count']],
  ['summary.activeTime', ['time']],
  ['summary.candy', ['candy']],
  ['summary.bonus', ['bonus']],
  // Added by the skip-pause-quit ticket.
  ['workout.skipSet.dialog.text', ['bonus']],
  ['workout.quit.dialog.text', ['bonus']],
  ['workout.announce.resumed', ['next']],
  ['workout.announce.skippedSet', ['next']],
  ['workout.announce.skippedRest', ['next']],
  ['summary.setsNotReached', ['count']],
  ['summary.noBonus', ['bonus']],
  ['summary.set.line', ['exercise', 'number', 'count', 'state']],
  // Added by the candy-and-history ticket.
  ['home.candy.balance', ['candy']],
  ['home.candy.welcome', ['candy']],
  ['summary.balance', ['balance']],
  ['history.total', ['candy']],
  // Added by the resume-after-refresh ticket.
  ['resume.text', ['routine', 'exercise', 'number', 'count', 'candy']],
  ['resume.text.rest', ['routine', 'exercise', 'number', 'count', 'candy']],
  ['resume.discarded', ['candy']],
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

  it.each(workoutTemplates)('%s holds exactly its designed placeholders', (id, expected) => {
    const found = [...t(id).matchAll(/\{([a-zA-Z]+)\}/g)].map((m) => m[1]);
    expect([...found].sort()).toEqual([...expected].sort());

    const values = Object.fromEntries(expected.map((name) => [name, `<${name}>`]));
    const result = format(id, values as never);
    expect(result).not.toMatch(/\{[a-zA-Z]+\}/);
    for (const name of expected) expect(result).toContain(`<${name}>`);
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
