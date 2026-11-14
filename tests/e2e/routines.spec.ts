import { expect, type Page, type Request, type Response, test } from '@playwright/test';

import { entries, routines, stillViews, type RoutineStep } from '@/catalog';
import { exerciseName, exercisePath } from '@/ui/exercises/labels';
import {
  countLabel,
  entryOfStep,
  lengthLabel,
  routineName,
  routinePath,
  stepLine,
  workoutPath,
} from '@/ui/routines/labels';
import { sectionName, sectionPath, sectionTitle } from '@/ui/sections';
import { format, locales } from '@/ui/strings';

import { routineListScreen } from './support/screens';

const en = locales.en;

/**
 * The name of a Three.js shader chunk. It survives minification, so a script
 * body that contains it carries the 3D rendering library.
 */
const threeShaderChunkName = 'skinning_pars_vertex';

/** How long to keep recording after the load event, so link prefetches are caught too. */
const afterLoadMs = 3_000;

/** Every Coach_Asset and Still_Image path in the Catalog. */
const catalogAssetPaths: ReadonlySet<string> = new Set(
  entries.flatMap((entry) => [entry.coach.asset, ...stillViews.map((view) => entry.stills[view])]),
);

function isNetworkRequest(request: Request): boolean {
  const { protocol } = new URL(request.url());
  return protocol !== 'data:' && protocol !== 'blob:';
}

/**
 * Loads a screen and checks that it requests no Coach_Asset, no Still_Image
 * and no script that carries the 3D rendering library.
 */
