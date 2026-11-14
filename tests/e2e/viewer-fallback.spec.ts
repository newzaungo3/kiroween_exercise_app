/**
 * Viewer loading, slow loading and 3D failure (Requirement 9).
 *
 * These tests provoke failures without a fake asset on disk: the Coach_Asset
 * request is aborted, delayed or answered in the test (design "Fixture
 * policy"). Still_Image requests are answered with a 1 × 1 PNG built in
 * memory, so the `img` elements stay in place whether or not the
 * Asset_Pipeline has delivered the Still_Images; no test asserts that pixels
 * loaded.
 *
 * Two tests need the real, parseable Coach_Asset: "a lost WebGL context
 * shows the Still_Fallback with a Retry" and "the Coach appears when a slow
 * Coach_Asset finally arrives". They check for the delivered file first
 * (`expectCoachAssetDelivered` or `waitForCoach`) and, before the
 * Asset_Pipeline has delivered it (Open decision 1), fail with a message
 * naming the missing path. They are never skipped. Every other test here
 * runs without the delivered files.
 */
import { expect, test, type Locator, type Page, type Route } from '@playwright/test';

import { findExercise, stillViews, type ExerciseEntry } from '@/catalog';
import { difficultyLabel, exerciseName, exercisePath, muscleGroupLabel } from '@/ui/exercises/labels';
import { format, locales, t } from '@/ui/strings';

import { disableWebGL, expectCoachAssetDelivered, waitForCoach } from './support/webgl';

const en = locales.en;

/** The Exercise whose Exercise_Detail_Screen these tests open. */
const exercise: ExerciseEntry = (() => {
  const entry = findExercise('grave-rise');
  if (entry === undefined) throw new Error('The Catalog has no Grave Rise Exercise_Entry.');
  return entry;
})();

/** A valid 1 × 1 PNG, kept in memory only. Its pixels are never checked. */
const tinyPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
);

/** Matches a request URL whose path is exactly `path` (a Catalog path). */
function hasPath(path: string): (url: URL) => boolean {
  return (url) => url.pathname === path;
}

/** Records the Coach_Asset requests the route answered. */
interface CoachAssetRoute {
  /** Number of Coach_Asset requests seen so far. */
  readonly requests: () => number;
}

/**
 * Answers every request for the Exercise's Coach_Asset with `handle`.
 * Call before `page.goto`.
 */
async function routeCoachAsset(
  page: Page,
  handle: (route: Route) => Promise<void>,
  entry: ExerciseEntry = exercise,
): Promise<CoachAssetRoute> {
  let count = 0;
  await page.route(hasPath(entry.coach.asset), async (route) => {
    count += 1;
    await handle(route);
  });
  return { requests: () => count };
}

/**
 * Answers the Exercise's front, side and back Still_Image requests with a
 * 1 × 1 PNG from memory. Call before `page.goto`.
 */
async function routeStillImages(page: Page, entry: ExerciseEntry = exercise): Promise<void> {
  for (const view of stillViews) {
    await page.route(hasPath(entry.stills[view]), (route) =>
      route.fulfill({ status: 200, contentType: 'image/png', body: tinyPng }),
    );
  }
}

/** The Viewer_Area. */
function viewerArea(page: Page): Locator {
  return page.locator('[data-viewer-phase]');
}

/** The Viewer's polite live region. */
function liveRegion(page: Page): Locator {
  return viewerArea(page).getByRole('status');
}

/** The Retry button inside the Viewer_Area. */
function retryButton(page: Page): Locator {
  return viewerArea(page).getByRole('button', { name: en['viewer.retry'], exact: true });
}

/**
 * Checks that the Written_Content and the Safety_Message are visible
 * (Requirements 4.2–4.5), finding each by role or by its Strings_Module text.
 */
async function expectWrittenContentAndSafetyMessage(page: Page, entry: ExerciseEntry = exercise): Promise<void> {
  await expect(page.getByRole('heading', { level: 1, name: exerciseName(entry), exact: true })).toBeVisible();
  const texts = [
    t(entry.realNameId),
    difficultyLabel(entry.difficulty),
    ...entry.muscleGroups.map(muscleGroupLabel),
    ...entry.stepIds.map((id) => t(id)),
    ...entry.cueIds.map((id) => t(id)),
    ...entry.safetyNoteIds.map((id) => t(id)),
  ];
  for (const text of texts) {
    await expect(page.getByText(text, { exact: true })).toBeVisible();
  }
  await expect(page.getByRole('heading', { name: en['safety.heading'], exact: true })).toBeVisible();
  await expect(page.getByText(en['safety.coachMessage'], { exact: true })).toBeVisible();
}

