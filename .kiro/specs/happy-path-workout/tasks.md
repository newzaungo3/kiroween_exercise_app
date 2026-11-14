# Implementation Plan: Happy-Path Workout

## Overview

This plan builds ticket `06-happy-path-workout` as described in `design.md`, in TypeScript strict mode. Work goes bottom-up. First the Strings_Module additions and one Catalog finder, then the pure Workout_Engine with its tests, then the pure screen logic, then a checkpoint. After that come the Routine screens, the Workout_Screen, the static isolation guard, the E2E support and specs, the steering update, a final checkpoint and a commit that waits for the user.

Ground rules for every task:

- The shell is PowerShell on Windows. The agent may run `npx tsc --noEmit`, `npx vitest --run`, `npm run build` and `npx playwright test`. The agent never runs `npm run dev` or `npm run start`. Use the terminal only for npm, npx, node, uvx and git. Read and write files with the file tools.
- Every user-facing string comes from `src/ui/strings.ts`. Every colour comes from `src/ui/theme/tokens.ts`. Use glossary terms in identifiers, test names and comments. New text uses no glossary Avoid word, never claims or implies correct form, and never says the Candy was saved or added to a balance.
- ADR 0002: this ticket writes nothing to `localStorage`, `sessionStorage`, IndexedDB or cookies, and imports no Progress store. ADR 0004: no task creates or edits a GLB or a Still_Image; leave `assets/` and `.kiro/settings/mcp.json` untouched.
- Engine tests pass the Workout_Clock as an argument. No fake timers and no real time in Vitest. Property tests use `fast-check` with `numRuns: 200` and the tag comment `// Feature: happy-path-workout, Property N: …`.
- Between waves of group 5 and group 7, `npx tsc --noEmit` may fail: deleting `section.routines.message` breaks the old Routines code until tasks 5.1, 5.3 and 7.2 are all done. They share a wave, and every wave from wave 7 on leaves `npx tsc --noEmit` passing.
- Run `npx playwright test` with a long timeout (up to 1,800,000 ms): it builds the Site first.
- Ask the user before every commit. Stage files by name, never with `git add -A` or `git add .`. Never push.

## Tasks

- [x] 1. Strings_Module and the Catalog finder
  - [x] 1.1 Add the new English Locale entries to `src/ui/strings.ts`
    - Add every identifier of the design's "Strings_Module additions": the `routine.*` texts (title, `length.one`/`.other`, `count.exercises`/`count.stretches` `.one`/`.other`, `sets.one`/`.other`, `target.reps`/`.seconds`, `rest`, `detail.back`, `detail.steps.heading`, `detail.coolDown.heading`, `detail.start`), the `workout.*` texts (title, start, preparing.back, set.of, set.position, set.targetReps/.targetSeconds, reps.label/.fewer/.more/.invalid, timer.set/.rest/.format, set.finished, confirm, rest.heading, rest.next, announce.set/.rest/.summary) and the `summary.*` texts (heading, outcome, `outcome.completed`, setsConfirmed, setsSkipped, activeTime, candy, bonus, backToRoutine)
    - Keep `section.routines.message` for now; task 5.1 deletes it. Candy appears only under `workout.` and `summary.`
    - _Requirements: 16.1, 16.2, 16.3, 16.4, 16.5, 8.2, 9.4, 13.1, 13.2, 13.6_

  - [x] 1.2 Add the new templates to `tests/unit/strings-format.test.ts`
    - List every new template identifier by hand and check each holds exactly the placeholders of the design (`{minutes}` in both `routine.length.*`)
    - _Requirements: 16.2_

  - [x] 1.3 Add the Workout string tests to `tests/unit/strings.test.ts`
    - Test "no Workout, Summary, Routine or Safety_Message string says the Candy was saved or added to a balance": for every identifier starting with `workout.`, `summary.`, `routine.` or `safety.`, the text does not match `/\b(saved?|saving|kept|stored?|balance|banked?|wallet|added to)\b/i`
    - Test "the Workout outcome word exists for every outcome": `summary.outcome.completed` is non-blank
    - Leave the Placeholder_Screen list alone; task 5.1 changes it
    - _Requirements: 15.7, 16.3, 13.3, 13.6_

  - [x] 1.4 Add `findEntryById` to `src/catalog/index.ts`
    - `export function findEntryById(id: string): ExerciseEntry | undefined` searches `entries` of both Kinds by `id`
    - _Requirements: 2.2, 9.6, 11.2_

  - [x] 1.5 Add a `findEntryById` example to `tests/unit/catalog-partition.test.ts`
    - "an entry id finds its Exercise or Stretch, and an unknown id finds nothing": Grave Rise and Bat Hang are found; `no-such-entry` is not
    - _Requirements: 2.2_

