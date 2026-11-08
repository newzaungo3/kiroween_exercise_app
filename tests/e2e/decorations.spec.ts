import { expect, test, type Page } from '@playwright/test';

import { sectionIds, sectionPath } from '@/ui/sections';

/** Every screen of the Site: the Home_Screen, the five Placeholder_Screens and the not-found screen. */
const screens: readonly string[] = ['/', ...sectionIds.map(sectionPath), '/no-such-page'];

/** Selects every Decoration (bats and cobwebs). */
const decorationSelector = '[data-decoration]';

/** Number of geometry samples per screen, taken while the bats drift. */
const geometrySamples = 4;
/** Pause between geometry samples, in ms. A bat drift cycle is at least 4 s. */
const sampleIntervalMs = 700;

type Box = { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
type NamedBox = Box & { readonly label: string };

/** Opens a screen and waits until its fonts have settled, so the layout is final. */
async function openScreen(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
}

/** True when two boxes share any area (touching edges do not count). */
function intersects(a: Box, b: Box): boolean {
  return (
    a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
  );
}

/**
 * Takes one consistent snapshot of every Decoration box and every box it must
 * not cover: page headings and links (on the Home_Screen the links are the
 * Navigation_Entries; elsewhere they are the links back home).
 */
async function snapshotBoxes(
  page: Page,
): Promise<{ decorations: NamedBox[]; targets: NamedBox[] }> {
  return page.evaluate((selector) => {
    const toBox = (element: Element, label: string) => {
      const rect = element.getBoundingClientRect();
      return { label, x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    };
    const decorations = Array.from(document.querySelectorAll(selector)).map((element, index) =>
      toBox(element, `${element.getAttribute('data-decoration') ?? 'decoration'} #${index}`),
    );
    const targets = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6, a')).map(
      (element) => toBox(element, `<${element.tagName.toLowerCase()}> "${element.textContent ?? ''}"`),
    );
    return { decorations, targets };
  }, decorationSelector);
}

test.describe('Decorations', () => {
  test('the Home_Screen shows a bat and a cobweb', async ({ page }) => {
    await openScreen(page, '/');

    await expect(page.locator('[data-decoration="bat"]').first()).toBeVisible();
    await expect(page.locator('[data-decoration="cobweb"]').first()).toBeVisible();
  });

  test('Decorations are hidden from assistive technology', async ({ page }) => {
    await openScreen(page, '/');

    const decorations = page.locator(decorationSelector);
    expect(await decorations.count()).toBeGreaterThan(0);

    const withoutHiddenAncestor = await decorations.evaluateAll((elements) =>
      elements
        .filter((element) => element.closest('[aria-hidden="true"]') === null)
        .map((element) => element.outerHTML.slice(0, 80)),
    );
    expect(withoutHiddenAncestor).toEqual([]);

    // The accessibility tree exposes no image or graphic: the Decorations are
    // the only SVGs on the screen.
    const tree = await page.locator('body').ariaSnapshot();
    expect(tree).not.toMatch(/^\s*- (img|graphics-\w+|graphic)\b/m);
    await expect(page.getByRole('img')).toHaveCount(0);
  });

  test('Decorations stay outside the keyboard focus order', async ({ page }) => {
    await openScreen(page, '/');

    const focusAttributes = await page.locator(decorationSelector).evaluateAll((elements) =>
      elements.map((element) => ({
        focusable: element.getAttribute('focusable'),
        tabindex: element.getAttribute('tabindex'),
        focusableChildren: element.querySelectorAll('a, button, input, [tabindex]').length,
      })),
    );
    expect(focusAttributes.length).toBeGreaterThan(0);
    for (const attributes of focusAttributes) {
      expect(attributes).toEqual({ focusable: 'false', tabindex: null, focusableChildren: 0 });
    }

    // Tab through every focusable element and one step past the end.
    const tabStops = (await page.locator('a, button, input, select, textarea, [tabindex]').count()) + 2;
    const focusedLinks: string[] = [];
    for (let step = 0; step < tabStops; step += 1) {
      await page.keyboard.press('Tab');
      const focused = await page.evaluate((selector) => {
        const active = document.activeElement;
        if (active === null || active === document.body) {
          return { inDecoration: false, link: null };
        }
        return {
          inDecoration:
            active.closest(selector) !== null ||
            active.closest('[aria-hidden="true"]') !== null,
          link: active.tagName === 'A' ? (active.textContent ?? '') : null,
        };
      }, decorationSelector);
      expect(focused.inDecoration).toBe(false);
      if (focused.link !== null) {
        focusedLinks.push(focused.link);
      }
    }
    // Guard against a vacuous pass: Tab did reach the Navigation_Entries.
    expect(focusedLinks.length).toBeGreaterThan(0);
  });

  test('Decorations take no taps', async ({ page }) => {
    await openScreen(page, '/');

    const hits = await page.locator(decorationSelector).evaluateAll((elements, selector) =>
      elements.map((element) => {
        const rect = element.getBoundingClientRect();
        const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
        return {
          pointerEvents: getComputedStyle(element).pointerEvents,
          hitIsDecoration: hit !== null && hit.closest(selector) !== null,
        };
      }),
      decorationSelector,
    );
    expect(hits.length).toBeGreaterThan(0);
    for (const hit of hits) {
      expect(hit).toEqual({ pointerEvents: 'none', hitIsDecoration: false });
    }
  });

  for (const path of screens) {
    test(`Decorations cover no heading or Navigation_Entry: ${path}`, async ({ page }) => {
      await openScreen(page, path);

      const overlaps = new Set<string>();
      for (let sample = 0; sample < geometrySamples; sample += 1) {
        if (sample > 0) {
          // The bats drift; sampling at several moments checks more than one
          // animation position.
          await page.waitForTimeout(sampleIntervalMs);
        }
        const { decorations, targets } = await snapshotBoxes(page);
        // Guard against a vacuous pass.
        expect(decorations.length).toBeGreaterThan(0);
        expect(targets.length).toBeGreaterThan(0);
        for (const decoration of decorations) {
          for (const target of targets) {
            if (intersects(decoration, target)) {
              overlaps.add(`${decoration.label} covers ${target.label}`);
            }
          }
        }
      }
      expect([...overlaps]).toEqual([]);
    });
  }
});
