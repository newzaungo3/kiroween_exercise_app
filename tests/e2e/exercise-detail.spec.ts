import { expect, type Locator, type Page, type Route, test } from '@playwright/test';

import { entries, entriesOfKind, type ExerciseEntry, kinds, neighbours } from '@/catalog';
import { backToListLabel, exercisePath, listPath } from '@/ui/exercises/labels';
import { safetyMessage } from '@/ui/crypt/labels';
import { format, locales } from '@/ui/strings';

import { waitForCoach } from './support/webgl';

const en = locales.en;

/**
 * Shared helpers for the Exercise_Detail_Screen specs. Every expected text
 * comes from the Catalog entry's string identifiers, resolved in the English
 * Locale, so a content edit never needs a test edit. None of the checks
 * depend on the Viewer state: the Written_Content and the Safety_Message are
 * static HTML outside the Viewer island (Requirement 4.5).
 */

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** The text a visitor reads for each part of an Exercise's Written_Content. */
function writtenContent(exercise: ExerciseEntry) {
  return {
    spookyName: en[exercise.nameId],
    realName: en[exercise.realNameId],
    difficulty: en[`difficulty.${exercise.difficulty}.name`],
    muscleGroups: exercise.muscleGroups.map((muscleGroup) => en[`muscleGroup.${muscleGroup}.name`]),
    steps: exercise.stepIds.map((id) => en[id]),
    cues: exercise.cueIds.map((id) => en[id]),
    safetyNotes: exercise.safetyNoteIds.map((id) => en[id]),
  };
}

/** The value (`dd`) that follows the fact label (`dt`) with this text. */
function factValue(page: Page, label: string): Locator {
  return page
    .locator('dt', { hasText: new RegExp(`^${escapeRegExp(label)}$`) })
    .locator('xpath=following-sibling::dd[1]');
}

/** The element that directly follows the level-2 heading with this name. */
function listAfterHeading(page: Page, heading: string): Locator {
  return page
    .getByRole('heading', { level: 2, name: heading, exact: true })
    .locator('xpath=following-sibling::*[1]');
}

/**
 * Checks that the page shows the Exercise_Detail_Screen of `exercise` with
 * its whole Written_Content and the Safety_Message (Requirements 4.1–4.4).
 */
async function expectWrittenContentAndSafetyMessage(page: Page, exercise: ExerciseEntry): Promise<void> {
  const content = writtenContent(exercise);

  // Spooky_Name in the one level-1 heading (Requirement 4.2).
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
  await expect(
    page.getByRole('heading', { level: 1, name: content.spookyName, exact: true }),
  ).toBeVisible();

  // Real_Name, Difficulty and every Muscle_Group (Requirement 4.2).
  const realName = factValue(page, en['exercise.facts.realName']);
  await expect(realName).toHaveText(content.realName);
  await expect(realName).toBeVisible();

  const difficulty = factValue(page, en['exercise.facts.difficulty']);
  await expect(difficulty).toHaveText(content.difficulty);
  await expect(difficulty).toBeVisible();

  const muscleGroups = factValue(page, en['exercise.facts.muscleGroups']).getByRole('listitem');
  await expect(muscleGroups).toHaveText(content.muscleGroups);
  for (const item of await muscleGroups.all()) {
    await expect(item).toBeVisible();
  }

  // Instruction_Steps as one ordered list in Catalog order (Requirement 4.3).
  const steps = listAfterHeading(page, en['exercise.steps.heading']);
  await expect(steps).toHaveJSProperty('tagName', 'OL');
  await expect(steps.getByRole('listitem')).toHaveText(content.steps);
  await expect(steps).toBeVisible();

  // Cues and Safety_Notes, each a list under its own heading (Requirement 4.3).
  const cues = listAfterHeading(page, en['exercise.cues.heading']);
  await expect(cues.getByRole('listitem')).toHaveText(content.cues);
  await expect(cues).toBeVisible();

  const safetyNotes = listAfterHeading(page, en['exercise.safetyNotes.heading']);
  await expect(safetyNotes.getByRole('listitem')).toHaveText(content.safetyNotes);
  await expect(safetyNotes).toBeVisible();

  // The Safety_Message in the Coach's voice, in its own labelled region (Requirement 4.4).
  const safety = page.getByRole('region', { name: en['safety.heading'], exact: true });
  await expect(safety).toBeVisible();
  await expect(safety.getByText(safetyMessage(null), { exact: true })).toBeVisible();
}