- [x] 2. Build the Workout_Engine
  - [x] 2.1 Create `src/workout-engine/types.ts`, `candy.ts` and `reps.ts`
    - `types.ts`: `Phase`, `WorkoutOutcome = 'completed'`, `SetSlot`, `ConfirmedSet`, `Workout` and the three view types with `WorkoutView`, all `readonly`, `import type` from `@/catalog` only
    - `candy.ts`: `candyPerSet = 1`, `completionBonus = 5`, `candyFor(confirmedSets, totalSets)` as `confirmed × candyPerSet + (total > 0 && confirmed === total ? completionBonus : 0)`
    - `reps.ts`: `minActualReps = 0`, `maxActualReps = 200`, `isValidActualReps(value)` true only for an integer in range (false for NaN, fractions and infinities)
    - The engine imports no React, Three.js, Viewer, UI, app or storage code and reads no real time
    - _Requirements: 1.2, 1.3, 1.5, 3.2, 3.4, 5.1, 5.2, 5.3, 5.4, 5.5_

  - [x] 2.2 Allow the engine folder in `tests/unit/repository-rules.test.ts`
    - Add `src/workout-engine/` to `allowedPrefixes` of the test "source files live under …" and update its title and comment to name the new folder
    - _Requirements: 15.8, 15.9_

  - [x] 2.3 Implement `buildSetSlots` in `src/workout-engine/slots.ts`
    - For each step of `steps`, then of `coolDown`, in order, create `sets` slots with Set_Number 1 to `sets`, `setCount`, the step's `entryId`, `target` and `restSeconds`
    - _Requirements: 2.1, 2.2, 2.4, 2.5_

  - [x] 2.4 Implement the engine in `src/workout-engine/engine.ts` and `index.ts`
    - `startWorkout`, `advance`, `confirmSet` and `workoutView` exactly as the design's rules: clock `max(at, w.clock)`, Rest end moves the next Set's start to the Rest end instant, `confirmSet` advances first and returns the same Workout object on any rejection, no Rest after the final Set, summary frozen, `outcome: 'completed'`, `setsSkipped = total − confirmed`, `activeMs = finishedAt − startedAt`
    - `index.ts` exports the functions, constants, `buildSetSlots` and types listed in the design, and nothing that takes Viewer speed, camera or play state
    - Every command builds new objects and arrays and mutates nothing
    - _Requirements: 1.1, 1.4, 1.5, 1.6, 2.3, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10, 3.11, 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 5.1, 5.2, 5.3, 5.4, 6.1, 6.2, 6.3, 6.4, 7.1_

  - [x] 2.5 Write property test for the Candy rule
    - **Property 1: The Candy rule**
    - File `tests/unit/workout-candy.test.ts`: `fc.integer({ min: 1, max: 40 })` for the total and a confirmed count from 0 to the total; the oracle is written out in the test. Add the examples "the Completion_Bonus needs every Cool-down Set confirmed" (8 of 9 gives 8, 9 of 9 gives 14) and "an empty Workout earns 0 Candy". `numRuns: 200` and the tag comment
    - **Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.5**

  - [x] 2.6 Write property test and example for Set order
    - **Property 2: Set_Slots follow the Routine**
    - File `tests/unit/workout-slots.test.ts`, using the Routine arbitrary of `tests/unit/support/workout.ts`. The oracle is a plain nested loop in the test; also check the view after `startWorkout` is `exercising` on slot 0 with `totalSets` equal to the slot count. Add "Graveyard Shift has 9 Set_Slots in order" (Skeleton Jacks twice, Grave Rise three times, Coffin Push twice, Gravestone Lean once, Bat Hang once). `numRuns: 200` and the tag comment
    - **Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5**

  - [x] 2.7 Add the shared arbitraries in `tests/unit/support/workout.ts`
    - A valid Routine_Entry arbitrary (steps 1–4, Cool-down 1–3, sets 1–10, reps 1–200 or seconds 1–120, Rest 0–600 including 0, entry ids from the Catalog so units match); a reachable-Workout arbitrary (a random list of `advance` and `confirmSet` commands applied to `startWorkout`, confirming only with valid reps); and the Property 7 player (waits a generated time, waits out a seconds target, confirms with reps 0–200, records its own clock)
    - _Requirements: 15.5, 15.6_

  - [x] 2.8 Write the engine example tests
    - File `tests/unit/workout-engine.test.ts`, every clock value an argument: "a confirm without reps records the target reps"; "a confirm during Rest changes nothing"; "a Rest of 0 goes straight to the next Set"; "a late advance counts the time after the Rest end as time of the next Set"; "the final Set is followed by no Rest"; "a Set of Graveyard Shift earns 1 Candy whatever the reps"; "a full Graveyard Shift run earns 14 Candy and ends with 9 Sets confirmed"; "a rep Set with 0 reps is confirmed"
    - _Requirements: 3.3, 3.8, 3.10, 4.3, 4.5, 5.2, 5.6, 6.4_

  - [x] 2.9 Write property test for advancing in parts
    - **Property 3: Advancing in parts equals advancing at once**
    - File `tests/unit/workout-advance.test.ts`: reachable Workout, `a ≤ b`, compare `workoutView` of the two paths; an earlier `a` leaves the view unchanged; add the Rest formula and the "next Set counts from the Rest end" check. `numRuns: 200` and the tag comment
    - **Validates: Requirements 1.6, 4.1, 4.3, 4.4**

  - [x] 2.10 Write property test for the Actual_Reps range
    - **Property 4: Actual_Reps are accepted exactly in 0 to 200**
    - File `tests/unit/workout-reps.test.ts`: `fc.oneof` of integers across the bounds, `fc.double({ noNaN: false })`, `NaN`, `±Infinity`; on a reps Set, valid values confirm with that value and raise Candy by 1, others return the same object. `numRuns: 200` and the tag comment
    - **Validates: Requirements 3.2, 3.4**

  - [x] 2.11 Write property test for timed Sets
    - **Property 5: A timed Set waits for its countdown**
    - File `tests/unit/workout-timed.test.ts`: a Workout started on a Routine whose first step is seconds-based, any elapsed time `e`; check the timer formula, the phase and slot stay, an early confirm returns the same object, a confirm at or after the target succeeds. `numRuns: 200` and the tag comment
    - **Validates: Requirements 3.5, 3.6, 3.7**

  - [x] 2.12 Write property test for immutability
    - **Property 6: Commands leave their argument unchanged**
    - File `tests/unit/workout-immutable.test.ts`: `structuredClone` the Workout before each command (valid and invalid) and expect the argument deep-equal to the clone afterwards. `numRuns: 200` and the tag comment
    - **Validates: Requirements 1.4**

  - [x] 2.13 Write property test for a driven Workout
    - **Property 7: A driven Workout reports what its commands did**
    - File `tests/unit/workout-drive.test.ts`: the player of the support file drives a generated Routine to the end; assert slot order, Rest only after a non-final Set with Rest above 0 and `next` the following slot, +1 Candy per confirm, the summary fields, `activeMs` equal to the player's clock difference, and that further `advance` and `confirmSet` calls return an equal summary. `numRuns: 200` and the tag comment
    - **Validates: Requirements 3.1, 3.9, 3.10, 3.11, 4.2, 4.5, 4.6, 5.2, 6.1, 6.2, 6.3, 6.4, 7.1**

  - [x] 2.14 Add the engine isolation scan `tests/unit/workout-isolation.test.ts`
    - Scan `src/workout-engine/` with the TypeScript compiler API (comments and strings ignored): imports only its own files and `import type` from `@/catalog`; no `Date`, `performance`, `setTimeout`, `setInterval`, `requestAnimationFrame`, `window`, `document`, `localStorage`, `sessionStorage`, `indexedDB`. Also assert no file of `src/viewer/` imports the engine and the engine imports nothing from the Viewer. The folder must yield at least one file. Include fixtures the scanner must flag and fixtures it must pass
    - _Requirements: 1.2, 1.3, 1.7, 7.2_

