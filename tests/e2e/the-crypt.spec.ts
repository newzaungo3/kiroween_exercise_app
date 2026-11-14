/**
 * The Crypt: Candy, Unlocks, Previews, the Coach name, the Equipped_Look on
 * the Exercise, Stretch and Workout screens, the Accessory_Asset, storage
 * rules, accessibility and the Render_Loop (ticket 11).
 *
 * Expected values come from the Crypt_Content and the Strings_Module, never
 * literals. The Coach is paused from the start (reduced motion). The Viewer
 * attributes `data-coach-color` and `data-coach-accessories` carry the look
 * that is on the Coach, so every look check waits for them.
 */
import { expect, test, type Locator, type Page } from '@playwright/test';

import {
  cryptContent,
  findAccessory,
  findEntryById,
  stretches,
  entries,
  findRoutine,
  type ExerciseEntry,
  type RoutineEntry,
} from '@/catalog';
import { coachNameMaxLength, schemaVersion, storageKey, welcomeGiftCandy } from '@/progress-store';
import type { UnlockRecord, WorkoutRecord } from '@/progress-store';
import { coachColorHex } from '@/ui/crypt/coach-colors';
import { safetyMessage } from '@/ui/crypt/labels';
import { nodesFor, type EquippedLook } from '@/ui/crypt/look';
import { exercisePath } from '@/ui/exercises/labels';
import { sectionName } from '@/ui/sections';
import { format, locales, t } from '@/ui/strings';
import { buildSetSlots } from '@/workout-engine';

import {
  accessoriesState,
  coachAccessoriesOf,
  coachColorOf,
  coachNameField,
  cryptBalance,
  equipToggle,
  findOption,
  liveRegion,
  nameOf,
  optionRow,
  previewToggle,
  saveNameButton,
  shortfallText,
  unlockButton,
  unlockOption,
} from './support/crypt';
import {
  graveyardShiftCheckpoint,
  homeBalance,
  readProgress,
  readProgressText,
  resumePrompt,
  seedCurrent,
  seedVersion2,
} from './support/progress';
import { countDrawCalls, waitForCoach, type DrawCallCounter } from './support/webgl';
import { openPreparing, startWorkout } from './support/workout';

const en = locales.en;

test.describe.configure({ timeout: 180_000 });
test.use({ reducedMotion: 'reduce' });

/** Software WebGL is slow: how long a look may take to show on the Coach. */
const lookTimeout = 60_000;

const previewExercise: ExerciseEntry = (() => {
  const found = findEntryById(cryptContent.previewExerciseId);
  if (found === undefined) throw new Error('The Catalog has no Crypt_Preview_Exercise.');
  return found;
})();
const graveRisePath = exercisePath(previewExercise);
const stretch: ExerciseEntry = (() => {
  const found = stretches[0];
  if (found === undefined) throw new Error('The Catalog has no Stretch.');
  return found;
})();
const routine: RoutineEntry = (() => {
  const found = findRoutine('graveyard-shift');
  if (found === undefined) throw new Error('The Catalog has no Routine "graveyard-shift".');
  return found;
})();

const witchHat = findOption('witch-hat');
const pumpkinHead = findOption('pumpkin-head');
const glowingEyes = findOption('glowing-eyes');
const witchColor = findOption('witch');
const ashColor = findOption('ash');
const moonlightColor = findOption('moonlight');
const emberColor = findOption('ember');
const boneColor = findOption('bone');

// --- helpers ---------------------------------------------------------------

function unlockRecord(optionId: string): UnlockRecord {
  const option = findOption(optionId);
  return { id: option.id, kind: option.kind, candySpent: option.price };
}

const allAccessoryUnlocks = cryptContent.accessories.map((entry) => unlockRecord(entry.id));

const defaultLook: EquippedLook = { color: 'bone', accessories: [] };

async function openCrypt(page: Page): Promise<void> {
  await page.goto('/crypt');
  await expect(cryptBalance(page)).toBeVisible();
}

function balanceText(candy: number): string {
  return format('crypt.balance', { candy: String(candy) });
}