/** The Grave Rise Exercise_Entry, the Exercise the Viewer-state tests open. */
const graveRise: ExerciseEntry = (() => {
  const entry = entries.find((exercise) => exercise.id === 'grave-rise');
  if (entry === undefined) throw new Error('the Catalog has no Grave Rise Exercise_Entry');
  return entry;
})();

/** The document title of an Exercise_Detail_Screen, from the Strings_Module (Requirement 4.9). */
function exerciseTitle(exercise: ExerciseEntry): string {
  return format('exercise.title', { exercise: en[exercise.nameId] });
}

/** Checks the URL, the response and the title of a directly requested Exercise_Detail_Screen. */
async function expectServedDetailScreen(
  page: Page,
  exercise: ExerciseEntry,
  response: Awaited<ReturnType<Page['goto']>>,
  label: string,
): Promise<void> {
  expect(response?.status(), `status ${label}`).toBe(200);
  expect(response?.request().redirectedFrom(), `redirect ${label}`).toBeNull();
  expect(new URL(page.url()).pathname).toBe(exercisePath(exercise));
  await expect(page).toHaveTitle(exerciseTitle(exercise));
  expect(await page.title(), `title ${label}`).toContain(en[exercise.nameId]);
}

/**
 * The text a visitor would read in an HTML document, without running it:
 * scripts, styles, comments and tags removed, character references decoded
 * and whitespace collapsed. Scripts are dropped so that text found only in
 * the React payload does not count as prerendered content.
 */
function readableHtmlText(html: string): string {
  const named: Readonly<Record<string, string>> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
  return html
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (reference: string, body: string) => {
      if (body.startsWith('#x') || body.startsWith('#X')) return String.fromCodePoint(parseInt(body.slice(2), 16));
      if (body.startsWith('#')) return String.fromCodePoint(parseInt(body.slice(1), 10));
      return named[body.toLowerCase()] ?? reference;
    })
    .replace(/\s+/g, ' ');
}

/** Every Written_Content text and the Safety_Message, as a visitor reads them. */
function writtenContentTexts(exercise: ExerciseEntry): readonly string[] {
  const content = writtenContent(exercise);
  return [
    content.spookyName,
    content.realName,
    content.difficulty,
    ...content.muscleGroups,
    ...content.steps,
    ...content.cues,
    ...content.safetyNotes,
    en['safety.heading'],
    safetyMessage(null),
  ];
}

/** Matches a request URL whose path is exactly `path` (a Catalog path). */
function hasPath(path: string): (url: URL) => boolean {
  return (url) => url.pathname === path;
}

/** A Coach_Asset request held open by the test until `release` is called. */
interface HeldCoachAsset {
  /** Number of Coach_Asset requests seen so far. */
  readonly requests: () => number;
  /** Lets every held request end (as a network failure) and removes the route. */
  readonly release: () => Promise<void>;
}

/**
 * Holds every request for the Exercise's Coach_Asset open, so the Viewer
 * stays in the Loading_State for as long as the test needs. No asset file is
 * read or written. Call before `page.goto`.
 */
async function holdCoachAsset(page: Page, exercise: ExerciseEntry): Promise<HeldCoachAsset> {
  let count = 0;
  let open: () => void = () => undefined;
  const released = new Promise<void>((resolve) => {
    open = resolve;
  });
  await page.route(hasPath(exercise.coach.asset), async (route: Route) => {
    count += 1;
    await released;
    await route.abort('failed').catch(() => undefined);
  });
  return {
    requests: () => count,
    release: async () => {
      open();
      await page.unrouteAll({ behavior: 'ignoreErrors' });
    },
  };
}

/** The Viewer_Area. */
function viewerArea(page: Page): Locator {
  return page.locator('[data-viewer-phase]');
}

