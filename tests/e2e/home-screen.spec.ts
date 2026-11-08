import { expect, test } from '@playwright/test';

import { locales } from '@/ui/strings';

const en = locales.en;

/** Navigation_Entry labels in Home_Navigation order (Requirement 2.3). */
const sectionNames = [
  en['section.exercises.name'],
  en['section.stretches.name'],
  en['section.routines.name'],
  en['section.crypt.name'],
  en['section.history.name'],
];

test.describe('Home_Screen', () => {
  test('the Home_Screen shows the app name and the five Navigation_Entries in order', async ({
    page,
  }) => {
    await page.goto('/');

    const heading = page.getByRole('heading', { level: 1 });
    await expect(heading).toHaveCount(1);
    await expect(
      page.getByRole('heading', { level: 1, name: en['app.name'], exact: true }),
    ).toBeVisible();

    const homeNavigation = page.getByRole('navigation', {
      name: en['home.nav.label'],
      exact: true,
    });
    await expect(homeNavigation).toBeVisible();

    const entries = homeNavigation.getByRole('link');
    await expect(entries).toHaveCount(sectionNames.length);
    for (const [index, name] of sectionNames.entries()) {
      const entry = entries.nth(index);
      await expect(entry).toBeVisible();
      await expect(entry).toHaveAccessibleName(name);
      await expect(homeNavigation.getByRole('link', { name, exact: true })).toBeVisible();
    }
  });

  test('the Home_Screen has one navigation landmark, an English lang and the app name in its title', async ({
    page,
  }) => {
    await page.goto('/');

    await expect(page.getByRole('navigation')).toHaveCount(1);
    await expect(page.getByRole('navigation')).toHaveAccessibleName(en['home.nav.label']);
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');

    const title = await page.title();
    expect(title).toBe(en['home.title']);
    expect(title).toContain(en['app.name']);
  });

  test('the tagline follows the heading', async ({ page }) => {
    await page.goto('/');

    const heading = page.getByRole('heading', { level: 1, name: en['app.name'], exact: true });
    const nextInReadingOrder = heading.locator('xpath=following-sibling::*[1]');
    await expect(nextInReadingOrder).toHaveText(en['home.tagline']);
    await expect(page.getByText(en['home.tagline'], { exact: true })).toBeVisible();
  });

  test('the visitor lands on the Home_Screen with no sign-up', async ({ page }) => {
    const response = await page.goto('/');

    expect(response?.status()).toBe(200);
    expect(response?.request().redirectedFrom()).toBeNull();
    expect(new URL(page.url()).pathname).toBe('/');

    await expect(
      page.getByRole('heading', { level: 1, name: en['app.name'], exact: true }),
    ).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    await expect(page.locator('form')).toHaveCount(0);
  });
});