/** Waits until the Coach in the Viewer wears exactly this look. */
async function expectLook(page: Page, look: EquippedLook): Promise<void> {
  await expect
    .poll(() => coachColorOf(page), { message: 'data-coach-color', timeout: lookTimeout })
    .toBe(coachColorHex(look.color));
  const expectedNodes = [...nodesFor(look.accessories)].sort().join(' ');
  await expect
    .poll(async () => (await coachAccessoriesOf(page)).sort().join(' '), {
      message: 'data-coach-accessories',
      timeout: lookTimeout,
    })
    .toBe(expectedNodes);
}

function viewerRegion(page: Page): Locator {
  return page.getByRole('region', { name: en['viewer.region.label'], exact: true });
}

function hasPath(path: string): (url: URL) => boolean {
  return (url) => url.pathname === path;
}

/** Counts the requests the page makes for the Accessory_Asset. */
function watchAccessoryAsset(page: Page): { count(): number } {
  let requests = 0;
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === cryptContent.accessoryAsset) requests += 1;
  });
  return { count: () => requests };
}

function recordedMessages(page: Page): string[] {
  const messages: string[] = [];
  page.on('console', (message) => messages.push(message.text()));
  page.on('pageerror', (error) => messages.push(error.message));
  return messages;
}

async function storedCoach(page: Page): Promise<{ name: string | null; color: string | null; accessories: string[] }> {
  const stored = (await readProgress(page)) as { coach: { name: string | null; color: string | null; accessories: string[] } };
  return stored.coach;
}

async function storedCandy(page: Page): Promise<number> {
  return ((await readProgress(page)) as { candy: number }).candy;
}

// --- first visit, free colors, Prices, Preview -----------------------------

test.describe('first visit', () => {
  test('the Welcome gift is 15 Candy and Bone White is equipped', async ({ page }) => {
    await openCrypt(page);
    await expect(cryptBalance(page)).toHaveText(balanceText(welcomeGiftCandy));
    expect(await storedCandy(page)).toBe(welcomeGiftCandy);
    await expect(equipToggle(page, boneColor)).toHaveAttribute('aria-pressed', 'true');
  });

  test('Grave Ash and Moonlight Blue equip with no Candy change; Prices and the Shortfall show', async ({ page }) => {
    await openCrypt(page);

    for (const option of [ashColor, moonlightColor]) {
      await equipToggle(page, option).click();
      await expect(equipToggle(page, option)).toHaveAttribute('aria-pressed', 'true');
      await expect(cryptBalance(page)).toHaveText(balanceText(welcomeGiftCandy));
    }
    expect((await storedCoach(page)).color).toBe(moonlightColor.id);

    // A Price shows on every Locked option.
    await expect(optionRow(page, emberColor)).toContainText(
      format('crypt.option.price', { price: String(emberColor.price) }),
    );
    await expect(unlockButton(page, emberColor)).toBeEnabled();

    // The Shortfall: the Unlock button is disabled and says how much more Candy is needed.
    await expect(unlockButton(page, pumpkinHead)).toBeDisabled();
    await expect(shortfallText(page, pumpkinHead)).toHaveText(
      format('crypt.needMore', { count: String(pumpkinHead.price - welcomeGiftCandy) }),
    );
    expect(await storedCandy(page)).toBe(welcomeGiftCandy);
  });

  test('the free Coach colors work with no Candy', async ({ page }) => {
    await seedCurrent(page, { candy: 0 });
    await openCrypt(page);
    await expect(cryptBalance(page)).toHaveText(balanceText(0));

    await equipToggle(page, ashColor).click();
    await expect(equipToggle(page, ashColor)).toHaveAttribute('aria-pressed', 'true');
    await expect(cryptBalance(page)).toHaveText(balanceText(0));
    expect(await storedCandy(page)).toBe(0);
    await expect(shortfallText(page, emberColor)).toHaveText(
      format('crypt.needMore', { count: String(emberColor.price) }),
    );
  });
});

