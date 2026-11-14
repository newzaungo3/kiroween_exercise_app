import { expect, test, type Page } from '@playwright/test';

import { colors } from '@/ui/theme/tokens';

import { screens } from './support/screens';

/** Turns a `#rrggbb` token into the `rgb(r, g, b)` form of computed styles. */
function toRgb(hex: string): string {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!match) throw new Error(`Not a #rrggbb colour: ${hex}`);
  const [r, g, b] = match.slice(1).map((part) => Number.parseInt(part, 16));
  return `rgb(${r}, ${g}, ${b})`;
}

/** First family of a CSS font-family list, without quotes. */
function firstFamily(fontFamily: string): string {
  const first = fontFamily.split(',')[0] ?? '';
  return first.trim().replace(/^["']|["']$/g, '');
}

type ScreenFonts = {
  readonly htmlBackground: string;
  readonly displayVariable: string;
  readonly bodyVariable: string;
  readonly headingFamily: string;
  /** Font family and size of every non-heading text element in `<main>`. */
  readonly bodyText: ReadonlyArray<{ text: string; family: string; sizePx: number }>;
};

async function readScreenFonts(page: Page): Promise<ScreenFonts> {
  return page.evaluate(() => {
    const root = getComputedStyle(document.documentElement);
    const heading = document.querySelector('main h1');
    if (!heading) throw new Error('No level-1 heading in <main>');
    const bodyText = Array.from(document.querySelectorAll('main p, main a')).map((element) => {
      const style = getComputedStyle(element);
      return {
        text: element.textContent ?? '',
        family: style.fontFamily,
        sizePx: Number.parseFloat(style.fontSize),
      };
    });
    return {
      htmlBackground: root.backgroundColor,
      displayVariable: root.getPropertyValue('--font-display'),
      bodyVariable: root.getPropertyValue('--font-body'),
      headingFamily: getComputedStyle(heading).fontFamily,
      bodyText,
    };
  });
}

test.describe('Halloween_Theme', () => {
  test('every screen shares the Halloween_Theme background and display font', async ({ page }) => {
    const headingFamilies = new Set<string>();

    for (const path of screens) {
      await page.goto(path);
      const fonts = await readScreenFonts(page);

      expect(fonts.htmlBackground, `background on ${path}`).toBe(toRgb(colors.bg));
      expect(firstFamily(fonts.displayVariable), `--font-display on ${path}`).not.toBe('');
      expect(firstFamily(fonts.headingFamily), `heading font on ${path}`).toBe(
        firstFamily(fonts.displayVariable),
      );
      headingFamilies.add(firstFamily(fonts.headingFamily));
    }

    expect([...headingFamilies]).toHaveLength(1);
  });

  test('headings use the display font and body text is at least 16 px', async ({ page }) => {
    for (const path of screens) {
      await page.goto(path);
      const fonts = await readScreenFonts(page);
      const display = firstFamily(fonts.displayVariable);
      const body = firstFamily(fonts.bodyVariable);

      expect(body, `--font-body on ${path}`).not.toBe('');
      expect(body, `body font differs from display font on ${path}`).not.toBe(display);
      expect(firstFamily(fonts.headingFamily), `heading font on ${path}`).toBe(display);

      // Tagline and Navigation_Entries on the Home_Screen; back-home link
      // on the Crypt_Screen and the not-found screen;
      // Exercise_List_Entries and the back-home link on the
      // Exercise_List_Screen; back link, live region and Safety_Message on
      // the Exercise_Detail_Screen.
      expect(fonts.bodyText.length, `body text elements on ${path}`).toBeGreaterThanOrEqual(2);
      for (const element of fonts.bodyText) {
        expect(firstFamily(element.family), `font of "${element.text}" on ${path}`).toBe(body);
        expect(element.sizePx, `size of "${element.text}" on ${path}`).toBeGreaterThanOrEqual(16);
      }
    }
  });

  test('an orange and a purple element are visible on the Home_Screen', async ({ page }) => {
    await page.goto('/');

    const coloured = await page.locator('main *').evaluateAll((elements) =>
      elements
        .filter((element) => {
          const rect = element.getBoundingClientRect();
          const style = getComputedStyle(element);
          return rect.width > 0 && rect.height > 0 && style.visibility === 'visible';
        })
        .map((element) => {
          const style = getComputedStyle(element);
          return { color: style.color, borderColor: style.borderTopColor };
        }),
    );

    const orange = toRgb(colors.orange);
    const purple = toRgb(colors.purple);
    expect(coloured.some((style) => style.color === orange || style.borderColor === orange)).toBe(
      true,
    );
    expect(coloured.some((style) => style.color === purple || style.borderColor === purple)).toBe(
      true,
    );
  });

  test('text stays visible when fonts fail to load', async ({ page }) => {
    await page.route('**/*.woff2', (route) => route.abort());
    await page.goto('/');

    const textElements = [
      page.getByRole('heading', { level: 1 }),
      // Ticket 08 added Candy balance paragraphs to Home; check every paragraph.
      ...(await page.locator('main p').all()),
      ...(await page.getByRole('navigation').getByRole('link').all()),
    ];
    expect(textElements.length).toBeGreaterThanOrEqual(7);

    for (const element of textElements) {
      await expect(element).toBeVisible();
      await expect(element).not.toHaveText('');
      const box = await element.boundingBox();
      expect(box?.width ?? 0).toBeGreaterThan(0);
      expect(box?.height ?? 0).toBeGreaterThan(0);
    }
  });
});

test.describe('Halloween_Theme with JavaScript disabled', () => {
  test.use({ javaScriptEnabled: false });

  test('the background is dark with JavaScript disabled', async ({ page }) => {
    for (const path of screens) {
      await page.goto(path);
      const background = await page.evaluate(
        () => getComputedStyle(document.documentElement).backgroundColor,
      );
      expect(background, `background on ${path}`).toBe(toRgb(colors.bg));
    }
  });
});

test.describe('Halloween_Theme with reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('Decorations stay still with reduced motion', async ({ page }) => {
    await page.goto('/');

    const decorations = page.locator('[data-decoration]');
    const bats = page.locator('[data-decoration="bat"]');
    await expect(bats.first()).toBeAttached();
    expect(await bats.count()).toBeGreaterThanOrEqual(1);

    const motion = await decorations.evaluateAll((elements) =>
      elements.map((element) => {
        const style = getComputedStyle(element);
        return {
          decoration: element.getAttribute('data-decoration'),
          animationName: style.animationName,
          transitionDurations: style.transitionDuration.split(',').map((d) => d.trim()),
        };
      }),
    );
    for (const decoration of motion) {
      expect(decoration.animationName, `${decoration.decoration} animation`).toBe('none');
      for (const duration of decoration.transitionDurations) {
        expect(duration, `${decoration.decoration} transition`).toBe('0s');
      }
    }

    const readBoxes = () =>
      decorations.evaluateAll((elements) =>
        elements.map((element) => {
          const rect = element.getBoundingClientRect();
          return [rect.x, rect.y, rect.width, rect.height];
        }),
      );
    const before = await readBoxes();
    await page.waitForTimeout(1_000);
    const after = await readBoxes();
    expect(after).toEqual(before);
  });
});