- [x] 3. Screen logic (pure files)
  - [x] 3.1 Create `src/ui/workout/clock-text.ts` and `reps-field.ts`
    - `formatCountdown(ms)`: `ceil(ms / 1000)` seconds as `m:ss` through the `workout.timer.format` template, negative input as 0:00. `formatElapsed(ms)`: the same with `floor`. `parseActualReps(text)`: trimmed text matching `/^\d{1,3}$/` whose value passes `isValidActualReps`, else `null`. `stepReps(value, delta)`: clamped to 0–200
    - _Requirements: 11.3, 11.4, 11.5, 11.7, 12.1, 13.1_

  - [x] 3.2 Write property tests for clock text and the rep field
    - **Property 8: Clock text matches whole seconds** and **Property 9: Rep field text is accepted exactly when it names 0 to 200**
    - File `tests/unit/workout-screen-logic.test.ts`, one `fc.assert` per property. Property 8 parses the text back; Property 9 uses `fc.string()` mixed with generated digit strings and signed, decimal and exponent forms. `numRuns: 200` and the tag comments
    - **Validates: Requirements 11.4, 11.5, 11.7, 12.1, 13.1**

  - [x] 3.3 Create the run reducer `src/ui/workout/run.ts`
    - `RunState`, `RunAction`, `initialRunState`, `runReducer` as in the design: `start` only from `null`, `tick` and `confirm` ignored while `null`, otherwise `advance` / `confirmSet`. No React, no storage, no real time
    - _Requirements: 10.1, 10.3, 14.4_

  - [x] 3.4 Add the run reducer tests to `tests/unit/workout-screen-logic.test.ts`
    - "a tick or a confirm before the start changes nothing", "a second start does not restart the Workout", "a start then a confirm with 12 reps records 12", "the reducer file imports nothing from React"
    - _Requirements: 10.1, 10.3, 11.6_

