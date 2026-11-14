import { expect, type Page, test } from '@playwright/test';

import { entriesOfKind, exerciseSlugs, routines } from '@/catalog';
import { format, locales } from '@/ui/strings';
import { colors } from '@/ui/theme/tokens';

const en = locales.en;

/**
 * Sections in Home_Navigation order, with the route each Navigation_Entry
 * must lead to (Requirement 3.1) and the screen it serves there. Exercises
 * serves the Exercise_List_Screen, Stretches the Stretch list and Routines the
 * Routine_List_Screen, Crypt the Crypt_Screen and History the History_Screen
 * (Requirements 8.1-8.5 of `happy-path-workout`, 19.3 of `the-crypt`).
 */
const sections = [
  {
    screen: 'exercise-list',
    kind: 'exercise',
    route: '/exercises',
    name: en['section.exercises.name'],
    title: en['section.exercises.title'],
  },
  {
    screen: 'exercise-list',
    kind: 'stretch',
    route: '/stretches',
    name: en['section.stretches.name'],
    title: en['section.stretches.title'],
  },
  {
    screen: 'routine-list',
    route: '/routines',
    name: en['section.routines.name'],
    title: en['section.routines.title'],
  },
  {
    screen: 'crypt',
    route: '/crypt',
    name: en['section.crypt.name'],
    title: en['section.crypt.title'],
  },
  {
    screen: 'history',
    route: '/history',
    name: en['section.history.name'],
    title: en['section.history.title'],
  },
] as const;

type Section = (typeof sections)[number];
type CryptSection = Extract<Section, { readonly screen: 'crypt' }>;
type ExerciseListSection = Extract<Section, { readonly screen: 'exercise-list' }>;

type RoutineListSection = Extract<Section, { readonly screen: 'routine-list' }>;
type HistorySection = Extract<Section, { readonly screen: 'history' }>;

/** The Sections that serve the Crypt_Screen: Crypt. */
const cryptSections = sections.filter(
  (section): section is CryptSection => section.screen === 'crypt',
);

/** Every Exercise_Detail_Screen path, from the Catalog. */
const exerciseDetailRoutes = exerciseSlugs().map((slug) => `/exercises/${slug}`);

/** Every Routine detail and Workout screen path, from the Catalog. */
const routineRoutes = routines.flatMap((routine) => [
  `/routines/${routine.slug}`,
  `/routines/${routine.slug}/workout`,
]);

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Turns a `#rrggbb` token into the `rgb(r, g, b)` form computed styles use. */
function toComputedRgb(hex: string): string {
  const channels = [1, 3, 5].map((start) => Number.parseInt(hex.slice(start, start + 2), 16));
  return `rgb(${channels.join(', ')})`;
}

function homeNavigation(page: Page) {
  return page.getByRole('navigation', { name: en['home.nav.label'], exact: true });
}

/** Checks the URL, the single level-1 heading and the document title of a Section screen. */
async function expectSectionHeadingAndTitle(page: Page, section: Section): Promise<void> {
  expect(new URL(page.url()).pathname).toBe(section.route);

  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
  await expect(
    page.getByRole('heading', { level: 1, name: section.name, exact: true }),
  ).toBeVisible();

  // A Section screen is not the Home_Screen.
  await expect(homeNavigation(page)).toHaveCount(0);

  // After a client-side navigation the App Router sets the document title a
  // moment after the content renders, so wait for it instead of reading once.
  await expect(page).toHaveTitle(section.title);
  expect(await page.title()).toContain(section.name);
}

/**
 * Checks that the page shows the Crypt_Screen of `section`: its h1, its title
 * and the back-home link (the Candy balance and the Viewer have their own specs).
 */
async function expectCryptScreen(page: Page, section: CryptSection): Promise<void> {
  await expectSectionHeadingAndTitle(page, section);

  const backHome = page.getByRole('link', { name: en['common.backHome'], exact: true });
  await expect(backHome).toBeVisible();
  await expect(backHome).toHaveAttribute('href', '/');
}

/**
 * Checks that the page shows the Exercise_List_Screen: its heading, its title
 * and one Exercise_List_Entry per Exercise_Entry, each a link whose accessible
 * name begins with the Spooky_Name (Requirements 3.1, 3.2, 3.3, 3.6).
 */
async function expectExerciseListScreen(page: Page, section: ExerciseListSection): Promise<void> {
  await expectSectionHeadingAndTitle(page, section);

  for (const exercise of entriesOfKind(section.kind)) {
    const spookyName = en[exercise.nameId];
    const entry = page.getByRole('link', { name: new RegExp(`^${escapeRegExp(spookyName)}`) });
    await expect(entry, `Exercise_List_Entry for ${spookyName}`).toHaveCount(1);
    await expect(entry).toBeVisible();
    await expect(entry).toHaveAttribute('href', `${section.route}/${exercise.slug}`);
  }

  const backHome = page.getByRole('link', { name: en['common.backHome'], exact: true });
  await expect(backHome).toBeVisible();
  await expect(backHome).toHaveAttribute('href', '/');
}

/**
 * Checks that the page shows the Routine_List_Screen: its heading, its title
 * and one link per Routine whose accessible name begins with the Routine name
 * and whose href is `/routines/<slug>` (Requirements 8.1-8.5).
 */
async function expectRoutineListScreen(page: Page, section: RoutineListSection): Promise<void> {
  await expectSectionHeadingAndTitle(page, section);

  for (const routine of routines) {
    const routineName = en[routine.nameId];
    const entry = page.getByRole('link', { name: new RegExp(`^${escapeRegExp(routineName)}`) });
    await expect(entry, `Routine link for ${routineName}`).toHaveCount(1);
    await expect(entry).toBeVisible();
    await expect(entry).toHaveAttribute('href', `${section.route}/${routine.slug}`);
  }

  const backHome = page.getByRole('link', { name: en['common.backHome'], exact: true });
  await expect(backHome).toBeVisible();
  await expect(backHome).toHaveAttribute('href', '/');
}

