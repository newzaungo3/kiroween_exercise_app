/**
 * Candy and History: the Welcome gift, the Candy_Balance on the Home_Screen,
 * the recording of a Workout at its summary and the History_Screen.
 *
 * The Workout_Screen reads `performance.now()`, so the clock is installed
 * before `goto` and driven with `page.clock`. Time zone UTC makes the date
 * text of History entries predictable. Reduced motion keeps the Coach paused.
 */
import { expect, type Locator, type Page, test } from '@playwright/test';

import { findEntryById, findRoutine, type RoutineEntry } from '@/catalog';
import { schemaVersion, storageKey, welcomeGiftCandy } from '@/progress-store';
import { formatWorkoutDate } from '@/ui/history/date';
import { routineName } from '@/ui/routines/labels';
import { format, locales } from '@/ui/strings';
import { colors } from '@/ui/theme/tokens';
import { buildSetSlots, candyPerSet, completionBonus } from '@/workout-engine';

import {
  blockStorageWrites,
  historyEntries,
  homeBalance,
  readProgress,
  readProgressText,
  seedProgress,
} from './support/progress';
import {
  completeWorkout,
  confirmCurrentSet,
  openPreparing,
  quitWorkout,
  startWorkout,
} from './support/workout';

const en = locales.en;

const routine: RoutineEntry = (() => {
  const found = findRoutine('graveyard-shift');
  if (found === undefined) throw new Error('The Catalog has no Routine "graveyard-shift".');
  return found;
})();
const slots = buildSetSlots(routine);
const totalSets = slots.length;
const fullCandy = totalSets * candyPerSet + completionBonus; // 14
const skippedCandy = (totalSets - 1) * candyPerSet; // 8
const quitCandy = 3 * candyPerSet; // 3
const marginMs = 1_000;

const fixedTime = new Date('2026-11-20T10:00:00Z');

test.describe.configure({ timeout: 180_000 });
test.use({ timezoneId: 'UTC', reducedMotion: 'reduce' });

// --- helpers ---------------------------------------------------------------

const balanceText = (candy: number) => format('home.candy.balance', { candy: String(candy) });
const giftText = format('home.candy.welcome', { candy: String(welcomeGiftCandy) });
const outcomeText = (key: 'completed' | 'partial' | 'abandoned') =>
  format('summary.outcome', { outcome: en[`summary.outcome.${key}`] });

async function installClock(page: Page): Promise<void> {
  await page.clock.install({ time: fixedTime });
}

async function goHome(page: Page): Promise<void> {
  await page.goto('/');
  await expect(homeBalance(page)).toBeVisible();
}

async function goHistory(page: Page): Promise<void> {
  await page.goto('/history');
  await expect(page.getByText(/^Total Candy earned: \d+$/)).toBeVisible();
}

/** Confirms the first `count` Sets, waiting out each Rest but the last. Ends in the last Rest. */
async function confirmSets(page: Page, count: number): Promise<void> {
  for (let index = 0; index < count; index += 1) {
    const slot = slots[index];
    if (slot === undefined) throw new Error(`No Set slot ${index}.`);
    const entry = findEntryById(slot.entryId);
    if (entry === undefined) throw new Error(`No entry "${slot.entryId}".`);
    await expect(page.getByRole('heading', { level: 2, name: en[entry.nameId], exact: true })).toBeVisible();
    if (slot.target.seconds !== undefined) {
      await page.clock.fastForward(slot.target.seconds * 1_000 + marginMs);
    }
    await confirmCurrentSet(page);
    if (slot.restSeconds > 0) {
      await expect(
        page.getByRole('heading', { level: 2, name: en['workout.rest.heading'], exact: true }),
      ).toBeVisible();
      if (index < count - 1) await page.clock.fastForward(slot.restSeconds * 1_000 + marginMs);
    }
  }
}

async function startFresh(page: Page): Promise<void> {
  await openPreparing(page, routine);
  await startWorkout(page);
}