test.describe('Preview', () => {
  test('a Preview shows on the Coach, is never stored and is gone after a reload', async ({ page }) => {
    await seedCurrent(page, { candy: welcomeGiftCandy });
    await openCrypt(page);
    await waitForCoach(page, { exercise: previewExercise, timeoutMs: lookTimeout });
    await expectLook(page, defaultLook);
    const before = await readProgressText(page);

    await previewToggle(page, witchColor).click();
    await previewToggle(page, witchHat).click();
    await expect(page.getByText(t('crypt.preview.note'), { exact: true })).toBeVisible();
    await expectLook(page, { color: 'witch', accessories: ['witch-hat'] });
    expect(await readProgressText(page)).toBe(before);

    await page.reload();
    await expect(cryptBalance(page)).toBeVisible();
    await waitForCoach(page, { exercise: previewExercise, timeoutMs: lookTimeout });
    await expectLook(page, defaultLook);
    await expect(page.getByText(t('crypt.preview.note'), { exact: true })).toHaveCount(0);
    expect(await readProgressText(page)).toBe(before);
  });

  test('an Exercise page opened in the same visit shows the Equipped_Look, not the Preview', async ({ page }) => {
    await seedCurrent(page, { candy: welcomeGiftCandy });
    await openCrypt(page);
    await previewToggle(page, witchColor).click();
    await expect(previewToggle(page, witchColor)).toHaveAttribute('aria-pressed', 'true');

    // Client-side navigation only: Crypt → Home → Exercises → Exercise.
    await page.getByRole('link', { name: t('common.backHome'), exact: true }).click();
    await page.waitForURL('/');
    await page
      .getByRole('navigation', { name: en['home.nav.label'], exact: true })
      .getByRole('link', { name: sectionName('exercises'), exact: true })
      .click();
    await page.waitForURL('/exercises');
    await page.locator(`a[href="${graveRisePath}"]`).click();
    await page.waitForURL(graveRisePath);

    await waitForCoach(page, { exercise: previewExercise, timeoutMs: lookTimeout });
    await expectLook(page, defaultLook);
  });
});

// --- Unlock, persistence ---------------------------------------------------

test.describe('Unlock', () => {
  test('the witch hat unlocks with the Welcome gift, persists across a reload, and unequips for good', async ({ page }) => {
    await openCrypt(page);
    await unlockOption(page, nameOf(witchHat));

    await expect(cryptBalance(page)).toHaveText(balanceText(welcomeGiftCandy - witchHat.price));
    await expect(equipToggle(page, witchHat)).toHaveAttribute('aria-pressed', 'true');
    for (const other of [glowingEyes, pumpkinHead, emberColor]) {
      await expect(unlockButton(page, other)).toBeDisabled();
      await expect(shortfallText(page, other)).toHaveText(
        format('crypt.needMore', { count: String(other.price) }),
      );
    }

    await page.reload();
    await expect(cryptBalance(page)).toHaveText(balanceText(welcomeGiftCandy - witchHat.price));
    await expect(equipToggle(page, witchHat)).toHaveAttribute('aria-pressed', 'true');
    await expect(unlockButton(page, witchHat)).toHaveCount(0);

    await equipToggle(page, witchHat).click();
    await expect(equipToggle(page, witchHat)).toHaveAttribute('aria-pressed', 'false');
    expect((await storedCoach(page)).accessories).toEqual([]);

    await page.reload();
    await expect(cryptBalance(page)).toHaveText(balanceText(welcomeGiftCandy - witchHat.price));
    await expect(equipToggle(page, witchHat)).toHaveAttribute('aria-pressed', 'false');
    await expect(unlockButton(page, witchHat)).toHaveCount(0);
  });

  test('the pumpkin head takes the hat on top and hides the glowing eyes', async ({ page }) => {
    await seedCurrent(page, {
      candy: 100,
      unlocks: allAccessoryUnlocks,
      coach: { accessories: [] },
    });
    await openCrypt(page);
    await waitForCoach(page, { exercise: previewExercise, timeoutMs: lookTimeout });

    await equipToggle(page, pumpkinHead).click();
    await equipToggle(page, witchHat).click();
    const hatOnPumpkin: EquippedLook = { color: 'bone', accessories: ['pumpkin-head', 'witch-hat'] };
    await expectLook(page, hatOnPumpkin);
    expect(await coachAccessoriesOf(page)).toContain('accessory_witch_hat_on_pumpkin');
    expect(await coachAccessoriesOf(page)).toContain('accessory_pumpkin_head');

    await equipToggle(page, glowingEyes).click();
    await expectLook(page, { color: 'bone', accessories: ['pumpkin-head', 'witch-hat', 'glowing-eyes'] });
    expect(await coachAccessoriesOf(page)).not.toContain(findAccessory('glowing-eyes')?.node ?? 'missing');
    await expect(optionRow(page, glowingEyes)).toContainText(
      format('crypt.option.hiddenBy', { accessory: nameOf(pumpkinHead) }),
    );
  });
});

