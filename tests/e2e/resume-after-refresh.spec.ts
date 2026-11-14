/**
 * Resume after refresh: the Stored_Checkpoint, the Resume_Prompt on the
 * Workout_Route and the Home_Screen, Resume, Discard, the Schema_Version 1
 * migration and the rules that guard the checkpoint.
 *
 * The Workout_Screen reads `performance.now()`, so the clock is installed
 * before `goto` and driven with `page.clock`. Time zone UTC and reduced
 * motion keep dates and animation predictable.
 */
import { expect, test, type Locator, type Page } from '@playwright/test';

import { findEntryById, findRoutine, type RoutineEntry } from '@/catalog';
import { storageKey, welcomeGiftCandy, type WorkoutRecord } from '@/progress-store';
import { exerciseName } from '@/ui/exercises/labels';
import { routineName, workoutPath } from '@/ui/routines/labels';
import { format, locales, t } from '@/ui/strings';
import { formatCountdown } from '@/ui/workout/clock-text';
import {
  advance,
  buildSetSlots,
  candyPerSet,
  checkpointOf,
  completionBonus,
  confirmSet,
  restoreWorkout,
  skipRest,
  startWorkout as startEngineWorkout,
  workoutView,
  type WorkoutCheckpoint,
  type WorkoutOutcome,
} from '@/workout-engine';

import {
  blockStorageWrites,
  discardButton,
  graveyardShiftCheckpoint,
  historyEntries,
  homeBalance,
  readCheckpoint,
  readProgress,
  readProgressText,
  reloadMidWorkout,
  restoredPausedPanel,
  resumeButton,
  resumePrompt,
  seedCheckpoint,
  seedVersion2,
  seedVersion1,
} from './support/progress';
import { confirmCurrentSet, openPreparing, startWorkout, timerSeconds } from './support/workout';
import { countDrawCalls, simulatePageHidden } from './support/webgl';

const en = locales.en;

const routine: RoutineEntry = (() => {
  const found = findRoutine('graveyard-shift');
  if (found === undefined) throw new Error('The Catalog has no Routine "graveyard-shift".');
  return found;
})();
const slots = buildSetSlots(routine);
const totalSets = slots.length;
const fullCandy = totalSets * candyPerSet + completionBonus;
const marginMs = 1_000;
const routinePath = workoutPath(routine);
const fixedTime = new Date('2026-11-20T10:00:00Z');

test.describe.configure({ timeout: 180_000 });
test.use({ timezoneId: 'UTC', reducedMotion: 'reduce' });

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: fixedTime });
});

