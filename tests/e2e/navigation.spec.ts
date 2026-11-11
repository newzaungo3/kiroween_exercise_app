import { expect, type Page, test } from '@playwright/test';

import { exerciseSlugs, exercises } from '@/catalog';
import { locales } from '@/ui/strings';
import { colors } from '@/ui/theme/tokens';

const en = locales.en;

/**
 * Sections in Home_Navigation order, with the route each Navigation_Entry
 * must lead to (Requirement 3.1) and the screen it serves there. Exercises
 * serves the Exercise_List_Screen (ticket 03); the other four still serve a
 * Placeholder_Screen with its Strings_Module message (Requirements 3.3, 3.7
 * of the `spooky-site-skeleton` spec, Requirement 14.2).
 */
const sections = [
  {
    screen: 'exercise-list',
    route: '/exercises',
    name: en['section.exercises.name'],
    title: en['section.exercises.title'],
  },
  {
    screen: 'placeholder',
    route: '/stretches',
    name: en['section.stretches.name'],
    message: en['section.stretches.message'],
    title: en['section.stretches.title'],
  },
  {
    screen: 'placeholder',
    route: '/routines',
    name: en['section.routines.name'],
    message: en['section.routines.message'],
    title: en['section.routines.title'],
  },
  {
    screen: 'placeholder',
    route: '/crypt',
    name: en['section.crypt.name'],
    message: en['section.crypt.message'],
    title: en['section.crypt.title'],
  },
  {
    screen: 'placeholder',
    route: '/history',
    name: en['section.history.name'],
    message: en['section.history.message'],
    title: en['section.history.title'],
  },
] as const;

type Section = (typeof sections)[number];
type PlaceholderSection = Extract<Section, { readonly screen: 'placeholder' }>;
type ExerciseListSection = Extract<Section, { readonly screen: 'exercise-list' }>;

/** The Sections that still serve a Placeholder_Screen: Stretches, Routines, Crypt and History. */
const placeholderSections = sections.filter(
  (section): section is PlaceholderSection => section.screen === 'placeholder',
);

/** Every Exercise_Detail_Screen path, from the Catalog. */
const exerciseDetailRoutes = exerciseSlugs().map((slug) => `/exercises/${slug}`);

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

/** Checks that the page shows the Placeholder_Screen of `section` (Requirements 3.3, 3.7). */
async function expectPlaceholderScreen(page: Page, section: PlaceholderSection): Promise<void> {
  await expectSectionHeadingAndTitle(page, section);

  const heading = page.getByRole('heading', { level: 1, name: section.name, exact: true });
  const message = heading.locator('xpath=following-sibling::*[1]');
  await expect(message).toHaveText(section.message);
  await expect(message).toBeVisible();
}

/**
 * Checks that the page shows the Exercise_List_Screen: its heading, its title
 * and one Exercise_List_Entry per Exercise_Entry, each a link whose accessible
 * name begins with the Spooky_Name (Requirements 3.1, 3.2, 3.3, 3.6).
 */
async function expectExerciseListScreen(page: Page, section: ExerciseListSection): Promise<void> {
  await expectSectionHeadingAndTitle(page, section);

  for (const exercise of exercises) {
    const spookyName = en[exercise.nameId];
    const entry = page.getByRole('link', { name: new RegExp(`^${escapeRegExp(spookyName)}`) });
    await expect(entry, `Exercise_List_Entry for ${spookyName}`).toHaveCount(1);
    await expect(entry).toBeVisible();
    await expect(entry).toHaveAttribute('href', `/exercises/${exercise.slug}`);
  }
}

/** Checks that the page shows the screen `section`'s Navigation_Entry leads to. */
async function expectSectionScreen(page: Page, section: Section): Promise<void> {
  if (section.screen === 'exercise-list') {
    await expectExerciseListScreen(page, section);
  } else {
    await expectPlaceholderScreen(page, section);
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

  test('every Placeholder_Screen links back to the Home_Screen', async ({ page }) => {
    for (const section of placeholderSections) {
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
    // The Home_Screen, the Exercise_List_Screen, every Exercise_Detail_Screen,
    // every Placeholder_Screen and the not-found screen.
    const screens = [
      '/',
      ...sections.map((section) => section.route),
      ...exerciseDetailRoutes,
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
