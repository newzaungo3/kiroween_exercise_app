/**
 * Workout pause and the Coach: a Workout pause holds the Coach without
 * changing the play state the visitor chose (Requirements 8.4, 9.2–9.8, 12.8,
 * 13.7, 15.4).
 *
 * Real time and software WebGL, laptop project only: frames are observed
 * through the browser's WebGL draw calls (`countDrawCalls`).
 */
import { expect, test, type Locator, type Page } from '@playwright/test';

import { findEntryById, routines, type ExerciseEntry } from '@/catalog';
import { locales, type StringId } from '@/ui/strings';
import { buildSetSlots } from '@/workout-engine';

import {
  openPreparing,
  pauseWorkout,
  quitWorkout,
  resumeWorkout,
  startWorkout,
} from './support/workout';
import { countDrawCalls, simulatePageHidden, waitForCoach, type DrawCallCounter } from './support/webgl';

const en = locales.en;

const routine = (() => {
  const first = routines[0];
  if (first === undefined) throw new Error('The Catalog holds no Routine_Entry.');
  return first;
})();

const firstEntry: ExerciseEntry = (() => {
  const slot = buildSetSlots(routine)[0];
  const entry = slot === undefined ? undefined : findEntryById(slot.entryId);
  if (entry === undefined) throw new Error('The first Set of the Routine has no Catalog entry.');
  return entry;
})();

/** How long a held Render_Loop must stay stopped. */
const stillForMs = 1_500;
/** Gap between two readings that counts as "no frame drawn in between". */
const settleGapMs = 400;

test.describe.configure({ timeout: 120_000 });

test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== 'laptop', 'The Coach render loop is checked on the laptop project.');
});

function viewerRegion(page: Page): Locator {
  return page.getByRole('region', { name: en['viewer.region.label'], exact: true });
}

function viewerButton(page: Page, nameId: StringId): Locator {
  return viewerRegion(page).getByRole('button', { name: en[nameId], exact: true });
}

function playButton(page: Page): Locator {
  return viewerButton(page, 'viewer.play');
}

function pauseButton(page: Page): Locator {
  return viewerButton(page, 'viewer.pause');
}

/** The Coach's play/pause button, whichever name it shows. */
function playPause(page: Page): Locator {
  return playButton(page).or(pauseButton(page));
}

/** Opens the Workout with the draw-call counter, starts it and waits for the Coach. */
async function startWithCoach(page: Page): Promise<DrawCallCounter> {
  const counter = await countDrawCalls(page);
  await openPreparing(page, routine);
  await startWorkout(page);
  await waitForCoach(page, { exercise: firstEntry });
  return counter;
}

async function settledCount(page: Page, counter: DrawCallCounter): Promise<number> {
  let previous = await counter.read();
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await page.waitForTimeout(settleGapMs);
    const next = await counter.read();
    if (next === previous) return next;
    previous = next;
  }
  throw new Error('The Viewer kept drawing frames after it should have stopped.');
}

async function expectNoFrames(page: Page, counter: DrawCallCounter, settled: number): Promise<void> {
  await page.waitForTimeout(stillForMs);
  expect(await counter.read(), 'draw calls while the Coach is held or paused').toBe(settled);
}

async function expectFramesAfter(counter: DrawCallCounter, from: number): Promise<void> {
  await expect
    .poll(() => counter.read(), { message: 'the Viewer draws frames again', timeout: 10_000 })
    .toBeGreaterThan(from);
}

/** While the Workout is paused: play disabled, speed and camera buttons enabled. */
async function expectHeldControls(page: Page): Promise<void> {
  await expect(playPause(page)).toBeDisabled();
  for (const id of [
    'viewer.speed.half',
    'viewer.speed.threeQuarters',
    'viewer.speed.normal',
    'viewer.view.front',
    'viewer.view.side',
    'viewer.view.back',
  ] as const) {
    await expect(viewerButton(page, id)).toBeEnabled();
  }
}

