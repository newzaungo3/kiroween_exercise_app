/**
 * Viewer on the Exercise_Detail_Screen: WebGL availability in the test
 * browser, the labelled Coach image, the Camera_Controls and
 * Playback_Controls of the 3D scene, gestures inside and outside the
 * Viewer_Area, control states while loading and in the Still_Fallback,
 * layout and keyboard access, context release and reduced motion
 * (Requirements 5.1, 5.7, 5.8, 6.7–6.9, 7.5, 7.7, 8.1, 8.4, 8.6, 8.7, 8.9,
 * 11.1, 11.5, 12.2–12.6, 14.5).
 *
 * Tests that need the 3D scene call `waitForCoach`. Before the
 * Asset_Pipeline has delivered the Coach_Asset (Open decision 1, Option A),
 * they fail with a message naming the missing file. They are never skipped.
 * Tests of the Loading_State hold the Coach_Asset request unanswered, and
 * tests of the Still_Fallback abort it or disable WebGL, so they need no
 * delivered file.
 */
import { expect, type Locator, type Page, test } from '@playwright/test';

import { type ExerciseEntry, entries, exercises } from '@/catalog';
import { exercisePath } from '@/ui/exercises/labels';
import { format, locales, type StringId, t } from '@/ui/strings';
import { colors } from '@/ui/theme/tokens';

import { settledPicture } from './support/pictures';
import { disableWebGL, waitForCoach } from './support/webgl';

const en = locales.en;

/** The Exercise whose Exercise_Detail_Screen these tests open: the first in Catalog order. */
const exercise: ExerciseEntry = (() => {
  const first = exercises[0];
  if (first === undefined) throw new Error('The Catalog holds no Exercise_Entry.');
  return first;
})();

const detailPath = `/exercises/${exercise.slug}`;

/** Opens the Exercise_Detail_Screen of `exercise`. */
async function openDetail(page: Page): Promise<void> {
  await page.goto(detailPath);
}

/** The Viewer's region on the Exercise_Detail_Screen, named by `viewer.region.label`. */
function viewerRegion(page: Page): Locator {
  return page.getByRole('region', { name: en['viewer.region.label'], exact: true });
}

/** A button inside the Viewer found by role and its exact Strings_Module name. */
function viewerButton(page: Page, nameId: StringId): Locator {
  return viewerRegion(page).getByRole('button', { name: en[nameId], exact: true });
}

/** The Play/Pause button, whichever action it names next (Requirement 8.4). */
function playPauseButton(page: Page): Locator {
  return viewerButton(page, 'viewer.play').or(viewerButton(page, 'viewer.pause'));
}

/** Camera_Controls in display order: the Camera_Presets, then the pad (Open decision 3, Option A). */
const cameraControlIds = [
  'viewer.view.front',
  'viewer.view.side',
  'viewer.view.back',
  'viewer.rotateLeft',
  'viewer.rotateRight',
  'viewer.tiltUp',
  'viewer.tiltDown',
  'viewer.zoomIn',
  'viewer.zoomOut',
] as const satisfies readonly StringId[];

/** Playback_Speed buttons in display order. */
const speedControlIds = [
  'viewer.speed.half',
  'viewer.speed.threeQuarters',
  'viewer.speed.normal',
] as const satisfies readonly StringId[];

/** Number of Viewer buttons outside the Still_Fallback: Play/Pause, the speeds and the Camera_Controls. */
const viewerControlCount = 1 + speedControlIds.length + cameraControlIds.length;

/**
 * Buttons expected in the Viewer region while the Coach_Asset is held: every
 * control, plus the Retry button once the Slow_Load_Notice is up. On a loaded
 * test machine the held request can pass 10 s before the buttons are read
 * (Requirement 9.3); Retry is a Viewer button too, so it is counted and
 * measured with the others, never dropped.
 */
function loadingButtonCount(buttonNames: readonly string[]): number {
  return viewerControlCount + (buttonNames.includes(en['viewer.retry']) ? 1 : 0);
}

/** Route pattern of the Exercise's Coach_Asset request, from the Catalog. */
const coachAssetRoute = `**${exercise.coach.asset}`;

/** Accessible name of the Coach image while the 3D scene is shown (Requirement 5.7). */
const coachImageName = format('viewer.coachLabel', { exercise: t(exercise.nameId) });