/**
 * Checks the Still_Fallback (Requirement 9.9): the Still_Fallback message in
 * the live region, and one figure per view captioned Front, Side or Back
 * holding an `img` with the Catalog path and the alternative text from the
 * Strings_Module. Pixels are not checked.
 */
async function expectStillFallback(page: Page, entry: ExerciseEntry = exercise): Promise<void> {
  const area = viewerArea(page);
  await expect(area).toHaveAttribute('data-viewer-phase', 'fallback', { timeout: 30_000 });
  await expect(liveRegion(page)).toHaveText(en['viewer.fallback.message']);

  await expect(area.getByRole('img')).toHaveCount(stillViews.length);
  const name = exerciseName(entry);
  for (const view of stillViews) {
    const figure = area.getByRole('figure', { name: t(`viewer.view.${view}`), exact: true });
    await expect(figure).toBeVisible();
    const image = figure.getByRole('img', {
      name: format(`viewer.still.${view}.alt`, { exercise: name }),
      exact: true,
    });
    await expect(image).toBeVisible();
    await expect(image).toHaveAttribute('src', entry.stills[view]);
  }
}

/** Resolves after `ms` milliseconds of test-runner time. */
function delay(ms: number): Promise<void> {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

/** A Coach_Asset route that holds every request until released. */
interface HeldCoachAsset extends CoachAssetRoute {
  /** Answers every held and later Coach_Asset request with a network failure. */
  readonly release: () => void;
}

/**
 * Holds every Coach_Asset request without answering, so the Viewer stays in
 * the Loading_State, until `release()` makes them fail with a network error.
 * Call before `page.goto`.
 */
async function holdCoachAsset(page: Page): Promise<HeldCoachAsset> {
  let release: () => void = () => undefined;
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  const route = await routeCoachAsset(page, async (held) => {
    await released;
    await held.abort('failed').catch(() => undefined);
  });
  return { requests: route.requests, release: () => release() };
}

/** Name of the list the live-region recorder keeps on `window`. */
const liveRegionLogKey = '__spookyCoachLiveRegionLog';

/**
 * Records every distinct text the Viewer's live region shows, from the
 * moment the parser inserts it, so a test can check that each message is
 * announced once per change (Requirement 9.2). Call before `page.goto`.
 */
async function recordLiveRegion(page: Page): Promise<() => Promise<readonly string[]>> {
  await page.addInitScript((key: string) => {
    const seen: string[] = [];
    // Narrow cast: the log is a test-only property that the Window type does not declare.
    (window as unknown as Record<string, string[]>)[key] = seen;
    const record = (): void => {
      const region = document.querySelector('[data-viewer-phase] [role="status"]');
      if (region === null) return;
      const text = region.textContent ?? '';
      if (seen[seen.length - 1] !== text) seen.push(text);
    };
    new MutationObserver(record).observe(document, { subtree: true, childList: true, characterData: true });
  }, liveRegionLogKey);
  return () =>
    page.evaluate((key: string) => {
      // Narrow cast: see the init script above.
      const log = (window as unknown as Record<string, string[] | undefined>)[key];
      return log ?? [];
    }, liveRegionLogKey);
}

/** Records the pathnames of every Still_Image request of the Exercise. Call before `page.goto`. */
function recordStillImageRequests(page: Page, entry: ExerciseEntry = exercise): () => readonly string[] {
  const stillPaths = new Set<string>(stillViews.map((view) => entry.stills[view]));
  const seen: string[] = [];
  page.on('request', (request) => {
    const path = new URL(request.url()).pathname;
    if (stillPaths.has(path)) seen.push(path);
  });
  return () => seen;
}

/**
 * Software WebGL is slow: with four workers rendering the Coach at once, page
 * loads and context teardown take longer than the default 30 s budget. Same
 * budget as viewer.spec.ts and viewer-render-loop.spec.ts.
 */
test.describe.configure({ timeout: 90_000 });

test.describe('Viewer loading and Still_Fallback', () => {
  test('a failed Coach_Asset request shows the Still_Fallback with the Written_Content and the Safety_Message', async ({
    page,
  }) => {
    const coachAsset = await routeCoachAsset(page, (route) => route.abort('failed'));
    await routeStillImages(page);

    await page.goto(exercisePath(exercise));

    await expectStillFallback(page);
    expect(coachAsset.requests(), 'the Viewer requested the Coach_Asset before falling back').toBeGreaterThan(0);
    // A failed request offers a Retry (Requirement 9.7), unlike a browser without WebGL.
    await expect(retryButton(page)).toBeVisible();
    await expectWrittenContentAndSafetyMessage(page);
  });

  test('a Coach_Asset slower than 10 seconds adds the Slow_Load_Notice with a Retry', async ({ page }) => {
    test.setTimeout(90_000);
    // Hold the Coach_Asset response for more than 10 s and until the checks
    // below are done, so loading is still running while they look at it.
    // The answer after that does not matter.
    let release: () => void = () => undefined;
    const checksDone = new Promise<void>((resolve) => {
      release = resolve;
    });
    const coachAsset = await routeCoachAsset(page, async (route) => {
      await Promise.all([new Promise<void>((resolve) => setTimeout(resolve, 11_000)), checksDone]);
      await route.abort('failed').catch(() => undefined);
    });

    await page.goto(exercisePath(exercise));

    const area = viewerArea(page);
    await expect(area).toHaveAttribute('data-viewer-phase', 'loading', { timeout: 15_000 });
    await expect(liveRegion(page)).toHaveText(en['viewer.loading']);
    await expect(retryButton(page)).toHaveCount(0);

    // The notice appears at 10 s, while the Coach_Asset is still loading (Requirement 9.3).
    await expect(liveRegion(page)).toHaveText(en['viewer.slowLoad'], { timeout: 20_000 });
    await expect(retryButton(page)).toBeVisible();
    await expect(area).toHaveAttribute('data-viewer-phase', 'loading');
    expect(coachAsset.requests()).toBe(1);
    await expectWrittenContentAndSafetyMessage(page);

    release();
    await page.unrouteAll({ behavior: 'ignoreErrors' });
  });

  const unusableAnswers: readonly { readonly title: string; readonly answer: (route: Route) => Promise<void> }[] = [
    {
      title: 'an HTTP error from the Coach_Asset shows the Still_Fallback with a Retry',
      answer: (route) => route.fulfill({ status: 500, contentType: 'text/plain', body: 'server error' }),
    },
    {
      title: 'an unreadable Coach_Asset shows the Still_Fallback with a Retry',
      answer: (route) => route.fulfill({ status: 200, contentType: 'model/gltf-binary', body: 'not a glb' }),
    },
  ];

  for (const { title, answer } of unusableAnswers) {
    test(title, async ({ page }) => {
      const coachAsset = await routeCoachAsset(page, answer);
      await routeStillImages(page);

      await page.goto(exercisePath(exercise));

      await expectStillFallback(page);
      await expect(retryButton(page)).toBeVisible();
      expect(coachAsset.requests()).toBe(1);
      await expectWrittenContentAndSafetyMessage(page);
    });
  }

  test('without WebGL the Still_Fallback appears and the Coach_Asset is never requested', async ({ page }) => {
    await disableWebGL(page);
    const coachAsset = await routeCoachAsset(page, (route) => route.abort('failed'));
    await routeStillImages(page);

    await page.goto(exercisePath(exercise));

    await expectStillFallback(page);
    // Nothing would change on a Retry, so none is offered (Requirement 9.6).
    await expect(retryButton(page)).toHaveCount(0);
    await expectWrittenContentAndSafetyMessage(page);
    expect(coachAsset.requests(), 'the Viewer requested the Coach_Asset without WebGL').toBe(0);
  });

  test('Still_Images are requested only in the Still_Fallback', async ({ page }) => {
    const stillRequests = recordStillImageRequests(page);
    const coachAsset = await holdCoachAsset(page);
    await routeStillImages(page);

    await page.goto(exercisePath(exercise));

    // Loading has started: the Coach_Asset request is out and still unanswered.
    await expect
      .poll(coachAsset.requests, { message: 'the Viewer requests the Coach_Asset', timeout: 15_000 })
      .toBeGreaterThan(0);
    await expect(viewerArea(page)).toHaveAttribute('data-viewer-phase', 'loading');
    expect(stillRequests(), 'Still_Images requested during the Loading_State').toEqual([]);

    coachAsset.release();
    await expectStillFallback(page);
    await expect
      .poll(() => [...new Set(stillRequests())].sort(), { message: 'each Still_Image is requested' })
      .toEqual(stillViews.map((view) => exercise.stills[view]).sort());

    await page.unrouteAll({ behavior: 'ignoreErrors' });
  });

  test('a Still_Image that fails shows its alternative text', async ({ page }) => {
    await routeCoachAsset(page, (route) => route.abort('failed'));
    await routeStillImages(page);
    const [failedView, ...shownViews] = stillViews;
    if (failedView === undefined) throw new Error('The Catalog defines no Still_Image views.');
    // Registered last, so it wins over the 1 × 1 PNG answer for this one view.
    await page.route(hasPath(exercise.stills[failedView]), (route) =>
      route.fulfill({ status: 404, contentType: 'text/plain', body: 'not found' }),
    );

    await page.goto(exercisePath(exercise));

    const area = viewerArea(page);
    await expect(area).toHaveAttribute('data-viewer-phase', 'fallback', { timeout: 30_000 });
    const name = exerciseName(exercise);

    const failedFigure = area.getByRole('figure', { name: t(`viewer.view.${failedView}`), exact: true });
    await expect(
      failedFigure.getByText(format(`viewer.still.${failedView}.alt`, { exercise: name }), { exact: true }),
    ).toBeVisible();
    await expect(failedFigure.getByRole('img')).toHaveCount(0);

    for (const view of shownViews) {
      const figure = area.getByRole('figure', { name: t(`viewer.view.${view}`), exact: true });
      await expect(
        figure.getByRole('img', { name: format(`viewer.still.${view}.alt`, { exercise: name }), exact: true }),
      ).toBeVisible();
    }
    await expect(liveRegion(page)).toHaveText(en['viewer.fallback.message']);
    await expectWrittenContentAndSafetyMessage(page);
  });

  test('a lost WebGL context shows the Still_Fallback with a Retry', async ({ page }) => {
    test.setTimeout(120_000);
    await routeStillImages(page);

    await page.goto(exercisePath(exercise));
    // Needs the real Coach_Asset; fails with the missing-file message before delivery.
    await waitForCoach(page, { exercise, timeoutMs: 60_000 });

    const lost = await viewerArea(page)
      .locator('canvas')
      .evaluate((canvas: HTMLCanvasElement) => {
        // Returns the Viewer's existing WebGL2 context, the one R3F created.
        const extension = canvas.getContext('webgl2')?.getExtension('WEBGL_lose_context');
        if (extension === undefined || extension === null) return false;
        extension.loseContext();
        return true;
      });
    expect(lost, 'the Viewer canvas offers WEBGL_lose_context').toBe(true);

    await expectStillFallback(page);
    await expect(retryButton(page)).toBeVisible();
    await expectWrittenContentAndSafetyMessage(page);

    // Retry creates a new canvas and context, and the Coach appears again.
    await retryButton(page).click();
    await waitForCoach(page, { exercise, timeoutMs: 60_000 });
  });

  test('Retry restarts loading without the Slow_Load_Notice', async ({ page }) => {
    test.setTimeout(90_000);
    const coachAsset = await holdCoachAsset(page);

    await page.goto(exercisePath(exercise));

    await expect(liveRegion(page)).toHaveText(en['viewer.slowLoad'], { timeout: 20_000 });
    await retryButton(page).click();

    const area = viewerArea(page);
    await expect(area).toHaveAttribute('data-viewer-phase', 'loading');
    await expect(liveRegion(page)).toHaveText(en['viewer.loading']);
    await expect(retryButton(page)).toHaveCount(0);
    await expect
      .poll(coachAsset.requests, { message: 'Retry requests the Coach_Asset again' })
      .toBe(2);

    // The 10-second count restarted: well over 10 s have passed since the
    // first attempt, yet a few seconds after Retry the notice is still absent.
    await delay(3_000);
    await expect(liveRegion(page)).toHaveText(en['viewer.loading']);
    await expect(retryButton(page)).toHaveCount(0);
    await expectWrittenContentAndSafetyMessage(page);

    coachAsset.release();
    await page.unrouteAll({ behavior: 'ignoreErrors' });
  });

  test('the Coach appears when a slow Coach_Asset finally arrives', async ({ page }) => {
    test.setTimeout(120_000);
    // Needs the real Coach_Asset; fails with the missing-file message before delivery.
    await expectCoachAssetDelivered(page, exercise);
    // Hold the real Coach_Asset for more than 10 s and until the Slow_Load_Notice
    // checks are done; a fixed delay alone left a one-second window that a
    // loaded test machine could miss.
    let release: () => void = () => undefined;
    const checksDone = new Promise<void>((resolve) => {
      release = resolve;
    });
    const coachAsset = await routeCoachAsset(page, async (route) => {
      await Promise.all([delay(11_000), checksDone]);
      await route.continue().catch(() => undefined);
    });

    await page.goto(exercisePath(exercise));

    await expect(liveRegion(page)).toHaveText(en['viewer.slowLoad'], { timeout: 20_000 });
    await expect(retryButton(page)).toBeVisible();
    release();

    // The 3D scene replaces the Loading_State and the Slow_Load_Notice (Requirement 9.5).
    await waitForCoach(page, { exercise, timeoutMs: 60_000 });
    await expect(liveRegion(page)).toHaveText('');
    await expect(retryButton(page)).toHaveCount(0);
    expect(coachAsset.requests()).toBe(1);
  });

  test('the live region announces loading, slow loading and the Still_Fallback once each', async ({ page }) => {
    test.setTimeout(90_000);
    const liveRegionLog = await recordLiveRegion(page);
    const coachAsset = await holdCoachAsset(page);
    await routeStillImages(page);

    // 'commit' returns at the first response byte, so a busy machine cannot let the
    // 10-second slow-load timer pass before the first assertion starts to wait.
    await page.goto(exercisePath(exercise), { waitUntil: 'commit' });

    await expect(viewerArea(page).getByRole('status')).toHaveCount(1);
    await expect(liveRegion(page)).toHaveText(en['viewer.loading'], { timeout: 15_000 });
    await expect(liveRegion(page)).toHaveText(en['viewer.slowLoad'], { timeout: 20_000 });
    coachAsset.release();
    await expect(liveRegion(page)).toHaveText(en['viewer.fallback.message'], { timeout: 15_000 });

    // One polite live region, its text changed once per phase: empty in the
    // prerendered HTML, then each message exactly once.
    expect(await liveRegionLog()).toEqual([
      '',
      en['viewer.loading'],
      en['viewer.slowLoad'],
      en['viewer.fallback.message'],
    ]);

    await page.unrouteAll({ behavior: 'ignoreErrors' });
  });

  test('the live region is empty in the prerendered HTML', async ({ request }) => {
    const response = await request.get(exercisePath(exercise));
    expect(response.status()).toBe(200);
    const html = await response.text();

    const regions = [...html.matchAll(/<p\b[^>]*\brole="status"[^>]*>([\s\S]*?)<\/p>/g)];
    expect(regions, 'the prerendered HTML holds one live region').toHaveLength(1);
    const content = regions[0]?.[1] ?? '';
    const text = content
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<[^>]*>/g, '')
      .trim();
    expect(text).toBe('');
  });
});

