# Implementation Plan: Candy and History

## Overview

This plan builds ticket `08-candy-and-history` as described in `design.md`, in TypeScript strict mode. Work goes bottom-up. First the new strings, then the pure Progress_Store with its tests, then a checkpoint. After that come the record mapping, the Workout_Screen hook points, the client hook and the Recording_Bridge, the Home_Screen balance and the History_Screen, the updates to earlier tests, the new E2E spec, the steering update, a final checkpoint and a commit that waits for the user.

Ground rules for every task:

- The shell is PowerShell on Windows. The agent may run `npx tsc --noEmit`, `npx vitest --run`, `npm run build` and `npx playwright test`. The agent never runs `npm run dev` or `npm run start`. Use the terminal only for npm, npx, node, uvx and git. Read and write files with the file tools.
- Every user-facing string comes from `src/ui/strings.ts`. Every colour comes from `src/ui/theme/tokens.ts`. Use glossary terms in identifiers, test names and comments (Candy, Welcome gift, Workout outcome, Routine, Workout; never Points, coins, score, XP, Session, Status or Result). New text never claims or implies correct form and never blames the user.
- ADR 0002 allows browser storage; this ticket writes exactly one `localStorage` key, `spooky-coach:progress`, and nothing to `sessionStorage`, IndexedDB or cookies. Only `src/progress-store/local-storage.ts` names `localStorage`. Only `src/ui/progress/` imports `@/progress-store`. `src/workout-engine/`, `src/ui/workout/` and `src/app/routines/` never import the Progress_Store and never name a storage API; the existing isolation scans must pass unchanged. ADR 0004: no task creates or edits a GLB or a Still_Image; leave `assets/` and `.kiro/settings/mcp.json` untouched.
- The Progress_Store reads no clock and the Workout_Engine is not edited. The wall-clock time is read with `Date.now()` only inside the `onFinished` handler of `RecordedWorkoutScreen`.
- Property tests use `fast-check` with `numRuns: 200` and the tag comment `// Feature: candy-and-history, Property N: …`. Store tests use the in-memory adapter and never real time or fake timers.
- Between task 1.1 and task 5.2, `src/app/history/page.tsx` still shows the Placeholder_Screen for History, so `npx tsc --noEmit` passes throughout. Task 5.2 moves History out of the Placeholder list and removes its message string in one step; tests that still list History as a Placeholder (`tests/unit/strings.test.ts`, `tests/e2e/navigation.spec.ts`) fail between task 5.2 and tasks 5.3 and 6.2, so the checkpoints before task 9 run only the test files named in them.
- Light Playwright: the E2E specs use the production build and software WebGL. While developing, run one spec file and one project at a time with `--workers=1`, for example `npx playwright test tests/e2e/candy-and-history.spec.ts --project=phone --workers=1`. Run the whole suite only at the final checkpoint (task 9), with a long timeout (up to 1,800,000 ms): it builds the Site first.
- Ask the user before every commit. Stage files by name, never with `git add -A` or `git add .`. Never push.

## Tasks

- [x] 1. Strings_Module additions
  - [x] 1.1 Add the new English Locale entries to `src/ui/strings.ts`
    - Add every identifier of the design's "Strings_Module additions": `home.candy.loading`, `home.candy.balance`, `home.candy.welcome`, `progress.unavailable`, `summary.balance`, `history.loading`, `history.total`, `history.list.label`, `history.empty`, `history.empty.link`, `history.entry.unknownRoutine`
    - Templates: `home.candy.balance` and `home.candy.welcome` take `{candy}`, `summary.balance` takes `{balance}`, `history.total` takes `{candy}`. Do not remove `section.history.message` yet (task 5.2 does)
    - _Requirements: 11.1, 11.2, 11.3, 11.4_

  - [x] 1.2 Update the string tests
    - `tests/unit/strings-format.test.ts`: list `home.candy.balance` (`candy`), `home.candy.welcome` (`candy`), `summary.balance` (`balance`) and `history.total` (`candy`) by hand
    - `tests/unit/strings.test.ts`: change the "no Workout, Summary, Routine or Safety_Message string says the Candy was saved or added to a balance" test so it skips exactly the id `summary.balance` and nothing else, with a comment that ticket 08 supersedes the rule for that one line; extend the shaming-word test to the prefixes `home.`, `history.`, `progress.` and `summary.`; add the examples "every new identifier is non-blank" and "the empty History text and the loading texts contain no digit"; the existing Avoid-word and form-claim tests must pass over the new strings unchanged
    - _Requirements: 11.2, 11.3, 11.4, 11.5, 11.6_