- [x] 4. Checkpoint - Engine block
  - Run `npx tsc --noEmit` and `npx vitest --run`. Both must exit 0 with no test skipped. Ensure all tests pass, ask the user if questions arise.

- [x] 5. Routine screens and routes
  - [x] 5.1 Retire the Routines Placeholder_Screen text
    - `src/ui/sections.ts`: `ListSectionId = 'exercises' | 'stretches' | 'routines'`, `PlaceholderSectionId = Exclude<SectionId, ListSectionId>`, and `placeholderSectionIds` filters all three out
    - `src/ui/strings.ts`: delete `section.routines.message`
    - `tests/unit/strings.test.ts`: `placeholderSectionIds` is `['crypt', 'history']`
    - _Requirements: 8.7, 15.1_

  - [x] 5.2 Add the Routine labels and metadata
    - `src/ui/routines/labels.ts`: `routineName`, `routinePath`, `workoutPath`, `lengthLabel` (singular text for 1 minute), `countLabel`, `setsLabel`, `stepTargetLabel`, `stepLine`, `entryOfStep`
    - `src/ui/metadata.ts`: `routineMetadata(routine)` and `workoutMetadata(routine)` from the `routine.title` and `workout.title` templates
    - _Requirements: 8.3, 9.4, 9.5, 9.6, 16.1, 16.2_

  - [x] 5.3 Build the Routine_List_Screen
    - `src/ui/routines/RoutineListScreen.tsx` and its CSS module: `h1` from `sectionName('routines')`, one link per Routine_Entry in Catalog order (name first, then length and the Exercise and Stretch counts), a back-home link. Tokens only, large touch targets. No Viewer import
    - `src/app/routines/page.tsx`: render it with `sectionMetadata('routines')`
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6_

  - [x] 5.4 Build the Routine_Detail_Screen and its route
    - `src/ui/routines/RoutineDetailScreen.tsx` and CSS module: back link, `h1`, length, ordered list of `steps` with the Spooky_Name linking to `exercisePath(entry)`, a separate Cool-down heading with its ordered list, and the start link to `workoutPath`. No Viewer import
    - `src/app/routines/[slug]/page.tsx`: `dynamicParams = false`, `generateStaticParams` from `routines`, `generateMetadata` with `routineMetadata`, `notFound()` for any other slug
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8, 9.9, 9.10_

  - [x] 5.5 Write the Routine label tests
    - File `tests/unit/routine-labels.test.ts`: the length text for 1 minute and for other minutes, count labels for 1 and 2, `stepLine` of a Graveyard Shift step, and "Graveyard Shift's length reads About 10 minutes"
    - _Requirements: 8.3, 9.5, 9.6_

