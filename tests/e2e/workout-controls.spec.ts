/**
 * The Workout controls: skip Set, skip Rest, pause, resume, Auto_Pause and
 * quit, and what they leave on the summary.
 *
 * The Workout_Screen reads `performance.now()`, so the clock is installed
 * before `goto` and driven with `page.clock`. Reduced motion keeps the Coach
 * paused, so nothing here depends on the animation.
 */
import { expect, type Locator, type Page, test } from '@playwright/test';

import { findEntryById, findRoutine, type ExerciseEntry, type RoutineEntry } from '@/catalog';
import { storageKey } from '@/progress-store';
import { format, locales } from '@/ui/strings';
import { colors } from '@/ui/theme/tokens';
import { buildSetSlots, candyPerSet, completionBonus } from '@/workout-engine';

import { simulatePageHidden } from './support/webgl';
import {
  completeWorkout,
  confirmCurrentSet,
  openPreparing,
  pauseWorkout,
  quitWorkout,
  resumeWorkout,
  skipCurrentSet,
  startWorkout,
  timerSeconds,
} from './support/workout';

const en = locales.en;

const routine: RoutineEntry = (() => {
  const found = findRoutine('graveyard-shift');
  if (found === undefined) throw new Error('The Catalog has no Routine "graveyard-shift".');
  return found;
})();
const slots = buildSetSlots(routine);
const totalSets = slots.length;
const bonus = String(completionBonus);

function slotAt(index: number): (typeof slots)[number] {
  const slot = slots[index];
  if (slot === undefined) throw new Error(`The Routine has no Set slot ${index}.`);
  return slot;
}
function entryOf(index: number): ExerciseEntry {
  const entry = findEntryById(slotAt(index).entryId);
  if (entry === undefined) throw new Error(`The Catalog has no entry "${slotAt(index).entryId}".`);
  return entry;
}

const firstSlot = slotAt(0);
const secondSlot = slotAt(1);
const firstEntry = entryOf(0);
if (firstSlot.restSeconds < 12) throw new Error('The first Set needs a Rest of at least 12 seconds.');

/** Fixed start of the installed clock. */
const fixedTime = new Date('2026-11-20T10:00:00Z');
const marginMs = 1_000;

test.describe.configure({ timeout: 120_000 });
test.use({ reducedMotion: 'reduce' });

// --- locators -------------------------------------------------------------

const setHeading = (page: Page, entry: ExerciseEntry) =>
  page.getByRole('heading', { level: 2, name: en[entry.nameId], exact: true });
const restHeading = (page: Page) =>
  page.getByRole('heading', { level: 2, name: en['workout.rest.heading'], exact: true });
const pausedHeading = (page: Page) =>
  page.getByRole('heading', { level: 2, name: en['workout.paused.heading'], exact: true });
const preparingHeading = (page: Page) =>
  page.getByRole('heading', { level: 2, name: en[routine.nameId], exact: true });
const summaryHeading = (page: Page, key: 'summary.heading' | 'summary.heading.ended') =>
  page.getByRole('heading', { level: 2, name: en[key], exact: true });
const liveRegion = (page: Page) => page.getByRole('status').first();
const dialog = (page: Page) => page.getByRole('dialog');
const skipButton = (page: Page) => page.getByRole('button', { name: en['workout.skipSet'], exact: true });
const pausedPanel = (page: Page) => page.locator('section[aria-labelledby="paused-heading"]');
const setPanel = (page: Page) => page.locator('section[aria-labelledby="set-heading"]');
const restTimer = (page: Page) =>
  page.getByRole('timer', { name: en['workout.timer.rest'], exact: true });

function setAnnouncement(index: number): string {
  const slot = slotAt(index);
  return format('workout.announce.set', {
    number: String(slot.setNumber),
    count: String(slot.setCount),
    exercise: en[entryOf(index).nameId],
  });
}

// --- helpers --------------------------------------------------------------

async function open(page: Page): Promise<void> {
  await page.clock.install({ time: fixedTime });
  await openPreparing(page, routine);
}

async function openStarted(page: Page): Promise<void> {
  await open(page);
  await startWorkout(page);
  await expect(setHeading(page, firstEntry)).toBeVisible();
}

