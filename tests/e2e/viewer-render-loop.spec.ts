/**
 * Render_Loop: the Viewer draws frames of the 3D scene only while something
 * visible changes (Requirements 10.1–10.5).
 *
 * Frames are observed through the browser's WebGL API: `countDrawCalls`
 * counts every draw call the page makes, so an unchanged count means no frame
 * was drawn. Every test needs the 3D scene, so each calls `waitForCoach`,
 * which fails with a message naming the Coach_Asset path until the
 * Asset_Pipeline has delivered it (Open decision 1).
 */
import { expect, test, type Locator, type Page } from '@playwright/test';

import { exercises } from '@/catalog';
import { exercisePath } from '@/ui/exercises/labels';
import { locales } from '@/ui/strings';

import { countDrawCalls, simulatePageHidden, waitForCoach, type DrawCallCounter } from './support/webgl';

const en = locales.en;

const exercise = exercises[0]!;
const detailPath = exercisePath(exercise);

/** How long a stopped Render_Loop must stay stopped. */
const stillForMs = 1_500;

/** Gap between two readings that counts as "no frame drawn in between". */
const settleGapMs = 400;

/** Software WebGL is slow: loading the Coach and settling take longer than the default budget. */
test.describe.configure({ timeout: 90_000 });

function pauseButton(page: Page): Locator {
  return page.getByRole('button', { name: en['viewer.pause'], exact: true });
}

function playButton(page: Page): Locator {
  return page.getByRole('button', { name: en['viewer.play'], exact: true });
}

function viewerArea(page: Page): Locator {
  return page.locator('[data-viewer-phase]');
}

/** Opens the Exercise_Detail_Screen with the draw-call counter and waits for the 3D scene. */
async function openCoach(page: Page): Promise<DrawCallCounter> {
  const counter = await countDrawCalls(page);
  await page.goto(detailPath);
  await waitForCoach(page, { exercise });
  return counter;
}

/** Pauses the Demo_Clip with the Play/Pause button. */
async function pause(page: Page): Promise<void> {
  await pauseButton(page).click();
  await expect(playButton(page)).toBeVisible();
}

/**
 * Waits until two readings `settleGapMs` apart are equal (a frame already
 * in flight may still finish) and returns the settled count. Fails if the
 * Viewer keeps drawing.
 */
async function settledCount(page: Page, counter: DrawCallCounter): Promise<number> {
  let previous = await counter.read();
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await page.waitForTimeout(settleGapMs);
    const next = await counter.read();
    if (next === previous) return next;
    previous = next;
  }
  throw new Error(`The Viewer kept drawing frames for ${(20 * settleGapMs) / 1000} s after it should have stopped.`);
}

/** Checks that no frame is drawn for `stillForMs` after the count has settled at `settled`. */
async function expectNoFrames(page: Page, counter: DrawCallCounter, settled: number): Promise<void> {
  await page.waitForTimeout(stillForMs);
  expect(await counter.read(), 'draw calls while nothing visible changes').toBe(settled);
}

/** Checks that frames are being drawn again after `from`. */
async function expectFramesAfter(counter: DrawCallCounter, from: number): Promise<void> {
  await expect
    .poll(() => counter.read(), { message: 'the Viewer draws frames again', timeout: 10_000 })
    .toBeGreaterThan(from);
}

test.describe('Render_Loop', () => {
  test('a playing Coach keeps drawing', async ({ page }) => {
    const counter = await openCoach(page);
    await expect(pauseButton(page)).toBeVisible();

    // Non-vacuous guard for the "no frames" tests below: the counter sees
    // the frames of a playing Demo_Clip, in two consecutive windows.
    const first = await counter.read();
    await page.waitForTimeout(1_000);
    const second = await counter.read();
    expect(second).toBeGreaterThan(first);
    await page.waitForTimeout(1_000);
    expect(await counter.read()).toBeGreaterThan(second);
  });

  test('a paused Coach draws no frames', async ({ page }) => {
    const counter = await openCoach(page);
    await pause(page);

    const settled = await settledCount(page, counter);
    await expectNoFrames(page, counter, settled);
  });

  test('a camera button while paused draws until the camera stops', async ({ page }) => {
    const counter = await openCoach(page);
    await pause(page);
    const before = await settledCount(page, counter);

    // The first 3D view is the Front Camera_Preset; Back starts a camera move.
    await page.getByRole('button', { name: en['viewer.view.back'], exact: true }).click();

    const after = await settledCount(page, counter);
    expect(after, 'frames drawn while the camera moved').toBeGreaterThan(before);
    await expectNoFrames(page, counter, after);
    // The Demo_Clip is still paused after the camera stopped.
    await expect(playButton(page)).toBeVisible();
  });

  test('a hidden page draws no frames and resumes when shown', async ({ page }) => {
    const counter = await openCoach(page);
    await expect(pauseButton(page)).toBeVisible();

    await simulatePageHidden(page, true);
    const settled = await settledCount(page, counter);
    await expectNoFrames(page, counter, settled);

    // Shown again: the Coach continues in the play state the visitor last chose.
    await simulatePageHidden(page, false);
    await expectFramesAfter(counter, settled);
    await expect(pauseButton(page)).toBeVisible();
  });

  test('a Viewer_Area scrolled out of view draws no frames', async ({ page }) => {
    const counter = await openCoach(page);
    await expect(pauseButton(page)).toBeVisible();

    const scrollToBottom = (): Promise<void> =>
      page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }));
    const areaBottom = (): Promise<number> =>
      viewerArea(page).evaluate((element) => element.getBoundingClientRect().bottom);

    await scrollToBottom();
    if ((await areaBottom()) > 0) {
      // The page is too short to scroll the Viewer_Area away (a tall
      // viewport): add room below the content, then scroll to the bottom.
      await page.evaluate(() => {
        const spacer = document.createElement('div');
        spacer.style.blockSize = `${2 * window.innerHeight}px`;
        document.body.append(spacer);
      });
      await scrollToBottom();
    }
    expect(await areaBottom(), 'the Viewer_Area is fully above the visible part of the page').toBeLessThanOrEqual(0);

    const settled = await settledCount(page, counter);
    await expectNoFrames(page, counter, settled);

    // Back in view: the Coach continues playing.
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await expectFramesAfter(counter, settled);
    await expect(pauseButton(page)).toBeVisible();
  });

  test('resizing a paused Viewer redraws once and then stops', async ({ page }) => {
    const counter = await openCoach(page);
    await expect(pauseButton(page)).toBeVisible();

    // The draw calls of one frame, measured while the Coach plays.
    const oneFrame = await counter.largestFrame();
    expect(oneFrame, 'one drawn frame makes draw calls').toBeGreaterThan(0);

    await pause(page);
    const before = await settledCount(page, counter);
    const heightBefore = (await viewerArea(page).boundingBox())?.height;

    // A shorter viewport shrinks the Viewer_Area (its height follows the viewport height).
    const viewport = page.viewportSize();
    if (viewport === null) throw new Error('The test page has no fixed viewport size.');
    await page.setViewportSize({ width: viewport.width, height: viewport.height - 80 });
    await expect
      .poll(async () => (await viewerArea(page).boundingBox())?.height, {
        message: 'the Viewer_Area changes size',
      })
      .not.toBe(heightBefore);

    const after = await settledCount(page, counter);
    expect(after - before, 'draw calls after the resize: at most one frame').toBeLessThanOrEqual(oneFrame);
    await expectNoFrames(page, counter, after);
    await expect(playButton(page)).toBeVisible();
  });
});