// --- Coach name ------------------------------------------------------------

test.describe('Coach name', () => {
  async function saveName(page: Page, text: string): Promise<void> {
    await coachNameField(page).fill(text);
    await saveNameButton(page).click();
  }

  async function expectSafetyMessage(page: Page, name: string | null): Promise<void> {
    const safety = page.getByRole('region', { name: en['safety.heading'], exact: true });
    await expect(safety.getByText(safetyMessage(name), { exact: true })).toBeVisible();
  }

  test('the name shows in the Safety_Message on an Exercise page, a Stretch page and the Preparing_Panel', async ({ page }) => {
    await openCrypt(page);
    await saveName(page, 'Count Rattle');
    await expect(liveRegion(page)).toHaveText(format('crypt.announce.named', { coach: 'Count Rattle' }));
    expect((await storedCoach(page)).name).toBe('Count Rattle');

    await page.goto(graveRisePath);
    await expectSafetyMessage(page, 'Count Rattle');
    await page.goto(exercisePath(stretch));
    await expectSafetyMessage(page, 'Count Rattle');

    await openPreparing(page, routine);
    await expect(page.getByText(safetyMessage('Count Rattle'), { exact: true })).toBeVisible();
  });

  test('an invalid name shows the rule and keeps the stored name; an empty name brings back the default', async ({ page }) => {
    await openCrypt(page);
    await saveName(page, 'Count Rattle');
    await expect(liveRegion(page)).toHaveText(/Count Rattle/);

    await saveName(page, '<b>Bones</b>');
    await expect(
      page.getByText(format('crypt.name.invalid', { count: String(coachNameMaxLength) }), { exact: true }),
    ).toBeVisible();
    expect((await storedCoach(page)).name).toBe('Count Rattle');

    await saveName(page, '');
    await expect(liveRegion(page)).toHaveText(format('crypt.announce.named', { coach: t('coach.defaultName') }));
    expect((await storedCoach(page)).name).toBeNull();
    await page.goto(graveRisePath);
    await expectSafetyMessage(page, null);
  });

  test('an apostrophe and markup characters render as text', async ({ page }) => {
    await openCrypt(page);
    const name = "O'Bones";
    await saveName(page, name);
    await expect(liveRegion(page)).toHaveText(format('crypt.announce.named', { coach: name }));
    await page.goto(graveRisePath);
    await expectSafetyMessage(page, name);
    await expect(page.locator('main b, main i')).toHaveCount(0);
  });
});

// --- the Equipped_Look elsewhere --------------------------------------------

