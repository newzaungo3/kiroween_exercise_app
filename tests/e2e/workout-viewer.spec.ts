/**
 * The Viewer on the Workout_Screen: one Coach_Asset request across the Sets
 * and Rest of one Exercise, the Coach of the next Exercise during Rest, the
 * speed back at 1× when the Exercise changes, and no Viewer (and a released
 * WebGL context) at the summary (Requirements 11.2, 11.11, 11.12, 12.3, 13.5).
 *
 * Laptop project only: software WebGL is slow, and the Viewer's own phone
 * checks live in viewer.spec.ts. `page.clock.install()` runs before `goto`,
 * as the helpers of support/workout.ts require.
 */
import { expect, type JSHandle, type Locator, type Page, test } from '@playwright/test';

import { findEntryById, type ExerciseEntry, routines } from '@/catalog';
import { format, locales, t } from '@/ui/strings';
import { buildSetSlots, type SetSlot } from '@/workout-engine';

import { confirmCurrentSet, openPreparing, startWorkout } from './support/workout';
import { waitForCoach } from './support/webgl';

const en = locales.en;

/** Extra time past every wait, so a Set or Rest is certainly over. */
const marginMs = 1_000;

/** Software WebGL is slow: same budget as viewer.spec.ts. */
test.describe.configure({ timeout: 90_000 });

test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== 'laptop', 'The Viewer checks of the Workout run on the laptop project only');
});

const routine = (() => {
  const found = routines.find((entry) => entry.slug === 'graveyard-shift');
  if (found === undefined) throw new Error('The Catalog has no Routine "graveyard-shift".');
  return found;
})();

const slots: readonly SetSlot[] = buildSetSlots(routine);

function entryOf(slot: SetSlot): ExerciseEntry {
  const entry = findEntryById(slot.entryId);
  if (entry === undefined) throw new Error(`The Catalog has no entry "${slot.entryId}".`);
  return entry;
}

const firstSlot = slots[0];
if (firstSlot === undefined) throw new Error('The Routine has no Set.');
const jacks = entryOf(firstSlot);
const graveRiseSlot = slots.find((slot) => slot.entryId !== jacks.id);
if (graveRiseSlot === undefined) throw new Error('The Routine has no second Exercise.');
const graveRise = entryOf(graveRiseSlot);

function viewerRegion(page: Page): Locator {
  return page.getByRole('region', { name: en['viewer.region.label'], exact: true });
}

function coachImage(page: Page, entry: ExerciseEntry): Locator {
  const name = format('viewer.coachLabel', { exercise: t(entry.nameId) });
  return page.getByRole('img', { name, exact: true });
}

function speedButton(page: Page, id: 'viewer.speed.half' | 'viewer.speed.normal'): Locator {
  return viewerRegion(page).getByRole('button', { name: en[id], exact: true });
}

/** Waits out the Rest that follows `slot`, if it has one. */
async function waitOutRest(page: Page, slot: SetSlot): Promise<void> {
  await expect(page.getByRole('heading', { level: 2, name: en['workout.rest.heading'] })).toBeVisible();
  await page.clock.fastForward(slot.restSeconds * 1_000 + marginMs);
}

/** Starts the Workout of `routine` with the clock installed before `goto`. */
async function openStarted(page: Page): Promise<void> {
  await page.clock.install();
  await openPreparing(page, routine);
  await startWorkout(page);
}