async function expectNoAssetsOrThreeCode(page: Page, path: string, ready: () => Promise<void>): Promise<void> {
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

  await page.goto(path, { waitUntil: 'load' });
  await ready();
  await page.waitForTimeout(afterLoadMs);

  const assetRequests = requests
    .map((request) => new URL(request.url()).pathname)
    .filter((pathname) => catalogAssetPaths.has(pathname));
  expect(assetRequests, 'Coach_Asset or Still_Image requests').toEqual([]);

  // Without at least one script the 3D-code check below would pass vacuously.
  expect(scriptResponses.length, `scripts loaded by ${path}`).toBeGreaterThan(0);

  const scriptsWithThree: string[] = [];
  for (const response of scriptResponses) {
    const body = await response.text();
    if (body.includes(threeShaderChunkName)) {
      scriptsWithThree.push(response.url());
    }
  }
  expect(scriptsWithThree, 'scripts that carry the 3D rendering library').toEqual([]);
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** The list entries: the links inside `<main>` that lead to a Routine_Detail_Screen. */
function listEntries(page: Page) {
  return page.locator('main a[href^="/routines/"]');
}

/** Checks one ordered list of Routine_Steps: order, link by Kind, Sets, target and Rest. */
async function expectStepList(
  list: ReturnType<Page['locator']>,
  steps: readonly RoutineStep[],
): Promise<void> {
  const items = list.locator('li');
  await expect(items).toHaveCount(steps.length);

  for (const [index, step] of steps.entries()) {
    const entry = entryOfStep(step);
    const name = exerciseName(entry);
    const item = items.nth(index);

    const link = item.getByRole('link', { name: new RegExp(`^${escapeRegExp(name)}`) });
    await expect(link, `${name} is a link`).toHaveCount(1);
    // exercisePath leads to /exercises/<slug> or /stretches/<slug> by Kind.
    await expect(link).toHaveAttribute('href', exercisePath(entry));
    await expect(link).toContainText(name);
    await expect(link).toContainText(stepLine(step));

    // The line holds Sets, target and Rest, spelled out from the Catalog.
    const sets = format(step.sets === 1 ? 'routine.sets.one' : 'routine.sets.other', {
      count: String(step.sets),
    });
    await expect(item).toContainText(sets);
    await expect(item).toContainText(format('routine.rest', { seconds: String(step.restSeconds) }));
  }
}

test.describe('Routine_List_Screen', () => {
  test('lists every Routine with its name, length and counts, in Catalog order', async ({ page }) => {
    const response = await page.goto(routineListScreen);
    expect(response?.status(), 'status').toBe(200);

    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    await expect(
      page.getByRole('heading', { level: 1, name: sectionName('routines'), exact: true }),
    ).toBeVisible();
    await expect(page).toHaveTitle(sectionTitle('routines'));
    expect(await page.title()).toContain(en['section.routines.name']);

    const listed = listEntries(page);
    await expect(listed).toHaveCount(routines.length);
    const hrefs = await listed.evaluateAll((anchors) =>
      anchors.map((anchor) => anchor.getAttribute('href') ?? ''),
    );
    expect(hrefs, 'list entries in Catalog order').toEqual(routines.map(routinePath));

    for (const [index, routine] of routines.entries()) {
      const row = listed.nth(index);
      await expect(row).toContainText(routineName(routine));
      await expect(row).toContainText(lengthLabel(routine));
      await expect(row).toContainText(countLabel('exercises', routine.steps.length));
      await expect(row).toContainText(countLabel('stretches', routine.coolDown.length));
    }
  });

  test('a list entry is one link whose name begins with the Routine name and opens its detail screen', async ({
    page,
  }) => {
    for (const routine of routines) {
      const name = routineName(routine);
      await page.goto(routineListScreen);

      const link = page.getByRole('link', { name: new RegExp(`^${escapeRegExp(name)}`) });
      await expect(link).toHaveCount(1);
      await expect(link).toHaveAttribute('href', routinePath(routine));

      await link.click();
      await page.waitForURL(routinePath(routine));
      await expect(page.getByRole('heading', { level: 1, name, exact: true })).toBeVisible();
    }
  });

  test('links back to the Home_Screen', async ({ page }) => {
    await page.goto(routineListScreen);
    const backHome = page.getByRole('link', { name: en['common.backHome'], exact: true });
    await expect(backHome).toHaveAttribute('href', '/');

    await backHome.click();
    await page.waitForURL('/');
    await expect(page.getByRole('heading', { level: 1, name: en['app.name'], exact: true })).toBeVisible();
  });

  test('requests no Coach_Asset, Still_Image or 3D code', async ({ page }) => {
    await expectNoAssetsOrThreeCode(page, sectionPath('routines'), async () => {
      await expect(listEntries(page)).toHaveCount(routines.length);
    });
  });
});

for (const routine of routines) {
  const path = routinePath(routine);
  const name = routineName(routine);

  test.describe(`Routine_Detail_Screen: ${name}`, () => {
    test('shows the heading, title, back link and length', async ({ page }) => {
      const response = await page.goto(path);
      expect(response?.status(), 'status').toBe(200);

      await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
      await expect(page.getByRole('heading', { level: 1, name, exact: true })).toBeVisible();
      await expect(page).toHaveTitle(format('routine.title', { routine: name }));
      expect(await page.title()).toContain(name);

      const back = page.getByRole('link', { name: en['routine.detail.back'], exact: true });
      await expect(back).toHaveAttribute('href', '/routines');

      await expect(page.getByText(lengthLabel(routine), { exact: true })).toBeVisible();
    });

    test('shows the steps in order, then the Cool-down under its own heading', async ({ page }) => {
      await page.goto(path);

      const lists = page.locator('main ol');
      await expect(lists).toHaveCount(2);
      await expectStepList(lists.nth(0), routine.steps);
      await expectStepList(lists.nth(1), routine.coolDown);

      const coolDownHeading = page.getByRole('heading', {
        level: 2,
        name: en['routine.detail.coolDown.heading'],
        exact: true,
      });
      await expect(coolDownHeading).toHaveCount(1);

      // The Cool-down heading sits after the steps list and before the Cool-down list.
      const order = await page.evaluate(() => {
        const [steps, coolDown] = Array.from(document.querySelectorAll('main ol'));
        const heading = Array.from(document.querySelectorAll('main h2')).find(
          (node) => node.nextElementSibling === coolDown,
        );
        if (steps === undefined || coolDown === undefined || heading === undefined) return false;
        return (
          (steps.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0 &&
          (heading.compareDocumentPosition(coolDown) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0
        );
      });
      expect(order, 'Cool-down heading sits between the two lists').toBe(true);
    });

    test('a step name opens its Exercise_Detail_Screen by Kind', async ({ page }) => {
      const firstStretch = routine.coolDown[0];
      const firstExercise = routine.steps[0];
      for (const step of [firstExercise, firstStretch]) {
        if (step === undefined) continue;
        const entry = entryOfStep(step);
        await page.goto(path);
        await page
          .getByRole('link', { name: new RegExp(`^${escapeRegExp(exerciseName(entry))}`) })
          .click();
        await page.waitForURL(exercisePath(entry));
        await expect(
          page.getByRole('heading', { level: 1, name: exerciseName(entry), exact: true }),
        ).toBeVisible();
      }
    });

    test('the start link leads to the Workout_Screen', async ({ page }) => {
      await page.goto(path);
      const start = page.getByRole('link', { name: en['routine.detail.start'], exact: true });
      await expect(start).toHaveCount(1);
      await expect(start).toHaveAttribute('href', workoutPath(routine));

      await start.click();
      await page.waitForURL(workoutPath(routine));
    });

    test('requests no Coach_Asset, Still_Image or 3D code', async ({ page }) => {
      await expectNoAssetsOrThreeCode(page, path, async () => {
        await expect(page.getByRole('heading', { level: 1, name, exact: true })).toBeVisible();
      });
    });
  });
}
