/**
 * Picture helpers for the Viewer's E2E tests: they compare what the 3D scene
 * draws, byte for byte, without looking at the app's internals.
 */
import type { Page } from '@playwright/test';

/**
 * Takes canvas screenshots until two in a row are equal, and returns that
 * picture: the 3D scene after the camera and the Demo_Clip have stopped.
 */
export async function settledPicture(page: Page): Promise<Buffer> {
  // The canvas inside the Viewer_Area, which reports its phase in `data-viewer-phase`.
  const canvas = page.locator('[data-viewer-phase]').locator('canvas');
  let previous = await canvas.screenshot();
  for (let attempt = 0; attempt < 30; attempt += 1) {
    await page.waitForTimeout(250);
    const next = await canvas.screenshot();
    if (next.equals(previous)) return next;
    previous = next;
  }
  throw new Error('the 3D scene kept changing for 7.5 s although the Coach is paused');
}