- [x] 2. Progress_Store
  - [x] 2.1 Create the types, the pure rules and the codec
    - `src/progress-store/types.ts`: `schemaVersion`, `welcomeGiftCandy` (15), `storageKey` (`spooky-coach:progress`), `WorkoutRecord`, `ProgressData`, `ProgressSnapshot`, `RecordResult`, `StorageAdapter`, `ProgressStore`; `import type { WorkoutOutcome } from '@/workout-engine'` only
    - `src/progress-store/rules.ts`: `emptyProgress`, `validateRecord` (non-empty `id` and `routineId`, `finishedAt` an integer from 0 to 8,640,000,000,000,000, `candyEarned` a non-negative safe integer, `outcome` in the list, with a compile-time check that `WorkoutOutcome` is assignable to the list), `grantWelcomeGift` (null when already granted), `recordWorkout` (`'invalid'`, `'duplicate'` or the new data), `totalCandyEarned`, `snapshotOf` (copies, reverses history, sums Candy). Every function returns new objects
    - `src/progress-store/codec.ts`: `serialiseProgress` and `parseProgress` with the result kinds `data`, `none` and `newer`, exactly as the design's Codec section; `parseProgress` never throws; `newer` is decided before the shape check; version 1 data must have unique ids and valid records
    - No import of React, Three.js, the UI, the Catalog or runtime Workout_Engine code; no `Date`, `performance`, `window` or `document`
    - _Requirements: 1.3, 1.4, 2.1, 2.5, 2.6, 3.1, 3.2, 3.4, 4.1, 4.2, 4.3, 4.4, 5.1, 5.2, 5.3_

  - [x] 2.2 Create the store, the adapters and the module index
    - `src/progress-store/store.ts`: `createProgressStore(storage)` with `load()` (try the read, parse, handle `data`, `none` and `newer`), the read-modify-write change path with one `setItem` call per change, `persistent` and `newer` flags, a cached snapshot rebuilt only when the data changes, `subscribe`, and listeners called once per change; reads storage only through the adapter
    - `src/progress-store/memory-storage.ts`: `createMemoryStorage(initial?)` over a `Map`, with `dump()`
    - `src/progress-store/local-storage.ts`: `createLocalStorageAdapter()`; the only file of the folder that names `localStorage`; the property access sits inside the methods
    - `src/progress-store/index.ts`: export the store, the adapters, the types, `storageKey`, `welcomeGiftCandy` and `schemaVersion`
    - _Requirements: 1.1, 1.2, 1.6, 2.2, 2.3, 2.4, 2.6, 2.7, 3.1, 3.2, 3.3, 4.1, 5.5, 5.6_

  - [x] 2.3 Add the test support in `tests/unit/support/progress.ts`
    - Arbitraries for a valid Workout_Record (distinct ids when asked), an operation (`grant`, `record`, `reload`) and an operation sequence; a model of the expected gift flag, balance and recorded list; a spy adapter that counts `getItem` and `setItem` and can be told to throw on read, on write or both; `runOperations(adapter, operations)` that creates a store, applies each operation (a `reload` creates a new store over the same adapter) and returns the results and snapshots after every step. Keep the existing support files unchanged
    - _Requirements: 13.1, 13.2_

  - [x] 2.4 Write property tests for the codec
    - **Property 1: Serialisation round trip** and **Property 7: Unreadable stored text is treated as no data**
    - File `tests/unit/progress-codec.test.ts`, one `fc.assert` per property. Add the examples "the stored text carries the schema version 1", "text from a newer schema version parses as newer", "a missing history list parses as no data", "a record with a negative Candy parses as no data", "a version 1 history with a repeated id parses as no data". `numRuns: 200` and the tag comments
    - **Validates: Requirements 2.1, 2.3, 2.5, 2.8**

  - [x] 2.5 Write property tests for persistence, the Welcome gift and the invariant
    - **Property 2: A new store over the same storage reports the same state**, **Property 3: The Welcome gift is granted at most once** and **Property 4: Balance, total and order agree**
    - File `tests/unit/progress-store.test.ts`, one `fc.assert` per property, using `runOperations`. Add the examples "a fresh store has no Candy and writes nothing", "a Welcome gift is granted once and 15 Candy are added", "the Welcome gift is not granted again after a reload", "the Candy balance persists across a new store over the same storage", "the history lists Workouts newest first", "the total Candy earned excludes the Welcome gift". `numRuns: 200` and the tag comments
    - **Validates: Requirements 2.2, 2.9, 3.1, 3.2, 3.3, 3.4, 3.5, 5.1, 5.2, 5.3, 5.4**

  - [x] 2.6 Write property tests for recording
    - **Property 5: Recording a valid record adds its Candy once** and **Property 6: Rejected records change nothing**
    - File `tests/unit/progress-rules.test.ts`, one `fc.assert` per property, against the store and the pure rules, with the spy adapter counting one `setItem` call for a recorded Workout and none for a rejected one, and an oracle predicate for `validateRecord`. Add the examples "a completed Workout adds 14 Candy", "a partial Workout adds its Candy", "an abandoned Workout adds the Candy for the confirmed Sets", "a Workout with 0 Candy is recorded", and one example for each invalid field (empty id, empty Routine id, negative Candy, a fraction, an unknown outcome, `finishedAt` out of range). `numRuns: 200` and the tag comments
    - **Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7**

  - [x] 2.7 Write property tests for memory-only modes, interleaved stores and listeners
    - **Property 8: Memory-only modes keep the rules and write nothing they must not**, **Property 9: Two stores over one storage lose no update** and **Property 10: Listeners hear each change once**
    - File `tests/unit/progress-modes.test.ts` (a separate file from task 2.5, so the two tasks never write the same file). One `fc.assert` per property. Add the examples "an adapter that throws on write keeps the Candy in memory and reports not persistent", "an adapter that throws on read starts empty and reports not persistent", "data from a newer schema version is never overwritten", "a snapshot that the caller changes does not change the store", "the store reads only through the adapter". `numRuns: 200` and the tag comments
    - **Validates: Requirements 1.2, 2.4, 2.6, 2.7, 5.5, 5.6**

  - [x] 2.8 Add the module-boundary scan `tests/unit/progress-boundaries.test.ts`
    - Scan `src/progress-store/`: no import of React, Three.js, `@/viewer`, `@/ui`, `@/app`, `@/catalog` or runtime `@/workout-engine` (only `import type`); no `Date`, `performance`, `window` or `document`; `localStorage`, `sessionStorage` and `indexedDB` named only in `local-storage.ts`, and only `localStorage` there. Scan `src/` for imports of `@/progress-store` and allow them only in `src/progress-store/` and `src/ui/progress/`. Include a fixture that must be flagged and one that must pass for each rule. Reuse the scanning helpers of `tests/unit/workout-isolation.test.ts` or `module-boundaries.test.ts` if they are exported; otherwise write the scan in this file
    - _Requirements: 1.3, 1.4, 1.5, 1.6, 10.1, 13.5_

