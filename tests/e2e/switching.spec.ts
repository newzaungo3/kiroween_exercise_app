/**
 * Switching between detail screens resets the Viewer (Requirements 9.1–9.5):
 * after the visitor changes the camera and the Playback_Speed and pauses the
 * Demo_Clip on screen A, the next detail screen B shows exactly the picture a
 * fresh load of B shows, with the 1× Playback_Speed selected and the Coach
 * paused. B is reached by the Next link, by a list link and by the browser
 * Back button. The first screen's WebGL context is lost after leaving.
 *
 * With reduced motion the Coach starts paused and nothing moves by itself,
 * so a picture is a stable value to compare byte for byte.
 */
import { expect, type Locator, type Page, test } from '@playwright/test';

import { type ExerciseEntry, findEntry, type Kind } from '@/catalog';
import { exercisePath, listPath } from '@/ui/exercises/labels';
import { format, locales, type StringId, t } from '@/ui/strings';

import { settledPicture } from './support/pictures';
import { waitForCoach } from './support/webgl';

const en = locales.en;

test.use({ reducedMotion: 'reduce' });

// Software WebGL is slow: same budget as the other Viewer specs.
test.describe.configure({ timeout: 90_000 });

function entryOf(kind: Kind, slug: string): ExerciseEntry {
  const entry = findEntry(kind, slug);
  if (entry === undefined) throw new Error(`The Catalog holds no ${kind} "${slug}".`);
  return entry;
}

const graveRise = entryOf('exercise', 'grave-rise');
const skeletonJacks = entryOf('exercise', 'skeleton-jacks');
const gravestoneLean = entryOf('stretch', 'gravestone-lean');

function viewerRegion(page: Page): Locator {
  return page.getByRole('region', { name: en['viewer.region.label'], exact: true });
}

function viewerButton(page: Page, nameId: StringId): Locator {
  return viewerRegion(page).getByRole('button', { name: en[nameId], exact: true });
}

function coachCanvas(page: Page): Locator {
  return page.locator('[data-viewer-phase]').locator('canvas');
}

/** Opens `entry` with a full page load and waits for the Coach. */
async function openFresh(page: Page, entry: ExerciseEntry): Promise<void> {
  await page.goto(exercisePath(entry));
  await waitForCoach(page, { exercise: entry });
}

/** Side preset, Zoom in, 0.5×, then Play and Pause. */
async function changeViewer(page: Page): Promise<void> {
  await viewerButton(page, 'viewer.view.side').click();
  await viewerButton(page, 'viewer.zoomIn').click();
  await viewerButton(page, 'viewer.speed.half').click();
  await viewerButton(page, 'viewer.play').click();
  await expect(viewerButton(page, 'viewer.pause')).toBeVisible();
  await viewerButton(page, 'viewer.pause').click();
  await expect(viewerButton(page, 'viewer.play')).toBeVisible();
}

/** Loads A fresh, changes the Viewer and checks that A's picture changed. */
async function openAndChange(page: Page, a: ExerciseEntry, aFresh: Buffer): Promise<void> {
  await openFresh(page, a);
  await changeViewer(page);
  const changed = await settledPicture(page);
  expect(changed.equals(aFresh), 'the changes alter the picture of the first screen').toBe(false);
}

/** The screen B shows what a fresh load shows, 1× selected and paused. */
async function expectReset(page: Page, b: ExerciseEntry, bFresh: Buffer): Promise<void> {
  await page.waitForURL(exercisePath(b));
  await waitForCoach(page, { exercise: b });
  await expect(viewerButton(page, 'viewer.speed.normal')).toHaveAttribute('aria-pressed', 'true');
  await expect(viewerButton(page, 'viewer.play')).toBeVisible();
  const picture = await settledPicture(page);
  expect(picture.equals(bFresh), 'the picture equals the fresh load of the second screen').toBe(true);
}

/** Clicks the back link to the list of the screen's Kind. */
async function toList(page: Page, from: ExerciseEntry): Promise<void> {
  const label = from.kind === 'stretch' ? 'exercise.backToStretches' : 'exercise.backToList';
  await page.getByRole('link', { name: en[label], exact: true }).click();
  await page.waitForURL(listPath(from.kind));
}

/**
 * Goes from detail screen `from` to detail screen `to` by client-side links
 * only, through the lists (and the Home_Screen when the Kinds differ).
 * Returns the number of history entries added.
 */