test.afterEach(async ({ page }) => {
  if (!page.url().startsWith('http')) return;
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

// --- helpers ---------------------------------------------------------------

const balanceText = (candy: number) => format('home.candy.balance', { candy: String(candy) });
const outcomeText = (key: 'completed' | 'partial' | 'abandoned') =>
  format('summary.outcome', { outcome: en[`summary.outcome.${key}`] });

function slotAt(index: number) {
  const slot = slots[index];
  if (slot === undefined) throw new Error(`No Set slot ${index}.`);
  const entry = findEntryById(slot.entryId);
  if (entry === undefined) throw new Error(`No entry "${slot.entryId}".`);
  return { slot, entry };
}

/** The prompt text for a Workout held before Set `index` (0-based). */
function promptText(index: number, candy: number, resting: boolean): string {
  const { slot, entry } = slotAt(index);
  return format(resting ? 'resume.text.rest' : 'resume.text', {
    routine: routineName(routine),
    exercise: exerciseName(entry),
    number: String(slot.setNumber),
    count: String(slot.setCount),
    candy: String(candy),
  });
}

interface StoredWorkout {
  readonly phase?: unknown;
  readonly clock?: unknown;
  readonly confirmed?: unknown;
}

function workoutOf(checkpoint: unknown): StoredWorkout | undefined {
  if (typeof checkpoint !== 'object' || checkpoint === null) return undefined;
  const workout = (checkpoint as { workout?: unknown }).workout;
  return typeof workout === 'object' && workout !== null ? (workout as StoredWorkout) : undefined;
}

async function storedClock(page: Page): Promise<number> {
  const clock = workoutOf(await readCheckpoint(page))?.clock;
  return typeof clock === 'number' ? clock : -1;
}

async function storedConfirmed(page: Page): Promise<number> {
  const confirmed = workoutOf(await readCheckpoint(page))?.confirmed;
  return Array.isArray(confirmed) ? confirmed.length : -1;
}

function restTimer(page: Page): Locator {
  return page.getByRole('timer', { name: en['workout.timer.rest'], exact: true });
}

function restHeading(page: Page): Locator {
  return page.getByRole('heading', { level: 2, name: en['workout.rest.heading'], exact: true });
}

function startButton(page: Page): Locator {
  return page.getByRole('button', { name: en['workout.start'] });
}

/** Starts a fresh Workout and confirms `count` Sets, ending in the Rest after the last. */
async function confirmFresh(page: Page, count: number): Promise<void> {
  await openPreparing(page, routine);
  await startWorkout(page);
  for (let index = 0; index < count; index += 1) {
    const { slot, entry } = slotAt(index);
    await expect(page.getByRole('heading', { level: 2, name: en[entry.nameId], exact: true })).toBeVisible();
    await confirmCurrentSet(page);
    await expect(restHeading(page)).toBeVisible();
    if (index < count - 1) await page.clock.fastForward(slot.restSeconds * 1_000 + marginMs);
  }
  await expect.poll(() => storedConfirmed(page)).toBe(count);
}

/**
 * Runs the Workout from Set slot `firstIndex` to its summary. When
 * `restFirst`, the Workout is in the Rest before that slot.
 */
async function finishFrom(page: Page, firstIndex: number, restFirst: boolean): Promise<void> {
  if (restFirst) {
    await expect(restHeading(page)).toBeVisible();
    await page.clock.fastForward(slotAt(firstIndex - 1).slot.restSeconds * 1_000 + marginMs);
  }
  const confirm = page.getByRole('button', { name: en['workout.confirm'] });
  for (let index = firstIndex; index < totalSets; index += 1) {
    const { slot, entry } = slotAt(index);
    await expect(page.getByRole('heading', { level: 2, name: en[entry.nameId], exact: true })).toBeVisible();
    if (slot.target.seconds !== undefined) {
      await page.clock.fastForward(slot.target.seconds * 1_000 + marginMs);
      await expect(confirm).toBeEnabled();
    }
    await confirm.click();
    if (index < totalSets - 1 && slot.restSeconds > 0) {
      await expect(restHeading(page)).toBeVisible();
      await page.clock.fastForward(slot.restSeconds * 1_000 + marginMs);
    }
  }
  await expect(page.getByRole('heading', { level: 2, name: en['summary.heading'] })).toBeVisible();
}

/** The Paused_Panel's held timer text for a stored checkpoint, as the screen shows it. */
function heldTimerText(checkpoint: unknown): string {
  const restored = restoreWorkout(checkpoint, routine, 0);
  if (restored === null) throw new Error('The stored checkpoint cannot be restored.');
  const view = workoutView(restored);
  if (view.phase !== 'paused') throw new Error('A restored Workout must be paused.');
  const held = view.held;
  return formatCountdown(held.phase === 'resting' ? held.restRemainingMs : held.timer.kind === 'seconds' ? held.timer.remainingMs : 0);
}

/** A checkpoint held in the first stretch's Set with 20 s left (a seconds Set). */
function stretchSetCheckpoint(): WorkoutCheckpoint {
  let workout = startEngineWorkout(routine, 0);
  const firstStretch = slots.findIndex((slot) => slot.target.seconds !== undefined);
  for (let index = 0; index < firstStretch; index += 1) {
    workout = confirmSet(workout, (index + 1) * 1_000);
    if (index < firstStretch - 1) workout = skipRest(workout, (index + 1) * 1_000 + 500);
  }
  workout = skipRest(workout, firstStretch * 1_000 + 1_000);
  workout = advance(workout, firstStretch * 1_000 + 11_000);
  const checkpoint = checkpointOf(workout);
  if (checkpoint === null) throw new Error('The Workout is at the summary.');
  return JSON.parse(JSON.stringify(checkpoint)) as WorkoutCheckpoint;
}

function record(finishedAt: number, outcome: WorkoutOutcome, candyEarned: number): WorkoutRecord {
  return { id: `${routine.id}:${finishedAt}`, routineId: routine.id, finishedAt, outcome, candyEarned };
}

// --- the Workout_Route -----------------------------------------------------------

test.describe('a reload mid-Workout', () => {
  test('shows the Resume_Prompt, never the Preparing_Panel; Resume holds the Workout and it finishes once', async ({
    page,
  }) => {
    await confirmFresh(page, 1);
    const clockBefore = await storedClock(page);
    await page.clock.runFor(6_000);
    await expect.poll(() => storedClock(page)).toBeGreaterThan(clockBefore);

    await reloadMidWorkout(page);
    await expect(resumePrompt(page)).toBeVisible();
    // The page-hide save of the reload is the last one: read the checkpoint now.
    const stored = await readCheckpoint(page);
    await expect(startButton(page)).toHaveCount(0);
    await expect(resumePrompt(page)).toContainText(promptText(1, candyPerSet, true));
    await expect(resumePrompt(page)).toContainText(en['resume.awayNote']);

    // Minutes pass while the prompt is open.
    await page.clock.fastForward(5 * 60_000);
    await resumeButton(page).click();

    const panel = restoredPausedPanel(page);
    await expect(panel).toBeVisible();
    await expect(panel).toContainText(en['workout.paused.restored']);
    await expect(panel).toContainText(exerciseName(slotAt(1).entry));
    await expect(panel).toContainText(
      format('workout.rest.next', {
        exercise: exerciseName(slotAt(1).entry),
        number: String(slotAt(1).slot.setNumber),
        count: String(slotAt(1).slot.setCount),
        target: format('routine.target.reps', { reps: String(slotAt(1).slot.target.reps) }),
      }),
    );
    const timer = restTimer(page);
    const expectedTimer = heldTimerText(stored);
    await expect(timer).toHaveText(expectedTimer);
    await page.clock.fastForward(10 * 60_000);
    await expect(timer).toHaveText(expectedTimer);
    const heldSeconds = await timerSeconds(timer);

    await page.getByRole('button', { name: en['workout.resume'], exact: true }).click();
    await expect(restHeading(page)).toBeVisible();
    expect(await timerSeconds(timer)).toBeLessThanOrEqual(heldSeconds);
    expect(await timerSeconds(timer)).toBeGreaterThan(heldSeconds - 3);

    await finishFrom(page, 1, true);
    await expect(page.getByText(outcomeText('completed'), { exact: true })).toBeVisible();
    await expect(
      page.getByText(format('summary.candy', { candy: String(fullCandy) }), { exact: true }),
    ).toBeVisible();
    expect(await readCheckpoint(page)).toBeNull();

    await reloadMidWorkout(page);
    await expect(startButton(page)).toBeVisible();
    await expect(resumePrompt(page)).toHaveCount(0);

    await page.goto('/history');
    await expect(historyEntries(page)).toHaveCount(1);
    await expect(historyEntries(page).first()).toContainText(outcomeText('completed'));
  });

  test('then Discard records an abandoned entry with the confirmed Sets, raises the balance and shows a fresh Workout', async ({
    page,
  }) => {
    await confirmFresh(page, 2);
    await reloadMidWorkout(page);
    await expect(resumePrompt(page)).toBeVisible();
    await expect(resumePrompt(page)).toContainText(promptText(2, 2 * candyPerSet, true));

    await discardButton(page).click();
    await expect(resumePrompt(page)).toHaveCount(0);
    await expect(
      page.getByText(format('resume.discarded', { candy: String(2 * candyPerSet) }), { exact: true }),
    ).toBeVisible();
    await expect(startButton(page)).toBeVisible();

    expect(await readCheckpoint(page)).toBeNull();
    const stored = (await readProgress(page)) as {
      candy: number;
      history: { outcome: string; candyEarned: number; routineId: string }[];
    };
    expect(stored.candy).toBe(welcomeGiftCandy + 2 * candyPerSet);
    expect(stored.history).toHaveLength(1);
    expect(stored.history[0]).toMatchObject({
      outcome: 'abandoned',
      candyEarned: 2 * candyPerSet,
      routineId: routine.id,
    });

    await page.goto('/');
    await expect(page.getByText(balanceText(welcomeGiftCandy + 2 * candyPerSet), { exact: true })).toBeVisible();
    await expect(resumePrompt(page)).toHaveCount(0);
  });

  test('a Workout held in a seconds Set restores with its Set timer unchanged by closed time', async ({
    page,
  }) => {
    const checkpoint = stretchSetCheckpoint();
    await seedCheckpoint(page, checkpoint, welcomeGiftCandy);
    await page.goto(routinePath);
    await expect(resumePrompt(page)).toBeVisible();
    await page.clock.fastForward(3 * 60_000);
    await resumeButton(page).click();

    const panel = restoredPausedPanel(page);
    await expect(panel).toBeVisible();
    const timer = page.getByRole('timer', { name: en['workout.timer.set'], exact: true });
    const expected = heldTimerText(checkpoint);
    expect(expected).toBe('0:20');
    await expect(timer).toHaveText(expected);
    await page.clock.fastForward(60_000);
    await expect(timer).toHaveText(expected);
  });
});

// --- the Home_Screen ---------------------------------------------------------------

test.describe('the Home_Screen prompt', () => {
  test('Resume opens the Workout_Route with no second prompt, and a reload there asks again', async ({
    page,
  }) => {
    await seedCheckpoint(page, graveyardShiftCheckpoint(1), welcomeGiftCandy + candyPerSet);
    await page.goto('/');
    await expect(resumePrompt(page)).toBeVisible();
    await expect(resumePrompt(page)).toContainText(promptText(1, candyPerSet, true));
    await resumeButton(page).click();

    await expect(page).toHaveURL(new RegExp(`${routinePath}$`));
    await expect(restoredPausedPanel(page)).toBeVisible();
    await expect(resumePrompt(page)).toHaveCount(0);
    await expect(startButton(page)).toHaveCount(0);

    await reloadMidWorkout(page);
    await expect(resumePrompt(page)).toBeVisible();
    await expect(startButton(page)).toHaveCount(0);
  });

  test('Discard removes the prompt and updates the balance in place', async ({ page }) => {
    await seedCheckpoint(page, graveyardShiftCheckpoint(2), welcomeGiftCandy);
    await page.goto('/');
    await expect(page.getByText(balanceText(welcomeGiftCandy), { exact: true })).toBeVisible();
    await expect(resumePrompt(page)).toBeVisible();

    await discardButton(page).click();
    await expect(resumePrompt(page)).toHaveCount(0);
    await expect(
      page.getByText(balanceText(welcomeGiftCandy + 2 * candyPerSet), { exact: true }),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/$/);
    expect(await readCheckpoint(page)).toBeNull();
  });
});

// --- saving ----------------------------------------------------------------------

test.describe('saving the checkpoint', () => {
  test('is repeated at least every 5 seconds while a Rest runs', async ({ page }) => {
    await confirmFresh(page, 1);
    const before = await storedClock(page);
    await page.clock.runFor(6_000);
    await expect.poll(() => storedClock(page)).toBeGreaterThanOrEqual(before + 4_000);
    const second = await storedClock(page);
    await page.clock.runFor(6_000);
    await expect.poll(() => storedClock(page)).toBeGreaterThan(second);
  });

  test('is saved on pagehide between two saves', async ({ page }) => {
    await confirmFresh(page, 1);
    await page.clock.runFor(2_000);
    const before = await readProgressText(page);
    const clockBefore = await storedClock(page);
    await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
    await expect.poll(() => storedClock(page)).toBeGreaterThan(clockBefore);
    expect(await readProgressText(page)).not.toBe(before);
  });

  test('a Workout that reached the summary leaves no checkpoint and no prompt', async ({ page }) => {
    await openPreparing(page, routine);
    await startWorkout(page);
    await finishFrom(page, 0, false);
    expect(await readCheckpoint(page)).toBeNull();
    await page.goto('/');
    await expect(homeBalance(page)).toBeVisible();
    await expect(resumePrompt(page)).toHaveCount(0);
    await page.goto(routinePath);
    await expect(startButton(page)).toBeVisible();
    await expect(resumePrompt(page)).toHaveCount(0);
  });

  test('a blocked setItem keeps the Workout running', async ({ page }) => {
    await blockStorageWrites(page);
    await openPreparing(page, routine);
    await startWorkout(page);
    await confirmCurrentSet(page);
    await expect(restHeading(page)).toBeVisible();
    await page.clock.fastForward(slotAt(0).slot.restSeconds * 1_000 + marginMs);
    await expect(
      page.getByRole('heading', { level: 2, name: exerciseName(slotAt(1).entry), exact: true }),
    ).toBeVisible();
    expect(await readProgressText(page)).toBeNull();
  });
});

// --- migration and bad data ------------------------------------------------------

test.describe('stored data', () => {
  test('a version 1 text keeps its Candy and history and is stored as version 3 after the first change', async ({
    page,
  }) => {
    const history = [record(Date.parse('2026-11-19T09:00:00Z'), 'completed', fullCandy)];
    await seedVersion1(page, 30, history);
    await page.goto('/');
    await expect(page.getByText(balanceText(30), { exact: true })).toBeVisible();
    await expect(resumePrompt(page)).toHaveCount(0);
    expect(((await readProgress(page)) as { schemaVersion: number }).schemaVersion).toBe(1);

    await page.goto(routinePath);
    await expect(startButton(page)).toBeVisible();
    await startWorkout(page);
    await expect.poll(async () => ((await readProgress(page)) as { schemaVersion: number }).schemaVersion).toBe(3);
    const stored = (await readProgress(page)) as { candy: number; history: unknown[] };
    expect(stored.candy).toBe(30);
    expect(stored.history).toEqual(history);

    await page.goto('/history');
    await expect(historyEntries(page)).toHaveCount(1);
  });

  test('a junk checkpoint is dropped and the Candy stays', async ({ page }) => {
    // Junk on purpose: a version 2 text whose checkpoint is not a checkpoint.
    await seedVersion2(page, 23, [], { version: 1, workout: 'junk' } as unknown as WorkoutCheckpoint);
    await page.goto('/');
    await expect(page.getByText(balanceText(23), { exact: true })).toBeVisible();
    await expect(resumePrompt(page)).toHaveCount(0);
    await page.goto(routinePath);
    await expect(startButton(page)).toBeVisible();
    await expect(resumePrompt(page)).toHaveCount(0);
  });

  test('a checkpoint of a changed Routine is cleared and nothing is recorded', async ({ page }) => {
    const checkpoint = graveyardShiftCheckpoint(1) as unknown as { workout: { slots: { setCount: number }[] } };
    const first = checkpoint.workout.slots[0];
    if (first === undefined) throw new Error('The checkpoint holds no Set slots.');
    first.setCount = first.setCount + 5;
    await seedCheckpoint(page, checkpoint as unknown as WorkoutCheckpoint, 12);
    await page.goto('/');
    await expect(page.getByText(balanceText(12), { exact: true })).toBeVisible();
    await expect(resumePrompt(page)).toHaveCount(0);
    await expect.poll(() => readCheckpoint(page)).toBeNull();
    const stored = (await readProgress(page)) as { candy: number; history: unknown[] };
    expect(stored.candy).toBe(12);
    expect(stored.history).toEqual([]);
  });
});

// --- rendering -------------------------------------------------------------------

test.describe('rendering', () => {
  test('the server HTML of the Workout_Route holds the loading text and one h1, no panel and no prompt', async ({
    page,
  }) => {
    const html = await (await page.request.get(routinePath)).text();
    expect(html).toContain(en['resume.loading']);
    expect(html.match(/<h1[\s>]/g) ?? []).toHaveLength(1);
    expect(html).not.toContain(en['workout.start']);
    expect(html).not.toContain(en['resume.heading']);
    expect(html).not.toContain(en['resume.resume']);
  });

  for (const path of ['/', routinePath]) {
    test(`${path}: hydration logs no message, with a checkpoint stored`, async ({ page }) => {
      const messages: string[] = [];
      page.on('console', (message) => messages.push(message.text()));
      page.on('pageerror', (error) => messages.push(error.message));
      await seedCheckpoint(page, graveyardShiftCheckpoint(1), welcomeGiftCandy);
      await page.goto(path);
      await expect(resumePrompt(page)).toBeVisible();
      expect(messages.filter((text) => /hydrat/i.test(text))).toEqual([]);
    });
  }
});

// --- the prompt's look ---------------------------------------------------------------

test.describe('the prompt layout', () => {
  async function expectFits(page: Page, label: string): Promise<void> {
    const size = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    }));
    expect(size.scrollWidth, `${label}: page scroll width`).toBeLessThanOrEqual(size.innerWidth);
    const clipped = await page.evaluate(() =>
      Array.from(document.querySelectorAll('main h1, main h2, main p, main button, main section'))
        .filter((el) => el.scrollWidth > el.clientWidth || el.getBoundingClientRect().right > window.innerWidth)
        .map((el) => el.textContent ?? ''),
    );
    expect(clipped, `${label}: clipped text`).toEqual([]);
  }

  for (const path of ['/', routinePath]) {
    test(`${path}: a labelled region with tall buttons and no animation`, async ({ page }) => {
      await seedCheckpoint(page, graveyardShiftCheckpoint(1), welcomeGiftCandy);
      await page.goto(path);
      const prompt = resumePrompt(page);
      await expect(prompt).toBeVisible();
      await expect(prompt.getByRole('heading', { name: en['resume.heading'] })).toBeVisible();

      const facts = await prompt.evaluate((element) => {
        const rem = Number.parseFloat(getComputedStyle(document.documentElement).fontSize);
        const all = [element, ...Array.from(element.querySelectorAll('*'))];
        return {
          rem,
          buttons: Array.from(element.querySelectorAll('button')).map((button) => ({
            text: button.textContent ?? '',
            height: button.getBoundingClientRect().height,
          })),
          motion: all.map((el) => ({
            animationName: getComputedStyle(el).animationName,
            durations: getComputedStyle(el).transitionDuration.split(',').map((d) => d.trim()),
          })),
        };
      });
      expect(facts.buttons).toHaveLength(2);
      for (const button of facts.buttons) {
        expect(button.height, `height of "${button.text}"`).toBeGreaterThanOrEqual(3 * facts.rem);
      }
      for (const item of facts.motion) {
        expect(item.animationName).toBe('none');
        for (const duration of item.durations) expect(duration).toBe('0s');
      }
    });

    test(`${path}: no sideways scroll or clipped text at 320 CSS px`, async ({ page }) => {
      await page.setViewportSize({ width: 320, height: 640 });
      await seedCheckpoint(page, graveyardShiftCheckpoint(1), welcomeGiftCandy);
      await page.goto(path);
      await expect(resumePrompt(page)).toBeVisible();
      await expectFits(page, `${path} at 320 CSS px`);
    });

    test(`${path}: no sideways scroll or clipped text at 200% text size`, async ({ page }) => {
      await seedCheckpoint(page, graveyardShiftCheckpoint(1), welcomeGiftCandy);
      await page.goto(path);
      await expect(resumePrompt(page)).toBeVisible();
      await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
      await page.evaluate(async () => {
        await document.fonts.ready;
      });
      await expectFits(page, `${path} at 200% text size`);
    });
  }
});