/**
 * Checks that the page shows the History_Screen: its heading, its title, the
 * total line (0: the Welcome gift is not Candy earned) and the empty text.
 */
async function expectHistoryScreen(page: Page, section: HistorySection): Promise<void> {
  await expectSectionHeadingAndTitle(page, section);

  await expect(page.getByText(format('history.total', { candy: '0' }), { exact: true })).toBeVisible();
  await expect(page.getByText(en['history.empty'], { exact: true })).toBeVisible();
}

/** Checks that the page shows the screen `section`'s Navigation_Entry leads to. */
async function expectSectionScreen(page: Page, section: Section): Promise<void> {
  if (section.screen === 'exercise-list') {
    await expectExerciseListScreen(page, section);
  } else if (section.screen === 'routine-list') {
    await expectRoutineListScreen(page, section);
  } else if (section.screen === 'history') {
    await expectHistoryScreen(page, section);
  } else {
    await expectCryptScreen(page, section);
  }
}

test.describe('Navigation', () => {
  test('each Navigation_Entry opens its screen', async ({ page }) => {
    for (const section of sections) {
      await page.goto('/');
      await homeNavigation(page).getByRole('link', { name: section.name, exact: true }).click();
      await page.waitForURL(section.route);
      await expectSectionScreen(page, section);
    }
  });

  // Chromium dispatches Tab and Enter in the phone project too (isMobile and
  // hasTouch do not disable the keyboard), so this test runs in both projects.
  test('Tab moves through the Navigation_Entries in order with a visible focus indicator', async ({
    page,
  }) => {
    await page.goto('/');
    const focusColor = toComputedRgb(colors.focus);

    for (const section of sections) {
      await page.keyboard.press('Tab');
      const entry = homeNavigation(page).getByRole('link', { name: section.name, exact: true });
      await expect(entry).toBeFocused();

      const outline = await entry.evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          style: style.outlineStyle,
          width: Number.parseFloat(style.outlineWidth),
          color: style.outlineColor,
        };
      });
      expect(outline.style, `${section.name} focus outline style`).not.toBe('none');
      expect(outline.width, `${section.name} focus outline width`).toBeGreaterThan(0);
      expect(outline.color, `${section.name} focus outline colour`).toBe(focusColor);
    }
  });

  test('Enter on a focused Navigation_Entry opens its screen', async ({ page }) => {
    for (const [index, section] of sections.entries()) {
      await page.goto('/');
      for (let presses = 0; presses <= index; presses += 1) {
        await page.keyboard.press('Tab');
      }
      await expect(
        homeNavigation(page).getByRole('link', { name: section.name, exact: true }),
      ).toBeFocused();

      await page.keyboard.press('Enter');
      await page.waitForURL(section.route);
      await expectSectionScreen(page, section);
    }
  });

  test('every Section route serves its screen directly and on reload', async ({ page }) => {
    for (const section of sections) {
      const response = await page.goto(section.route);
      expect(response?.status(), `${section.route} status`).toBe(200);
      expect(response?.request().redirectedFrom(), `${section.route} redirect`).toBeNull();
      await expectSectionScreen(page, section);

      const reloaded = await page.reload();
      expect(reloaded?.status(), `${section.route} status after reload`).toBe(200);
      expect(reloaded?.request().redirectedFrom(), `${section.route} redirect after reload`).toBeNull();
      await expectSectionScreen(page, section);
    }
  });

  test('the Crypt_Screen links back to the Home_Screen', async ({ page }) => {
    for (const section of cryptSections) {
      await page.goto(section.route);

      const backHome = page.getByRole('link', { name: en['common.backHome'], exact: true });
      await expect(backHome).toBeVisible();
      await expect(backHome).toHaveAttribute('href', '/');

      await backHome.click();
      await page.waitForURL('/');
      await expect(
        page.getByRole('heading', { level: 1, name: en['app.name'], exact: true }),
      ).toBeVisible();
      await expect(homeNavigation(page)).toBeVisible();
    }
  });

  test('every link leads to a served screen', async ({ page, baseURL }) => {
    // The Home_Screen, every Section screen, every Exercise_Detail_Screen,
    // every Routine detail and Workout screen and the not-found screen.
    const screens = [
      '/',
      ...sections.map((section) => section.route),
      ...exerciseDetailRoutes,
      ...routineRoutes,
      '/no-such-page',
    ];
    const destinations = new Map<string, string>();

    for (const screen of screens) {
      await page.goto(screen);
      const hrefs = await page
        .locator('a[href]')
        .evaluateAll((anchors) => anchors.map((anchor) => anchor.getAttribute('href') ?? ''));
      expect(hrefs.length, `${screen} has at least one link`).toBeGreaterThan(0);
      for (const href of hrefs) {
        const url = new URL(href, baseURL);
        destinations.set(url.href, `${href} (linked from ${screen})`);
      }
    }

    for (const [url, origin] of destinations) {
      const response = await page.goto(url);
      expect(response?.status(), `${origin} status`).toBe(200);
      await expect(page.getByRole('heading', { level: 1 }), `${origin} heading`).toHaveCount(1);
      await expect(
        page.getByRole('heading', { level: 1, name: en['notFound.heading'], exact: true }),
        `${origin} is not the not-found screen`,
      ).toHaveCount(0);
    }
  });
});