test.describe('Viewer without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('without JavaScript the Viewer_Area shows only the Still_Fallback', async ({ page }) => {
    const coachAsset = await routeCoachAsset(page, (route) => route.abort('failed'));
    await routeStillImages(page);

    await page.goto(exercisePath(exercise));

    const area = viewerArea(page);
    await expect(area.getByText(en['viewer.fallback.message'], { exact: true })).toBeVisible();
    const name = exerciseName(exercise);
    for (const view of stillViews) {
      const figure = area.getByRole('figure', { name: t(`viewer.view.${view}`), exact: true });
      await expect(figure).toBeVisible();
      const image = figure.getByRole('img', {
        name: format(`viewer.still.${view}.alt`, { exercise: name }),
        exact: true,
      });
      await expect(image).toBeVisible();
      await expect(image).toHaveAttribute('src', exercise.stills[view]);
    }

    // The Loading art and both control groups are in the HTML but hidden.
    const loadingArt = area.locator('[data-viewer-loading-art]');
    await expect(loadingArt).toHaveCount(1);
    await expect(loadingArt).toBeHidden();
    const viewer = page.getByRole('region', { name: en['viewer.region.label'], exact: true });
    expect(
      await viewer.getByRole('button', { includeHidden: true }).count(),
      'the control groups are in the prerendered HTML',
    ).toBeGreaterThan(0);
    await expect(viewer.getByRole('button')).toHaveCount(0);

    await expectWrittenContentAndSafetyMessage(page);
    expect(coachAsset.requests(), 'the Coach_Asset requested without JavaScript').toBe(0);
  });
});