function summaryOutcome(page: Page, key: 'completed' | 'partial' | 'abandoned'): Locator {
  return page.getByText(outcomeText(key), { exact: true });
}

function record(id: string, finishedAt: number, outcome: string, candyEarned: number, routineId = routine.id) {
  return { id, routineId, finishedAt, outcome, candyEarned };
}

function progressText(candy: number, history: readonly unknown[], version: number = schemaVersion): string {
  return JSON.stringify({ schemaVersion: version, candy, welcomeGiftGranted: true, history, checkpoint: null });
}

const seededAt = Date.parse('2026-11-20T09:00:00Z');
const seededHistory = [
  record(`${routine.id}:${seededAt}`, seededAt, 'completed', 14),
  record(`${routine.id}:${seededAt + 60_000}`, seededAt + 60_000, 'partial', 8),
  record(`${routine.id}:${seededAt + 120_000}`, seededAt + 120_000, 'abandoned', 3),
];

function toRgb(hex: string): string {
  const value = Number.parseInt(hex.slice(1), 16);
  return `rgb(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255})`;
}

function firstFamily(fontFamily: string): string {
  return (fontFamily.split(',')[0] ?? '').trim().replace(/^["']|["']$/g, '');
}

test.afterEach(async ({ page }) => {
  const stored = await page.evaluate(async () => ({
    local: Object.keys(window.localStorage),
    session: window.sessionStorage.length,
    databases: (await window.indexedDB.databases()).length,
  }));
  expect(stored.local.filter((key) => key !== storageKey)).toEqual([]);
  expect(stored.session).toBe(0);
  expect(stored.databases).toBe(0);
  expect(await page.context().cookies()).toEqual([]);
});

// --- Welcome gift and the balance ---------------------------------------------

test.describe('the Welcome gift', () => {
  test('a new visitor gets 15 Candy once, and a reload shows the balance without the gift text', async ({
    page,
  }) => {
    await installClock(page);
    await page.goto('/');
    await expect(page.getByText(balanceText(welcomeGiftCandy), { exact: true })).toBeVisible();
    await expect(page.getByText(giftText, { exact: true })).toBeVisible();

    const stored = (await readProgress(page)) as { schemaVersion: number; welcomeGiftGranted: boolean };
    expect(stored.schemaVersion).toBe(2);
    expect(stored.schemaVersion).toBe(schemaVersion);
    expect(stored.welcomeGiftGranted).toBe(true);

    await page.reload();
    await expect(page.getByText(balanceText(welcomeGiftCandy), { exact: true })).toBeVisible();
    await expect(page.getByText(giftText, { exact: true })).toHaveCount(0);
  });

  test('seeded text that is not JSON gives a fresh start with the Welcome gift', async ({ page }) => {
    await installClock(page);
    await seedProgress(page, 'this is not json {');
    await page.goto('/');
    await expect(page.getByText(balanceText(welcomeGiftCandy), { exact: true })).toBeVisible();
    await expect(page.getByText(giftText, { exact: true })).toBeVisible();
    await expect(page.getByText(en['progress.unavailable'], { exact: true })).toHaveCount(0);
  });

  test('seeded schemaVersion 3 is left untouched and the not-persistent text shows', async ({ page }) => {
    await installClock(page);
    const text = progressText(99, [], schemaVersion + 1);
    await seedProgress(page, text);
    await page.goto('/');
    await expect(page.getByText(en['progress.unavailable'], { exact: true })).toBeVisible();
    expect(await readProgressText(page)).toBe(text);
  });
});

test.describe('loading and hydration', () => {
  for (const [path, loading] of [
    ['/', en['home.candy.loading']],
    ['/history', en['history.loading']],
  ] as const) {
    test(`${path}: the server HTML has the loading text and hydration logs no message`, async ({ page }) => {
      const html = await (await page.request.get(path)).text();
      expect(html).toContain(loading);

      const messages: string[] = [];
      page.on('console', (message) => messages.push(message.text()));
      page.on('pageerror', (error) => messages.push(error.message));
      await installClock(page);
      await page.goto(path);
      await expect(page.getByText(loading, { exact: true })).toHaveCount(0);
      expect(messages.filter((text) => /hydrat/i.test(text))).toEqual([]);
    });
  }
});

// --- recording a Workout ---------------------------------------------------------

test.describe('recording Workouts', () => {
  test('a completed Graveyard Shift adds 14 Candy, shows the balance on the summary and is listed in History', async ({
    page,
  }) => {
    await installClock(page);
    await startFresh(page);
    await completeWorkout(page, routine);

    await expect(summaryOutcome(page, 'completed')).toBeVisible();
    await expect(
      page.getByText(format('summary.balance', { balance: String(welcomeGiftCandy + fullCandy) }), {
        exact: true,
      }),
    ).toBeVisible();
    expect(welcomeGiftCandy + fullCandy).toBe(29);

    await page.goto('/');
    await expect(page.getByText(balanceText(29), { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByText(balanceText(29), { exact: true })).toBeVisible();
    await expect(page.getByText(giftText, { exact: true })).toHaveCount(0);

    await goHistory(page);
    await expect(historyEntries(page)).toHaveCount(1);
    const entry = historyEntries(page).first();
    await expect(entry).toContainText(routineName(routine));
    await expect(entry).toContainText(outcomeText('completed'));
    await expect(entry).toContainText(format('summary.candy', { candy: String(fullCandy) }));
    await expect(page.getByText(format('history.total', { candy: String(fullCandy) }), { exact: true })).toBeVisible();

    const time = entry.locator('time');
    const dateTime = (await time.getAttribute('dateTime')) ?? '';
    expect(dateTime.startsWith('2026-11-20T')).toBe(true);
    await expect(time).toHaveText(formatWorkoutDate(Date.parse(dateTime), 'UTC'));
  });

  test('a skipped Set (8 Candy) and a quit after 3 Sets (3 Candy) are recorded, newest first', async ({
    page,
  }) => {
    await installClock(page);

    await startFresh(page);
    await completeWorkout(page, routine);
    await page.clock.fastForward(60_000);

    await startFresh(page);
    await completeWorkout(page, routine, [0]);
    await expect(summaryOutcome(page, 'partial')).toBeVisible();
    await expect(
      page.getByText(format('summary.candy', { candy: String(skippedCandy) }), { exact: true }),
    ).toBeVisible();
    await page.clock.fastForward(60_000);

    await startFresh(page);
    await confirmSets(page, 3);
    await quitWorkout(page);
    await expect(summaryOutcome(page, 'abandoned')).toBeVisible();
    await expect(
      page.getByText(format('summary.candy', { candy: String(quitCandy) }), { exact: true }),
    ).toBeVisible();

    await goHome(page);
    const expected = welcomeGiftCandy + fullCandy + skippedCandy + quitCandy;
    expect(expected).toBe(40);
    await expect(page.getByText(balanceText(40), { exact: true })).toBeVisible();

    await goHistory(page);
    const entries = historyEntries(page);
    await expect(entries).toHaveCount(3);
    await expect(entries.nth(0)).toContainText(outcomeText('abandoned'));
    await expect(entries.nth(0)).toContainText(format('summary.candy', { candy: String(quitCandy) }));
    await expect(entries.nth(1)).toContainText(outcomeText('partial'));
    await expect(entries.nth(1)).toContainText(format('summary.candy', { candy: String(skippedCandy) }));
    await expect(entries.nth(2)).toContainText(outcomeText('completed'));
    await expect(entries.nth(2)).toContainText(format('summary.candy', { candy: String(fullCandy) }));
    await expect(page.getByText(format('history.total', { candy: '25' }), { exact: true })).toBeVisible();
  });

  test('quitting before any Set records a Workout with 0 Candy', async ({ page }) => {
    await installClock(page);
    await startFresh(page);
    await quitWorkout(page);
    await expect(summaryOutcome(page, 'abandoned')).toBeVisible();

    await goHistory(page);
    await expect(historyEntries(page)).toHaveCount(1);
    await expect(historyEntries(page).first()).toContainText(format('summary.candy', { candy: '0' }));
    await expect(page.getByText(format('history.total', { candy: '0' }), { exact: true })).toBeVisible();
    await goHome(page);
    await expect(page.getByText(balanceText(welcomeGiftCandy), { exact: true })).toBeVisible();
  });

  test('a refresh in the middle of a Workout records nothing', async ({ page }) => {
    await installClock(page);
    await startFresh(page);
    await confirmSets(page, 1);
    await page.reload();

    const stored = (await readProgress(page)) as { history: unknown[]; candy: number };
    expect(stored.history).toEqual([]);
    expect(stored.candy).toBe(welcomeGiftCandy);

    await goHistory(page);
    await expect(page.getByText(en['history.empty'], { exact: true })).toBeVisible();
    await goHome(page);
    await expect(page.getByText(balanceText(welcomeGiftCandy), { exact: true })).toBeVisible();
  });

  test('a blocked setItem shows the not-persistent text and the Workout still reaches its summary', async ({
    page,
  }) => {
    await installClock(page);
    await blockStorageWrites(page);
    await startFresh(page);
    await completeWorkout(page, routine);
    await expect(summaryOutcome(page, 'completed')).toBeVisible();

    await goHome(page);
    await expect(page.getByText(en['progress.unavailable'], { exact: true })).toBeVisible();
    expect(await readProgressText(page)).toBeNull();
  });
});

// --- the History_Screen ----------------------------------------------------------

test.describe('the History_Screen', () => {
  test('an empty History shows its text and a link to the Routines', async ({ page }) => {
    await installClock(page);
    await goHistory(page);
    await expect(page.getByText(en['history.empty'], { exact: true })).toBeVisible();
    const link = page.getByRole('link', { name: en['history.empty.link'], exact: true });
    await expect(link).toHaveAttribute('href', '/routines');
    await link.click();
    await expect(page).toHaveURL(/\/routines$/);
    await expect(page.getByText(format('history.total', { candy: '0' }))).toHaveCount(0);
  });

  test('it has one h1, an ordered list, time elements with dateTime and a link home', async ({ page }) => {
    await installClock(page);
    await seedProgress(page, progressText(40, seededHistory));
    await goHistory(page);

    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    await expect(page.getByRole('heading', { level: 1, name: en['section.history.name'], exact: true })).toBeVisible();
    const list = page.getByRole('list', { name: en['history.list.label'] });
    expect(await list.evaluate((el) => el.tagName)).toBe('OL');
    await expect(historyEntries(page)).toHaveCount(3);
    const times = list.locator('time');
    await expect(times).toHaveCount(3);
    for (let index = 0; index < 3; index += 1) {
      const dateTime = (await times.nth(index).getAttribute('dateTime')) ?? '';
      expect(Number.isNaN(Date.parse(dateTime))).toBe(false);
      await expect(times.nth(index)).toHaveText(formatWorkoutDate(Date.parse(dateTime), 'UTC'));
    }
    // Newest first.
    await expect(historyEntries(page).nth(0)).toContainText(outcomeText('abandoned'));
    const home = page.getByRole('link', { name: en['common.backHome'], exact: true });
    await expect(home).toHaveAttribute('href', '/');
  });

  test('a seeded unknown Routine id shows the fallback text', async ({ page }) => {
    await installClock(page);
    await seedProgress(page, progressText(20, [record('gone:1700000000000', 1_700_000_000_000, 'completed', 5, 'gone')]));
    await goHistory(page);
    await expect(historyEntries(page)).toHaveCount(1);
    await expect(historyEntries(page).first()).toContainText(en['history.entry.unknownRoutine']);
  });

  test('links are at least 3rem tall, the theme holds and nothing animates', async ({ page }, testInfo) => {
    await installClock(page);
    await seedProgress(page, progressText(40, seededHistory));
    await goHistory(page);

    const facts = await page.evaluate(() => {
      const html = getComputedStyle(document.documentElement);
      const rem = Number.parseFloat(html.fontSize);
      const main = document.querySelector('main');
      const rect = main?.getBoundingClientRect();
      return {
        rem,
        background: html.backgroundColor,
        display: html.getPropertyValue('--font-display'),
        body: html.getPropertyValue('--font-body'),
        heading: getComputedStyle(document.querySelector('main h1') as Element).fontFamily,
        texts: Array.from(document.querySelectorAll('main p, main a')).map((el) => ({
          text: el.textContent ?? '',
          family: getComputedStyle(el).fontFamily,
          size: Number.parseFloat(getComputedStyle(el).fontSize),
        })),
        links: Array.from(document.querySelectorAll('main a')).map((el) => ({
          text: el.textContent ?? '',
          height: el.getBoundingClientRect().height,
          width: el.getBoundingClientRect().width,
        })),
        mainWidth: rect?.width ?? 0,
        margins: rect === undefined ? [0, 0] : [rect.x, document.documentElement.clientWidth - rect.right],
        motion: [document.body, ...Array.from(document.querySelectorAll('main, main *'))].map((el) => ({
          animationName: getComputedStyle(el).animationName,
          durations: getComputedStyle(el).transitionDuration.split(',').map((d) => d.trim()),
        })),
      };
    });
    expect(facts.background).toBe(toRgb(colors.bg));
    expect(firstFamily(facts.heading)).toBe(firstFamily(facts.display));
    for (const text of facts.texts) {
      expect(firstFamily(text.family), `font of "${text.text}"`).toBe(firstFamily(facts.body));
      expect(text.size, `size of "${text.text}"`).toBeGreaterThanOrEqual(16);
    }
    expect(facts.links.length).toBeGreaterThan(0);
    for (const link of facts.links) {
      expect(link.height, `height of "${link.text}"`).toBeGreaterThanOrEqual(3 * facts.rem);
      expect(link.width, `width of "${link.text}"`).toBeGreaterThanOrEqual(44);
    }
    if (testInfo.project.name === 'laptop') {
      expect(facts.mainWidth).toBeLessThanOrEqual(768);
      expect(Math.abs((facts.margins[0] ?? 0) - (facts.margins[1] ?? 0))).toBeLessThanOrEqual(1);
    }
    for (const item of facts.motion) {
      expect(item.animationName).toBe('none');
      for (const duration of item.durations) expect(duration).toBe('0s');
    }
  });
});

// --- layout ----------------------------------------------------------------------

test.describe('layout', () => {
  async function expectFits(page: Page, label: string): Promise<void> {
    const size = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    }));
    expect(size.scrollWidth, `${label}: page scroll width`).toBeLessThanOrEqual(size.innerWidth);
    const clipped = await page.evaluate(() =>
      Array.from(document.querySelectorAll('main h1, main p, main a, main li, main ol'))
        .filter((el) => el.scrollWidth > el.clientWidth || el.getBoundingClientRect().right > window.innerWidth)
        .map((el) => el.textContent ?? ''),
    );
    expect(clipped, `${label}: clipped text`).toEqual([]);
  }

  for (const [label, setup] of [
    ['320 CSS px', async (page: Page) => page.setViewportSize({ width: 320, height: 640 })],
    ['200% text size', async (page: Page) => {
      await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
      await page.evaluate(async () => {
        await document.fonts.ready;
      });
    }],
  ] as const) {
    test(`Home and History do not scroll sideways or clip at ${label}`, async ({ page }) => {
      await installClock(page);
      await seedProgress(page, progressText(40, seededHistory));
      if (label === '320 CSS px') await setup(page);
      for (const [path, ready] of [
        ['/', () => homeBalance(page)],
        ['/history', () => page.getByText(/^Total Candy earned: \d+$/)],
      ] as const) {
        await page.goto(path);
        await expect(ready()).toBeVisible();
        if (label !== '320 CSS px') await setup(page);
        await expectFits(page, `${path} at ${label}`);
      }
    });
  }
});