- [x] 6. Workout screen and route
  - [x] 6.1 Create `src/ui/workout/useWorkoutRun.ts` and `CoachViewer.tsx`
    - `useWorkoutRun(routine)`: `useReducer(runReducer, initialRunState)`, `start` and `confirm` dispatching with `performance.now()`, and a 250 ms `setInterval` tick while the phase is `exercising` or `resting`, cleared on cleanup and in `summary`. It returns the `workoutView` or `null`
    - `CoachViewer`: `memo` around `ViewerIsland`, importing it only through `@/viewer/ViewerIsland`
    - _Requirements: 7.1, 10.3, 11.2, 11.12_

  - [x] 6.2 Build the four panels and their CSS
    - `PreparingPanel`, `SetPanel`, `RestPanel`, `SummaryPanel` in `src/ui/workout/` as in the design's table: rep field with `−`, number input and `+`, bounds and invalid message through `parseActualReps` and `stepReps`; seconds timer as `role="timer"` with `formatCountdown`; Rest `role="timer"` and the Next line; no skip control; Summary with `formatElapsed`, Candy, bonus line, the two links and no Viewer. The `safety.*` strings appear on every Set and on the Preparing_Panel. Tokens only, buttons at least `3rem` tall, no animation or transition
    - _Requirements: 10.2, 10.4, 10.6, 11.1, 11.3, 11.4, 11.5, 11.6, 11.7, 11.8, 11.9, 11.10, 12.1, 12.2, 12.4, 13.1, 13.2, 13.3, 13.4, 13.6_

  - [x] 6.3 Build the WorkoutScreen and the workout route
    - `src/ui/workout/WorkoutScreen.tsx` (`'use client'`): `h1` Routine name, a visually hidden polite live region fed by the panel heading, one `CoachViewer key={entry.id}` while `exercising` (current entry) or `resting` (next entry) and none at `summary`, the active panel, focus moved to the new panel heading, the Set panel keyed by position
    - `src/app/routines/[slug]/workout/page.tsx`: `dynamicParams = false`, `generateStaticParams`, `generateMetadata` with `workoutMetadata`, `notFound()` for an unknown slug, renders `<WorkoutScreen routine={routine} />`
    - _Requirements: 9.2, 9.3, 10.1, 10.3, 10.5, 11.2, 11.11, 11.12, 12.3, 12.5, 12.6, 13.5, 14.4_

  - [x] 6.4 Extend the isolation scan and the source-rule coverage
    - `tests/unit/workout-isolation.test.ts`: add that the files of `src/ui/routines/`, `src/ui/workout/`, `src/app/routines/` and `src/workout-engine/` reference no `localStorage`, `sessionStorage`, `indexedDB` or `document.cookie` and import no `progress-store`; each folder must yield at least one file; fixtures for both outcomes
    - `tests/unit/source-rules.test.ts`: add `['src/workout-engine/', '.ts']` and `['src/ui/workout/', '.tsx']` to the coverage lists of the text and colour scans
    - _Requirements: 14.1, 14.3, 16.1_

