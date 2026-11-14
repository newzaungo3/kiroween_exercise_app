/**
 * Helpers for the Progress_Store's one `localStorage` key and for the Candy
 * balance and History entries on screen. Names come from the English Locale.
 */
import type { Locator, Page } from '@playwright/test';

import { findRoutine } from '@/catalog';
import { storageKey } from '@/progress-store';
import type { WorkoutRecord } from '@/progress-store';
import { checkpointOf, confirmSet, skipRest, startWorkout } from '@/workout-engine';
import type { WorkoutCheckpoint } from '@/workout-engine';
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

/**
 * Stores a Progress_Store text of schema version 2 holding `checkpoint`
 * before the page loads. Set only when the key is not already set.
 */
export async function seedCheckpoint(
  page: Page,
  checkpoint: WorkoutCheckpoint,
  candy = 0,
  history: readonly WorkoutRecord[] = [],
): Promise<void> {
  await seedProgress(
    page,
    JSON.stringify({
      schemaVersion: 2,
      candy,
      welcomeGiftGranted: true,
      history,
      checkpoint,
    }),
  );
}

/**
 * Stores a version 1 Progress_Store text (no `checkpoint` member) before the
 * page loads. Set only when the key is not already set.
 */
export async function seedVersion1(
  page: Page,
  candy: number,
  history: readonly WorkoutRecord[],
): Promise<void> {
  await seedProgress(
    page,
    JSON.stringify({ schemaVersion: 1, candy, welcomeGiftGranted: true, history }),
  );
}

/** The stored `checkpoint` member, or null when none is stored. */
export async function readCheckpoint(page: Page): Promise<unknown> {
  const stored = await readProgress(page);
  if (typeof stored !== 'object' || stored === null) return null;
  const checkpoint = (stored as { checkpoint?: unknown }).checkpoint;
  return checkpoint === undefined ? null : checkpoint;
}

/** Reloads the page, as a refresh mid-Workout, and waits for the load event. */
export async function reloadMidWorkout(page: Page): Promise<void> {
  await page.reload({ waitUntil: 'load' });
}

/** The Resume_Prompt: the region labelled by its heading. */
export function resumePrompt(page: Page): Locator {
  return page.getByRole('region', { name: en['resume.heading'] });
}

/** The Resume button of the Resume_Prompt. */
export function resumeButton(page: Page): Locator {
  return page.getByRole('button', { name: en['resume.resume'] });
}

/** The Discard button of the Resume_Prompt. */
export function discardButton(page: Page): Locator {
  return page.getByRole('button', { name: en['resume.discard'] });
}

/** The Paused_Panel shown for a restored Workout. */
export function restoredPausedPanel(page: Page): Locator {
  return page.getByRole('region', { name: en['workout.paused.heading'] });
}

/**
 * A plain JSON checkpoint of a Workout of the Routine "graveyard-shift":
 * started at clock 0, then `confirmedSets` Sets confirmed one second apart.
 * The Workout is resting after the last confirmed Set. For seeding.
 */
export function graveyardShiftCheckpoint(confirmedSets = 1): WorkoutCheckpoint {
  const routine = findRoutine('graveyard-shift');
  if (routine === undefined) throw new Error('The Catalog has no Routine "graveyard-shift".');
  let workout = startWorkout(routine, 0);
  for (let i = 1; i <= confirmedSets; i += 1) {
    workout = confirmSet(workout, i * 1000);
    // A Set is confirmed only while exercising: end the Rest before the next one.
    if (i < confirmedSets) workout = skipRest(workout, i * 1000 + 500);
  }
  const checkpoint = checkpointOf(workout);
  if (checkpoint === null) throw new Error('The Workout is already at the summary.');
  return JSON.parse(JSON.stringify(checkpoint)) as WorkoutCheckpoint;
}
