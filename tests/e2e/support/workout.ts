/**
 * Helpers that drive a Workout on the Workout_Screen.
 *
 * Time on the Workout_Screen comes from `performance.now()`, so the specs
 * control it with Playwright's clock. `page.clock.install()` must have been
 * called BEFORE `page.goto`, otherwise the page reads real time and
 * `fastForward` has no effect on it. Names come from the English Locale.
 */
import { expect, type Locator, type Page } from '@playwright/test';

import { findEntryById, type RoutineEntry } from '@/catalog';
import { workoutPath } from '@/ui/routines/labels';
import { locales } from '@/ui/strings';
import { buildSetSlots } from '@/workout-engine';

const en = locales.en;

/** Extra time past every wait, so a Set or Rest is certainly over. */
const marginMs = 1_000;

/** Opens the Workout_Screen of a Routine; it shows the Preparing_Panel. */
export async function openPreparing(page: Page, routine: RoutineEntry): Promise<void> {
  await page.goto(workoutPath(routine));
  await expect(page.getByRole('heading', { level: 2, name: en[routine.nameId] })).toBeVisible();
}

/** Presses "Start the Workout" on the Preparing_Panel. */
export async function startWorkout(page: Page): Promise<void> {
  await page.getByRole('button', { name: en['workout.start'] }).click();
}

/** Presses "Confirm this Set" on the current Set. */
export async function confirmCurrentSet(page: Page): Promise<void> {
  await page.getByRole('button', { name: en['workout.confirm'] }).click();
}

/** Reads a `role="timer"` showing `m:ss` and returns its whole seconds. */
export async function timerSeconds(timer: Locator): Promise<number> {
  const text = (await timer.textContent())?.trim() ?? '';
  const match = /^(\d+):(\d{2})$/.exec(text);
  if (match === null) {
    throw new Error(`The timer text "${text}" is not of the form m:ss.`);
  }
  return Number(match[1]) * 60 + Number(match[2]);
}

/**
 * Runs a started Workout to its summary, one Set slot at a time. A seconds
 * target is waited out with `page.clock.fastForward`, then the Set is
 * confirmed; after every Set but the last, the Catalog's Rest is waited out
 * the same way. Call it after `startWorkout`, with the clock installed
 * before `goto`.
 */
export async function completeWorkout(page: Page, routine: RoutineEntry): Promise<void> {
  const slots = buildSetSlots(routine);
  const confirm = page.getByRole('button', { name: en['workout.confirm'] });

  for (const [index, slot] of slots.entries()) {
    const entry = findEntryById(slot.entryId);
    if (entry === undefined) {
      throw new Error(`The Catalog has no entry "${slot.entryId}".`);
    }
    await expect(page.getByRole('heading', { level: 2, name: en[entry.nameId] })).toBeVisible();

    if (slot.target.seconds !== undefined) {
      await page.clock.fastForward(slot.target.seconds * 1_000 + marginMs);
      await expect(confirm).toBeEnabled();
    }
    await confirm.click();

    if (index < slots.length - 1 && slot.restSeconds > 0) {
      await expect(page.getByRole('heading', { level: 2, name: en['workout.rest.heading'] })).toBeVisible();
      await page.clock.fastForward(slot.restSeconds * 1_000 + marginMs);
    }
  }

  await expect(page.getByRole('heading', { level: 2, name: en['summary.heading'] })).toBeVisible();
}
