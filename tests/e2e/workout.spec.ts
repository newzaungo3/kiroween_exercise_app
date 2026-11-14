import { expect, type Page, test } from '@playwright/test';

import { findEntryById, findRoutine, type ExerciseEntry, type RoutineEntry } from '@/catalog';
import { storageKey } from '@/progress-store';
import { lengthLabel, routinePath, workoutPath } from '@/ui/routines/labels';
import { format, locales } from '@/ui/strings';
import { buildSetSlots, completionBonus } from '@/workout-engine';

import {
  confirmCurrentSet,
  openPreparing,
  startWorkout,
  timerSeconds,
} from './support/workout';

const en = locales.en;

function graveyardShift(): RoutineEntry {
  const routine = findRoutine('graveyard-shift');
  if (routine === undefined) {
    throw new Error('The Catalog has no Routine "graveyard-shift".');
  }
  return routine;
}

function entryById(id: string): ExerciseEntry {
  const entry = findEntryById(id);
  if (entry === undefined) {
    throw new Error(`The Catalog has no entry "${id}".`);
  }
  return entry;
}

const routine = graveyardShift();
const slots = buildSetSlots(routine);

function slotAt(index: number): (typeof slots)[number] {
  const slot = slots[index];
  if (slot === undefined) {
    throw new Error(`The Routine has no Set slot ${index}.`);
  }
  return slot;
}

const firstSlot = slotAt(0);
const firstEntry = entryById(firstSlot.entryId);
const firstName = en[firstEntry.nameId];
const totalSets = slots.length;
const candyTotal = totalSets + completionBonus;

/** Extra time past every wait, so a Set or Rest is certainly over. */
const marginMs = 1_000;

const preparingHeading = (page: Page) =>
  page.getByRole('heading', { level: 2, name: en[routine.nameId], exact: true });
const setHeading = (page: Page, entry: ExerciseEntry) =>
  page.getByRole('heading', { level: 2, name: en[entry.nameId], exact: true });
const restHeading = (page: Page) =>
  page.getByRole('heading', { level: 2, name: en['workout.rest.heading'], exact: true });
const summaryHeading = (page: Page) =>
  page.getByRole('heading', { level: 2, name: en['summary.heading'], exact: true });
const confirmButton = (page: Page) =>
  page.getByRole('button', { name: en['workout.confirm'], exact: true });
const repsInput = (page: Page) =>
  page.getByRole('spinbutton', { name: en['workout.reps.label'], exact: true });
/** The visually hidden live region of the screen; it comes first in the DOM. */
const liveRegion = (page: Page) => page.getByRole('status').first();

function targetText(slot: (typeof slots)[number]): string {
  return slot.target.reps !== undefined
    ? format('workout.set.targetReps', { reps: String(slot.target.reps) })
    : format('workout.set.targetSeconds', { seconds: String(slot.target.seconds) });
}

async function expectNoPerfectForm(page: Page): Promise<void> {
  const text = await page.locator('body').innerText();
  expect(text).not.toMatch(/perfect form/i);
}

async function openClocked(page: Page): Promise<void> {
  await page.clock.install();
  await openPreparing(page, routine);
}

