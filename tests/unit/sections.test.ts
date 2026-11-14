import { describe, expect, it } from 'vitest';

import { placeholderSectionIds, sectionName, sectionTitle } from '@/ui/sections';
import { locales } from '@/ui/strings';

describe('sections', () => {
  it('only Crypt is still a Placeholder section', () => {
    expect(placeholderSectionIds).toEqual(['crypt']);
  });

  it('History has a name and a title but no Placeholder message', () => {
    expect(sectionName('history').length).toBeGreaterThan(0);
    expect(sectionTitle('history').length).toBeGreaterThan(0);
    expect('section.history.message' in locales.en).toBe(false);
  });
});