test.describe('Viewer on the Workout_Screen', () => {
  test('Set 1, the Rest and Set 2 of an Exercise request its Coach_Asset once', async ({ page }) => {
    const assetPath = jacks.coach.asset;
    let requests = 0;
    page.on('request', (request) => {
      if (new URL(request.url()).pathname === assetPath) requests += 1;
    });

    await openStarted(page);
    await waitForCoach(page, { exercise: jacks });
    await confirmCurrentSet(page);

    await expect(page.getByRole('heading', { level: 2, name: en['workout.rest.heading'] })).toBeVisible();
    await expect(coachImage(page, jacks)).toBeVisible();
    await page.clock.fastForward(firstSlot.restSeconds * 1_000 + marginMs);

    await expect(
      page.getByRole('heading', { level: 2, name: en[jacks.nameId] }),
      'Set 2 of the same Exercise',
    ).toBeVisible();
    await waitForCoach(page, { exercise: jacks });
    await page.waitForTimeout(500);

    expect(requests, `requests for ${assetPath} across Set 1, the Rest and Set 2`).toBe(1);
  });

  test('the next Exercise shows its own Coach with the speed back at 1×', async ({ page }) => {
    await openStarted(page);
    await waitForCoach(page, { exercise: jacks });

    // Slow the first Exercise down, then move on to the next one.
    await speedButton(page, 'viewer.speed.half').click();
    await expect(speedButton(page, 'viewer.speed.half')).toHaveAttribute('aria-pressed', 'true');

    const graveRiseIndex = slots.indexOf(graveRiseSlot);
    for (const slot of slots.slice(0, graveRiseIndex - 1)) {
      await confirmCurrentSet(page);
      await waitOutRest(page, slot);
    }
    // Last Set of the first Exercise: its Rest names the next Exercise (Requirement 11.12).
    await confirmCurrentSet(page);
    await expect(page.getByRole('heading', { level: 2, name: en['workout.rest.heading'] })).toBeVisible();
    await waitForCoach(page, { exercise: graveRise });
    await expect(coachImage(page, graveRise), 'during Rest the Coach demonstrates the next Exercise').toBeVisible();
    await expect(coachImage(page, jacks)).toHaveCount(0);

    const lastJacksSlot = slots[graveRiseIndex - 1];
    if (lastJacksSlot === undefined) throw new Error('The Routine has no Set before the second Exercise.');
    await page.clock.fastForward(lastJacksSlot.restSeconds * 1_000 + marginMs);
    await expect(page.getByRole('heading', { level: 2, name: en[graveRise.nameId] })).toBeVisible();
    await expect(coachImage(page, graveRise)).toBeVisible();
    await expect(speedButton(page, 'viewer.speed.normal'), 'the speed is back at 1×').toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(speedButton(page, 'viewer.speed.half')).toHaveAttribute('aria-pressed', 'false');
  });

  test('the summary shows no Viewer and the WebGL context is lost', async ({ page }) => {
    await openStarted(page);

    const lastIndex = slots.length - 1;
    let context: JSHandle<WebGL2RenderingContext | null> | undefined;

    for (const [index, slot] of slots.entries()) {
      const entry = entryOf(slot);
      await expect(page.getByRole('heading', { level: 2, name: en[entry.nameId] })).toBeVisible();

      if (index === lastIndex) {
        // Capture the context of the last Exercise's canvas before the summary removes it.
        await waitForCoach(page, { exercise: entry });
        context = await page
          .locator('[data-viewer-phase] canvas')
          .evaluateHandle(
            (canvas): WebGL2RenderingContext | null =>
              canvas instanceof HTMLCanvasElement ? canvas.getContext('webgl2') : null,
          );
        expect(
          await context.evaluate((gl) => gl !== null && !gl.isContextLost()),
          'the Viewer has a live WebGL2 context during the last Set',
        ).toBe(true);
      }

      if (slot.target.seconds !== undefined) {
        await page.clock.fastForward(slot.target.seconds * 1_000 + marginMs);
        await expect(page.getByRole('button', { name: en['workout.confirm'] })).toBeEnabled();
      }
      await confirmCurrentSet(page);
      if (index < lastIndex && slot.restSeconds > 0) await waitOutRest(page, slot);
    }

    await expect(page.getByRole('heading', { level: 2, name: en['summary.heading'] })).toBeVisible();
    await expect(viewerRegion(page), 'no Viewer region at the summary').toHaveCount(0);
    await expect(page.locator('[data-viewer-phase]')).toHaveCount(0);
    await expect(page.locator('canvas')).toHaveCount(0);

    if (context === undefined) throw new Error('The WebGL context was never captured.');
    await expect
      .poll(() => context.evaluate((gl) => gl !== null && gl.isContextLost()), {
        message: 'the WebGL context is lost at the summary',
        timeout: 10_000,
      })
      .toBe(true);
    await context.dispose();
  });
});
