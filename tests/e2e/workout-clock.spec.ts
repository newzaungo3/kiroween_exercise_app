/**
 * The Workout_Clock and the Viewer: Viewer speed and the Coach's Play/Pause
 * never change Workout time (Requirements 7.3–7.6).
 *
 * The Workout_Screen reads `performance.now()`, so the clock is installed at a
 * fixed time before `goto` and driven with `page.clock`. The Coach starts
 * paused under reduced motion, so nothing here depends on the animation.
 */
import { expect, type Locator, type Page, test } from '@playwright/test';

import { findEntryById, routines, type ExerciseEntry } from '@/catalog';
import { locales, type StringId } from '@/ui/strings';
import { buildSetSlots } from '@/workout-engine';

import { confirmCurrentSet, openPreparing, startWorkout, timerSeconds } from './support/workout';
import { waitForCoach } from './support/webgl';

const en = locales.en;

const routine = (() => {
  const first = routines[0];
  if (first === undefined) throw new Error('The Catalog holds no Routine_Entry.');
  return first;
})();

/** The Exercise_Entry of the first Set, which must have a Rest after it. */
const firstSlot = (() => {
  const slot = buildSetSlots(routine)[0];
  if (slot === undefined || slot.restSeconds < 12) {
    throw new Error('The first Set of the Routine needs a Rest of at least 12 seconds.');
  }
  return slot;
})();
const firstEntry: ExerciseEntry = (() => {
  const entry = findEntryById(firstSlot.entryId);
  if (entry === undefined) throw new Error(`The Catalog has no entry "${firstSlot.entryId}".`);
  return entry;
})();

/** Fixed start of the installed clock. */
const fixedTime = new Date('2026-11-20T10:00:00Z');

/** Software WebGL is slow; same budget as viewer.spec.ts. */
test.describe.configure({ timeout: 90_000 });
test.use({ reducedMotion: 'reduce' });

/** A button inside the Viewer region by its Strings_Module name. */
function viewerButton(page: Page, nameId: StringId): Locator {
  return page
    .getByRole('region', { name: en['viewer.region.label'], exact: true })
    .getByRole('button', { name: en[nameId], exact: true });
}

/** Installs the clock, opens the Preparing_Panel, starts and waits for the Coach. */
async function startWithCoach(page: Page): Promise<void> {
  await page.clock.install({ time: fixedTime });
  await openPreparing(page, routine);
  await startWorkout(page);
  await waitForCoach(page, { exercise: firstEntry });
}

/** Presses a speed button and checks it is the pressed one. */
async function pressSpeed(page: Page, nameId: StringId): Promise<void> {
  await viewerButton(page, nameId).click();
  await expect(viewerButton(page, nameId)).toHaveAttribute('aria-pressed', 'true');
}

/** Pauses the page's clock one second ahead of now. */
async function pauseClock(page: Page): Promise<void> {
  const now = await page.evaluate(() => Date.now());
  await page.clock.pauseAt(now + 1_000);
}

function restTimer(page: Page): Locator {
  return page.getByRole('timer', { name: en['workout.timer.rest'], exact: true });
}

/**
 * In the Rest: pauses the clock, then checks that jumping 10 s ahead lowers the
 * Rest timer by exactly 10 s. The timer shows the last 250 ms tick, so both
 * readings follow a `fastForward`, which fires the tick once at the new time.
 */
async function expectRestDropsTenSeconds(page: Page): Promise<void> {
  await expect(page.getByRole('heading', { level: 2, name: en['workout.rest.heading'] })).toBeVisible();
  await pauseClock(page);
  await page.clock.fastForward(1_000);
  const before = await timerSeconds(restTimer(page));
  await page.clock.fastForward('00:10');
  await expect.poll(() => timerSeconds(restTimer(page))).toBe(before - 10);
}

test.describe('Workout time and Viewer controls', () => {
  test('a Playback_Speed of 0.5× does not change the Rest timer', async ({ page }) => {
    await startWithCoach(page);
    await pressSpeed(page, 'viewer.speed.half');
    await confirmCurrentSet(page);
    await expectRestDropsTenSeconds(page);
  });

  test('pausing the Coach does not change the Rest timer', async ({ page }) => {
    await startWithCoach(page);
    // The Coach starts paused under reduced motion; make sure Pause was pressed either way.
    if ((await viewerButton(page, 'viewer.pause').count()) > 0) {
      await viewerButton(page, 'viewer.pause').click();
    }
    await expect(viewerButton(page, 'viewer.play')).toBeVisible();
    await pressSpeed(page, 'viewer.speed.half');
    await confirmCurrentSet(page);
    await expectRestDropsTenSeconds(page);
  });

  test('the Set number, target and Rest texts are the same before and after a speed change', async ({
    page,
  }) => {
    await startWithCoach(page);
    const setPanel = page.locator('section[aria-labelledby="set-heading"]');
    const setBefore = await setPanel.innerText();

    await pressSpeed(page, 'viewer.speed.half');
    expect(await setPanel.innerText(), 'the Set panel after 0.5×').toBe(setBefore);
    await pressSpeed(page, 'viewer.speed.threeQuarters');
    expect(await setPanel.innerText(), 'the Set panel after 0.75×').toBe(setBefore);

    await confirmCurrentSet(page);
    await expect(page.getByRole('heading', { level: 2, name: en['workout.rest.heading'] })).toBeVisible();
    // A stopped clock keeps the Rest timer text still, so the whole panel can be compared.
    await pauseClock(page);
    await page.clock.fastForward(1_000);
    const restPanel = page.locator('section[aria-labelledby="rest-heading"]');
    const restBefore = await restPanel.innerText();

    await pressSpeed(page, 'viewer.speed.half');
    expect(await restPanel.innerText(), 'the Rest panel after 0.5×').toBe(restBefore);
    await pressSpeed(page, 'viewer.speed.normal');
    expect(await restPanel.innerText(), 'the Rest panel after 1×').toBe(restBefore);
    // Candy earned so far is not shown during a Workout; it appears only on the summary.
  });
});
