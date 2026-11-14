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
import { distinctRecordsArbitrary } from './support/progress';

const progressDataArbitrary: fc.Arbitrary<ProgressData> = fc
  .record({
    candy: fc.integer({ min: 0, max: 100_000 }),
    welcomeGiftGranted: fc.boolean(),
    history: distinctRecordsArbitrary({ maxLength: 15 }),
  })
  .map((fields) => ({ schemaVersion: 1 as const, ...fields }));

const validData: ProgressData = {
  schemaVersion: 1,
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
};

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
  // Version 1 with a broken shape.
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
      fc.property(progressDataArbitrary, (data) => {
        const text = serialiseProgress(data);
        const parsed = parseProgress(text);
        expect(parsed).toEqual({ kind: 'data', data });
        expect((JSON.parse(text) as { schemaVersion: number }).schemaVersion).toBe(1);
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

  it('the stored text carries the schema version 1', () => {
    const text = serialiseProgress(validData);
    expect((JSON.parse(text) as { schemaVersion: number }).schemaVersion).toBe(schemaVersion);
    expect(schemaVersion).toBe(1);
  });

  it('text from a newer schema version parses as newer', () => {
    const text = JSON.stringify({ schemaVersion: 2, anything: 'else' });
    expect(parseProgress(text)).toEqual({ kind: 'newer', version: 2 });
  });

  it('a missing history list parses as no data', () => {
    const { history: _history, ...withoutHistory } = validData;
    expect(parseProgress(JSON.stringify(withoutHistory))).toEqual({ kind: 'none' });
  });

  it('a record with a negative Candy parses as no data', () => {
    const bad = { ...validData, history: [{ ...validData.history[0], candyEarned: -1 }] };
    expect(parseProgress(JSON.stringify(bad))).toEqual({ kind: 'none' });
  });

  it('a version 1 history with a repeated id parses as no data', () => {
    const entry = validData.history[0];
    const bad = { ...validData, history: [entry, { ...entry }] };
    expect(parseProgress(JSON.stringify(bad))).toEqual({ kind: 'none' });
  });
});
