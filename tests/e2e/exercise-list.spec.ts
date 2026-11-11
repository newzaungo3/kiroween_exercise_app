import { expect, type Page, type Request, type Response, test } from '@playwright/test';

import { exercises, stillViews, type ExerciseEntry } from '@/catalog';
import {
  difficultyLabel,
  exerciseName,
  exercisePath,
  muscleGroupLabel,
} from '@/ui/exercises/labels';
import { sectionName, sectionTitle } from '@/ui/sections';
import { locales } from '@/ui/strings';

import { exerciseListScreen, homeScreen } from './support/screens';

const en = locales.en;

/**
 * The name of a Three.js shader chunk. It survives minification, so a script
 * body that contains it carries the 3D rendering library.
 */
const threeShaderChunkName = 'skinning_pars_vertex';

/** How long to keep recording after the load event, so link prefetches are caught too. */
const afterLoadMs = 3_000;

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function homeNavigation(page: Page) {
  return page.getByRole('navigation', { name: en['home.nav.label'], exact: true });
}

/** The Exercise_List_Entries: the links inside `<main>` that lead to an Exercise_Detail_Screen. */
function exerciseListEntries(page: Page) {
  return page.locator(`main a[href^="${exerciseListScreen}/"]`);
}

/** The Exercise_List_Entry of one Exercise, found by its accessible name. */
function exerciseListEntry(page: Page, exercise: ExerciseEntry) {
  return page.getByRole('link', { name: new RegExp(`^${escapeRegExp(exerciseName(exercise))}`) });
}

/** Checks the URL, the single level-1 heading and the document title of the Exercise_List_Screen. */
async function expectExerciseListScreen(page: Page): Promise<void> {
  expect(new URL(page.url()).pathname).toBe(exerciseListScreen);

  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
  await expect(
    page.getByRole('heading', { level: 1, name: sectionName('exercises'), exact: true }),
  ).toBeVisible();
  await expect(homeNavigation(page)).toHaveCount(0);

  // After a client-side navigation the App Router sets the title a moment
  // after the content renders, so wait for it instead of reading once.
  await expect(page).toHaveTitle(sectionTitle('exercises'));
  expect(await page.title()).toContain(sectionName('exercises'));

  await expect(exerciseListEntries(page)).toHaveCount(exercises.length);
}

/** Every Coach_Asset and Still_Image path in the Catalog. */
const catalogAssetPaths: ReadonlySet<string> = new Set(
  exercises.flatMap((exercise) => [
    exercise.coach.asset,
    ...stillViews.map((view) => exercise.stills[view]),
  ]),
);

function isNetworkRequest(request: Request): boolean {
  const { protocol } = new URL(request.url());
  return protocol !== 'data:' && protocol !== 'blob:';
}