/** The Viewer_Area, which reports its phase in `data-viewer-phase`. */
function viewerArea(page: Page): Locator {
  return page.locator('[data-viewer-phase]');
}

/** The canvas the 3D scene is drawn on. */
function coachCanvas(page: Page): Locator {
  return viewerArea(page).locator('canvas');
}

/** The Viewer_Area exposed as one image while the 3D scene is shown. */
function coachImage(page: Page): Locator {
  return viewerRegion(page).getByRole('img', { name: coachImageName, exact: true });
}

/** Leaves the Coach_Asset request unanswered, so the Viewer stays in the Loading_State. Call before `page.goto`. */
async function holdCoachAsset(page: Page): Promise<void> {
  await page.route(coachAssetRoute, () => {
    // Never answered: the request stays pending until the page closes.
  });
}

/** Makes the Coach_Asset request fail with a network error. Call before `page.goto`. */
async function failCoachAsset(page: Page): Promise<void> {
  await page.route(coachAssetRoute, (route) => route.abort());
}

/** Opens the Exercise_Detail_Screen with the Coach_Asset held, and waits for the Loading_State. */
async function openLoadingDetail(page: Page): Promise<void> {
  await holdCoachAsset(page);
  await openDetail(page);
  await expect(viewerArea(page)).toHaveAttribute('data-viewer-phase', 'loading');
}

/** Pauses the Demo_Clip with the Play/Pause button. */
async function pauseCoach(page: Page): Promise<void> {
  await viewerButton(page, 'viewer.pause').click();
  await expect(viewerButton(page, 'viewer.play')).toBeVisible();
}

/** Adds room below the content, so the page can always scroll and scroll checks are not vacuous. */
async function makePageScrollable(page: Page): Promise<void> {
  await page.addStyleTag({ content: 'main { padding-block-end: 150vh !important; }' });
  const scrollable = await page.evaluate(
    () => document.documentElement.scrollHeight > window.innerHeight + 200,
  );
  expect(scrollable, 'the page can scroll').toBe(true);
}

async function scrollTop(page: Page): Promise<number> {
  return page.evaluate(() => window.scrollY);
}

/** Centre of an element's box, in viewport CSS px. */
async function centreOf(locator: Locator): Promise<{ readonly x: number; readonly y: number }> {
  const box = await locator.boundingBox();
  if (box === null) throw new Error('the element has no box');
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/**
 * A one-finger touch drag from `start` by `yDistance` CSS px (negative moves
 * the finger up, which scrolls the page down), sent as real touch events
 * through Chromium's input pipeline, so `touch-action` decides whether the
 * page scrolls.
 */
async function touchDrag(
  page: Page,
  start: { readonly x: number; readonly y: number },
  yDistance: number,
): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  const point = (y: number) => [{ x: Math.round(start.x), y: Math.round(y), id: 1 }];
  const steps = 12;
  try {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: point(start.y) });
    for (let step = 1; step <= steps; step += 1) {
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: point(start.y + (yDistance * step) / steps),
      });
      await page.waitForTimeout(16);
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } finally {
    await cdp.detach();
  }
}

/** Turns a `#rrggbb` token into the `rgb(r, g, b)` form computed styles use. */
function toComputedRgb(hex: string): string {
  const channels = [1, 3, 5].map((start) => Number.parseInt(hex.slice(start, start + 2), 16));
  return `rgb(${channels.join(', ')})`;
}

