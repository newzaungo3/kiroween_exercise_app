import { readFileSync } from 'node:fs';
import path from 'node:path';

import { expect, test } from '@playwright/test';

import { entries, routines } from '@/catalog';
import { exercisePath } from '@/ui/exercises/labels';
import { routinePath } from '@/ui/routines/labels';
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
  routes: Record<
    string,
    {
      routeType: string;
      initialRevalidateSeconds: number | false;
      /** The App Router route that produced this page, e.g. `/exercises/[slug]`. */
      srcRoute: string | null;
    }
  >;
  /**
   * Dynamic segments such as `/exercises/[slug]`. With `dynamicParams = false`
   * Next.js records `fallback: false`: only the prerendered params are served
   * and any other segment returns 404. A string (fallback page) or `null`
   * (blocking) would mean unknown params are rendered on demand.
   */
  dynamicRoutes: Record<string, { fallback: string | false | null }>;
}

/** `.next/app-path-routes-manifest.json`: app path (e.g. `/exercises/page`) → route (`/exercises`). */
type AppPathRoutesManifest = Record<string, string>;

// Playwright runs from the Repository root, where the config file and `.next/` live.
const buildDir = path.join(process.cwd(), '.next');

function readManifest<T>(fileName: string): T {
  return JSON.parse(readFileSync(path.join(buildDir, fileName), 'utf8')) as T;
}

/** The Exercise_Detail_Screen of every Catalog entry of both Kinds: its path and the App Router route that serves it. */
const exerciseDetails = entries.map((entry) => ({
  path: exercisePath(entry),
  srcRoute: entry.kind === 'stretch' ? '/stretches/[slug]' : '/exercises/[slug]',
}));

/** The path of every Exercise_Detail_Screen, one per Catalog entry. */
const exerciseDetailRoutes: string[] = exerciseDetails.map((detail) => detail.path);

/** The Routine detail screen of every Catalog Routine. */
const routineDetailRoutes: string[] = routines.map((routine) => routinePath(routine));

/** The Workout screen of every Catalog Routine. */
const routineWorkoutRoutes: string[] = routines.map((routine) => `${routinePath(routine)}/workout`);

/** The pages each dynamic App Router route may prerender: exactly the Catalog's pages for that route. */
const expectedPagesBySrcRoute: Record<string, string[]> = {
  '/exercises/[slug]': exerciseDetails.filter((d) => d.srcRoute === '/exercises/[slug]').map((d) => d.path),
  '/stretches/[slug]': exerciseDetails.filter((d) => d.srcRoute === '/stretches/[slug]').map((d) => d.path),
  '/routines/[slug]': routineDetailRoutes,
  '/routines/[slug]/workout': routineWorkoutRoutes,
};

/**
 * The Home_Screen, the Section screens (the two list screens and the three
 * Placeholder_Screens), every Exercise_Detail_Screen, every Routine detail and
 * Workout screen, and the not-found screen.
 */
const screenRoutes = [
  '/',
  ...sectionIds.map(sectionPath),
  ...exerciseDetailRoutes,
  ...routineDetailRoutes,
  ...routineWorkoutRoutes,
  '/_not-found',
];

test.describe('static Build', () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== 'laptop', 'reads build output once; viewport-independent');
  });

  test('the Build prerenders every screen', () => {
    const prerender = readManifest<PrerenderManifest>('prerender-manifest.json');
    const appRoutes = Object.values(readManifest<AppPathRoutesManifest>('app-path-routes-manifest.json'));

    // Every screen is prerendered as a static page (no revalidation interval,
    // so not ISR) from an App Router route. For an Exercise_Detail_Screen that
    // route is the dynamic `/exercises/[slug]`, recorded as `srcRoute`.
    for (const route of screenRoutes) {
      const entry = prerender.routes[route];
      expect(entry, `prerendered route ${route}`).toBeDefined();
      expect(entry?.routeType, `route type of ${route}`).toBe('page');
      expect(entry?.initialRevalidateSeconds, `revalidation of ${route}`).toBe(false);
      expect(appRoutes, `app route that produced ${route}`).toContain(entry?.srcRoute);
    }
  });

  test('the Build lists no route that is server-rendered on demand', () => {
    const prerender = readManifest<PrerenderManifest>('prerender-manifest.json');
    const appRoutes = Object.values(readManifest<AppPathRoutesManifest>('app-path-routes-manifest.json'));

    // A dynamic route counts as static only when unknown params return 404
    // (`dynamicParams = false` → `fallback: false`) and are never rendered on
    // demand (Requirement 14.1).
    for (const [route, entry] of Object.entries(prerender.dynamicRoutes)) {
      expect(entry.fallback, `fallback of dynamic route ${route}`).toBe(false);
    }

    // A route the Build did not prerender would be rendered on each request,
    // unless it is such a dynamic route. This covers every App Router route,
    // including Next's internal `/_global-error` page and the `/icon.svg`
    // metadata route, which Next.js 16 also prerenders into
    // `prerender-manifest.routes`.
    const staticDynamicRoutes = Object.entries(prerender.dynamicRoutes)
      .filter(([, entry]) => entry.fallback === false)
      .map(([route]) => route);
    const onDemand = appRoutes.filter(
      (route) => prerender.routes[route] === undefined && !staticDynamicRoutes.includes(route),
    );
    expect(onDemand).toEqual([]);

    // Every page a dynamic route prerendered is a Catalog page of that route
    // (an Exercise_Detail_Screen, a Routine detail or a Routine Workout
    // screen), and every Catalog entry was prerendered from the route of its
    // Kind (`/exercises/[slug]` or `/stretches/[slug]`).
    for (const route of Object.keys(prerender.dynamicRoutes)) {
      const expected = expectedPagesBySrcRoute[route];
      expect(expected, `dynamic route ${route} is a known Catalog route`).toBeDefined();
      const pages = Object.entries(prerender.routes)
        .filter(([, entry]) => entry.srcRoute === route)
        .map(([page]) => page);
      for (const page of pages) {
        expect(expected, `page ${page} prerendered from ${route}`).toContain(page);
      }
    }
    for (const detail of exerciseDetails) {
      expect(prerender.routes[detail.path]?.srcRoute, `source route of ${detail.path}`).toBe(detail.srcRoute);
    }
  });
});