test.describe('Workout screen', () => {
  test.setTimeout(120_000);

  test('the Preparing_Panel shows the Routine, its length and the Safety_Message, and no Viewer', async ({
    page,
  }) => {
    await openClocked(page);

    await expect(page.getByRole('heading', { level: 1, name: en[routine.nameId], exact: true })).toBeVisible();
    await expect(preparingHeading(page)).toBeVisible();
    await expect(page.getByText(lengthLabel(routine), { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: en['safety.heading'], exact: true })).toBeVisible();
    await expect(page.getByText(en['safety.coachMessage'], { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: en['workout.start'], exact: true })).toBeVisible();

    const back = page.getByRole('link', { name: en['workout.preparing.back'], exact: true });
    await expect(back).toHaveAttribute('href', routinePath(routine));

    await expect(page.locator('canvas')).toHaveCount(0);
    await expect(page.locator('[data-viewer-phase]')).toHaveCount(0);
  });

  test('starting shows the first Set of Skeleton Jacks with its target and the rep field at the target', async ({
    page,
  }) => {
    await openClocked(page);
    await startWorkout(page);

    await expect(setHeading(page, firstEntry)).toBeVisible();
    expect(firstName).toBe('Skeleton Jacks');
    await expect(
      page.getByText(
        format('workout.set.of', { number: '1', count: String(firstSlot.setCount) }),
        { exact: true },
      ),
    ).toBeVisible();
    await expect(
      page.getByText(
        format('workout.set.position', { position: '1', total: String(totalSets) }),
        { exact: true },
      ),
    ).toBeVisible();
    await expect(page.getByText(targetText(firstSlot), { exact: true })).toBeVisible();
    await expect(repsInput(page)).toHaveValue(String(firstSlot.target.reps));
    await expect(page.getByRole('heading', { name: en['safety.heading'], exact: true })).toBeVisible();
  });

  test('the rep buttons change the field and a value outside 0 to 200 disables the confirm button', async ({
    page,
  }) => {
    await openClocked(page);
    await startWorkout(page);
    const input = repsInput(page);
    const target = firstSlot.target.reps ?? 0;
    const invalid = page.getByText(en['workout.reps.invalid'], { exact: true });

    await page.getByRole('button', { name: en['workout.reps.more'], exact: true }).click();
    await expect(input).toHaveValue(String(target + 1));
    await page.getByRole('button', { name: en['workout.reps.fewer'], exact: true }).click();
    await page.getByRole('button', { name: en['workout.reps.fewer'], exact: true }).click();
    await expect(input).toHaveValue(String(target - 1));

    await input.fill('250');
    await expect(invalid).toBeVisible();
    await expect(confirmButton(page)).toBeDisabled();

    await input.fill('');
    await expect(invalid).toBeVisible();
    await expect(confirmButton(page)).toBeDisabled();

    await input.fill('0');
    await expect(invalid).toHaveCount(0);
    await expect(confirmButton(page)).toBeEnabled();
  });

  test('a confirmed Set leads to a Rest with a timer, a Next line and the Rest controls, then to the next Set', async ({
    page,
  }) => {
    await openClocked(page);
    await startWorkout(page);

    const setPanel = page.locator('section[aria-labelledby="set-heading"]');
    await expect(setPanel.getByRole('button', { name: en['workout.pause'], exact: true })).toBeVisible();
    await expect(setPanel.getByRole('button', { name: en['workout.skipSet'], exact: true })).toBeVisible();
    await expect(setPanel.getByRole('button', { name: en['workout.quit'], exact: true })).toBeVisible();
    await expect(setPanel.getByRole('button', { name: en['workout.skipRest'], exact: true })).toHaveCount(0);

    await confirmCurrentSet(page);

    await expect(restHeading(page)).toBeVisible();
    const panel = page.locator('section[aria-labelledby="rest-heading"]');
    const timer = panel.getByRole('timer', { name: en['workout.timer.rest'], exact: true });
    const seconds = await timerSeconds(timer);
    expect(seconds).toBeGreaterThan(0);
    expect(seconds).toBeLessThanOrEqual(firstSlot.restSeconds);

    const next = slotAt(1);
    await expect(
      panel.getByText(
        format('workout.rest.next', {
          exercise: firstName,
          number: String(next.setNumber),
          count: String(next.setCount),
          target: format('routine.target.reps', { reps: String(next.target.reps) }),
        }),
        { exact: true },
      ),
    ).toBeVisible();
    await expect(panel.getByRole('button', { name: en['workout.skipRest'], exact: true })).toBeVisible();
    await expect(panel.getByRole('button', { name: en['workout.pause'], exact: true })).toBeVisible();
    await expect(panel.getByRole('button', { name: en['workout.quit'], exact: true })).toBeVisible();
    await expect(panel.getByRole('button', { name: en['workout.skipSet'], exact: true })).toHaveCount(0);
    await expect(panel.getByRole('button', { name: en['workout.confirm'], exact: true })).toHaveCount(0);
    await expect(panel.getByRole('button')).toHaveCount(3);

    await page.clock.fastForward(firstSlot.restSeconds * 1_000 + marginMs);
    await expect(setHeading(page, firstEntry)).toBeVisible();
    await expect(
      page.getByText(format('workout.set.of', { number: '2', count: String(next.setCount) }), {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByText(format('workout.set.position', { position: '2', total: String(totalSets) }), {
        exact: true,
      }),
    ).toBeVisible();
  });

  test('a whole Workout ends in a Completed summary and writes nothing to browser storage', async ({
    page,
  }) => {
    await openClocked(page);
    await startWorkout(page);

    const announcements: string[] = [];
    for (const [index, slot] of slots.entries()) {
      const entry = entryById(slot.entryId);
      await expect(setHeading(page, entry)).toBeVisible();
      await expect(liveRegion(page)).toHaveText(
        format('workout.announce.set', {
          number: String(slot.setNumber),
          count: String(slot.setCount),
          exercise: en[entry.nameId],
        }),
      );
      announcements.push((await liveRegion(page).textContent()) ?? '');
      await expectNoPerfectForm(page);

      if (slot.target.seconds !== undefined) {
        await expect(page.getByText(targetText(slot), { exact: true })).toBeVisible();
        await expect(confirmButton(page)).toBeDisabled();
        await page.clock.fastForward(slot.target.seconds * 1_000 + marginMs);
        await expect(page.getByText(en['workout.set.finished'], { exact: true })).toBeVisible();
        await expect(confirmButton(page)).toBeEnabled();
      }
      await confirmCurrentSet(page);

      if (index < slots.length - 1 && slot.restSeconds > 0) {
        await expect(restHeading(page)).toBeVisible();
        const nextEntry = entryById(slotAt(index + 1).entryId);
        await expect(liveRegion(page)).toHaveText(
          format('workout.announce.rest', { exercise: en[nextEntry.nameId] }),
        );
        await page.clock.fastForward(slot.restSeconds * 1_000 + marginMs);
      }
    }

    await expect(summaryHeading(page)).toBeVisible();
    await expect(liveRegion(page)).toHaveText(en['workout.announce.summary']);
    expect(new Set(announcements).size).toBe(totalSets);

    await expect(
      page.getByText(format('summary.outcome', { outcome: en['summary.outcome.completed'] }), {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByText(format('summary.setsConfirmed', { count: String(totalSets) }), { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText(format('summary.setsSkipped', { count: '0' }), { exact: true }),
    ).toBeVisible();
    const activeTimePattern = format('summary.activeTime', { time: 'TIME' })
      .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      .replace('TIME', '\\d+:\\d{2}');
    await expect(page.getByText(new RegExp(`^${activeTimePattern}$`))).toBeVisible();
    await expect(
      page.getByText(format('summary.candy', { candy: String(candyTotal) }), { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText(format('summary.bonus', { bonus: String(completionBonus) }), { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: en['summary.backToRoutine'], exact: true }),
    ).toHaveAttribute('href', routinePath(routine));
    await expect(page.getByRole('link', { name: en['common.backHome'], exact: true })).toHaveAttribute(
      'href',
      '/',
    );
    await expect(page.locator('canvas')).toHaveCount(0);
    await expect(page.locator('[data-viewer-phase]')).toHaveCount(0);
    await expectNoPerfectForm(page);

    const stored = await page.evaluate(async () => ({
      local: Object.keys(window.localStorage),
      session: window.sessionStorage.length,
      databases: (await window.indexedDB.databases()).length,
    }));
    expect(stored.local.filter((key) => key !== storageKey)).toEqual([]);
    expect(stored.session).toBe(0);
    expect(stored.databases).toBe(0);
    expect(await page.context().cookies()).toEqual([]);
  });

  test('a second visit and a refresh mid-Workout both show the Preparing_Panel with the Safety_Message', async ({
    page,
  }) => {
    await openClocked(page);
    await expect(page.getByText(en['safety.coachMessage'], { exact: true })).toBeVisible();
    await startWorkout(page);
    await confirmCurrentSet(page);
    await expect(restHeading(page)).toBeVisible();

    // A refresh mid-Workout now offers Resume or Discard; Discard leads to the Preparing_Panel.
    await page.reload();
    await page.getByRole('button', { name: en['resume.discard'], exact: true }).click();
    await expect(preparingHeading(page)).toBeVisible();
    await expect(page.getByText(en['safety.coachMessage'], { exact: true })).toBeVisible();

    await page.goto(workoutPath(routine));
    await expect(preparingHeading(page)).toBeVisible();
    await expect(page.getByText(en['safety.coachMessage'], { exact: true })).toBeVisible();
  });

  test.describe('with reduced motion', () => {
    test.use({ reducedMotion: 'reduce' });

    test('the panels have no animation and no transition', async ({ page }) => {
      const expectStill = async (selector: string): Promise<void> => {
        const motion = await page.locator(selector).evaluate((panel) =>
          [panel, ...Array.from(panel.querySelectorAll('*'))].map((element) => {
            const style = getComputedStyle(element);
            return {
              animationName: style.animationName,
              transitionDurations: style.transitionDuration.split(',').map((d) => d.trim()),
            };
          }),
        );
        expect(motion.length).toBeGreaterThan(1);
        for (const element of motion) {
          expect(element.animationName, `${selector} animation`).toBe('none');
          for (const duration of element.transitionDurations) {
            expect(duration, `${selector} transition`).toBe('0s');
          }
        }
      };

      await openClocked(page);
      await expectStill('section[aria-labelledby="preparing-heading"]');

      await startWorkout(page);
      await expect(setHeading(page, firstEntry)).toBeVisible();
      await expectStill('section[aria-labelledby="set-heading"]');

      await confirmCurrentSet(page);
      await expect(restHeading(page)).toBeVisible();
      await expectStill('section[aria-labelledby="rest-heading"]');

      // Finish the Workout to reach the summary panel.
      await page.clock.fastForward(firstSlot.restSeconds * 1_000 + marginMs);
      for (const [index, slot] of slots.entries()) {
        if (index === 0) continue;
        await expect(setHeading(page, entryById(slot.entryId))).toBeVisible();
        if (slot.target.seconds !== undefined) {
          await page.clock.fastForward(slot.target.seconds * 1_000 + marginMs);
          await expect(confirmButton(page)).toBeEnabled();
        }
        await confirmCurrentSet(page);
        if (index < slots.length - 1 && slot.restSeconds > 0) {
          await expect(restHeading(page)).toBeVisible();
          await page.clock.fastForward(slot.restSeconds * 1_000 + marginMs);
        }
      }
      await expect(summaryHeading(page)).toBeVisible();
      await expectStill('section[aria-labelledby="summary-heading"]');
    });
  });
});