async function expectPausedPanel(page: Page): Promise<void> {
  await expect(page.getByRole('heading', { level: 2, name: en['workout.paused.heading'] })).toBeVisible();
}

test.describe('a playing Coach', () => {
  test('the Coach keeps drawing in Set 1', async ({ page }) => {
    const counter = await startWithCoach(page);
    await expect(pauseButton(page)).toBeVisible();
    const first = await counter.read();
    await page.waitForTimeout(1_000);
    const second = await counter.read();
    expect(second).toBeGreaterThan(first);
    await page.waitForTimeout(1_000);
    expect(await counter.read()).toBeGreaterThan(second);
  });

  test('a Workout pause stops the frames, a resume draws again and the GLB is requested once', async ({
    page,
  }) => {
    const assetPath = firstEntry.coach.asset;
    let assetRequests = 0;
    page.on('request', (request) => {
      if (new URL(request.url()).pathname === assetPath) assetRequests += 1;
    });
    const counter = await startWithCoach(page);
    await expect(pauseButton(page)).toBeVisible();

    await pauseWorkout(page);
    await expectPausedPanel(page);
    const settled = await settledCount(page, counter);
    await expectNoFrames(page, counter, settled);

    await resumeWorkout(page);
    await expectFramesAfter(counter, settled);
    await expect(pauseButton(page)).toBeVisible();
    expect(assetRequests, `requests for ${assetPath}`).toBe(1);
  });

  test('a Coach paused with its own button stays paused after a Workout pause and resume', async ({
    page,
  }) => {
    const counter = await startWithCoach(page);
    await pauseButton(page).click();
    await expect(playButton(page)).toBeVisible();
    await settledCount(page, counter);

    await pauseWorkout(page);
    await expectPausedPanel(page);
    await resumeWorkout(page);
    await expect(page.getByRole('button', { name: en['workout.confirm'] })).toBeVisible();

    await expect(playButton(page)).toBeVisible();
    await expect(playButton(page)).toBeEnabled();
    await expectNoFrames(page, counter, await settledCount(page, counter));
  });

  test('while the Workout is paused the play button is disabled and speed and camera buttons work', async ({
    page,
  }) => {
    await startWithCoach(page);
    await pauseWorkout(page);
    await expectPausedPanel(page);
    await expectHeldControls(page);
    await resumeWorkout(page);
    await expect(playPause(page)).toBeEnabled();
  });

  test('the same holds across a page-hidden auto-pause', async ({ page }) => {
    const counter = await startWithCoach(page);
    await expect(pauseButton(page)).toBeVisible();

    await simulatePageHidden(page, true);
    await expectPausedPanel(page);
    await simulatePageHidden(page, false);
    await expectPausedPanel(page);
    await expectHeldControls(page);
    const settled = await settledCount(page, counter);
    await expectNoFrames(page, counter, settled);

    await resumeWorkout(page);
    await expectFramesAfter(counter, settled);
    await expect(pauseButton(page)).toBeVisible();
  });

  test('at the summary no Viewer region remains', async ({ page }) => {
    await startWithCoach(page);
    await expect(viewerRegion(page)).toBeVisible();
    await quitWorkout(page);
    await expect(page.getByRole('heading', { level: 2, name: en['summary.heading.ended'] })).toBeVisible();
    await expect(viewerRegion(page)).toHaveCount(0);
  });
});

test.describe('under the Reduced_Motion_Preference', () => {
  test.use({ reducedMotion: 'reduce' });

  test('the Coach starts paused and stays paused after a Workout pause and resume', async ({ page }) => {
    const counter = await startWithCoach(page);
    await expect(playButton(page)).toBeVisible();
    await settledCount(page, counter);

    await pauseWorkout(page);
    await expectPausedPanel(page);
    await expectHeldControls(page);
    await resumeWorkout(page);
    await expect(page.getByRole('button', { name: en['workout.confirm'] })).toBeVisible();

    await expect(playButton(page)).toBeVisible();
    await expect(playButton(page)).toBeEnabled();
    await expectNoFrames(page, counter, await settledCount(page, counter));
  });
});