- [x] 7. E2E support and specs
  - [x] 7.1 Update `tests/e2e/support/screens.ts` and add `tests/e2e/support/workout.ts`
    - `screens.ts`: add `routineListScreen`, `routineDetailScreens` (`/routines/<slug>` per Routine) and `workoutScreens` (`/routines/<slug>/workout`); `placeholderScreens` shrinks to Crypt and History; `screens` includes the new lists
    - `workout.ts`: `openPreparing`, `startWorkout`, `confirmCurrentSet`, `timerSeconds` (reads a `role="timer"`) and `completeWorkout`, which uses `page.clock.fastForward` by the Catalog's Rest and target seconds
    - _Requirements: 15.3_

  - [x] 7.2 Update `tests/e2e/navigation.spec.ts` for the Routine_List_Screen
    - Routines becomes a list screen (heading, title, one link per Routine whose name begins with the Routine name and whose `href` is `/routines/<slug>`, link home), checked from the Home_Screen, by direct request and by reload; only Crypt and History expect a Placeholder_Screen; the "every link leads to a served screen" walk includes the Routine detail and Workout screens
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 15.2_

  - [x] 7.3 Update `tests/e2e/static-build.spec.ts`
    - `screenRoutes` gains `/routines/<slug>` and `/routines/<slug>/workout` per Routine; the dynamic-route check accepts the pages of `/routines/[slug]` and `/routines/[slug]/workout` and still requires `fallback: false` for every dynamic route
    - _Requirements: 9.3_

  - [x] 7.4 Update `tests/e2e/not-found.spec.ts`
    - Add `/routines/unknown`, `/routines/no-such-routine/workout` and `/routines/<slug>/no-such-page`, all HTTP 404 with the not-found screen
    - _Requirements: 9.2, 15.4_

  - [x] 7.5 Add `tests/e2e/routines.spec.ts`
    - List entries and links; detail screen heading, "About 10 minutes", ordered steps (name link by Kind, Sets, target, Rest), the Cool-down heading and its two Stretches, the start link; the list and detail screens request no Coach_Asset, Still_Image or 3D code. Expected values come from the Catalog
    - _Requirements: 8.2, 8.3, 8.4, 8.6, 9.4, 9.5, 9.6, 9.7, 9.8, 9.9, 9.10_

  - [x] 7.6 Add `tests/e2e/workout.spec.ts`
    - With `page.clock.install()` before `goto`: Preparing shows the Routine name, length, safety heading and message, the back link and no Viewer; start shows Skeleton Jacks, "Set 1 of 2", "Set 1 of 9 in this Workout", target 20 and the rep field at 20; the rep buttons change it, `250` and an empty field show the range message and disable confirm, `0` is accepted; confirm leads to a Rest with a timer, a Next line and no skip control; `fastForward` past the Rest shows the next Set; the whole run (timed Cool-down confirm disabled until `fastForward` by 30 s, then "This Set is finished") ends in a summary with Completed, 9 confirmed, 0 skipped, Active time, Candy earned 14, the bonus line, both links and no canvas; the status region announces heading changes; a second visit shows the safety message again; a refresh mid-Workout shows the Preparing_Panel; after the run `localStorage`, `sessionStorage`, `indexedDB.databases()` and cookies are empty; no text matches "perfect form"; under reduced motion the new panels have no animation or transition
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.6, 11.1, 11.3, 11.4, 11.5, 11.6, 11.7, 11.8, 11.9, 11.10, 12.2, 12.4, 12.5, 12.6, 13.1, 13.2, 13.3, 13.4, 13.5, 13.6, 14.2, 14.4, 5.6_

  - [x] 7.7 Add `tests/e2e/workout-clock.spec.ts`
    - `test.use({ reducedMotion: 'reduce' })`, `page.clock.install` at a fixed time. Start, `waitForCoach`, press 0.5× and check `aria-pressed`, confirm Set 1; in the Rest `pauseAt` one second ahead, read the Rest timer, `fastForward('00:10')`, expect it 10 s lower. A second test presses the Coach's Pause and repeats. A third checks the Set number, target, Rest and Candy texts are the same before and after a speed change
    - _Requirements: 7.3, 7.4, 7.5, 7.6_

  - [x] 7.8 Add `tests/e2e/workout-viewer.spec.ts`
    - Laptop project, software WebGL: Set 1, the Rest and Set 2 of Skeleton Jacks request the GLB once; Grave Rise shows its own Coach label with speed back at 1×; during Rest the Coach label names the next Exercise; at the summary no Viewer region remains and the WebGL context captured earlier is lost (technique of `viewer.spec.ts`)
    - _Requirements: 11.2, 11.11, 11.12, 12.3, 13.5_

