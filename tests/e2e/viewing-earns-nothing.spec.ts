import { expect, type Page, test } from '@playwright/test';

import { entries, type ExerciseEntry } from '@/catalog';
import { exercisePath } from '@/ui/exercises/labels';
import { locales } from '@/ui/strings';

import { exerciseDetailScreens, exerciseListScreen, stretchListScreen } from './support/screens';
import { waitForCoach } from './support/webgl';

const en = locales.en;

/** The Grave Rise Exercise_Entry, the Exercise whose Viewer the test drives. */
const graveRise: ExerciseEntry = (() => {
  const entry = entries.find((exercise) => exercise.id === 'grave-rise');
  if (entry === undefined) throw new Error('the Catalog has no Grave Rise Exercise_Entry');
  return entry;
})();

/** The Playback_Speed button with this Strings_Module label. */
function speedButton(page: Page, label: string) {
  return page
    .getByRole('group', { name: en['viewer.speed.label'], exact: true })
    .getByRole('button', { name: label, exact: true });
}

/**
 * Software WebGL is slow: the test loads and renders the Coach, so it gets the
 * same budget as exercise-detail.spec.ts.
 */
test.describe.configure({ timeout: 90_000 });

test.describe('Viewing earns no Candy', () => {
  // Candy is earned only in Workouts. Viewing Exercises and Stretches must not
  // write anything a Progress store could later read as Candy (Requirement 10.3).
  test('viewing the lists and every detail screen, and using the Viewer, stores nothing', async ({
    page,
    context,
  }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });

    for (const path of [exerciseListScreen, stretchListScreen, ...exerciseDetailScreens]) {
      const response = await page.goto(path);
      expect(response?.status(), `status of ${path}`).toBe(200);
    }

    // Play, pause and change the speed on one detail screen.
    await page.goto(exercisePath(graveRise));
    await waitForCoach(page, { exercise: graveRise });
    await speedButton(page, en['viewer.speed.half']).click();
    await expect(speedButton(page, en['viewer.speed.half'])).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: en['viewer.pause'], exact: true }).click();
    const play = page.getByRole('button', { name: en['viewer.play'], exact: true });
    await expect(play).toBeVisible();
    await play.click();
    await expect(page.getByRole('button', { name: en['viewer.pause'], exact: true })).toBeVisible();

    const stored = await page.evaluate(async () => ({
      localStorage: window.localStorage.length,
      sessionStorage: window.sessionStorage.length,
      indexedDB: (await window.indexedDB.databases()).length,
      cookie: document.cookie,
    }));
    expect(stored.localStorage, 'localStorage.length').toBe(0);
    expect(stored.sessionStorage, 'sessionStorage.length').toBe(0);
    expect(stored.indexedDB, 'indexedDB.databases().length').toBe(0);
    expect(stored.cookie, 'document.cookie').toBe('');
    expect(await context.cookies(), 'context cookies').toEqual([]);
  });
});