- [x] 3. Checkpoint - Progress_Store block
  - Run `npx tsc --noEmit` and `npx vitest --run tests/unit/progress-codec.test.ts tests/unit/progress-store.test.ts tests/unit/progress-rules.test.ts tests/unit/progress-modes.test.ts tests/unit/progress-boundaries.test.ts tests/unit/strings.test.ts tests/unit/strings-format.test.ts tests/unit/workout-isolation.test.ts tests/unit/viewing-earns-nothing.test.ts`. All must exit 0 with no test skipped. Ensure all tests pass, ask the user if questions arise.

- [x] 4. Recording a Workout
  - [x] 4.1 Create `src/ui/progress/workout-record.ts`
    - `workoutRecordOf(view: SummaryView, routineId: string, finishedAt: number): WorkoutRecord` returning `{ id: \`${routineId}:${finishedAt}\`, routineId, finishedAt, outcome: view.outcome, candyEarned: view.candyEarned }`. Pure, takes the time as an argument, reads no clock. It never recomputes Candy
    - _Requirements: 6.2, 6.4, 6.5, 6.9_

  - [x] 4.2 Add the hook points to the Workout_Screen and the Summary_Panel
    - `src/ui/workout/WorkoutScreen.tsx`: props `onFinished?: (view: SummaryView) => void` and `recordedBalance?: number | null`; an effect with a `useRef` guard that calls `onFinished(view)` exactly once when `view.phase` becomes `summary`, for every Workout outcome; pass `recordedBalance` to `SummaryPanel`. The announcements and the focus handling stay as they are
    - `src/ui/workout/SummaryPanel.tsx`: prop `balance?: number | null`; when it is a number, render `format('summary.balance', { balance: String(balance) })` as a `p` after the bonus or no-bonus line; render nothing extra otherwise
    - No import from `@/progress-store` or `@/ui/progress`, and no storage name in `src/ui/workout/`
    - _Requirements: 6.1, 6.7, 6.8, 7.1, 7.2, 7.3, 7.4_

  - [x] 4.3 Create the client hook `src/ui/progress/useProgress.ts`
    - `'use client'`. A module-level lazy singleton `getStore()` over `createLocalStorageAdapter()`; `useSyncExternalStore(subscribe, () => getStore().snapshot(), () => null)`; one mount effect that calls `grantWelcomeGift()` and sets `welcomeJustGranted` true when it returns true (never back to false in that mount); stable `recordWorkout` and `ensureWelcomeGift` callbacks. Returns `{ snapshot, welcomeJustGranted, recordWorkout, ensureWelcomeGift }`. The store is never created during server rendering
    - _Requirements: 3.1, 8.3, 10.1, 14.2_