interface ButtonBox {
  readonly name: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Boxes of every visible button in the Viewer region, in DOM order, named by their accessible name. */
async function viewerButtonBoxes(page: Page): Promise<readonly ButtonBox[]> {
  return viewerRegion(page)
    .getByRole('button')
    .evaluateAll((buttons) =>
      buttons
        .map((button) => {
          const box = button.getBoundingClientRect();
          return {
            name: button.getAttribute('aria-label') ?? (button.textContent ?? '').trim(),
            x: box.x,
            y: box.y,
            width: box.width,
            height: box.height,
          };
        })
        .filter((box) => box.width > 0 && box.height > 0),
    );
}

/** Empty space between two boxes: the larger of the horizontal and vertical gap (0 if they touch or overlap). */
function gapBetween(a: ButtonBox, b: ButtonBox): number {
  const dx = Math.max(0, b.x - (a.x + a.width), a.x - (b.x + b.width));
  const dy = Math.max(0, b.y - (a.y + a.height), a.y - (b.y + b.height));
  return Math.max(dx, dy);
}

/** Whether two boxes share an area of more than half a pixel in both directions. */
function overlap(a: ButtonBox, b: ButtonBox): boolean {
  const width = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const height = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return width > 0.5 && height > 0.5;
}

/** Sub-pixel layout tolerance for size and gap checks. */
const layoutTolerancePx = 0.5;

/**
 * Software WebGL is slow: with four workers, loading the Coach (`waitForCoach`
 * alone may take 30 s), settling the picture and closing the WebGL context take
 * longer than the default 30 s budget. Same budget as viewer-render-loop.spec.ts.
 */
test.describe.configure({ timeout: 90_000 });

test.describe('Viewer', () => {
  test('the test browser can create a WebGL2 context', async ({ page }) => {
    await page.goto('/');
    const hasWebGL2 = await page.evaluate(
      () => document.createElement('canvas').getContext('webgl2') !== null,
    );
    expect(
      hasWebGL2,
      'the test browser has no WebGL2: the software WebGL launch flags in playwright.config.ts ' +
        '(--use-angle=swiftshader, --enable-unsafe-swiftshader) stopped working, so every 3D test ' +
        'would see the Still_Fallback',
    ).toBe(true);
  });

  test('the Coach loads for every Exercise_Entry', async ({ page }) => {
    for (const entry of entries) {
      await page.goto(exercisePath(entry));
      await waitForCoach(page, { exercise: entry });
      const name = format('viewer.coachLabel', { exercise: t(entry.nameId) });
      await expect(
        page.getByRole('img', { name, exact: true }),
        `the Coach image of ${t(entry.nameId)}`,
      ).toBeVisible();
    }
  });

  test('every Camera_Control and Playback_Control has its name from the Strings_Module', async ({
    page,
  }) => {
    await openDetail(page);
    await waitForCoach(page, { exercise });

    for (const id of cameraControlIds) {
      await expect(viewerButton(page, id), `the ${en[id]} Camera_Control`).toBeVisible();
    }

    await expect(playPauseButton(page), 'the Play/Pause button').toBeVisible();

    for (const id of speedControlIds) {
      await expect(viewerButton(page, id), `the ${en[id]} Playback_Speed button`).toBeVisible();
    }
  });

  test('the Coach appears as one labelled image once loaded', async ({ page }) => {
    await openDetail(page);
    await waitForCoach(page, { exercise });

    // The Viewer_Area is one image named from the Strings_Module (Requirement 5.7),
    // and the Coach is drawn inside it (Requirement 5.1).
    await expect(viewerRegion(page).getByRole('img')).toHaveCount(1);
    await expect(coachImage(page)).toBeVisible();
    await expect(coachCanvas(page)).toBeVisible();
    const canvasBox = await coachCanvas(page).boundingBox();
    expect(canvasBox?.width ?? 0, 'the Coach canvas has a width').toBeGreaterThan(0);
    expect(canvasBox?.height ?? 0, 'the Coach canvas has a height').toBeGreaterThan(0);
  });

  test('Play/Pause names its next action and switches', async ({ page }) => {
    await openDetail(page);
    await waitForCoach(page, { exercise });

    // The Demo_Clip plays at 1× when the 3D scene first appears (Requirement 8.1),
    // so the button offers to pause (Requirement 8.4).
    await expect(viewerButton(page, 'viewer.pause')).toBeVisible();
    await expect(viewerButton(page, 'viewer.play')).toHaveCount(0);
    await expect(viewerButton(page, 'viewer.speed.normal')).toHaveAttribute('aria-pressed', 'true');

    await viewerButton(page, 'viewer.pause').click();
    await expect(viewerButton(page, 'viewer.play')).toBeVisible();
    await expect(viewerButton(page, 'viewer.pause')).toHaveCount(0);

    await viewerButton(page, 'viewer.play').click();
    await expect(viewerButton(page, 'viewer.pause')).toBeVisible();
    await expect(viewerButton(page, 'viewer.play')).toHaveCount(0);
  });

  test('the selected Playback_Speed is pressed and shows a check mark', async ({ page }) => {
    await openDetail(page);
    await waitForCoach(page, { exercise });

    for (const selectedId of ['viewer.speed.half', 'viewer.speed.threeQuarters', 'viewer.speed.normal'] as const) {
      await viewerButton(page, selectedId).click();
      for (const id of speedControlIds) {
        const button = viewerButton(page, id);
        const selected = id === selectedId;
        await expect(button, `${en[id]} aria-pressed`).toHaveAttribute('aria-pressed', String(selected));
        // Not colour alone (Requirement 8.7): a check mark and bold text mark the selection.
        await expect(button.locator('svg'), `${en[id]} check mark`).toHaveCount(selected ? 1 : 0);
        const weight = await button.evaluate((element) => Number.parseInt(getComputedStyle(element).fontWeight, 10));
        if (selected) {
          expect(weight, `${en[id]} is bold when selected`).toBeGreaterThanOrEqual(700);
        } else {
          expect(weight, `${en[id]} is not bold when not selected`).toBeLessThan(700);
        }
      }
    }
  });

  test('a speed change while paused keeps the Coach paused', async ({ page }) => {
    await openDetail(page);
    await waitForCoach(page, { exercise });

    await pauseCoach(page);
    const paused = await settledPicture(page);

    await viewerButton(page, 'viewer.speed.half').click();
    await expect(viewerButton(page, 'viewer.speed.half')).toHaveAttribute('aria-pressed', 'true');
    // Still paused (Requirement 8.6): the button still offers to play and the Coach holds its frame.
    await expect(viewerButton(page, 'viewer.play')).toBeVisible();
    await page.waitForTimeout(1_000);
    const afterSpeed = await coachCanvas(page).screenshot();
    expect(afterSpeed.equals(paused), 'the Coach stays on the paused frame after a speed change').toBe(true);

    // The new speed applies once playback resumes: the Coach moves again.
    await viewerButton(page, 'viewer.play').click();
    await expect(viewerButton(page, 'viewer.pause')).toBeVisible();
    await expect
      .poll(async () => (await coachCanvas(page).screenshot()).equals(paused), {
        message: 'the Coach moves again after Play',
        timeout: 10_000,
      })
      .toBe(false);
  });

  test('dragging, pinching and wheel turning inside the Viewer_Area do not scroll the page', async ({
    page,
  }, testInfo) => {
    await openDetail(page);
    await waitForCoach(page, { exercise });
    await makePageScrollable(page);
    await page.evaluate(() => window.scrollTo(0, 0));

    // Touches on the 3D scene never scroll or zoom the page (Requirement 6.7).
    await expect(coachImage(page)).toHaveCSS('touch-action', 'none');

    await pauseCoach(page);
    const before = await settledPicture(page);
    const centre = await centreOf(coachCanvas(page));

    // A mouse drag turns the camera: the picture changes, the page stays put.
    await page.mouse.move(centre.x, centre.y);
    await page.mouse.down();
    await page.mouse.move(centre.x + 120, centre.y, { steps: 8 });
    await page.mouse.up();
    const afterDrag = await settledPicture(page);
    expect(afterDrag.equals(before), 'a drag on the Viewer_Area turns the camera').toBe(false);
    expect(await scrollTop(page), 'a drag on the Viewer_Area does not scroll the page').toBe(0);

    // Turning the wheel over the 3D scene zooms instead of scrolling the page.
    await page.mouse.move(centre.x, centre.y);
    await page.mouse.wheel(0, 300);
    const afterWheel = await settledPicture(page);
    expect(afterWheel.equals(afterDrag), 'the wheel over the Viewer_Area zooms the camera').toBe(false);
    expect(await scrollTop(page), 'the wheel over the Viewer_Area does not scroll the page').toBe(0);

    if (testInfo.project.name === 'phone') {
      // A one-finger touch drag on the 3D scene does not scroll the page.
      await touchDrag(page, centre, -150);
      await page.waitForTimeout(500);
      expect(await scrollTop(page), 'a touch drag on the Viewer_Area does not scroll the page').toBe(0);
    }
  });

  test('dragging or scrolling outside the Viewer_Area scrolls the page', async ({ page }, testInfo) => {
    await openLoadingDetail(page);
    await makePageScrollable(page);
    await page.evaluate(() => window.scrollTo(0, 0));

    const heading = page.getByRole('heading', { level: 1, name: en[exercise.nameId], exact: true });
    const start = await centreOf(heading);

    // The wheel over the page outside the Viewer_Area scrolls it.
    await page.mouse.move(start.x, start.y);
    await page.mouse.wheel(0, 300);
    await expect
      .poll(() => scrollTop(page), { message: 'the wheel outside the Viewer_Area scrolls the page' })
      .toBeGreaterThan(0);

    if (testInfo.project.name === 'phone') {
      // A one-finger drag upwards outside the Viewer_Area scrolls the page down (Requirement 6.8).
      await page.evaluate(() => window.scrollTo(0, 0));
      await expect.poll(() => scrollTop(page)).toBe(0);
      await touchDrag(page, await centreOf(heading), -120);
      await expect
        .poll(() => scrollTop(page), { message: 'a touch drag outside the Viewer_Area scrolls the page' })
        .toBeGreaterThan(0);
    }
  });

  test('the camera buttons change the picture', async ({ page }) => {
    await openDetail(page);
    await waitForCoach(page, { exercise });

    // Paused, so only the camera can change the picture.
    await pauseCoach(page);
    let previous = await settledPicture(page);

    const sequence = [
      'viewer.rotateLeft',
      'viewer.rotateRight',
      'viewer.tiltUp',
      'viewer.tiltDown',
      'viewer.zoomIn',
      'viewer.zoomOut',
      'viewer.view.side',
      'viewer.view.back',
      'viewer.view.front',
    ] as const satisfies readonly (typeof cameraControlIds)[number][];

    for (const id of sequence) {
      await viewerButton(page, id).click();
      const next = await settledPicture(page);
      expect(next.equals(previous), `${en[id]} changes the picture`).toBe(false);
      previous = next;
    }
  });

  test('Camera_Controls and Playback_Controls are disabled while loading', async ({ page }) => {
    await openLoadingDetail(page);

    // Shown but disabled, so the layout does not jump when the Coach appears (Requirements 7.7, 8.9).
    const buttons = viewerRegion(page).getByRole('button');
    const names = await buttons.evaluateAll((elements) =>
      elements.map((element) => element.getAttribute('aria-label') ?? (element.textContent ?? '').trim()),
    );
    await expect(buttons).toHaveCount(loadingButtonCount(names));
    for (const id of [...cameraControlIds, ...speedControlIds]) {
      await expect(viewerButton(page, id), `${en[id]} while loading`).toBeDisabled();
    }
    await expect(playPauseButton(page)).toBeDisabled();
    // No Coach image yet: the image exists only while the 3D scene is shown (Requirement 5.7).
    await expect(viewerRegion(page).getByRole('img')).toHaveCount(0);
  });

  test('Camera_Controls and Playback_Controls are absent in the Still_Fallback', async ({ page }) => {
    // A failed Coach_Asset request: the Still_Fallback with only its Retry button.
    await failCoachAsset(page);
    await openDetail(page);
    await expect(viewerArea(page)).toHaveAttribute('data-viewer-phase', 'fallback', { timeout: 30_000 });
    await expect(viewerRegion(page).getByRole('button')).toHaveCount(1);
    await expect(viewerButton(page, 'viewer.retry')).toBeVisible();
    for (const id of [...cameraControlIds, ...speedControlIds, 'viewer.play', 'viewer.pause'] as const) {
      await expect(viewerButton(page, id), `${en[id]} in the Still_Fallback`).toHaveCount(0);
    }

    // No WebGL: the Still_Fallback has no button at all.
    const noWebGL = await page.context().newPage();
    try {
      await disableWebGL(noWebGL);
      await openDetail(noWebGL);
      await expect(viewerArea(noWebGL)).toHaveAttribute('data-viewer-phase', 'fallback', { timeout: 30_000 });
      await expect(viewerRegion(noWebGL).getByRole('button')).toHaveCount(0);
    } finally {
      await noWebGL.close();
    }
  });

  test('while the 3D scene is shown, the Viewer_Area takes at most 60 % of the phone screen and the Play/Pause button is visible without scrolling', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'phone', 'Requirements 6.9 and 12.6 apply to the Phone_Viewport only');

    await openDetail(page);
    await waitForCoach(page, { exercise });
    await page.evaluate(() => window.scrollTo(0, 0));

    const viewportHeight = await page.evaluate(() => window.innerHeight);
    const area = await viewerArea(page).boundingBox();
    const playPause = await playPauseButton(page).boundingBox();
    if (area === null || playPause === null) throw new Error('the Viewer_Area or the Play/Pause button has no box');

    expect(area.height, 'Viewer_Area height').toBeLessThanOrEqual(0.6 * viewportHeight + layoutTolerancePx);
    expect(area.y, 'Viewer_Area top is on screen').toBeGreaterThanOrEqual(0);
    expect(area.y + area.height, 'Viewer_Area bottom is on screen').toBeLessThanOrEqual(viewportHeight);
    expect(playPause.y, 'Play/Pause top is on screen').toBeGreaterThanOrEqual(0);
    expect(playPause.y + playPause.height, 'Play/Pause bottom is on screen').toBeLessThanOrEqual(viewportHeight);
  });

