/**
 * WebGL helpers for the Viewer's E2E tests.
 *
 * They observe or change the browser's own APIs (WebGL draw calls,
 * `getContext`, page visibility), never the app's internals, so the tests
 * check external behaviour: "no frames are drawn", "no WebGL", "the page is
 * hidden", "the Coach is shown".
 *
 * Init-script helpers (`countDrawCalls`, `disableWebGL`) must be called
 * before the first `page.goto`. They run again on every navigation and
 * reload, so the draw-call count restarts at 0 on each new document.
 */
import { expect, type Page } from '@playwright/test';

import { type ExerciseEntry, findEntry, type Kind } from '@/catalog';
import { format, locales, t } from '@/ui/strings';

const en = locales.en;

/** Name of the counter the draw-call init script keeps on `window`. */
const drawCallCounterKey = '__spookyCoachDrawCalls';

/** Reads the number of WebGL draw calls made by the current document. */
export interface DrawCallCounter {
  /** Draw calls since the current document started (0 after each navigation). */
  read(): Promise<number>;
  /**
   * Samples the count at each of the next `frames` animation frames and
   * returns the largest increase between two consecutive samples: the draw
   * calls of one drawn frame of the 3D scene. Measure while the Coach plays.
   */
  largestFrame(frames?: number): Promise<number>;
}

/**
 * Counts every WebGL draw call (`drawArrays`, `drawElements`, their instanced
 * variants and `drawRangeElements`) on `WebGL2RenderingContext` and, if
 * present, `WebGLRenderingContext`. One drawn frame of the 3D scene makes at
 * least one draw call, so an unchanged count means no frame was drawn
 * (Requirement 10.1). Call before `page.goto`.
 */
export async function countDrawCalls(page: Page): Promise<DrawCallCounter> {
  await page.addInitScript((key: string) => {
    // Narrow cast: the counter is a test-only property that the Window type does not declare.
    const host = window as unknown as Record<string, number>;
    host[key] = 0;
    const drawMethods = [
      'drawArrays',
      'drawElements',
      'drawArraysInstanced',
      'drawElementsInstanced',
      'drawRangeElements',
    ];
    const prototypes: object[] = [];
    if (typeof WebGL2RenderingContext !== 'undefined') prototypes.push(WebGL2RenderingContext.prototype);
    if (typeof WebGLRenderingContext !== 'undefined') prototypes.push(WebGLRenderingContext.prototype);
    for (const prototype of prototypes) {
      // Narrow cast: the draw methods have different signatures; each is only wrapped and passed through.
      const methods = prototype as Record<string, unknown>;
      for (const name of drawMethods) {
        const original = methods[name];
        if (typeof original !== 'function') continue;
        methods[name] = function countedDraw(this: unknown, ...args: unknown[]): unknown {
          host[key] = (host[key] ?? 0) + 1;
          return Reflect.apply(original, this, args);
        };
      }
    }
  }, drawCallCounterKey);

  return {
    read: () =>
      page.evaluate((key: string) => {
        // Narrow cast: see the init script above.
        const value = (window as unknown as Record<string, number | undefined>)[key];
        return value ?? 0;
      }, drawCallCounterKey),
    largestFrame: (frames = 30) =>
      page.evaluate(
        ({ key, count }: { key: string; count: number }) =>
          new Promise<number>((resolve) => {
            // Narrow cast: see the init script above.
            const host = window as unknown as Record<string, number | undefined>;
            let last = host[key] ?? 0;
            let largest = 0;
            let left = count;
            const sample = (): void => {
              const now = host[key] ?? 0;
              largest = Math.max(largest, now - last);
              last = now;
              left -= 1;
              if (left <= 0) resolve(largest);
              else requestAnimationFrame(sample);
            };
            requestAnimationFrame(sample);
          }),
        { key: drawCallCounterKey, count: frames },
      ),
  };
}

/**
 * Makes the browser unable to create a WebGL context: `getContext` returns
 * `null` for `webgl2`, `webgl` and `experimental-webgl`, as on a device
 * without WebGL. The Viewer should then show the Still_Fallback without
 * requesting the Coach_Asset (Requirement 9.6). Call before `page.goto`.
 */
export async function disableWebGL(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const blocked = new Set(['webgl2', 'webgl', 'experimental-webgl']);
    const prototype = HTMLCanvasElement.prototype;
    const original = prototype.getContext;
    // Narrow cast: getContext is overloaded per context id; this wrapper keeps every overload's arguments and result.
    const wrapped = function getContextWithoutWebGL(
      this: HTMLCanvasElement,
      contextId: string,
      ...rest: unknown[]
    ): unknown {
      if (blocked.has(contextId)) return null;
      return Reflect.apply(original, this, [contextId, ...rest]);
    } as unknown as typeof prototype.getContext;
    prototype.getContext = wrapped;
  });
}