test.describe('Equipped_Look', () => {
  const seeded = {
    candy: 0,
    unlocks: [unlockRecord('witch'), unlockRecord('witch-hat')],
    coach: { color: 'witch', accessories: ['witch-hat'] },
  };
  const worn: EquippedLook = { color: 'witch', accessories: ['witch-hat'] };

  test('an Exercise page and a Stretch page show the look', async ({ page }) => {
    await seedCurrent(page, seeded);
    const assetRequests = watchAccessoryAsset(page);

    await page.goto(graveRisePath);
    await waitForCoach(page, { exercise: previewExercise, timeoutMs: lookTimeout });
    await expectLook(page, worn);
    expect(assetRequests.count(), 'Accessory_Asset requests with a hat on').toBeGreaterThan(0);

    await page.goto(exercisePath(stretch));
    await waitForCoach(page, { exercise: stretch, timeoutMs: lookTimeout });
    await expectLook(page, worn);
  });

  test('a Workout Set panel shows the look', async ({ page }) => {
    await seedCurrent(page, seeded);
    await page.clock.install();
    await openPreparing(page, routine);
    await startWorkout(page);
    const firstSlot = buildSetSlots(routine)[0];
    const first = firstSlot === undefined ? undefined : findEntryById(firstSlot.entryId);
    if (first === undefined) throw new Error('The Routine has no first Exercise.');
    await waitForCoach(page, { exercise: first, timeoutMs: lookTimeout });
    await expectLook(page, worn);
  });

  test('without an Accessory no Accessory_Asset is requested on an Exercise page', async ({ page }) => {
    await seedCurrent(page, { candy: 0, coach: { color: null, accessories: [] } });
    const assetRequests = watchAccessoryAsset(page);
    await page.goto(graveRisePath);
    await waitForCoach(page, { exercise: previewExercise, timeoutMs: lookTimeout });
    await expectLook(page, defaultLook);
    await page.waitForTimeout(1_000);
    expect(assetRequests.count()).toBe(0);
  });

  test('a blocked Accessory_Asset shows the Accessory_Note and the Coach still works', async ({ page }) => {
    await seedCurrent(page, seeded);
    await page.route(hasPath(cryptContent.accessoryAsset), (route) => route.abort('failed'));
    await openCrypt(page);
    await waitForCoach(page, { exercise: previewExercise, timeoutMs: lookTimeout });

    await expect
      .poll(() => accessoriesState(page), { timeout: lookTimeout })
      .toBe('failed');
    await expect(page.getByText(en['viewer.accessories.failed'], { exact: true })).toBeVisible();

    // The Coach still plays, and the Crypt's own controls still work.
    const region = viewerRegion(page);
    await region.getByRole('button', { name: en['viewer.play'], exact: true }).click();
    await expect(region.getByRole('button', { name: en['viewer.pause'], exact: true })).toBeVisible();
    await equipToggle(page, witchHat).click();
    await expect(equipToggle(page, witchHat)).toHaveAttribute('aria-pressed', 'false');
  });
});

// --- read-only browsing, migration, footprint -------------------------------

test.describe('storage', () => {
  test('browsing every Exercise and Stretch with seeded data leaves the stored text byte-identical', async ({ page }) => {
    const record: WorkoutRecord = {
      id: `${routine.id}:1`,
      routineId: routine.id,
      finishedAt: 1,
      outcome: 'completed',
      candyEarned: 14,
    };
    await seedCurrent(page, {
      candy: 7,
      history: [record],
      unlocks: [unlockRecord('witch-hat')],
      coach: { name: 'Count Rattle', color: null, accessories: ['witch-hat'] },
    });
    await page.goto('/');
    await expect(homeBalance(page)).toBeVisible();
    const before = await readProgressText(page);
    expect(before).not.toBeNull();

    for (const entry of entries) {
      await page.goto(exercisePath(entry));
      await expect(page.getByRole('heading', { level: 1, name: t(entry.nameId), exact: true })).toBeVisible();
      await expect(page.locator('[data-viewer-phase]')).toBeAttached();
    }
    expect(await readProgressText(page)).toBe(before);
  });

  test('a version 2 text keeps its Candy, history and checkpoint offer and is stored as version 3 after the first change', async ({ page }) => {
    const record: WorkoutRecord = {
      id: `${routine.id}:1`,
      routineId: routine.id,
      finishedAt: 1,
      outcome: 'completed',
      candyEarned: 14,
    };
    await seedVersion2(page, 9, [record], graveyardShiftCheckpoint(1));
    await page.goto('/');
    await expect(homeBalance(page)).toHaveText(format('home.candy.balance', { candy: '9' }));
    await expect(resumePrompt(page)).toBeVisible();
    expect(((await readProgress(page)) as { schemaVersion: number }).schemaVersion).toBe(2);

    await openCrypt(page);
    await expect(cryptBalance(page)).toHaveText(balanceText(9));
    await equipToggle(page, ashColor).click();
    await expect(equipToggle(page, ashColor)).toHaveAttribute('aria-pressed', 'true');

    const stored = (await readProgress(page)) as {
      schemaVersion: number;
      candy: number;
      history: unknown[];
      checkpoint: unknown;
      unlocks: unknown[];
    };
    expect(stored.schemaVersion).toBe(schemaVersion);
    expect(stored.candy).toBe(9);
    expect(stored.history).toHaveLength(1);
    expect(stored.checkpoint).not.toBeNull();
    expect(stored.unlocks).toEqual([]);
  });

  test('one localStorage key; sessionStorage, IndexedDB and cookies stay empty', async ({ page, context }) => {
    await openCrypt(page);
    await unlockOption(page, nameOf(witchHat));
    await saveNameThenCheck(page);

    const footprint = await page.evaluate(async () => ({
      local: Object.keys(window.localStorage),
      session: window.sessionStorage.length,
      cookie: document.cookie,
      databases: (await window.indexedDB.databases()).length,
    }));
    expect(footprint.local).toEqual([storageKey]);
    expect(footprint.session).toBe(0);
    expect(footprint.cookie).toBe('');
    expect(footprint.databases).toBe(0);
    expect(await context.cookies()).toEqual([]);
  });

  async function saveNameThenCheck(page: Page): Promise<void> {
    await coachNameField(page).fill('Count Rattle');
    await saveNameButton(page).click();
    await expect(liveRegion(page)).toHaveText(/Count Rattle/);
  }
});