  test('every Viewer button is at least 44 × 44 px and 8 px from its neighbours', async ({ page }) => {
    await openLoadingDetail(page);

    const boxes = await viewerButtonBoxes(page);
    expect(boxes).toHaveLength(loadingButtonCount(boxes.map((box) => box.name)));
    for (const box of boxes) {
      expect(box.width, `${box.name} width`).toBeGreaterThanOrEqual(44 - layoutTolerancePx);
      expect(box.height, `${box.name} height`).toBeGreaterThanOrEqual(44 - layoutTolerancePx);
    }
    for (let i = 0; i < boxes.length; i += 1) {
      for (let j = i + 1; j < boxes.length; j += 1) {
        const a = boxes[i] as ButtonBox;
        const b = boxes[j] as ButtonBox;
        expect(gapBetween(a, b), `gap between ${a.name} and ${b.name}`).toBeGreaterThanOrEqual(
          8 - layoutTolerancePx,
        );
      }
    }

    // The Retry button of the Still_Fallback (Requirement 12.3).
    const fallbackPage = await page.context().newPage();
    try {
      await failCoachAsset(fallbackPage);
      await openDetail(fallbackPage);
      // Hydration and the failed request can take seconds on a loaded test machine.
      await expect(viewerArea(fallbackPage)).toHaveAttribute('data-viewer-phase', 'fallback', { timeout: 30_000 });
      const retry = viewerButton(fallbackPage, 'viewer.retry');
      await expect(retry).toBeVisible();
      const retryBox = await retry.boundingBox();
      expect(retryBox?.width ?? 0, 'Retry width').toBeGreaterThanOrEqual(44 - layoutTolerancePx);
      expect(retryBox?.height ?? 0, 'Retry height').toBeGreaterThanOrEqual(44 - layoutTolerancePx);
    } finally {
      await fallbackPage.close();
    }
  });