- [x] 8. Structure steering
  - [x] 8.1 Update `.kiro/steering/structure.md`
    - In "Current state", mention ticket `06-happy-path-workout`; add `src/workout-engine/`, `src/ui/routines/`, `src/ui/workout/`, `src/app/routines/[slug]/` and `src/app/routines/[slug]/workout/` to the tree; in "Proposed app layout" drop the "arrive with the tickets that need them" wording for `workout-engine/`. List no path that is absent from the Repository (`tests/unit/repository-rules.test.ts` checks it)
    - _Requirements: 15.9_

- [x] 9. Checkpoint - Final verification
  - Run `npx tsc --noEmit`, `npx vitest --run`, `npm run build` and `npx playwright test`. All four must exit 0 with no test skipped. Fix every failure. Ensure all tests pass, ask the user if questions arise.
  - _Requirements: 15.8_

- [ ] 10. Commit locally
  - [-] 10.1 Ask the user, then commit
    - Ask the user for permission before committing. Run `git status --short` and show the list. Stage each changed file of this ticket by its exact path, never with `git add -A` or `git add .`; flag any file that looks like a secret. Commit locally with a short message such as `Add the happy-path Workout and Routine screens (ticket 06)`. Never push and never amend
    - Leave the User tasks to the user: the real-phone eye checks at the end of `design.md`
    - _Requirements: 15.8_

## Notes

- Tasks marked with `*` are optional; none is marked here, because every test sub-task protects a requirement of this ticket.
- Each task references specific requirements for traceability. Checkpoints ensure incremental validation.
- Property tests validate the nine universal properties of the design; unit and E2E tests validate examples and edge cases.
- Requirements 7.2 and 14.1 to 14.3 are static rules, checked by the isolation scan in tasks 2.14 and 6.4.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.4", "2.1"] },
    { "id": 1, "tasks": ["1.2", "1.3", "1.5", "2.2", "2.3", "2.5", "3.1"] },
    { "id": 2, "tasks": ["2.4", "3.2"] },
    { "id": 3, "tasks": ["2.7", "2.8", "2.14", "3.3"] },
    { "id": 4, "tasks": ["2.6", "2.9", "2.10", "2.11", "2.12", "2.13", "3.4"] },
    { "id": 5, "tasks": ["5.2", "6.1"] },
    { "id": 6, "tasks": ["5.1", "5.3", "5.4", "5.5", "6.2", "7.2"] },
    { "id": 7, "tasks": ["6.3"] },
    { "id": 8, "tasks": ["6.4", "7.1", "7.3", "7.4", "8.1"] },
    { "id": 9, "tasks": ["7.5", "7.6", "7.7", "7.8"] },
    { "id": 10, "tasks": ["10.1"] }
  ]
}
```
