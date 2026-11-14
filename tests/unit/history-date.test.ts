import { describe, expect, it } from 'vitest';

import { formatWorkoutDate } from '@/ui/history/date';

// Newer ICU versions put a narrow no-break space before AM/PM.
const plain = (text: string): string => text.replace(/\s/g, ' ');

describe('formatWorkoutDate', () => {
  it('a fixed time gives a fixed English date and time in UTC', () => {
    const ms = Date.UTC(2026, 10, 20, 10, 0, 0);
    expect(plain(formatWorkoutDate(ms, 'UTC'))).toBe('Nov 20, 2026, 10:00 AM');
  });

  it('a time just before midnight UTC shows the next day in a zone ahead of UTC', () => {
    const ms = Date.UTC(2026, 10, 20, 23, 30, 0);
    expect(plain(formatWorkoutDate(ms, 'UTC'))).toBe('Nov 20, 2026, 11:30 PM');
    expect(plain(formatWorkoutDate(ms, 'Asia/Bangkok'))).toBe('Nov 21, 2026, 6:30 AM');
  });

  it('time 0 and the upper bound do not throw', () => {
    expect(() => formatWorkoutDate(0, 'UTC')).not.toThrow();
    expect(() => formatWorkoutDate(8_640_000_000_000_000, 'UTC')).not.toThrow();
  });
});