/** The Viewer's polite live region. */
function liveRegion(page: Page): Locator {
  return viewerArea(page).getByRole('status');
}

/** The Play/Pause button, whichever action it names. */
function playPauseButton(page: Page): Locator {
  return page
    .getByRole('button', { name: en['viewer.play'], exact: true })
    .or(page.getByRole('button', { name: en['viewer.pause'], exact: true }));
}

/** The Playback_Speed button with this Strings_Module label. */
function speedButton(page: Page, label: string): Locator {
  return page
    .getByRole('group', { name: en['viewer.speed.label'], exact: true })
    .getByRole('button', { name: label, exact: true });
}

/**
 * Checks that the visit left nothing behind in browser storage, cookies or
 * the URL (Requirement 8.8; ADR 0002).
 */
async function expectNothingStored(page: Page, exercise: ExerciseEntry): Promise<void> {
  const url = new URL(page.url());
  expect(url.pathname, 'URL path').toBe(exercisePath(exercise));
  expect(url.search, 'URL query').toBe('');
  expect(url.hash, 'URL fragment').toBe('');

  const storage = await page.evaluate(() => ({
    local: Object.keys(window.localStorage),
    session: Object.keys(window.sessionStorage),
  }));
  expect(storage.local, 'localStorage keys').toEqual([]);
  expect(storage.session, 'sessionStorage keys').toEqual([]);
  expect(await page.context().cookies(), 'cookies').toEqual([]);
}

/**
 * Software WebGL is slow: every visit here loads and renders the Coach, so with
 * four workers page loads and context teardown take longer than the default
 * 30 s budget. Same budget as viewer.spec.ts and viewer-render-loop.spec.ts.
 */
test.describe.configure({ timeout: 90_000 });

