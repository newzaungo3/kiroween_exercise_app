import { expect, type Page, type Request, type Response, test } from '@playwright/test';

import { sectionIds, sectionName, sectionPath } from '@/ui/sections';
import { locales } from '@/ui/strings';

const en = locales.en;

/** The Home_Screen, every Placeholder_Screen and the not-found screen. */
const screens = ['/', ...sectionIds.map((id) => sectionPath(id)), '/no-such-page'] as const;

/** How long to keep recording after the page's load event (Requirement 10.4). */
const afterLoadMs = 5_000;

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