  // Chromium dispatches Tab in the phone project too, so this runs in both projects.
  test('Tab reaches every Viewer button in reading order with the focus indicator', async ({ page }) => {
    await openDetail(page);
    await waitForCoach(page, { exercise });
    const focusColor = toComputedRgb(colors.focus);

    const backLink = page.getByRole('link', { name: en['exercise.backToList'], exact: true });
    const order: readonly { readonly name: string; readonly locator: Locator }[] = [
      { name: en['exercise.backToList'], locator: backLink },
      { name: 'Play/Pause', locator: playPauseButton(page) },
      ...[...speedControlIds, ...cameraControlIds].map((id) => ({ name: en[id], locator: viewerButton(page, id) })),
    ];

    for (const { name, locator } of order) {
      await page.keyboard.press('Tab');
      await expect(locator, `Tab reaches ${name}`).toBeFocused();
      const outline = await locator.evaluate((element) => {
        const style = getComputedStyle(element);
        return { style: style.outlineStyle, width: Number.parseFloat(style.outlineWidth), color: style.outlineColor };
      });
      expect(outline.style, `${name} focus outline style`).not.toBe('none');
      expect(outline.width, `${name} focus outline width`).toBeGreaterThan(0);
      expect(outline.color, `${name} focus outline colour`).toBe(focusColor);
    }
  });

