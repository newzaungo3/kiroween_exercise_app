/**
 * Helpers for the Progress_Store's one `localStorage` key and for the Candy
 * balance and History entries on screen. Names come from the English Locale.
 */
import type { Locator, Page } from '@playwright/test';

import { storageKey } from '@/progress-store';
import { locales } from '@/ui/strings';

const en = locales.en;

/** Escapes text for use inside a regular expression. */
function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Reads the stored text under the Progress_Store key and parses it as JSON.
 * Returns null when nothing is stored. Throws when the text is not JSON.
 */
export async function readProgress(page: Page): Promise<unknown> {
  const text = await page.evaluate((key) => window.localStorage.getItem(key), storageKey);
  return text === null ? null : (JSON.parse(text) as unknown);
}

/** Reads the raw stored text under the key, or null. */
export async function readProgressText(page: Page): Promise<string | null> {
  return page.evaluate((key) => window.localStorage.getItem(key), storageKey);
}

/**
 * Stores `text` under the key before the page loads. The key is set only
 * when it is not already set, so a reload keeps the progress made since.
 */
export async function seedProgress(page: Page, text: string): Promise<void> {
  await page.addInitScript(
    ({ key, value }) => {
      if (window.localStorage.getItem(key) === null) {
        window.localStorage.setItem(key, value);
      }
    },
    { key: storageKey, value: text },
  );
}

/** Makes every `Storage.prototype.setItem` call throw, as a full or blocked store would. */
export async function blockStorageWrites(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Storage.prototype.setItem = () => {
      throw new DOMException('Storage writes are blocked.', 'QuotaExceededError');
    };
  });
}

/** The Home_Screen line "Candy balance: N". Read its text or match a number. */
export function homeBalance(page: Page): Locator {
  const [before = '', after = ''] = en['home.candy.balance'].split('{candy}');
  return page.getByText(new RegExp(`^${escapeRegExp(before)}\\d+${escapeRegExp(after)}$`));
}

/** The items of the History_Screen's list, newest first. */
export function historyEntries(page: Page): Locator {
  return page.getByRole('list', { name: en['history.list.label'] }).getByRole('listitem');
}