/**
 * Makes the page report itself as hidden (`hidden: true`) or visible again
 * (`hidden: false`), as when the visitor switches tabs or locks the phone,
 * and dispatches `visibilitychange` (Requirements 10.3, 10.5). The browser
 * keeps running animation frames, so a test can see whether the Viewer
 * itself stops drawing.
 */
export async function simulatePageHidden(page: Page, hidden: boolean): Promise<void> {
  await page.evaluate((isHidden: boolean) => {
    const state: DocumentVisibilityState = isHidden ? 'hidden' : 'visible';
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => isHidden });
    document.dispatchEvent(new Event('visibilitychange'));
  }, hidden);
}

/**
 * The Catalog entry whose detail screen the page shows, from its URL:
 * `/exercises/<slug>` or `/stretches/<slug>`, resolved by the Kind of the path.
 */
function exerciseOnPage(page: Page): ExerciseEntry {
  const match = /^\/(exercises|stretches)\/([^/]+)\/?$/.exec(new URL(page.url()).pathname);
  const folder = match?.[1];
  const slug = match?.[2];
  const kind: Kind = folder === 'stretches' ? 'stretch' : 'exercise';
  const entry = slug === undefined ? undefined : findEntry(kind, slug);
  if (entry === undefined) {
    throw new Error(
      `waitForCoach: ${page.url()} is not a detail screen under /exercises/ or /stretches/; pass the entry.`,
    );
  }
  return entry;
}

/**
 * Sends HEAD for the Exercise_Entry's Coach_Asset path, outside any
 * `page.route` handler, and fails with a message naming the path unless the
 * answer is 200: the Asset_Pipeline has not delivered the file yet (Open
 * decision 1, Option A). Tests that need the real Coach_Asset call this, or
 * `waitForCoach`, which calls it first. It never skips.
 */
export async function expectCoachAssetDelivered(page: Page, exercise: ExerciseEntry): Promise<void> {
  const assetPath = exercise.coach.asset;
  const head = await page.request.head(assetPath);
  if (head.status() !== 200) {
    throw new Error(
      `The Coach_Asset ${assetPath} answered HTTP ${head.status()} to HEAD: ` +
        `the Asset_Pipeline has not delivered it to public${assetPath} yet (Open decision 1, Option A).`,
    );
  }
}

export interface WaitForCoachOptions {
  /** The Exercise shown on the page. Defaults to the one named by the page's URL. */
  readonly exercise?: ExerciseEntry;
  /** How long to wait for the 3D scene. Software WebGL is slow. */
  readonly timeoutMs?: number;
}

/**
 * Waits until the 3D scene is shown on the Exercise_Detail_Screen the page
 * is on: the Viewer_Area is in its `ready` phase, the image named
 * `viewer.coachLabel` is visible and the Play/Pause button is enabled.
 *
 * It first sends HEAD for the Exercise_Entry's Coach_Asset path. If the
 * answer is not 200, it fails with a message naming the path: the
 * Asset_Pipeline has not delivered the file yet (Open decision 1). It never
 * skips. If the Viewer shows the Still_Fallback instead, it fails with the
 * live region's text.
 */
export async function waitForCoach(page: Page, options: WaitForCoachOptions = {}): Promise<void> {
  const exercise = options.exercise ?? exerciseOnPage(page);
  const timeout = options.timeoutMs ?? 30_000;

  await expectCoachAssetDelivered(page, exercise);

  const area = page.locator('[data-viewer-phase]');
  await expect
    .poll(() => area.getAttribute('data-viewer-phase'), {
      message: 'the Viewer_Area reaches the 3D scene or the Still_Fallback',
      timeout,
    })
    .toMatch(/^(ready|fallback)$/);

  if ((await area.getAttribute('data-viewer-phase')) === 'fallback') {
    const message = await area.getByRole('status').textContent();
    throw new Error(`The Viewer showed the Still_Fallback instead of the Coach: "${message ?? ''}".`);
  }

  const coachName = format('viewer.coachLabel', { exercise: t(exercise.nameId) });
  await expect(page.getByRole('img', { name: coachName, exact: true })).toBeVisible({ timeout });

  const playPause = page
    .getByRole('button', { name: en['viewer.play'], exact: true })
    .or(page.getByRole('button', { name: en['viewer.pause'], exact: true }));
  await expect(playPause).toBeEnabled({ timeout });
}