test.describe('Exercise_List_Screen', () => {
  test('the Exercises Navigation_Entry opens the Exercise_List_Screen', async ({ page }) => {
    await page.goto(homeScreen);
    await homeNavigation(page)
      .getByRole('link', { name: sectionName('exercises'), exact: true })
      .click();
    await page.waitForURL(exerciseListScreen);

    await expectExerciseListScreen(page);
  });

  test('/exercises serves the Exercise_List_Screen directly and on reload', async ({ page }) => {
    const response = await page.goto(exerciseListScreen);
    expect(response?.status(), 'status').toBe(200);
    expect(response?.request().redirectedFrom(), 'redirect').toBeNull();
    await expectExerciseListScreen(page);

    const reloaded = await page.reload();
    expect(reloaded?.status(), 'status after reload').toBe(200);
    expect(reloaded?.request().redirectedFrom(), 'redirect after reload').toBeNull();
    await expectExerciseListScreen(page);
  });

  test('the Exercise_List_Screen lists every Exercise in Catalog order with Spooky_Name, Real_Name, Difficulty and Muscle_Groups', async ({
    page,
  }) => {
    await page.goto(exerciseListScreen);

    const entries = exerciseListEntries(page);
    await expect(entries).toHaveCount(exercises.length);

    const hrefs = await entries.evaluateAll((anchors) =>
      anchors.map((anchor) => anchor.getAttribute('href') ?? ''),
    );
    expect(hrefs, 'Exercise_List_Entries in Catalog order').toEqual(exercises.map(exercisePath));

    for (const [index, exercise] of exercises.entries()) {
      const entry = entries.nth(index);
      const name = exerciseName(exercise);
      await expect(entry, `${name} is visible`).toBeVisible();
      await expect(entry, `${name} shows its Spooky_Name`).toContainText(name);
      await expect(entry, `${name} shows its Real_Name`).toContainText(en[exercise.realNameId]);
      await expect(entry, `${name} shows its Difficulty`).toContainText(
        difficultyLabel(exercise.difficulty),
      );
      for (const muscleGroup of exercise.muscleGroups) {
        await expect(entry, `${name} shows the Muscle_Group ${muscleGroup}`).toContainText(
          muscleGroupLabel(muscleGroup),
        );
      }
    }
  });

  test('an Exercise_List_Entry is one link whose name starts with the Spooky_Name and opens its Exercise_Detail_Screen', async ({
    page,
  }) => {
    for (const exercise of exercises) {
      const name = exerciseName(exercise);
      await page.goto(exerciseListScreen);

      const entry = exerciseListEntry(page, exercise);
      await expect(entry, `one Exercise_List_Entry for ${name}`).toHaveCount(1);
      await expect(entry).toHaveAttribute('href', exercisePath(exercise));
      // The whole entry is that one link: the Real_Name sits inside it, not beside it.
      await expect(entry).toContainText(en[exercise.realNameId]);

      await entry.click();
      await page.waitForURL(exercisePath(exercise));
      await expect(
        page.getByRole('heading', { level: 1, name, exact: true }),
        `${name} Exercise_Detail_Screen heading`,
      ).toBeVisible();
    }
  });

  test('the Exercise_List_Screen links back to the Home_Screen', async ({ page }) => {
    await page.goto(exerciseListScreen);

    const backHome = page.getByRole('link', { name: en['common.backHome'], exact: true });
    await expect(backHome).toBeVisible();
    await expect(backHome).toHaveAttribute('href', homeScreen);

    await backHome.click();
    await page.waitForURL(homeScreen);
    await expect(
      page.getByRole('heading', { level: 1, name: en['app.name'], exact: true }),
    ).toBeVisible();
    await expect(homeNavigation(page)).toBeVisible();
  });

  test('the Exercise_List_Screen requests no Coach_Asset, Still_Image or 3D code', async ({
    page,
  }) => {
    const requests: Request[] = [];
    const scriptResponses: Response[] = [];
    page.on('request', (request) => {
      if (isNetworkRequest(request)) {
        requests.push(request);
      }
    });
    page.on('response', (response) => {
      if (isNetworkRequest(response.request()) && response.request().resourceType() === 'script') {
        scriptResponses.push(response);
      }
    });

    await page.goto(exerciseListScreen, { waitUntil: 'load' });
    await expect(exerciseListEntries(page)).toHaveCount(exercises.length);
    await page.waitForTimeout(afterLoadMs);

    const assetRequests = requests
      .map((request) => new URL(request.url()).pathname)
      .filter((pathname) => catalogAssetPaths.has(pathname));
    expect(assetRequests, 'Coach_Asset or Still_Image requests').toEqual([]);

    // Without at least one script the 3D-code check below would pass vacuously.
    expect(scriptResponses.length, 'scripts loaded by the Exercise_List_Screen').toBeGreaterThan(0);

    const scriptsWithThree: string[] = [];
    for (const response of scriptResponses) {
      const body = await response.text();
      if (body.includes(threeShaderChunkName)) {
        scriptsWithThree.push(response.url());
      }
    }
    expect(scriptsWithThree, 'scripts that carry the 3D rendering library').toEqual([]);
  });
});