// --- static build and hydration ----------------------------------------------

test.describe('static build', () => {
  test('the server HTML of /crypt shows the loading text, one h1 and no balance', async ({ request }) => {
    const html = await (await request.get('/crypt')).text();
    expect(html).toContain(t('crypt.loading'));
    expect(html.match(/<h1[\s>]/g) ?? []).toHaveLength(1);
    expect(html).toContain(sectionName('crypt'));
    expect(html).not.toContain(balanceText(welcomeGiftCandy));
    expect(html).not.toContain(format('crypt.balance', { candy: '' }));
  });

  for (const path of ['/crypt', graveRisePath]) {
    test(`${path}: hydration logs no message`, async ({ page }) => {
      const messages = recordedMessages(page);
      await seedCurrent(page, { candy: 15, unlocks: [unlockRecord('witch-hat')], coach: { accessories: ['witch-hat'] } });
      await page.goto(path);
      if (path === '/crypt') await expect(cryptBalance(page)).toBeVisible();
      else await expect(page.locator('[data-viewer-phase]')).toBeAttached();
      await page.waitForTimeout(500);
      expect(messages.filter((text) => /hydrat/i.test(text))).toEqual([]);
    });
  }
});

// --- accessibility -------------------------------------------------------------

test.describe('accessibility', () => {
  const seeded = { candy: 12, unlocks: [unlockRecord('witch-hat')], coach: { accessories: ['witch-hat'] } };

  /** The three Crypt sections as labelled regions. */
  function sections(page: Page): Locator[] {
    return [t('crypt.name.heading'), t('crypt.colors.heading'), t('crypt.accessories.heading')].map((name) =>
      page.getByRole('region', { name, exact: true }),
    );
  }

  /** Every control of the Crypt sections (buttons, the field) and the back link. */
  function controls(page: Page): Locator {
    return sections(page)
      .map((region) => region.locator('button, input'))
      .reduce((all, next) => all.or(next))
      .or(page.getByRole('link', { name: t('common.backHome'), exact: true }));
  }

  test('three labelled regions; every button has a text name; controls are at least 3rem tall', async ({ page }) => {
    await seedCurrent(page, seeded);
    await openCrypt(page);
    for (const region of sections(page)) await expect(region).toBeVisible();

    const names: string[] = [];
    for (const region of sections(page)) {
      names.push(
        ...(await region
          .getByRole('button')
          .evaluateAll((elements) => elements.map((element) => (element as HTMLElement).innerText.trim()))),
      );
    }
    expect(names.length).toBeGreaterThan(0);
    for (const name of names) expect(name.length, 'a button without a text name').toBeGreaterThan(0);

    const rem = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize));
    for (const box of await controls(page).evaluateAll((elements) =>
      elements.map((element) => element.getBoundingClientRect().height),
    )) {
      expect(box).toBeGreaterThanOrEqual(3 * rem - 0.5);
    }
  });

  for (const [label, prepare] of [
    ['320 CSS px', async (page: Page) => page.setViewportSize({ width: 320, height: 640 })],
    [
      '200% text size',
      async (page: Page) => {
        await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
        await page.evaluate(async () => {
          await document.fonts.ready;
        });
      },
    ],
  ] as const) {
    test(`no sideways scroll or clipped text at ${label}`, async ({ page }) => {
      await seedCurrent(page, seeded);
      await openCrypt(page);
      await prepare(page);

      const size = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
      }));
      expect(size.scrollWidth, `${label}: page scroll width`).toBeLessThanOrEqual(size.innerWidth);
      const clipped = await page.evaluate(() =>
        Array.from(document.querySelectorAll('main h1, main h2, main p, main button, main li, main label'))
          .filter((el) => el.scrollWidth > el.clientWidth + 1 || el.getBoundingClientRect().right > window.innerWidth + 1)
          .map((el) => el.textContent ?? ''),
      );
      expect(clipped, `${label}: clipped text`).toEqual([]);
    });
  }

  test('the Crypt controls have no animation and no transition', async ({ page }) => {
    await seedCurrent(page, seeded);
    await openCrypt(page);
    const styles = await controls(page).evaluateAll((elements) =>
      elements.map((element) => {
        const style = getComputedStyle(element);
        return { animation: style.animationName, transition: style.transitionDuration };
      }),
    );
    expect(styles.length).toBeGreaterThan(0);
    for (const style of styles) {
      expect(style.animation).toBe('none');
      expect(style.transition.split(',').every((part) => part.trim() === '0s')).toBe(true);
    }
  });

  test('equips and names are announced in the live region', async ({ page }) => {
    await seedCurrent(page, seeded);
    await openCrypt(page);
    await expect(liveRegion(page)).toHaveAttribute('aria-atomic', 'true');

    await equipToggle(page, ashColor).click();
    await expect(liveRegion(page)).toHaveText(format('crypt.announce.equipped', { option: nameOf(ashColor) }));
    await equipToggle(page, witchHat).click();
    await expect(liveRegion(page)).toHaveText(format('crypt.announce.unequipped', { option: nameOf(witchHat) }));
    await coachNameField(page).fill('Mr. Bones');
    await saveNameButton(page).click();
    await expect(liveRegion(page)).toHaveText(format('crypt.announce.named', { coach: 'Mr. Bones' }));
  });
});