  test('200 % text neither clips nor overlaps the Viewer buttons', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'phone', 'Requirement 12.5 applies to the Phone_Viewport only');

    await openLoadingDetail(page);
    await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
    await page.evaluate(async () => {
      await document.fonts.ready;
    });
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).fontSize)).toBe('32px');

    // Every button and the live region show their full text.
    const clipped = await viewerRegion(page).evaluate((region) => {
      const problems: string[] = [];
      for (const element of region.querySelectorAll<HTMLElement>('button, [role="status"]')) {
        const style = getComputedStyle(element);
        const name = element.getAttribute('aria-label') ?? (element.textContent ?? '').trim();
        if (element.scrollWidth > element.clientWidth + 1 || element.scrollHeight > element.clientHeight + 1) {
          problems.push(`"${name}" is clipped`);
        }
        if (style.textOverflow === 'ellipsis') problems.push(`"${name}" uses an ellipsis`);
        const box = element.getBoundingClientRect();
        for (const label of element.querySelectorAll('span')) {
          const inner = label.getBoundingClientRect();
          if (inner.left < box.left - 1 || inner.right > box.right + 1 || inner.top < box.top - 1 || inner.bottom > box.bottom + 1) {
            problems.push(`"${name}" label sticks out of its button`);
          }
        }
      }
      return problems;
    });
    expect(clipped).toEqual([]);

    const boxes = await viewerButtonBoxes(page);
    expect(boxes).toHaveLength(loadingButtonCount(boxes.map((box) => box.name)));
    for (let i = 0; i < boxes.length; i += 1) {
      for (let j = i + 1; j < boxes.length; j += 1) {
        const a = boxes[i] as ButtonBox;
        const b = boxes[j] as ButtonBox;
        expect(overlap(a, b), `${a.name} and ${b.name} overlap`).toBe(false);
      }
    }

    const size = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    }));
    expect(size.scrollWidth, 'no horizontal scrolling').toBeLessThanOrEqual(size.innerWidth);
  });

  test('leaving the Exercise_Detail_Screen releases the WebGL context', async ({ page }) => {
    await openDetail(page);
    await waitForCoach(page, { exercise });

    const context = await coachCanvas(page).evaluateHandle((canvas) =>
      canvas instanceof HTMLCanvasElement ? canvas.getContext('webgl2') : null,
    );
    expect(
      await context.evaluate((gl) => gl !== null && !gl.isContextLost()),
      'the 3D scene has a live WebGL2 context',
    ).toBe(true);

    // Client-side navigation keeps the document, so the context object stays reachable (Requirement 5.8).
    await page.getByRole('link', { name: en['exercise.backToList'], exact: true }).click();
    await page.waitForURL('/exercises');
    await expect
      .poll(() => context.evaluate((gl) => gl !== null && gl.isContextLost()), {
        message: 'the WebGL context is lost after leaving the Exercise_Detail_Screen',
        timeout: 10_000,
      })
      .toBe(true);
    await context.dispose();
  });

  test.describe('with reduced motion', () => {
    test.use({ reducedMotion: 'reduce' });

    test('the Coach starts paused', async ({ page }) => {
      await openDetail(page);
      await waitForCoach(page, { exercise });

      // Paused on its first frame, with the button offering to play (Requirement 11.1).
      await expect(viewerButton(page, 'viewer.play')).toBeVisible();
      await expect(viewerButton(page, 'viewer.pause')).toHaveCount(0);
      const first = await settledPicture(page);
      await page.waitForTimeout(1_000);
      expect((await coachCanvas(page).screenshot()).equals(first), 'the Coach does not move by itself').toBe(true);
    });

    test('the Loading_State does not animate', async ({ page }) => {
      await openLoadingDetail(page);

      const loadingArt = viewerArea(page).locator('[data-viewer-loading-art]');
      await expect(loadingArt).toBeVisible();
      const running = (): Promise<number> =>
        loadingArt.evaluate(
          (element) => element.getAnimations({ subtree: true }).filter((a) => a.playState === 'running').length,
        );
      expect(await running(), 'running animations in the Loading art with reduced motion').toBe(0);

      // Non-vacuous guard: without the preference the same Loading art animates.
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      await expect.poll(running, { message: 'the Loading art animates without reduced motion' }).toBeGreaterThan(0);
    });
  });
});