test.describe('Exercise_Detail_Screen', () => {
  // Runs in both the phone and the laptop project (Requirement 14.4).
  test('Home_Screen → Exercises → Grave Rise shows the Written_Content and the Safety_Message', async ({
    page,
  }) => {
    const spookyName = en[graveRise.nameId];

    await page.goto('/');
    await page
      .getByRole('navigation', { name: en['home.nav.label'], exact: true })
      .getByRole('link', { name: en['section.exercises.name'], exact: true })
      .click();
    await page.waitForURL('/exercises');

    await page.getByRole('link', { name: new RegExp(`^${escapeRegExp(spookyName)}`) }).click();
    await page.waitForURL(exercisePath(graveRise));

    await expectWrittenContentAndSafetyMessage(page, graveRise);
  });

  // One test per entry: each entry loads the Viewer twice, so a single looping test
  // outgrew its timeout once the Catalog held five entries.
  for (const exercise of entries) {
    test(`the Exercise_Detail_Screen of ${exercisePath(exercise)} serves directly and on reload with the Spooky_Name in its title`, async ({
      page,
    }) => {
      const response = await page.goto(exercisePath(exercise));
      await expectServedDetailScreen(page, exercise, response, 'on a direct request');
      await expectWrittenContentAndSafetyMessage(page, exercise);

      const reloaded = await page.reload();
      await expectServedDetailScreen(page, exercise, reloaded, 'after reload');
      await expectWrittenContentAndSafetyMessage(page, exercise);
    });
  }

  test('the Written_Content and the Safety_Message are in the prerendered HTML', async ({ request }) => {
    for (const exercise of entries) {
      const response = await request.get(exercisePath(exercise));
      expect(response.status(), `status of ${exercisePath(exercise)}`).toBe(200);
      const text = readableHtmlText(await response.text());
      for (const expected of writtenContentTexts(exercise)) {
        expect(text, `prerendered HTML of ${exercisePath(exercise)}`).toContain(expected.replace(/\s+/g, ' '));
      }
    }
  });

  test('Instruction_Steps are one ordered list; Cues and Safety_Notes sit under their own headings', async ({
    page,
  }) => {
    for (const exercise of entries) {
      const content = writtenContent(exercise);
      await page.goto(exercisePath(exercise));

      // Exactly one ordered list on the screen, holding the Instruction_Steps in Catalog order.
      const orderedLists = page.getByRole('main').locator('ol');
      await expect(orderedLists).toHaveCount(1);
      await expect(orderedLists.getByRole('listitem')).toHaveText(content.steps);
      await expect(listAfterHeading(page, en['exercise.steps.heading'])).toHaveJSProperty('tagName', 'OL');

      // Cues and Safety_Notes: each a list directly under its own level-2 heading.
      for (const [heading, items] of [
        [en['exercise.cues.heading'], content.cues],
        [en['exercise.safetyNotes.heading'], content.safetyNotes],
      ] as const) {
        await expect(page.getByRole('heading', { level: 2, name: heading, exact: true })).toHaveCount(1);
        const list = listAfterHeading(page, heading);
        await expect(list, `the list under "${heading}"`).toHaveJSProperty('tagName', 'UL');
        await expect(list.getByRole('listitem')).toHaveText(items);
      }
    }
  });

  test('the Exercise_Detail_Screen links back to the list screen of its Kind', async ({ page }) => {
    for (const kind of kinds) {
      const entry = entriesOfKind(kind)[0];
      if (entry === undefined) throw new Error(`the Catalog has no entry of Kind ${kind}`);
      await page.goto(exercisePath(entry));

      const back = page.getByRole('link', { name: backToListLabel(kind), exact: true });
      await expect(back).toBeVisible();
      await expect(back).toHaveAttribute('href', listPath(kind));

      await back.click();
      await page.waitForURL(listPath(kind));
      const sectionName = kind === 'stretch' ? en['section.stretches.name'] : en['section.exercises.name'];
      await expect(page.getByRole('heading', { level: 1, name: sectionName, exact: true })).toBeVisible();
    }
  });

  test('the target fact shows reps for an Exercise and seconds for a Stretch', async ({ page }) => {
    for (const entry of entries) {
      await page.goto(exercisePath(entry));
      const label = entry.target.reps !== undefined ? en['exercise.facts.targetReps'] : en['exercise.facts.targetSeconds'];
      const value = entry.target.reps ?? entry.target.seconds;
      const fact = factValue(page, label);
      await expect(fact, `target fact of ${entry.slug}`).toHaveText(String(value));
      await expect(fact).toBeVisible();
      // The other unit's label is absent.
      const other =
        entry.target.reps !== undefined ? en['exercise.facts.targetSeconds'] : en['exercise.facts.targetReps'];
      await expect(factValue(page, other)).toHaveCount(0);
    }
  });

  test('the Pager names its neighbours, omits the missing ends and leads to the neighbour', async ({ page }) => {
    for (const kind of kinds) {
      const list = entriesOfKind(kind);
      for (const entry of list as readonly ExerciseEntry[]) {
        const { previous, next } = neighbours<ExerciseEntry>(list, entry);
        await page.goto(exercisePath(entry));
        const pager = page.getByRole('navigation', { name: en['pager.label'], exact: true });

        for (const [neighbour, template] of [
          [previous, 'pager.previous'],
          [next, 'pager.next'],
        ] as const) {
          const name = neighbour === undefined ? undefined : format(template, { exercise: en[neighbour.nameId] });
          if (neighbour === undefined || name === undefined) {
            await expect(
              page.getByRole('link', { name: new RegExp(`^${escapeRegExp(en[template].split('{')[0] ?? '')}`) }),
              `${template} on ${entry.slug}`,
            ).toHaveCount(0);
            continue;
          }
          const link = pager.getByRole('link', { name, exact: true });
          await expect(link).toContainText(en[neighbour.nameId]);
          await expect(link).toHaveAttribute('href', exercisePath(neighbour));
        }

        if (next !== undefined) {
          await pager.getByRole('link', { name: format('pager.next', { exercise: en[next.nameId] }), exact: true }).click();
          await page.waitForURL(exercisePath(next));
          await expect(page.getByRole('heading', { level: 1, name: en[next.nameId], exact: true })).toBeVisible();
        }
      }
    }
  });

  test('the Written_Content and the Safety_Message stay visible while loading and while slow', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    const coachAsset = await holdCoachAsset(page, graveRise);

    await page.goto(exercisePath(graveRise));

    // Loading_State: the Coach_Asset is still on its way (Requirement 4.5).
    await expect(viewerArea(page)).toHaveAttribute('data-viewer-phase', 'loading', { timeout: 15_000 });
    await expect(liveRegion(page)).toHaveText(en['viewer.loading']);
    await expectWrittenContentAndSafetyMessage(page, graveRise);

    // Slow_Load_Notice: after 10 s the Coach_Asset is still held (Requirement 4.5).
    await expect(liveRegion(page)).toHaveText(en['viewer.slowLoad'], { timeout: 20_000 });
    await expect(viewerArea(page)).toHaveAttribute('data-viewer-phase', 'loading');
    expect(coachAsset.requests(), 'Coach_Asset requests while held').toBe(1);
    await expectWrittenContentAndSafetyMessage(page, graveRise);

    await coachAsset.release();
  });

  test('the Written_Content and the Safety_Message stay visible in the Still_Fallback', async ({ page }) => {
    await page.route(hasPath(graveRise.coach.asset), (route) => route.abort('failed'));

    await page.goto(exercisePath(graveRise));

    await expect(viewerArea(page)).toHaveAttribute('data-viewer-phase', 'fallback', { timeout: 30_000 });
    await expect(liveRegion(page)).toHaveText(en['viewer.fallback.message']);
    await expectWrittenContentAndSafetyMessage(page, graveRise);
  });

  // Needs the delivered Coach_Asset. Until the Asset_Pipeline delivers it,
  // `waitForCoach` fails and names the missing file (Open decision 1).
  test('the Written_Content and the Safety_Message stay visible in the 3D scene', async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto(exercisePath(graveRise));

    await waitForCoach(page, { exercise: graveRise });
    await expectWrittenContentAndSafetyMessage(page, graveRise);
  });

  test('visiting the Exercise_Detail_Screen stores nothing in browser storage, cookies or the URL', async ({
    page,
  }) => {
    await page.goto(exercisePath(graveRise));
    // Wait until the Viewer has left its first phase, so its effects have run.
    await expect(viewerArea(page)).not.toHaveAttribute('data-viewer-phase', 'checking', { timeout: 15_000 });
    await expectNothingStored(page, graveRise);
  });

  // Needs the delivered Coach_Asset. Until the Asset_Pipeline delivers it,
  // `waitForCoach` fails and names the missing file (Open decision 1).
  test('the Playback_Speed and the play state are not stored', async ({ page }) => {
    test.setTimeout(90_000);
    // Without the Reduced_Motion_Preference the Demo_Clip starts playing (Requirement 8.1).
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto(exercisePath(graveRise));
    await waitForCoach(page, { exercise: graveRise });

    // Change the Playback_Speed and pause.
    await speedButton(page, en['viewer.speed.half']).click();
    await expect(speedButton(page, en['viewer.speed.half'])).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: en['viewer.pause'], exact: true }).click();
    await expect(playPauseButton(page)).toHaveText(en['viewer.play']);
    await expectNothingStored(page, graveRise);

    // A reload starts again from the defaults: 1× and playing (Requirement 8.8).
    await page.reload();
    await waitForCoach(page, { exercise: graveRise });
    await expect(speedButton(page, en['viewer.speed.normal'])).toHaveAttribute('aria-pressed', 'true');
    await expect(speedButton(page, en['viewer.speed.half'])).toHaveAttribute('aria-pressed', 'false');
    await expect(playPauseButton(page)).toHaveText(en['viewer.pause']);
    await expectNothingStored(page, graveRise);
  });
});

test.describe('Exercise_Detail_Screen without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('the Written_Content and the Safety_Message are shown before any script runs', async ({ page }) => {
    for (const exercise of entries) {
      await page.goto(exercisePath(exercise));
      await expect(page).toHaveTitle(exerciseTitle(exercise));
      await expectWrittenContentAndSafetyMessage(page, exercise);
    }
  });
});
