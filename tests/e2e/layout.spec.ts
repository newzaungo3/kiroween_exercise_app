import { expect, test, type Page } from '@playwright/test';

import { locales } from '@/ui/strings';
import { colors } from '@/ui/theme/tokens';

const en = locales.en;

/** The Home_Screen, the five Placeholder_Screens and the not-found screen. */
const screens = ['/', '/exercises', '/stretches', '/routines', '/crypt', '/history', '/no-such-page'];

/** Sample widths covering the fluid (< 768 px) and centred (≥ 768 px) layouts (Requirement 5.7). */
const sampleWidths = [320, 360, 414, 768, 1024, 1440, 1920];

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Opens a screen and waits until its fonts have loaded, so measurements are final. */
async function openScreen(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
}

/** Navigation_Entries of the Home_Navigation, in order. */
function navigationEntries(page: Page) {
  return page.getByRole('navigation', { name: en['home.nav.label'], exact: true }).getByRole('link');
}

async function boxOf(locator: ReturnType<Page['locator']>): Promise<Box> {
  const box = await locator.boundingBox();
  expect(box, 'element should be rendered with a bounding box').not.toBeNull();
  return box as Box;
}

function overlaps(a: Box, b: Box): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

/** Gap between two boxes along whichever axis separates them (0 if they overlap). */
function gapBetween(a: Box, b: Box): number {
  const horizontal = Math.max(b.x - (a.x + a.width), a.x - (b.x + b.width));
  const vertical = Math.max(b.y - (a.y + a.height), a.y - (b.y + b.height));
  return Math.max(horizontal, vertical, 0);
}

/** `#rrggbb` → the `rgb(r, g, b)` form that getComputedStyle reports. */
function hexToRgb(hex: string): string {
  const value = Number.parseInt(hex.slice(1), 16);
  return `rgb(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255})`;
}

async function documentSize(page: Page) {
  return page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    scrollHeight: document.documentElement.scrollHeight,
    clientWidth: document.documentElement.clientWidth,
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
  }));
}

