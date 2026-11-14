import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  createMemoryStorage,
  createProgressStore,
  schemaVersion,
  storageKey,
} from '@/progress-store';
import type { ProgressData } from '@/progress-store';
import { parseProgress, serialiseProgress } from '@/progress-store/codec';
import { isCheckpointEnvelope } from '@/progress-store/rules';
import { normaliseCoachName } from '@/progress-store';
import {
  checkpointArbitrary,
  createSpyAdapter,
  defaultCoachData,
  distinctRecordsArbitrary,
  junkCoachArbitrary,
  progressDataOf,
  storedTextOf,
  v1TextArbitrary,
  v2TextArbitrary,
  v3DataArbitrary as rawV3DataArbitrary,
} from './support/progress';

/**
 * Version 3 data whose equipped Coach color is not an Accessory id. The support arbitrary can
 * equip a color whose id is also an Unlocked Accessory; the codec rightly drops that color.
 */
const v3DataArbitrary: fc.Arbitrary<ProgressData> = rawV3DataArbitrary.map((data) => {
  const accessoryIds = data.unlocks.filter((e) => e.kind === 'accessory').map((e) => e.id);
  const color = data.coach.color;
  return color !== null && accessoryIds.includes(color)
    ? { ...data, coach: { ...data.coach, color: null } }
    : data;
});

const progressDataArbitrary: fc.Arbitrary<ProgressData> = fc
  .record({
    candy: fc.integer({ min: 0, max: 100_000 }),
    welcomeGiftGranted: fc.boolean(),
    history: distinctRecordsArbitrary({ maxLength: 15 }),
  })
  .map((fields) => progressDataOf(fields));

const validData: ProgressData = progressDataOf({
  candy: 29,
  welcomeGiftGranted: true,
  history: [
    {
      id: 'graveyard-shift:1795000000000',
      routineId: 'graveyard-shift',
      finishedAt: 1795000000000,
      outcome: 'completed',
      candyEarned: 14,
    },
  ],
});

/** Text that no stored-data reader should accept as Progress data. */
const unreadableTextArbitrary: fc.Arbitrary<string> = fc.oneof(
  // Not JSON at all.
  fc.string().filter((text) => {
    try {
      JSON.parse(text);
      return false;
    } catch {
      return true;
    }
  }),
  // JSON that is not an object.
  fc
    .oneof(
      fc.array(fc.integer()),
      fc.integer(),
      fc.string(),
      fc.boolean(),
      fc.constant(null),
    )
    .map((value) => JSON.stringify(value)),
  // An object whose schemaVersion is not an integer of at least 1.
  fc
    .record(
      {
        schemaVersion: fc.oneof(
          fc.integer({ max: 0 }),
          fc.double({ min: -1000, max: 1.9, noInteger: true, noNaN: true }),
          fc.string(),
          fc.boolean(),
          fc.constant(null),
        ),
        candy: fc.integer({ min: 0, max: 100 }),
        welcomeGiftGranted: fc.boolean(),
        history: fc.constant([]),
      },
      { requiredKeys: ['candy', 'welcomeGiftGranted', 'history'] },
    )
    .map((value) => JSON.stringify(value)),
  // Version 3 with a broken shape.
  fc
    .tuple(
      progressDataArbitrary,
      fc.constantFrom(
        'candy-negative',
        'candy-fraction',
        'candy-string',
        'gift-not-boolean',
        'history-missing',
        'history-not-array',
        'record-broken',
        'record-duplicate-id',
      ),
    )
    .map(([data, defect]) => {
      const copy: Record<string, unknown> = { ...data };
      switch (defect) {
        case 'candy-negative':
          copy.candy = -1;
          break;
        case 'candy-fraction':
          copy.candy = 1.5;
          break;
        case 'candy-string':
          copy.candy = '5';
          break;
        case 'gift-not-boolean':
          copy.welcomeGiftGranted = 1;
          break;
        case 'history-missing':
          delete copy.history;
          break;
        case 'history-not-array':
          copy.history = {};
          break;
        case 'record-broken':
          copy.history = [...data.history, { id: '', routineId: 'x' }];
          break;
        case 'record-duplicate-id': {
          const first = validData.history[0];
          copy.history = [first, first];
          break;
        }
      }
      return JSON.stringify(copy);
    }),
);

