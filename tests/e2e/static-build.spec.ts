import { readFileSync } from 'node:fs';
import path from 'node:path';

import { expect, test } from '@playwright/test';

import { sectionIds, sectionPath } from '@/ui/sections';

/**
 * Reads the Next.js build manifests that the webServer's `npm run build` wrote.
 * These are framework output, not a public API: if a Next.js release changes
 * their shape, update this spec or fall back to checking the `○ (Static)`
 * markers in the `next build` output by hand.
 */

/** The subset of `.next/prerender-manifest.json` (version 4, Next.js 16) this spec reads. */
interface PrerenderManifest {
  version: number;
  routes: Record<string, { routeType: string; initialRevalidateSeconds: number | false }>;
  dynamicRoutes: Record<string, unknown>;
}

/** `.next/app-path-routes-manifest.json`: app path (e.g. `/exercises/page`) → route (`/exercises`). */
type AppPathRoutesManifest = Record<string, string>;

// Playwright runs from the Repository root, where the config file and `.next/` live.
const buildDir = path.join(process.cwd(), '.next');

function readManifest<T>(fileName: string): T {
  return JSON.parse(readFileSync(path.join(buildDir, fileName), 'utf8')) as T;
}

/** The Home_Screen, the five Placeholder_Screens and the not-found screen. */
const screenRoutes = ['/', ...sectionIds.map(sectionPath), '/_not-found'];

test.describe('static Build', () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== 'laptop', 'reads build output once; viewport-independent');
  });

  test('the Build prerenders every screen', () => {
    const prerender = readManifest<PrerenderManifest>('prerender-manifest.json');
    const appRoutes = Object.values(readManifest<AppPathRoutesManifest>('app-path-routes-manifest.json'));

    // Every screen is an App Router route and is prerendered as a static page
    // (no revalidation interval, so not ISR).
    for (const route of screenRoutes) {
      expect(appRoutes, `app route ${route}`).toContain(route);
      const entry = prerender.routes[route];
      expect(entry, `prerendered route ${route}`).toBeDefined();
      expect(entry?.routeType, `route type of ${route}`).toBe('page');
      expect(entry?.initialRevalidateSeconds, `revalidation of ${route}`).toBe(false);
    }
  });

  test('the Build lists no route that is server-rendered on demand', () => {
    const prerender = readManifest<PrerenderManifest>('prerender-manifest.json');
    const appRoutes = Object.values(readManifest<AppPathRoutesManifest>('app-path-routes-manifest.json'));

    // A route the Build did not prerender would be rendered on each request.
    // This covers every App Router route, including Next's internal
    // `/_global-error` page and the `/icon.svg` metadata route, which Next.js
    // 16 also prerenders into `prerender-manifest.routes`.
    const onDemand = appRoutes.filter((route) => prerender.routes[route] === undefined);
    expect(onDemand).toEqual([]);

    // Dynamic segments (for example `[id]`) would appear here.
    expect(Object.keys(prerender.dynamicRoutes)).toEqual([]);
  });
});