test.describe('Phone-first responsive layout', () => {
  test('on a phone the heading and every Navigation_Entry fit without scrolling', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'phone', 'Requirement 5.1 applies to the Phone_Viewport only');

    await openScreen(page, '/');

    const heading = page.getByRole('heading', { level: 1, name: en['app.name'], exact: true });
    const entries = navigationEntries(page);
    await expect(entries).toHaveCount(5);

    const elements = [heading, ...Array.from({ length: 5 }, (_, index) => entries.nth(index))];
    for (const element of elements) {
      const box = await boxOf(element);
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(360);
      expect(box.y + box.height).toBeLessThanOrEqual(640);
    }

    const size = await documentSize(page);
    expect(size.scrollWidth).toBeLessThanOrEqual(size.innerWidth);
    expect(size.scrollHeight).toBeLessThanOrEqual(size.innerHeight);
  });

  test('200 % text neither clips nor overlaps nor scrolls sideways', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'phone', 'Requirement 5.4 applies to the Phone_Viewport only');

    await openScreen(page, '/');
    await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
    await page.evaluate(async () => {
      await document.fonts.ready;
    });
    expect(
      await page.evaluate(() => getComputedStyle(document.documentElement).fontSize),
    ).toBe('32px');

    const heading = page.getByRole('heading', { level: 1, name: en['app.name'], exact: true });
    const entries = navigationEntries(page);
    await expect(entries).toHaveCount(5);
    const entryList = Array.from({ length: 5 }, (_, index) => entries.nth(index));

    for (const element of [heading, ...entryList]) {
      const metrics = await element.evaluate((node) => {
        const style = getComputedStyle(node);
        return {
          scrollWidth: node.scrollWidth,
          clientWidth: node.clientWidth,
          textOverflow: style.textOverflow,
          text: node.textContent ?? '',
        };
      });
      expect(metrics.scrollWidth, `"${metrics.text}" is clipped`).toBeLessThanOrEqual(
        metrics.clientWidth,
      );
      expect(metrics.textOverflow, `"${metrics.text}" uses an ellipsis`).not.toBe('ellipsis');
    }

    const boxes = await Promise.all(entryList.map((entry) => boxOf(entry)));
    for (let i = 0; i < boxes.length; i += 1) {
      for (let j = i + 1; j < boxes.length; j += 1) {
        expect(
          overlaps(boxes[i] as Box, boxes[j] as Box),
          `Navigation_Entries ${i + 1} and ${j + 1} overlap`,
        ).toBe(false);
      }
    }

    const size = await documentSize(page);
    expect(size.scrollWidth).toBeLessThanOrEqual(size.innerWidth);
  });

  test('on a laptop the content is at most 768 px wide and centred', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'laptop', 'Requirement 5.2 applies to the Laptop_Viewport only');

    const background = hexToRgb(colors.bg);

    for (const path of screens) {
      await openScreen(page, path);

      const main = await boxOf(page.locator('main'));
      const size = await documentSize(page);
      const leftMargin = main.x;
      const rightMargin = size.clientWidth - (main.x + main.width);
      expect(main.width, `${path}: main content width`).toBeLessThanOrEqual(768);
      expect(Math.abs(leftMargin - rightMargin), `${path}: margin difference`).toBeLessThanOrEqual(1);

      const cover = await page.evaluate(() => {
        const html = document.documentElement;
        const rect = html.getBoundingClientRect();
        return {
          htmlBackground: getComputedStyle(html).backgroundColor,
          bodyBackground: getComputedStyle(document.body).backgroundColor,
          htmlWidth: rect.width,
          htmlHeight: rect.height,
          innerWidth: window.innerWidth,
          innerHeight: window.innerHeight,
        };
      });
      expect(cover.innerWidth).toBe(1440);
      expect(cover.innerHeight).toBe(900);
      expect(cover.htmlBackground, `${path}: html background`).toBe(background);
      expect(cover.bodyBackground, `${path}: body background`).toBe(background);
      expect(cover.htmlWidth, `${path}: html width`).toBeGreaterThanOrEqual(size.clientWidth);
      expect(cover.htmlHeight, `${path}: html height`).toBeGreaterThanOrEqual(cover.innerHeight);
    }
  });

  test('every link is at least 44 × 44 px', async ({ page }) => {
    for (const path of screens) {
      await openScreen(page, path);

      const links = page.getByRole('link');
      const count = await links.count();
      expect(count, `${path}: has at least one link`).toBeGreaterThan(0);
      for (let index = 0; index < count; index += 1) {
        const link = links.nth(index);
        const box = await boxOf(link);
        const name = (await link.textContent()) ?? '';
        expect(box.width, `${path}: "${name}" width`).toBeGreaterThanOrEqual(44);
        expect(box.height, `${path}: "${name}" height`).toBeGreaterThanOrEqual(44);
      }
    }
  });

  test('Navigation_Entries are at least 8 px apart', async ({ page }) => {
    await openScreen(page, '/');

    const entries = navigationEntries(page);
    await expect(entries).toHaveCount(5);
    const boxes = await Promise.all(
      Array.from({ length: 5 }, (_, index) => boxOf(entries.nth(index))),
    );
    for (let index = 1; index < boxes.length; index += 1) {
      expect(
        gapBetween(boxes[index - 1] as Box, boxes[index] as Box),
        `gap between Navigation_Entries ${index} and ${index + 1}`,
      ).toBeGreaterThanOrEqual(8);
    }
  });

  test('no screen scrolls sideways from 320 to 1920 px', async ({ page }) => {
    for (const width of sampleWidths) {
      await page.setViewportSize({ width, height: 800 });
      for (const path of screens) {
        await openScreen(page, path);
        const size = await documentSize(page);
        expect(size.scrollWidth, `${path} at ${width} px`).toBeLessThanOrEqual(size.clientWidth);
        expect(size.scrollWidth, `${path} at ${width} px`).toBeLessThanOrEqual(size.innerWidth);
      }
    }
  });

  test('every screen declares a responsive, zoomable viewport', async ({ page }) => {
    for (const path of screens) {
      await page.goto(path);

      const meta = page.locator('meta[name="viewport"]');
      await expect(meta, `${path}: one viewport declaration`).toHaveCount(1);
      const content = (await meta.getAttribute('content')) ?? '';

      const settings = new Map(
        content
          .split(',')
          .map((part) => part.split('=').map((piece) => piece.trim().toLowerCase()))
          .filter((pair): pair is [string, string] => pair.length === 2 && pair[0] !== ''),
      );

      expect(settings.get('width'), `${path}: ${content}`).toBe('device-width');
      expect(Number(settings.get('initial-scale')), `${path}: ${content}`).toBe(1);

      const userScalable = settings.get('user-scalable');
      expect(['no', '0'], `${path}: pinch-zoom is disabled`).not.toContain(userScalable);

      const maximumScale = settings.get('maximum-scale');
      if (maximumScale !== undefined) {
        expect(Number(maximumScale), `${path}: maximum-scale`).toBeGreaterThanOrEqual(5);
      }
    }
  });
});
