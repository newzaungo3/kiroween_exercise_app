import { describe, expect, it } from 'vitest';

import { sectionIds, sectionName, sectionTitle } from '@/ui/sections';
import { locales } from '@/ui/strings';

describe('sections', () => {
  it('every Section has a name and a title, and no Section has a Placeholder message string', () => {
    for (const id of sectionIds) {
      expect({ id, name: sectionName(id).length > 0 }).toEqual({ id, name: true });
      expect({ id, title: sectionTitle(id).length > 0 }).toEqual({ id, title: true });
      expect({ id, hasMessage: `section.${id}.message` in locales.en }).toEqual({
        id,
        hasMessage: false,
      });
    }
  });
});