describe('the Progress codec', () => {
  it('a serialised Progress data value parses back to the same value', () => {
    // Feature: candy-and-history, Property 1: Serialisation round trip
    // **Validates: Requirements 2.1, 2.8**
    fc.assert(
      fc.property(v3DataArbitrary, (data) => {
        const text = serialiseProgress(data);
        const parsed = parseProgress(text);
        expect(parsed).toEqual({ kind: 'data', data });
        expect((JSON.parse(text) as { schemaVersion: number }).schemaVersion).toBe(3);
      }),
      { numRuns: 200 },
    );
  });

  it('unreadable stored text is treated as no data', () => {
    // Feature: candy-and-history, Property 7: Unreadable stored text is treated as no data
    // **Validates: Requirements 2.3, 2.5**
    const empty = createProgressStore(createMemoryStorage()).snapshot();
    fc.assert(
      fc.property(unreadableTextArbitrary, (text) => {
        expect(parseProgress(text)).toEqual({ kind: 'none' });
        const store = createProgressStore(createMemoryStorage({ [storageKey]: text }));
        expect(store.snapshot()).toEqual(empty);
        expect(store.snapshot().persistent).toBe(true);
      }),
      { numRuns: 200 },
    );
  });

  it('the stored text carries the schema version 3', () => {
    const text = storedTextOf(validData);
    expect((JSON.parse(text) as { schemaVersion: number }).schemaVersion).toBe(schemaVersion);
    expect(schemaVersion).toBe(3);
  });

  it('version 4 parses as newer', () => {
    const text = JSON.stringify({ schemaVersion: 4, anything: 'else' });
    expect(parseProgress(text)).toEqual({ kind: 'newer', version: 4 });
  });

  it('version 1 text chains to version 3', () => {
    const { schemaVersion: _version, checkpoint: _checkpoint, ...core } = validData;
    const text = JSON.stringify({ schemaVersion: 1, ...core });
    expect(parseProgress(text)).toEqual({ kind: 'data', data: progressDataOf(core) });
  });

  it('a missing checkpoint member in version 3 parses as no data', () => {
    const { checkpoint: _checkpoint, ...without } = validData;
    expect(parseProgress(JSON.stringify(without))).toEqual({ kind: 'none' });
    expect(parseProgress(JSON.stringify({ ...without, schemaVersion: 2 }))).toEqual({ kind: 'none' });
  });

  it('version 0 parses as no data', () => {
    expect(parseProgress(JSON.stringify({ ...validData, schemaVersion: 0 }))).toEqual({
      kind: 'none',
    });
  });

  it('a junk checkpoint parses with the Candy and history kept', () => {
    const text = JSON.stringify({ ...validData, checkpoint: { version: 1 } });
    expect(parseProgress(text)).toEqual({ kind: 'data', data: validData });
  });

  it('migration from version 1 keeps Candy and history', () => {
    // Feature: resume-after-refresh, Property 6: Migration from version 1 keeps Candy and history
    // **Validates: Requirements 5.2, 5.9**
    fc.assert(
      fc.property(v1TextArbitrary, (text) => {
        const old = JSON.parse(text) as ProgressData;
        expect(parseProgress(text)).toEqual({
          kind: 'data',
          data: progressDataOf({
            candy: old.candy,
            welcomeGiftGranted: old.welcomeGiftGranted,
            history: old.history,
          }),
        });
        const adapter = createSpyAdapter({ [storageKey]: text });
        const snapshot = createProgressStore(adapter).snapshot();
        expect(snapshot.candyBalance).toBe(old.candy);
        expect(snapshot.welcomeGiftGranted).toBe(old.welcomeGiftGranted);
        expect(snapshot.history).toEqual([...old.history].reverse());
        expect(snapshot.checkpoint).toBeNull();
        expect(adapter.setItemCalls()).toBe(0);
      }),
      { numRuns: 200 },
    );
  });

  it('a version 3 value with a checkpoint round trips through its text', () => {
    // Feature: resume-after-refresh, Property 7: Version 3 serialisation round trip
    // **Validates: Requirements 5.1, 5.10**
    fc.assert(
      fc.property(
        v3DataArbitrary,
        fc.option(checkpointArbitrary, { nil: null }),
        (data, checkpoint) => {
          const full = progressDataOf({ ...data, checkpoint });
          const text = storedTextOf(full);
          expect(parseProgress(text)).toEqual({ kind: 'data', data: full });
          expect((JSON.parse(text) as { schemaVersion: number }).schemaVersion).toBe(3);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('a damaged checkpoint never costs Candy', () => {
    // Feature: resume-after-refresh, Property 8: A damaged checkpoint never costs Candy
    // **Validates: Requirements 5.4, 5.5, 5.6, 5.7, 5.8**
    const junk = fc.jsonValue().filter((value) => value !== null && !isCheckpointEnvelope(value));
    fc.assert(
      fc.property(progressDataArbitrary, junk, (data, checkpoint) => {
        const text = JSON.stringify({ ...data, checkpoint });
        expect(parseProgress(text)).toEqual({
          kind: 'data',
          data: progressDataOf({ ...data, checkpoint: null }),
        });
      }),
      { numRuns: 200 },
    );
  });

  it('a missing history list parses as no data', () => {
    const { history: _history, ...withoutHistory } = validData;
    expect(parseProgress(JSON.stringify(withoutHistory))).toEqual({ kind: 'none' });
  });

  it('a record with a negative Candy parses as no data', () => {
    const bad = { ...validData, history: [{ ...validData.history[0], candyEarned: -1 }] };
    expect(parseProgress(JSON.stringify(bad))).toEqual({ kind: 'none' });
  });

  it('a version 3 history with a repeated id parses as no data', () => {
    const entry = validData.history[0];
    const bad = { ...validData, history: [entry, { ...entry }] };
    expect(parseProgress(JSON.stringify(bad))).toEqual({ kind: 'none' });
  });

  it('migration from version 1 or 2 keeps Candy, history, gift and checkpoint', () => {
    // Feature: the-crypt, Property 1: Migration keeps Candy, history, gift and checkpoint
    // **Validates: Requirements 2.2, 2.3, 2.4, 2.9**
    fc.assert(
      fc.property(fc.oneof(v1TextArbitrary, v2TextArbitrary), (text) => {
        const old = JSON.parse(text) as Omit<ProgressData, 'schemaVersion'> & { schemaVersion: number };
        const checkpoint = old.schemaVersion === 1 ? null : old.checkpoint;
        expect(parseProgress(text)).toEqual({
          kind: 'data',
          data: {
            schemaVersion: 3,
            candy: old.candy,
            welcomeGiftGranted: old.welcomeGiftGranted,
            history: old.history,
            checkpoint,
            unlocks: [],
            coach: defaultCoachData,
          },
        });
        const adapter = createSpyAdapter({ [storageKey]: text });
        const snapshot = createProgressStore(adapter).snapshot();
        expect(snapshot.candyBalance).toBe(old.candy);
        expect(snapshot.welcomeGiftGranted).toBe(old.welcomeGiftGranted);
        expect(snapshot.history).toEqual([...old.history].reverse());
        expect(snapshot.checkpoint).toEqual(checkpoint);
        expect(snapshot.unlocks).toEqual([]);
        expect(snapshot.coach).toEqual(defaultCoachData);
        expect(adapter.setItemCalls()).toBe(0);
      }),
      { numRuns: 200 },
    );
  });

  it('a version 3 value round trips through its text', () => {
    // Feature: the-crypt, Property 2: Version 3 serialisation round trip
    // **Validates: Requirements 2.1, 2.10**
    fc.assert(
      fc.property(v3DataArbitrary, (data) => {
        const text = serialiseProgress(data);
        expect(parseProgress(text)).toEqual({ kind: 'data', data });
        expect((JSON.parse(text) as { schemaVersion: number }).schemaVersion).toBe(3);
      }),
      { numRuns: 200 },
    );
  });

  it('a damaged Coach_Customisation never costs Candy or Unlocks', () => {
    // Feature: the-crypt, Property 3: A damaged Coach_Customisation never costs Candy or Unlocks
    // **Validates: Requirements 2.5, 2.6, 2.7, 2.8**
    const coachReplacement = fc.oneof(fc.jsonValue(), junkCoachArbitrary);
    fc.assert(
      fc.property(v3DataArbitrary, coachReplacement, (data, replacement) => {
        const parsed = parseProgress(JSON.stringify({ ...data, coach: replacement }));
        expect(parsed.kind).toBe('data');
        if (parsed.kind !== 'data') return;
        const { coach, ...kept } = parsed.data;
        const { coach: _coach, ...original } = data;
        expect(kept).toEqual(original);

        const object =
          typeof replacement === 'object' && replacement !== null && !Array.isArray(replacement)
            ? (replacement as Record<string, unknown>)
            : {};
        const owned = data.unlocks.filter((entry) => entry.kind === 'accessory').map((e) => e.id);
        const name = object.name;
        if (typeof name === 'string' && normaliseCoachName(name) === name) {
          expect(coach.name).toBe(name);
        } else {
          expect(coach.name).toBeNull();
        }
        if (typeof object.color === 'string' && coach.color !== null) {
          expect(coach.color).toBe(object.color);
          expect(owned).not.toContain(object.color);
        }
        if (coach.color !== null) expect(coach.color).toBe(object.color);
        const stored = Array.isArray(object.accessories) ? (object.accessories as unknown[]) : [];
        const expected = stored.filter(
          (id, index): id is string =>
            typeof id === 'string' && owned.includes(id) && stored.indexOf(id) === index,
        );
        expect(coach.accessories).toEqual(expected);
      }),
      { numRuns: 200 },
    );
  });

  it('version 2 text parses as version 3 with no Unlocks and the default Coach', () => {
    const { schemaVersion: _version, unlocks: _unlocks, coach: _coach, ...core } = validData;
    const text = JSON.stringify({ schemaVersion: 2, ...core });
    expect(parseProgress(text)).toEqual({ kind: 'data', data: validData });
  });

  it('a version 3 text without unlocks or coach is no data', () => {
    const { unlocks: _unlocks, ...withoutUnlocks } = validData;
    const { coach: _coach, ...withoutCoach } = validData;
    expect(parseProgress(JSON.stringify(withoutUnlocks))).toEqual({ kind: 'none' });
    expect(parseProgress(JSON.stringify(withoutCoach))).toEqual({ kind: 'none' });
  });

  it('a repeated Unlock id is no data', () => {
    const entry = { id: 'witch-hat', kind: 'accessory', candySpent: 15 };
    const bad = { ...validData, unlocks: [entry, { ...entry }] };
    expect(parseProgress(JSON.stringify(bad))).toEqual({ kind: 'none' });
  });

  it('an equipped Accessory without an Unlock is dropped', () => {
    const owned = { id: 'witch-hat', kind: 'accessory', candySpent: 15 };
    const text = JSON.stringify({
      ...validData,
      unlocks: [owned],
      coach: { name: null, color: null, accessories: ['pumpkin-head', 'witch-hat', 'witch-hat'] },
    });
    const parsed = parseProgress(text);
    expect(parsed.kind).toBe('data');
    if (parsed.kind === 'data') {
      expect(parsed.data.coach.accessories).toEqual(['witch-hat']);
      expect(parsed.data.candy).toBe(validData.candy);
      expect(parsed.data.unlocks).toEqual([owned]);
    }
  });
});