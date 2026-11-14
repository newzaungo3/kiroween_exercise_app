import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { neighbours } from '../../src/catalog';

describe('neighbours()', () => {
  // Feature: catalog-and-stretches, Property 3: Previous and Next walk the list in order
  // **Validates: Requirements 8.6**
  it('Previous and Next walk the list in order', () => {
    fc.assert(
      fc.property(fc.uniqueArray(fc.integer(), { minLength: 1 }), (list) => {
        const last = list.length - 1;

        list.forEach((entry, i) => {
          const result = neighbours(list, entry);
          if (i === 0) {
            expect(result.previous).toBeUndefined();
          } else {
            expect(result.previous).toBe(list[i - 1]);
          }
          if (i === last) {
            expect(result.next).toBeUndefined();
          } else {
            expect(result.next).toBe(list[i + 1]);
          }
        });

        // Following `next` from the first entry visits every entry once, in order.
        const visited: number[] = [list[0]!];
        let current = neighbours(list, list[0]).next;
        while (current !== undefined) {
          visited.push(current);
          current = neighbours(list, current).next;
        }
        expect(visited).toEqual(list);
      }),
      { numRuns: 200 },
    );
  });
});
