import { expect, type Page, type Request, type Response, test } from '@playwright/test';

import { sectionIds, sectionName, sectionPath } from '@/ui/sections';
import { locales } from '@/ui/strings';

import { exerciseDetailScreens, screens } from './support/screens';

const en = locales.en;

/** How long to keep recording after the page's load event (Requirement 10.4). */
const afterLoadMs = 5_000;

/**
 * The name of a Three.js shader chunk. It survives minification, so a script
 * body that contains it carries the 3D rendering library.
 */
const threeShaderChunkName = 'skinning_pars_vertex';

const detailScreens: ReadonlySet<string> = new Set(exerciseDetailScreens);

const allowedMethods = new Set(['GET', 'HEAD']);

/**
 * `data:` and `blob:` URLs are resolved inside the browser and send nothing
 * over the network, so they cannot reach another origin. They are skipped
 * explicitly so the origin check only judges real network requests.
 */
function isNetworkRequest(request: Request): boolean {
  const { protocol } = new URL(request.url());
  return protocol !== 'data:' && protocol !== 'blob:';
}

/** Every request and response the page sends or receives from now on. */
interface Traffic {
  readonly requests: Request[];
  readonly responses: Response[];
}

/** Starts recording before the first navigation, so navigation start is covered. */
function recordTraffic(page: Page): Traffic {
  const traffic: Traffic = { requests: [], responses: [] };
  page.on('request', (request) => {
    if (isNetworkRequest(request)) {
      traffic.requests.push(request);
    }
  });
  page.on('response', (response) => {
    if (isNetworkRequest(response.request())) {
      traffic.responses.push(response);
    }
  });
  return traffic;
}

function describeRequest(request: Request): string {
  return `${request.method()} ${request.url()}`;
}

/**
 * Checks that every recorded request went to the Site's own origin with GET
 * or HEAD (Requirements 10.4, 10.8), that no response tried to set a cookie
 * and that the browser holds no cookie (Requirement 10.7).
 */
async function expectNoBackendTraffic(page: Page, traffic: Traffic, siteOrigin: string): Promise<void> {
  expect(traffic.requests.length, 'at least one request was recorded').toBeGreaterThan(0);

  const foreignRequests = traffic.requests
    .filter((request) => new URL(request.url()).origin !== siteOrigin)
    .map(describeRequest);
  expect(foreignRequests, `requests to an origin other than ${siteOrigin}`).toEqual([]);

  const otherMethods = traffic.requests
    .filter((request) => !allowedMethods.has(request.method()))
    .map(describeRequest);
  expect(otherMethods, 'requests with a method other than GET or HEAD').toEqual([]);

  const setCookieHeaders = await Promise.all(
    traffic.responses.map(async (response) => ({
      url: response.url(),
      setCookie: await response.headerValue('set-cookie'),
    })),
  );
  const cookieSetters = setCookieHeaders
    .filter((entry) => entry.setCookie !== null)
    .map((entry) => `${entry.url}: ${entry.setCookie}`);
  expect(cookieSetters, 'responses with a set-cookie header').toEqual([]);

  expect(await page.context().cookies(), 'cookies in the browser').toEqual([]);
}

/**
 * A JavaScript response: a `<script>` load or a prefetch of a `.js` chunk,
 * which the browser may report with another resource type.
 */
function isScriptResponse(response: Response): boolean {
  const request = response.request();
  return request.resourceType() === 'script' || new URL(request.url()).pathname.endsWith('.js');
}

/** Records every JavaScript response and finds the ones that carry Three.js. */
function recordScripts(page: Page): {
  readonly count: () => number;
  readonly withThree: () => Promise<readonly string[]>;
} {
  const responses: Response[] = [];
  const carriesThree = new Map<Response, Promise<boolean>>();
  page.on('response', (response) => {
    if (isNetworkRequest(response.request()) && isScriptResponse(response)) {
      responses.push(response);
    }
  });
  const check = (response: Response): Promise<boolean> => {
    let result = carriesThree.get(response);
    if (result === undefined) {
      result = response.text().then((body) => body.includes(threeShaderChunkName));
      carriesThree.set(response, result);
    }
    return result;
  };
  return {
    count: () => responses.length,
    withThree: async () => {
      const snapshot = [...responses];
      const flags = await Promise.all(snapshot.map(check));
      return snapshot.filter((_, index) => flags[index]).map((response) => response.url());
    },
  };
}

