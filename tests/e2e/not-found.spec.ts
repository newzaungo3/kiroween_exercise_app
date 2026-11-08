import { expect, test, type Page } from '@playwright/test';

import { locales } from '@/ui/strings';
import { colors } from '@/ui/theme/tokens';

const en = locales.en;

/** Paths the Site does not serve, including one nested under a Section route. */
const unknownPaths = ['/no-such-page', '/exercises/unknown'];

/** Converts a `#rrggbb` token to the `rgb(r, g, b)` form browsers report. */
function hexToRgb(hex: string): string {
  const value = Number.parseInt(hex.slice(1), 16);
  return `rgb(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255})`;
}

/** The computed font-family of the Home_Screen's level-1 heading (the display font). */
async function homeHeadingFontFamily(page: Page): Promise<string> {
  await page.goto('/');
  return page
    .getByRole('heading', { level: 1, name: en['app.name'], exact: true })
    .evaluate((element) => getComputedStyle(element).fontFamily);
}

test.describe('not-found screen', () => {
  for (const path of unknownPaths) {
    test(`an unknown path shows the themed not-found screen with HTTP 404: ${path}`, async ({
      page,
    }) => {
      const displayFontFamily = await homeHeadingFontFamily(page);

      const response = await page.goto(path);
      expect(response?.status()).toBe(404);
      expect(new URL(page.url()).pathname).toBe(path);

      const heading = page.getByRole('heading', {
        level: 1,
        name: en['notFound.heading'],
        exact: true,
      });
      await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
      await expect(heading).toBeVisible();
      await expect(page.getByText(en['notFound.message'], { exact: true })).toBeVisible();

      const homeLink = page.getByRole('link', { name: en['common.backHome'], exact: true });
      await expect(homeLink).toBeVisible();
      await expect(homeLink).toHaveAttribute('href', '/');

      // Halloween_Theme: the dark background token, the display font on the
      // heading (same family as the Home_Screen heading) and an accent token.
      await expect(page.locator('html')).toHaveCSS('background-color', hexToRgb(colors.bg));
      await expect(heading).toHaveCSS('font-family', displayFontFamily);
      const accents = [hexToRgb(colors.orange), hexToRgb(colors.purple)];
      const linkColor = await homeLink.evaluate((element) => getComputedStyle(element).color);
      expect(accents).toContain(linkColor);

      await homeLink.click();
      await expect(page).toHaveURL('/');
      await expect(
        page.getByRole('heading', { level: 1, name: en['app.name'], exact: true }),
      ).toBeVisible();
    });
  }
});