/** Confirms the first `count` Sets, waiting out each Rest but the last. Ends in the last Rest. */
async function confirmSets(page: Page, count: number): Promise<void> {
  for (let index = 0; index < count; index += 1) {
    const slot = slotAt(index);
    await expect(setHeading(page, entryOf(index))).toBeVisible();
    if (slot.target.seconds !== undefined) {
      await page.clock.fastForward(slot.target.seconds * 1_000 + marginMs);
    }
    await confirmCurrentSet(page);
    if (slot.restSeconds > 0) {
      await expect(restHeading(page)).toBeVisible();
      if (index < count - 1) await page.clock.fastForward(slot.restSeconds * 1_000 + marginMs);
    }
  }
}

async function pauseClock(page: Page): Promise<void> {
  const now = await page.evaluate(() => Date.now());
  await page.clock.pauseAt(now + 1_000);
}

async function expectNoPerfectForm(page: Page): Promise<void> {
  expect(await page.locator('body').innerText()).not.toMatch(/perfect form/i);
}

function setText(page: Page, index: number): Locator {
  const slot = slotAt(index);
  return page.getByText(
    format('workout.set.of', { number: String(slot.setNumber), count: String(slot.setCount) }),
    { exact: true },
  );
}

async function expectSummaryCounts(
  page: Page,
  counts: { confirmed: number; skipped: number; notReached: number; candy: number },
): Promise<void> {
  await expect(
    page.getByText(format('summary.setsConfirmed', { count: String(counts.confirmed) }), { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(format('summary.setsSkipped', { count: String(counts.skipped) }), { exact: true }),
  ).toBeVisible();
  const notReached = page.getByText(
    format('summary.setsNotReached', { count: String(counts.notReached) }),
    { exact: true },
  );
  if (counts.notReached > 0) await expect(notReached).toBeVisible();
  else await expect(page.getByText(/Sets not reached/)).toHaveCount(0);
  await expect(
    page.getByText(format('summary.candy', { candy: String(counts.candy) }), { exact: true }),
  ).toBeVisible();
}

function toRgb(hex: string): string {
  const value = Number.parseInt(hex.slice(1), 16);
  return `rgb(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255})`;
}

function firstFamily(fontFamily: string): string {
  return (fontFamily.split(',')[0] ?? '').trim().replace(/^["']|["']$/g, '');
}

/** Theme and layout checks shared with the other screens, over one scope. */
async function expectThemeAndLayout(page: Page, scope: Locator, label: string): Promise<void> {
  const facts = await scope.evaluate((root) => {
    const html = getComputedStyle(document.documentElement);
    return {
      background: html.backgroundColor,
      display: html.getPropertyValue('--font-display'),
      body: html.getPropertyValue('--font-body'),
      headings: Array.from(root.querySelectorAll('h2, h3')).map((el) => getComputedStyle(el).fontFamily),
      texts: Array.from(root.querySelectorAll('p')).map((el) => ({
        text: el.textContent ?? '',
        family: getComputedStyle(el).fontFamily,
        size: Number.parseFloat(getComputedStyle(el).fontSize),
      })),
    };
  });
  expect(facts.background, `${label}: background`).toBe(toRgb(colors.bg));
  expect(facts.headings.length, `${label}: headings`).toBeGreaterThan(0);
  for (const family of facts.headings) {
    expect(firstFamily(family), `${label}: heading font`).toBe(firstFamily(facts.display));
  }
  for (const text of facts.texts) {
    expect(firstFamily(text.family), `${label}: font of "${text.text}"`).toBe(firstFamily(facts.body));
    expect(text.size, `${label}: size of "${text.text}"`).toBeGreaterThanOrEqual(16);
  }
  const buttons = scope.getByRole('button');
  const count = await buttons.count();
  expect(count, `${label}: buttons`).toBeGreaterThan(0);
  for (let index = 0; index < count; index += 1) {
    const box = await buttons.nth(index).boundingBox();
    expect(box, `${label}: button box`).not.toBeNull();
    expect(box?.height ?? 0, `${label}: button height`).toBeGreaterThanOrEqual(44);
    expect(box?.width ?? 0, `${label}: button width`).toBeGreaterThanOrEqual(44);
  }
}

/** No horizontal scroll and no clipped button inside `scope`. */
async function expectNoOverflow(page: Page, scope: Locator, label: string): Promise<void> {
  const size = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(size.scrollWidth, `${label}: page scroll width`).toBeLessThanOrEqual(size.innerWidth);
  const scopeMetrics = await scope.evaluate((el) => ({ scroll: el.scrollWidth, client: el.clientWidth }));
  expect(scopeMetrics.scroll, `${label}: scope scroll width`).toBeLessThanOrEqual(scopeMetrics.client);
  const buttons = scope.getByRole('button');
  const count = await buttons.count();
  for (let index = 0; index < count; index += 1) {
    const button = buttons.nth(index);
    const box = await button.boundingBox();
    expect(box, `${label}: button box`).not.toBeNull();
    expect(box?.x ?? -1, `${label}: button left edge`).toBeGreaterThanOrEqual(0);
    expect((box?.x ?? 0) + (box?.width ?? 0), `${label}: button right edge`).toBeLessThanOrEqual(
      size.innerWidth,
    );
    const metrics = await button.evaluate((el) => ({
      sw: el.scrollWidth,
      cw: el.clientWidth,
      sh: el.scrollHeight,
      ch: el.clientHeight,
      text: el.textContent ?? '',
    }));
    expect(metrics.sw, `${label}: "${metrics.text}" clipped sideways`).toBeLessThanOrEqual(metrics.cw);
    expect(metrics.sh, `${label}: "${metrics.text}" clipped vertically`).toBeLessThanOrEqual(metrics.ch);
  }
}

/** Every element of `scope` and the scope itself has no animation and no transition. */
async function expectStill(scope: Locator, label: string): Promise<void> {
  const motion = await scope.evaluate((root) =>
    [root, ...Array.from(root.querySelectorAll('*'))].map((element) => {
      const style = getComputedStyle(element);
      return {
        animationName: style.animationName,
        durations: style.transitionDuration.split(',').map((d) => d.trim()),
      };
    }),
  );
  expect(motion.length, `${label}: elements`).toBeGreaterThan(1);
  for (const element of motion) {
    expect(element.animationName, `${label}: animation`).toBe('none');
    for (const duration of element.durations) expect(duration, `${label}: transition`).toBe('0s');
  }
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

// --- skip Set ---------------------------------------------------------------

test.describe('skipping a Set', () => {
  test('the dialog asks first and Cancel, Escape and a backdrop click change nothing and return focus to the skip button', async ({
    page,
  }) => {
    await openStarted(page);

    await skipButton(page).click();
    await expect(dialog(page)).toBeVisible();
    await expect(
      dialog(page).getByRole('heading', { level: 2, name: en['workout.skipSet.dialog.heading'], exact: true }),
    ).toBeVisible();
    await expect(dialog(page)).toHaveAccessibleName(en['workout.skipSet.dialog.heading']);
    await expect(dialog(page)).toHaveAccessibleDescription(
      format('workout.skipSet.dialog.text', { bonus }),
    );
    await expect(page.getByRole('button', { name: en['workout.dialog.cancel'], exact: true })).toBeFocused();
    await expectNoPerfectForm(page);

    // Cancel
    await page.getByRole('button', { name: en['workout.dialog.cancel'], exact: true }).click();
    await expect(dialog(page)).toHaveCount(0);
    await expect(skipButton(page)).toBeFocused();
    await expect(setHeading(page, firstEntry)).toBeVisible();
    await expect(setText(page, 0)).toBeVisible();

    // Escape
    await skipButton(page).click();
    await expect(dialog(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog(page)).toHaveCount(0);
    await expect(skipButton(page)).toBeFocused();
    await expect(setText(page, 0)).toBeVisible();

    // Backdrop
    await skipButton(page).click();
    await expect(dialog(page)).toBeVisible();
    await dialog(page).click({ position: { x: 4, y: 4 } });
    await expect(dialog(page)).toHaveCount(0);
    await expect(skipButton(page)).toBeFocused();
    await expect(setText(page, 0)).toBeVisible();
    await expect(restHeading(page)).toHaveCount(0);
  });

  test('confirming shows the next Set with no Rest and announces it', async ({ page }) => {
    await openStarted(page);
    await skipCurrentSet(page);

    await expect(dialog(page)).toHaveCount(0);
    await expect(setHeading(page, entryOf(1))).toBeVisible();
    await expect(setText(page, 1)).toBeVisible();
    await expect(
      page.getByText(
        format('workout.set.position', { position: '2', total: String(totalSets) }),
        { exact: true },
      ),
    ).toBeVisible();
    await expect(restHeading(page)).toHaveCount(0);
    await expect(liveRegion(page)).toHaveText(
      format('workout.announce.skippedSet', { next: setAnnouncement(1) }),
    );
    expect(secondSlot.setNumber).toBe(2);
  });

  test('the summary is Partial with 8 confirmed, 1 skipped, Candy earned 8 and the no-bonus text', async ({
    page,
  }) => {
    await open(page);
    await startWorkout(page);
    await completeWorkout(page, routine, [0]);

    await expect(summaryHeading(page, 'summary.heading')).toBeVisible();
    await expect(liveRegion(page)).toHaveText(en['workout.announce.summary']);
    await expect(
      page.getByText(format('summary.outcome', { outcome: en['summary.outcome.partial'] }), { exact: true }),
    ).toBeVisible();
    await expectSummaryCounts(page, {
      confirmed: totalSets - 1,
      skipped: 1,
      notReached: 0,
      candy: (totalSets - 1) * candyPerSet,
    });
    await expect(page.getByText(format('summary.noBonus', { bonus }), { exact: true })).toBeVisible();
    await expect(page.getByText(format('summary.bonus', { bonus }), { exact: true })).toHaveCount(0);

    const skippedLine = format('summary.set.line', {
      exercise: en[firstEntry.nameId],
      number: String(firstSlot.setNumber),
      count: String(firstSlot.setCount),
      state: en['summary.result.skipped'],
    });
    await expect(page.getByRole('listitem').filter({ hasText: skippedLine })).toHaveCount(1);
    await expect(page.locator('ol').getByRole('listitem').filter({ hasText: en['summary.result.skipped'] })).toHaveCount(1);
    await expect(page.getByRole('heading', { name: en['summary.sets.heading'], exact: true })).toBeVisible();
    await expectNoPerfectForm(page);
  });
});

// --- skip Rest -----------------------------------------------------------------

test('skipping a Rest goes straight to the next Set with no dialog', async ({ page }) => {
  await openStarted(page);
  await confirmCurrentSet(page);
  await expect(restHeading(page)).toBeVisible();

  await page.getByRole('button', { name: en['workout.skipRest'], exact: true }).click();
  await expect(dialog(page)).toHaveCount(0);
  await expect(restHeading(page)).toHaveCount(0);
  await expect(setHeading(page, entryOf(1))).toBeVisible();
  await expect(setText(page, 1)).toBeVisible();
  await expect(liveRegion(page)).toHaveText(
    format('workout.announce.skippedRest', { next: setAnnouncement(1) }),
  );
});

// --- pause and resume --------------------------------------------------------------

test.describe('pausing', () => {
  test('pause freezes the displayed timer across 30 seconds and resume continues from it', async ({ page }) => {
    await openStarted(page);
    await confirmCurrentSet(page);
    await expect(restHeading(page)).toBeVisible();
    await pauseClock(page);
    await page.clock.fastForward(1_000);

    await pauseWorkout(page);
    await expect(pausedHeading(page)).toBeVisible();
    const frozen = await timerSeconds(restTimer(page));
    expect(frozen).toBeGreaterThan(5);

    await page.clock.fastForward('00:30');
    expect(await timerSeconds(restTimer(page)), 'the timer after 30 s paused').toBe(frozen);

    await resumeWorkout(page);
    await expect(restHeading(page)).toBeVisible();
    await page.clock.fastForward('00:05');
    await expect.poll(() => timerSeconds(restTimer(page))).toBe(frozen - 5);
  });

  test('the Paused_Panel shows the heading, Exercise, Set position and user text and no Set controls', async ({
    page,
  }) => {
    await openStarted(page);
    await pauseWorkout(page);

    const panel = pausedPanel(page);
    await expect(pausedHeading(page)).toBeVisible();
    await expect(pausedHeading(page)).toBeFocused();
    await expect(panel.getByText(en[firstEntry.nameId], { exact: true })).toBeVisible();
    await expect(panel.getByText(format('workout.set.of', { number: '1', count: String(firstSlot.setCount) }), { exact: true })).toBeVisible();
    await expect(panel.getByText(en['workout.paused.user'], { exact: true })).toBeVisible();
    await expect(panel.getByText(en['workout.paused.auto'], { exact: true })).toHaveCount(0);
    await expect(liveRegion(page)).toHaveText(en['workout.announce.paused.user']);

    await expect(panel.getByRole('button', { name: en['workout.confirm'] })).toHaveCount(0);
    await expect(panel.getByRole('button', { name: en['workout.skipSet'] })).toHaveCount(0);
    await expect(panel.getByRole('button', { name: en['workout.skipRest'] })).toHaveCount(0);
    await expect(panel.getByRole('spinbutton')).toHaveCount(0);
    await expect(panel.getByRole('button')).toHaveCount(2);
    await expect(panel.getByRole('button', { name: en['workout.resume'], exact: true })).toBeVisible();
    await expect(panel.getByRole('button', { name: en['workout.quit'], exact: true })).toBeVisible();
    await expectNoPerfectForm(page);
    await expectThemeAndLayout(page, panel, 'Paused_Panel');

    await resumeWorkout(page);
    await expect(setHeading(page, firstEntry)).toBeVisible();
    await expect(liveRegion(page)).toHaveText(
      format('workout.announce.resumed', { next: setAnnouncement(0) }),
    );
  });
});

// --- page hidden -----------------------------------------------------------------------

test.describe('Auto_Pause', () => {
  test('a hidden page pauses with the auto text, a visible page leaves the Paused_Panel and only Resume continues', async ({
    page,
  }) => {
    await openStarted(page);
    await simulatePageHidden(page, true);
    await expect(pausedHeading(page)).toBeVisible();
    await expect(pausedPanel(page).getByText(en['workout.paused.auto'], { exact: true })).toBeVisible();
    await expect(liveRegion(page)).toHaveText(en['workout.announce.paused.auto']);

    await simulatePageHidden(page, false);
    await expect(pausedHeading(page)).toBeVisible();
    await expect(setHeading(page, firstEntry)).toHaveCount(0);

    await resumeWorkout(page);
    await expect(setHeading(page, firstEntry)).toBeVisible();
    await expect(pausedHeading(page)).toHaveCount(0);
  });

  test('a hidden event does nothing on the Preparing_Panel or the summary', async ({ page }) => {
    await open(page);
    await simulatePageHidden(page, true);
    await expect(preparingHeading(page)).toBeVisible();
    await expect(pausedHeading(page)).toHaveCount(0);
    await simulatePageHidden(page, false);
    await startWorkout(page);
    await expect(setHeading(page, firstEntry)).toBeVisible();

    await quitWorkout(page);
    await expect(summaryHeading(page, 'summary.heading.ended')).toBeVisible();
    await simulatePageHidden(page, true);
    await expect(summaryHeading(page, 'summary.heading.ended')).toBeVisible();
    await expect(pausedHeading(page)).toHaveCount(0);
  });

  test('a user pause stays a user pause after a hidden event', async ({ page }) => {
    await openStarted(page);
    await pauseWorkout(page);
    await simulatePageHidden(page, true);
    await expect(pausedPanel(page).getByText(en['workout.paused.user'], { exact: true })).toBeVisible();
    await expect(pausedPanel(page).getByText(en['workout.paused.auto'], { exact: true })).toHaveCount(0);
    await simulatePageHidden(page, false);
    await expect(pausedPanel(page).getByText(en['workout.paused.user'], { exact: true })).toBeVisible();
  });

  test('a skip dialog open when the page becomes hidden closes, focus lands on the Paused_Panel heading and the Set is not skipped', async ({
    page,
  }) => {
    await openStarted(page);
    await skipButton(page).click();
    await expect(dialog(page)).toBeVisible();

    await simulatePageHidden(page, true);
    await expect(dialog(page)).toHaveCount(0);
    await expect(pausedHeading(page)).toBeVisible();
    await expect(pausedHeading(page)).toBeFocused();

    await simulatePageHidden(page, false);
    await resumeWorkout(page);
    await expect(setHeading(page, firstEntry)).toBeVisible();
    await expect(setText(page, 0)).toBeVisible();
    await expect(
      page.getByText(format('workout.set.position', { position: '1', total: String(totalSets) }), {
        exact: true,
      }),
    ).toBeVisible();
  });
});

// --- quit ------------------------------------------------------------------------------------

test.describe('quitting', () => {
  const expectAbandoned = async (page: Page): Promise<void> => {
    await expect(summaryHeading(page, 'summary.heading.ended')).toBeVisible();
    await expect(liveRegion(page)).toHaveText(en['workout.announce.ended']);
    await expect(
      page.getByText(format('summary.outcome', { outcome: en['summary.outcome.abandoned'] }), { exact: true }),
    ).toBeVisible();
    await expectSummaryCounts(page, {
      confirmed: 3,
      skipped: 0,
      notReached: totalSets - 3,
      candy: 3 * candyPerSet,
    });
    await expect(page.getByText(format('summary.bonus', { bonus }), { exact: true })).toHaveCount(0);
    await expect(page.getByText(format('summary.noBonus', { bonus }), { exact: true })).toBeVisible();
    await expect(
      page.locator('ol').getByRole('listitem').filter({ hasText: en['summary.result.notReached'] }),
    ).toHaveCount(totalSets - 3);
    await expectNoPerfectForm(page);
  };

  test('quit asks first, then shows Abandoned with 3 confirmed and 6 not reached', async ({ page }) => {
    await openStarted(page);
    await confirmSets(page, 3);

    await page.getByRole('button', { name: en['workout.quit'], exact: true }).click();
    await expect(dialog(page)).toBeVisible();
    await expect(dialog(page)).toHaveAccessibleName(en['workout.quit.dialog.heading']);
    await expect(dialog(page)).toHaveAccessibleDescription(format('workout.quit.dialog.text', { bonus }));
    await expect(page.getByRole('button', { name: en['workout.dialog.cancel'], exact: true })).toBeFocused();

    // Cancel changes nothing.
    await page.getByRole('button', { name: en['workout.dialog.cancel'], exact: true }).click();
    await expect(dialog(page)).toHaveCount(0);
    await expect(restHeading(page)).toBeVisible();
    await expect(page.getByRole('button', { name: en['workout.quit'], exact: true })).toBeFocused();

    await page.getByRole('button', { name: en['workout.quit'], exact: true }).click();
    await page.getByRole('button', { name: en['workout.quit.dialog.confirm'], exact: true }).click();
    await expectAbandoned(page);
  });

  test('quitting from the Paused_Panel also shows Abandoned', async ({ page }) => {
    await openStarted(page);
    await confirmSets(page, 3);
    await pauseWorkout(page);
    await expect(pausedHeading(page)).toBeVisible();

    await quitWorkout(page);
    await expectAbandoned(page);
  });
});

// --- refresh -----------------------------------------------------------------------------------

test.describe('refresh', () => {
  test('a refresh while paused shows the Preparing_Panel', async ({ page }) => {
    await openStarted(page);
    await pauseWorkout(page);
    await expect(pausedHeading(page)).toBeVisible();
    // A refresh mid-Workout now offers Resume or Discard; Discard leads to the Preparing_Panel.
    await page.reload();
    await page.getByRole('button', { name: en['resume.discard'], exact: true }).click();
    await expect(preparingHeading(page)).toBeVisible();
    await expect(pausedHeading(page)).toHaveCount(0);
  });

  test('a refresh on the summary shows the Preparing_Panel', async ({ page }) => {
    await openStarted(page);
    await quitWorkout(page);
    await expect(summaryHeading(page, 'summary.heading.ended')).toBeVisible();
    await page.reload();
    await expect(preparingHeading(page)).toBeVisible();
  });
});

// --- narrow screens and large text -----------------------------------------------------------------

test.describe('320 CSS pixels and 200% text', () => {
  test('the control row, the Paused_Panel and the dialog show no horizontal scroll and no clipped button', async ({
    page,
  }) => {
    await openStarted(page);
    await page.setViewportSize({ width: 320, height: 640 });
    await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
    await page.evaluate(async () => {
      await document.fonts.ready;
    });
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).fontSize)).toBe('32px');

    const controls = pauseButtonRow(page);
    await expectNoOverflow(page, controls, 'control row');

    await skipButton(page).click();
    await expect(dialog(page)).toBeVisible();
    await expectNoOverflow(page, dialog(page), 'skip dialog');
    await expectThemeAndLayout(page, dialog(page), 'skip dialog');
    await page.getByRole('button', { name: en['workout.dialog.cancel'], exact: true }).click();

    await pauseWorkout(page);
    await expect(pausedHeading(page)).toBeVisible();
    await expectNoOverflow(page, pausedPanel(page), 'Paused_Panel');

    await page.getByRole('button', { name: en['workout.quit'], exact: true }).click();
    await expect(dialog(page)).toBeVisible();
    await expectNoOverflow(page, dialog(page), 'quit dialog');
  });
});

function pauseButtonRow(page: Page): Locator {
  return setPanel(page).getByRole('button', { name: en['workout.pause'], exact: true }).locator('..');
}

// --- motion -------------------------------------------------------------------------------------------

test('the Paused_Panel, the dialog and the controls have no animation and no transition', async ({ page }) => {
  await openStarted(page);
  await expectStill(pauseButtonRow(page), 'control row');

  await skipButton(page).click();
  await expect(dialog(page)).toBeVisible();
  await expectStill(dialog(page), 'dialog');
  await expectThemeAndLayout(page, dialog(page), 'dialog');
  await page.getByRole('button', { name: en['workout.dialog.cancel'], exact: true }).click();

  await pauseWorkout(page);
  await expect(pausedHeading(page)).toBeVisible();
  await expectStill(pausedPanel(page), 'Paused_Panel');
});