// --- the Coach in a restored Workout ---------------------------------------------------

test.describe('the Coach', () => {
  test('is held in the restored Paused_Panel and draws no frames', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'laptop', 'The Coach render loop is checked on the laptop project.');
    const counter = await countDrawCalls(page);
    await seedCheckpoint(page, graveyardShiftCheckpoint(1), welcomeGiftCandy);
    await page.goto(routinePath);
    await resumeButton(page).click();
    await expect(restoredPausedPanel(page)).toBeVisible();

    const entry = slotAt(1).entry;
    const region = page.getByRole('region', { name: en['viewer.region.label'], exact: true });
    await expect(region).toBeVisible();
    await expect
      .poll(() => page.locator('[data-viewer-phase]').getAttribute('data-viewer-phase'), { timeout: 30_000 })
      .toBe('ready');
    await expect(
      page.getByRole('img', { name: format('viewer.coachLabel', { exercise: t(entry.nameId) }), exact: true }),
    ).toBeVisible({ timeout: 30_000 });

    let previous = await counter.read();
    for (let attempt = 0; attempt < 20; attempt += 1) {
      await page.waitForTimeout(400);
      const next = await counter.read();
      if (next === previous) break;
      previous = next;
    }
    const settled = previous;
    await page.waitForTimeout(1_500);
    expect(await counter.read(), 'draw calls while the restored Workout is paused').toBe(settled);

    // A hidden page changes nothing for a paused Workout.
    await simulatePageHidden(page, true);
    await simulatePageHidden(page, false);
    await expect(restoredPausedPanel(page)).toBeVisible();
  });
});