// --- Render_Loop ------------------------------------------------------------------

test.describe('Render_Loop', () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== 'laptop', 'The frame count is checked on the laptop project only');
  });

  const settleGapMs = 400;

  async function settledCount(page: Page, counter: DrawCallCounter): Promise<number> {
    let previous = await counter.read();
    for (let attempt = 0; attempt < 25; attempt += 1) {
      await page.waitForTimeout(settleGapMs);
      const next = await counter.read();
      if (next === previous) return next;
      previous = next;
    }
    throw new Error('The Viewer kept drawing frames after it should have stopped.');
  }

  test('an equip while the Coach is paused draws a bounded number of frames, then none', async ({ page }) => {
    await seedCurrent(page, { candy: 0, unlocks: [unlockRecord('witch-hat')], coach: { accessories: [] } });
    const counter = await countDrawCalls(page);
    await openCrypt(page);
    await waitForCoach(page, { exercise: previewExercise, timeoutMs: lookTimeout });
    await expect.poll(() => accessoriesState(page), { timeout: lookTimeout }).toBe('ready');

    // One drawn frame, measured while the Coach plays; then pause.
    const region = viewerRegion(page);
    await region.getByRole('button', { name: en['viewer.play'], exact: true }).click();
    const oneFrame = await counter.largestFrame();
    expect(oneFrame, 'one drawn frame makes draw calls').toBeGreaterThan(0);
    await region.getByRole('button', { name: en['viewer.pause'], exact: true }).click();
    await expect(region.getByRole('button', { name: en['viewer.play'], exact: true })).toBeVisible();
    const before = await settledCount(page, counter);

    await equipToggle(page, witchHat).click();
    await expectLook(page, { color: 'bone', accessories: ['witch-hat'] });
    const after = await settledCount(page, counter);

    // The look redraws; the camera may refit around the Accessory, so allow a short move.
    expect(after - before, 'draw calls after the equip').toBeGreaterThan(0);
    expect(after - before, 'draw calls after the equip: bounded').toBeLessThanOrEqual(oneFrame * 120);
    await page.waitForTimeout(1_500);
    expect(await counter.read(), 'draw calls once the Coach is settled').toBe(after);
  });
});