async function viaLists(page: Page, from: ExerciseEntry, to: ExerciseEntry): Promise<number> {
  let steps = 1;
  await toList(page, from);
  if (from.kind !== to.kind) {
    await page.getByRole('link', { name: en['common.backHome'], exact: true }).click();
    await page.waitForURL('/');
    const section = to.kind === 'stretch' ? 'section.stretches.name' : 'section.exercises.name';
    await page
      .getByRole('navigation', { name: en['home.nav.label'], exact: true })
      .getByRole('link', { name: en[section] })
      .click();
    await page.waitForURL(listPath(to.kind));
    steps += 2;
  }
  await page.getByRole('link', { name: t(to.nameId) }).click();
  return steps + 1;
}

interface Pair {
  readonly title: string;
  readonly a: ExerciseEntry;
  readonly b: ExerciseEntry;
  readonly viaNext: boolean;
}

const pairs: readonly Pair[] = [
  { title: 'Grave Rise → Skeleton Jacks', a: graveRise, b: skeletonJacks, viaNext: true },
  { title: 'Skeleton Jacks → Gravestone Lean', a: skeletonJacks, b: gravestoneLean, viaNext: false },
];

for (const { title, a, b, viaNext } of pairs) {
  test.describe(title, () => {
    let aFresh: Buffer;
    let bFresh: Buffer;

    test.beforeEach(async ({ page }) => {
      await openFresh(page, b);
      bFresh = await settledPicture(page);
      await openFresh(page, a);
      aFresh = await settledPicture(page);
    });

    if (viaNext) {
      test('the Next link shows the second screen as a fresh load does', async ({ page }) => {
        await openAndChange(page, a, aFresh);
        await page
          .getByRole('link', { name: format('pager.next', { exercise: t(b.nameId) }), exact: true })
          .click();
        await expectReset(page, b, bFresh);
      });
    }

    test('a list link shows the second screen as a fresh load does', async ({ page }) => {
      await openAndChange(page, a, aFresh);
      await viaLists(page, a, b);
      await expectReset(page, b, bFresh);
    });

    test('the browser Back button shows the second screen as a fresh load does', async ({ page }) => {
      await openFresh(page, b);
      const steps = await viaLists(page, b, a);
      await waitForCoach(page, { exercise: a });
      await changeViewer(page);
      expect((await settledPicture(page)).equals(aFresh), 'the changes alter the picture').toBe(false);
      for (let back = 0; back < steps; back += 1) {
        await page.goBack();
      }
      await expectReset(page, b, bFresh);
    });
  });
}

test('the first screen\'s WebGL context is lost after leaving', async ({ page }) => {
  await openFresh(page, graveRise);

  const context = await coachCanvas(page).evaluateHandle((canvas) =>
    canvas instanceof HTMLCanvasElement ? canvas.getContext('webgl2') : null,
  );
  expect(
    await context.evaluate((gl) => gl !== null && !gl.isContextLost()),
    'the 3D scene has a live WebGL2 context',
  ).toBe(true);

  await page
    .getByRole('link', { name: format('pager.next', { exercise: t(skeletonJacks.nameId) }), exact: true })
    .click();
  await page.waitForURL(exercisePath(skeletonJacks));
  await expect
    .poll(() => context.evaluate((gl) => gl !== null && gl.isContextLost()), {
      message: 'the WebGL context of the first screen is lost after leaving',
      timeout: 10_000,
    })
    .toBe(true);
  await context.dispose();
});

test.describe('without reduced motion', () => {
  test.use({ reducedMotion: 'no-preference' });

  test('the Next link shows the second screen playing, in the Front view', async ({ page }) => {
    await openFresh(page, graveRise);
    await viewerButton(page, 'viewer.view.side').click();
    await viewerButton(page, 'viewer.speed.half').click();

    await page
      .getByRole('link', { name: format('pager.next', { exercise: t(skeletonJacks.nameId) }), exact: true })
      .click();
    await page.waitForURL(exercisePath(skeletonJacks));
    await waitForCoach(page, { exercise: skeletonJacks });

    // The Coach plays by itself: the button offers Pause.
    await expect(viewerButton(page, 'viewer.pause')).toBeVisible();
    await expect(viewerButton(page, 'viewer.speed.normal')).toHaveAttribute('aria-pressed', 'true');

    // The Camera_Preset buttons show no selection, so the Front view is checked by
    // picture: with the Coach paused, choosing Front must not change anything.
    await viewerButton(page, 'viewer.pause').click();
    await expect(viewerButton(page, 'viewer.play')).toBeVisible();
    const shown = await settledPicture(page);
    await viewerButton(page, 'viewer.view.front').click();
    const front = await settledPicture(page);
    expect(front.equals(shown), 'the camera was already at the Front view').toBe(true);
  });
});
