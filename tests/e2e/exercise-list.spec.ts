import { expect, type Page, type Request, type Response, test } from '@playwright/test';

import { entries, entriesOfKind, kinds, stillViews, type ExerciseEntry, type Kind } from '@/catalog';
import {
  difficultyLabel,
  exerciseName,
  exercisePath,
  listPath,
  listSection,
  muscleGroupLabel,
} from '@/ui/exercises/labels';
import { sectionName, sectionTitle } from '@/ui/sections';
import { locales } from '@/ui/strings';

import { homeScreen } from './support/screens';

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

/** The other Kind: the one whose entries must never appear on this Kind's list. */
function otherKind(kind: Kind): Kind {
  return kind === 'exercise' ? 'stretch' : 'exercise';
}

/** The list entries of one Kind: the links inside `<main>` that lead to a detail screen of its section. */
function listEntries(page: Page, kind: Kind) {
  return page.locator(`main a[href^="${listPath(kind)}/"]`);
}

/** The list entry of one Exercise_Entry, found by its accessible name. */
function listEntry(page: Page, entry: ExerciseEntry) {
  return page.getByRole('link', { name: new RegExp(`^${escapeRegExp(exerciseName(entry))}`) });
}

/** Checks the URL, the single level-1 heading and the document title of the list screen of a Kind. */
async function expectListScreen(page: Page, kind: Kind): Promise<void> {
  const section = listSection(kind);
  expect(new URL(page.url()).pathname).toBe(listPath(kind));

  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
  await expect(
    page.getByRole('heading', { level: 1, name: sectionName(section), exact: true }),
  ).toBeVisible();
  await expect(homeNavigation(page)).toHaveCount(0);

  // After a client-side navigation the App Router sets the title a moment
  // after the content renders, so wait for it instead of reading once.
  await expect(page).toHaveTitle(sectionTitle(section));
  expect(await page.title()).toContain(sectionName(section));

  await expect(listEntries(page, kind)).toHaveCount(entriesOfKind(kind).length);
}

/** Every Coach_Asset and Still_Image path in the Catalog, of either Kind. */
const catalogAssetPaths: ReadonlySet<string> = new Set(
  entries.flatMap((entry) => [
    entry.coach.asset,
    ...stillViews.map((view) => entry.stills[view]),
  ]),
);

function isNetworkRequest(request: Request): boolean {
  const { protocol } = new URL(request.url());
  return protocol !== 'data:' && protocol !== 'blob:';
}

for (const kind of kinds) {
  const section = listSection(kind);
  const path = listPath(kind);
  const kindEntries = entriesOfKind(kind);
  const foreignEntries = entriesOfKind(otherKind(kind));

  test.describe(`${section} list screen`, () => {
    test(`the ${section} Navigation_Entry opens the list screen`, async ({ page }) => {
      await page.goto(homeScreen);
      await homeNavigation(page)
        .getByRole('link', { name: sectionName(section), exact: true })
        .click();
      await page.waitForURL(path);

      await expectListScreen(page, kind);
    });

    test(`${path} serves the list screen directly and on reload`, async ({ page }) => {
      const response = await page.goto(path);
      expect(response?.status(), 'status').toBe(200);
      expect(response?.request().redirectedFrom(), 'redirect').toBeNull();
      await expectListScreen(page, kind);

      const reloaded = await page.reload();
      expect(reloaded?.status(), 'status after reload').toBe(200);
      expect(reloaded?.request().redirectedFrom(), 'redirect after reload').toBeNull();
      await expectListScreen(page, kind);
    });

    test(`the ${section} list lists every entry of its Kind in Catalog order with Spooky_Name, Real_Name, Difficulty and Muscle_Groups`, async ({
      page,
    }) => {
      await page.goto(path);

      const listed = listEntries(page, kind);
      await expect(listed).toHaveCount(kindEntries.length);

      const hrefs = await listed.evaluateAll((anchors) =>
        anchors.map((anchor) => anchor.getAttribute('href') ?? ''),
      );
      expect(hrefs, 'list entries in Catalog order').toEqual(kindEntries.map(exercisePath));

      for (const [index, entry] of kindEntries.entries()) {
        const row = listed.nth(index);
        const name = exerciseName(entry);
        await expect(row, `${name} is visible`).toBeVisible();
        await expect(row, `${name} shows its Spooky_Name`).toContainText(name);
        await expect(row, `${name} shows its Real_Name`).toContainText(en[entry.realNameId]);
        await expect(row, `${name} shows its Difficulty`).toContainText(
          difficultyLabel(entry.difficulty),
        );
        for (const muscleGroup of entry.muscleGroups) {
          await expect(row, `${name} shows the Muscle_Group ${muscleGroup}`).toContainText(
            muscleGroupLabel(muscleGroup),
          );
        }
      }
    });

    test(`an entry of the ${section} list never shows an entry of the other Kind`, async ({
      page,
    }) => {
      await page.goto(path);
      await expect(listEntries(page, kind)).toHaveCount(kindEntries.length);

      for (const foreign of foreignEntries) {
        const name = exerciseName(foreign);
        await expect(
          page.locator(`main a[href="${exercisePath(foreign)}"]`),
          `${name} has no link on ${path}`,
        ).toHaveCount(0);
        await expect(listEntry(page, foreign), `${name} is not listed on ${path}`).toHaveCount(0);
      }
      await expect(listEntries(page, otherKind(kind))).toHaveCount(0);
    });

    test(`a ${section} list entry is one link whose name starts with the Spooky_Name and opens its detail screen`, async ({
      page,
    }) => {
      for (const entry of kindEntries) {
        const name = exerciseName(entry);
        await page.goto(path);

        const link = listEntry(page, entry);
        await expect(link, `one list entry for ${name}`).toHaveCount(1);
        await expect(link).toHaveAttribute('href', exercisePath(entry));
        // The whole entry is that one link: the Real_Name sits inside it, not beside it.
        await expect(link).toContainText(en[entry.realNameId]);

        await link.click();
        await page.waitForURL(exercisePath(entry));
        await expect(
          page.getByRole('heading', { level: 1, name, exact: true }),
          `${name} detail screen heading`,
        ).toBeVisible();
      }
    });

    test(`the ${section} list screen links back to the Home_Screen`, async ({ page }) => {
      await page.goto(path);

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

    test(`the ${section} list screen requests no Coach_Asset, Still_Image or 3D code`, async ({
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
        if (
          isNetworkRequest(response.request()) &&
          response.request().resourceType() === 'script'
        ) {
          scriptResponses.push(response);
        }
      });

      await page.goto(path, { waitUntil: 'load' });
      await expect(listEntries(page, kind)).toHaveCount(kindEntries.length);
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
    });
  });
}