function siteOriginOf(baseURL: string | undefined): string {
  if (baseURL === undefined) {
    throw new Error('The Playwright config must set baseURL.');
  }
  return new URL(baseURL).origin;
}

test.describe('No backend', () => {
  for (const screen of screens) {
    test(`${screen} talks only to the Site's own origin with GET or HEAD and sets no cookies`, async ({
      page,
      baseURL,
    }) => {
      const siteOrigin = siteOriginOf(baseURL);
      const traffic = recordTraffic(page);

      await page.goto(screen, { waitUntil: 'load' });
      await page.waitForTimeout(afterLoadMs);

      await expectNoBackendTraffic(page, traffic, siteOrigin);
    });
  }

  // "3D code loads only on the Exercise_Detail_Screen" (Requirement 13.6),
  // checked one screen per test so each starts with an empty browser cache.
  for (const screen of screens) {
    const isDetailScreen = detailScreens.has(screen);
    const title = isDetailScreen
      ? `3D code loads only on the Exercise_Detail_Screen: ${screen} loads it`
      : `3D code loads only on the Exercise_Detail_Screen: ${screen} does not load it`;

    test(title, async ({ page }) => {
      const scripts = recordScripts(page);

      await page.goto(screen, { waitUntil: 'load' });

      if (isDetailScreen) {
        // The 3D chunk is requested only after the WebGL2 probe passes and
        // Scene3D mounts, so wait for the Viewer_Area to leave `checking`
        // and then for the chunk itself. Neither needs the delivered
        // Coach_Asset: Scene3D mounts as soon as loading starts.
        await expect(page.locator('[data-viewer-phase]')).not.toHaveAttribute(
          'data-viewer-phase',
          'checking',
        );
        await expect
          .poll(() => scripts.withThree(), { message: `${screen} loads the 3D chunk`, timeout: 20_000 })
          .not.toEqual([]);
        return;
      }

      // Keep recording a while, so link prefetches are caught too.
      await page.waitForTimeout(afterLoadMs);
      // Without at least one script the check below would pass vacuously.
      expect(scripts.count(), `scripts loaded by ${screen}`).toBeGreaterThan(0);
      expect(await scripts.withThree(), `scripts on ${screen} that carry the 3D rendering library`).toEqual([]);
    });
  }

  test("font files come from the Site's own origin", async ({ page, baseURL }) => {
    const siteOrigin = siteOriginOf(baseURL);
    const traffic = recordTraffic(page);

    await page.goto('/', { waitUntil: 'load' });
    await page.evaluate(async () => {
      await document.fonts.ready;
    });

    const fontRequests = traffic.requests.filter((request) =>
      new URL(request.url()).pathname.endsWith('.woff2'),
    );
    // Without at least one font request the origin check below would pass vacuously.
    expect(fontRequests.length, 'font files requested on the Home_Screen').toBeGreaterThan(0);

    const foreignFonts = fontRequests
      .filter((request) => new URL(request.url()).origin !== siteOrigin)
      .map(describeRequest);
    expect(foreignFonts, `font files from an origin other than ${siteOrigin}`).toEqual([]);
  });

  test("moving between screens talks only to the Site's own origin with GET or HEAD and sets no cookies", async ({
    page,
    baseURL,
  }) => {
    const siteOrigin = siteOriginOf(baseURL);
    const traffic = recordTraffic(page);
    const homeNavigation = page.getByRole('navigation', { name: en['home.nav.label'], exact: true });
    const backHome = page.getByRole('link', { name: en['common.backHome'], exact: true });

    await page.goto('/', { waitUntil: 'load' });

    for (const id of sectionIds) {
      await homeNavigation.getByRole('link', { name: sectionName(id), exact: true }).click();
      await page.waitForURL(sectionPath(id));
      await expect(page.getByRole('heading', { level: 1, name: sectionName(id), exact: true })).toBeVisible();

      await backHome.click();
      await page.waitForURL('/');
      await expect(homeNavigation).toBeVisible();
    }

    await page.goto('/no-such-page', { waitUntil: 'load' });
    await backHome.click();
    await page.waitForURL('/');
    await expect(homeNavigation).toBeVisible();

    await expectNoBackendTraffic(page, traffic, siteOrigin);
  });
});