- [x] 5. Screens
  - [x] 5.1 Build the Home_Screen balance
    - `src/ui/progress/CandyBalance.tsx` and `CandyBalance.module.css`: a client island using `useProgress`; shows `home.candy.loading` while the snapshot is `null`, then `home.candy.balance`; adds `home.candy.welcome` while `welcomeJustGranted` and `progress.unavailable` while `persistent` is false; no live region and no role; a `min-height` so the loading text and the value take the same space; tokens only, no animation
    - `src/ui/home/HomeScreen.tsx`: render `<CandyBalance />` between the tagline and the `<nav>`; the title, tagline and navigation stay as they are and the screen stays a server component
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 12.3, 12.5, 12.6, 14.3_

  - [x] 5.2 Build the History_Screen and move History out of the Placeholders
    - `src/ui/history/date.ts`: `formatWorkoutDate(ms, timeZone?)` using `Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short', timeZone })`
    - `src/ui/history/HistoryScreen.tsx` and `HistoryScreen.module.css`: a client component with one `h1` (`sectionName('history')`), the loading text while the snapshot is `null`, the total line, then the empty state with a link to `/routines` or an `ol` labelled `history.list.label` with one `li` per entry (a `time` element with `dateTime` from `toISOString()`, the Routine's Spooky_Name or `history.entry.unknownRoutine`, `summary.outcome` with the outcome word, `summary.candy`), and a link back to `/`; links at least `3rem` tall; tokens only; no animation; the outcome is a word, never colour alone
    - `src/app/history/page.tsx`: keep the metadata and render `<HistoryScreen />`
    - `src/ui/sections.ts`: add `'history'` to `ListSectionId` so `placeholderSectionIds` becomes `['crypt']`; remove `section.history.message` from `src/ui/strings.ts`
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8, 9.9, 11.7, 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 14.1, 14.3_

  - [x] 5.3 Update and add the unit tests for the screens
    - `tests/unit/strings.test.ts`: change the Placeholder list to `['crypt']`
    - `tests/unit/history-date.test.ts`: `formatWorkoutDate` examples in UTC: a fixed time gives a fixed English text; a time just before midnight UTC shows the next day in a zone ahead of UTC; a time at 0 and at the upper bound do not throw
    - A `sections` example (in the existing section test file if there is one, otherwise `tests/unit/sections.test.ts`): `placeholderSectionIds` equals `['crypt']` and `history` has a name and a title but no message
    - _Requirements: 9.8, 9.9, 11.7, 13.1_

- [x] 6. Recording_Bridge and the earlier tests
  - [x] 6.1 Create the Recording_Bridge and render it from the Workout route
    - `src/ui/progress/RecordedWorkoutScreen.tsx` as in the design: `useProgress()`, a `balance` state, an `onFinished` callback that reads `Date.now()`, builds the record with `workoutRecordOf(view, routine.id, Date.now())`, calls `ensureWelcomeGift()` then `recordWorkout(record)` and sets the balance when `recorded` is true; renders `<WorkoutScreen routine onFinished recordedBalance />`
    - `src/app/routines/[slug]/workout/page.tsx`: render `<RecordedWorkoutScreen routine={routine} />` instead of `<WorkoutScreen … />`; the page must name no storage API and import nothing from `@/progress-store`
    - _Requirements: 3.1, 6.1, 6.2, 6.3, 6.4, 6.6, 6.7, 6.9, 7.1, 14.5_

  - [x] 6.2 Write the property test for the record mapping
    - **Property 11: A summary view maps to a valid record with the same Candy**
    - File `tests/unit/progress-record.test.ts`, using the command-script arbitrary and player of `tests/unit/support/workout.ts`. Add the examples "a completed Graveyard Shift records 14 Candy", "one skipped Set records 8 Candy and the outcome partial", "a quit after 3 confirmed Sets records 3 Candy and the outcome abandoned", "the record id is the Routine id, a colon and the finish time". `numRuns: 200` and the tag comment
    - **Validates: Requirements 6.2, 6.4, 6.5**

  - [x] 6.3 Update the earlier E2E specs that assumed empty storage
    - `tests/e2e/workout.spec.ts` (the end of the happy-path test) and `tests/e2e/workout-controls.spec.ts` (`afterEach`): replace `{ local: 0, session: 0, databases: 0 }` with a check that `localStorage` holds only the key `storageKey` (imported from `@/progress-store`; the scans cover `src/` only, not `tests/`), and that `sessionStorage`, IndexedDB and cookies are empty. Change nothing else in those files
    - `tests/e2e/navigation.spec.ts`: History is a list-style Section: replace its `message` entry and Placeholder check with a check of the History_Screen `h1`, the total line and the empty text; keep the Crypt entry as it is
    - _Requirements: 9.1, 10.4, 13.4_

- [x] 7. E2E support and the acceptance spec
  - [x] 7.1 Add `tests/e2e/support/progress.ts`
    - Helpers: `readProgress(page)` (parses the stored text under the key, or returns null), `seedProgress(page, text)` (an `addInitScript` that sets the key before the page loads), `blockStorageWrites(page)` (an init script that makes `Storage.prototype.setItem` throw), and `homeBalance(page)` / `historyEntries(page)` locator helpers. Names come from the Strings_Module
    - _Requirements: 13.3_

  - [x] 7.2 Add `tests/e2e/candy-and-history.spec.ts`
    - Both projects, `page.clock.install({ time: new Date('2026-11-20T10:00:00Z') })` before `goto`, `test.use({ timezoneId: 'UTC', reducedMotion: 'reduce' })`. Cover, with expected values from the Catalog, the Candy rule and the Strings_Module: the Welcome gift text and "Candy balance: 15" for a new visitor and the same balance without the gift text after a reload; the stored JSON (`schemaVersion` 1, `welcomeGiftGranted` true); the loading text in the server HTML and no console message that matches `/hydrat/i` on Home and History; a completed "Graveyard Shift" (14 Candy, "Your Candy balance is now 29" on the summary, Home 29 also after a reload); the History entry (UTC date text, Routine name, "Workout outcome: Completed", "Candy earned: 14", "Total Candy earned: 14"); a Workout with one skipped Set (8 Candy) and a quit after 3 confirmed Sets (3 Candy) with Home at 40 and History newest first (Abandoned, Partial, Completed) and total 25, the clock moved between Workouts; a quit before any Set recording 0 Candy; a refresh mid-Workout recording nothing; the empty History text and its link to Routines; one `h1`, an ordered list, a `time` element with `dateTime` and a link home; a seeded unknown Routine id showing the fallback text; seeded text that is not JSON giving a fresh start with the Welcome gift; a seeded `schemaVersion` of 2 leaving the stored text untouched and showing the not-persistent text; a blocked `setItem` showing the not-persistent text while the Workout still reaches its summary; `sessionStorage`, IndexedDB and cookies empty after every run; no horizontal scroll or clipped text at 320 CSS pixels and at 200% text size on Home and History; History links at least `3rem` tall; computed `animation-name` and `transition-duration` none. Run the shared theme and layout checks over `/history`
    - _Requirements: 3.1, 3.3, 4.5, 6.1, 6.4, 6.6, 7.1, 8.1, 8.2, 8.3, 8.4, 8.5, 9.2, 9.3, 9.4, 9.5, 10.2, 10.4, 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 13.3, 14.3, 14.4_

- [x] 8. Structure steering
  - [x] 8.1 Update `.kiro/steering/structure.md`
    - In "Current state", mention ticket `08-candy-and-history`: the Progress_Store with its Storage_Adapters, the recording of a Workout at the summary, the Candy_Balance on the Home_Screen, the balance on the Summary_Panel and the History_Screen. Add `src/progress-store/`, `src/ui/progress/` and `src/ui/history/` to the tracked tree, and remove `progress-store/` from the "arrives with the ticket that needs it" sentence in "Proposed app layout". List no path that is absent from the Repository (`tests/unit/repository-rules.test.ts` checks it)
    - _Requirements: 13.6_

- [x] 9. Checkpoint - Final verification
  - Run `npx tsc --noEmit`, `npx vitest --run`, `npm run build` and `npx playwright test` (the whole suite, long timeout, `--workers=1` if the machine struggles). All four must exit 0 with no test skipped. Fix every failure. Ensure all tests pass, ask the user if questions arise.
  - _Requirements: 13.7_

- [ ] 10. Commit locally
  - [-] 10.1 Ask the user, then commit
    - Ask the user for permission before committing. Run `git status --short` and show the list. Stage each changed file of this ticket by its exact path, never with `git add -A` or `git add .`; flag any file that looks like a secret. Commit locally with a short message such as `Add Candy balance, Welcome gift and Workout history (ticket 08)`. Never push and never amend
    - Leave the User tasks to the user: the real-phone eye checks at the end of `design.md`
    - _Requirements: 13.6, 13.7_

## Notes

- Tasks marked with `*` are optional; none is marked here, because every test sub-task protects a requirement of this ticket.
- Each task references specific requirements for traceability. Checkpoints ensure incremental validation.
- Property tests validate the eleven universal properties of the design; unit and E2E tests validate examples and edge cases.
- Requirements 1.3 to 1.6, 6.7, 10.1 and 13.5 are static rules, checked by the boundary scan of task 2.8 and the existing isolation scans.
- Requirement 6.6 (nothing recorded without a summary) and the Candy lost on a closed page are known gaps until ticket 09.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "2.1"] },
    { "id": 1, "tasks": ["1.2", "2.2"] },
    { "id": 2, "tasks": ["2.3"] },
    { "id": 3, "tasks": ["2.4", "2.5", "2.6", "2.7", "2.8"] },
    { "id": 4, "tasks": ["4.1", "4.2", "4.3"] },
    { "id": 5, "tasks": ["5.1", "5.2", "6.1", "6.2"] },
    { "id": 6, "tasks": ["5.3", "6.3", "7.1", "8.1"] },
    { "id": 7, "tasks": ["7.2"] },
    { "id": 8, "tasks": ["10.1"] }
  ]
}
```
