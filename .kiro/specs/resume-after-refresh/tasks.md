# Implementation Plan: Resume After Refresh

## Overview

This plan builds ticket `09-resume-after-refresh` as described in `design.md`, in TypeScript strict mode. Work goes bottom-up. First the new strings, then the pure Workout_Engine checkpoint and restore functions with their property tests. Then the Progress_Store at Schema_Version 2 with the migration and the checkpoint operations, and a checkpoint. After that come the pure save-timing plan and the Workout_Screen hooks, the pure Resume_Prompt logic and tests, the prompt components and the Recording_Bridge, the scan and earlier-test updates, the new E2E spec, the steering update, a final checkpoint and a commit that waits for the user.

Ground rules for every task:

- The shell is PowerShell on Windows. The agent may run `npx tsc --noEmit`, `npx vitest --run`, `npm run build` and `npx playwright test`. The agent never runs `npm run dev` or `npm run start`. Use the terminal only for npm, npx, node, uvx and git. Read and write files with the file tools.
- Every user-facing string comes from `src/ui/strings.ts`. Every colour comes from `src/ui/theme/tokens.ts`. Use glossary terms in identifiers, test names and comments (Workout, Set, Candy, Workout outcome, Routine; never Session, Status, Result, Points, coins, score or XP). New text never claims or implies correct form and never blames the user. New `workout.` strings never say the Candy was saved, kept, stored or added to a balance.
- ADR 0002 allows browser storage; this ticket adds data to the one existing `localStorage` key `spooky-coach:progress` and writes nothing to `sessionStorage`, IndexedDB or cookies. Only `src/progress-store/local-storage.ts` names `localStorage`. Only `src/ui/progress/` and `src/progress-store/` import `@/progress-store`. `src/workout-engine/`, `src/ui/workout/` and `src/app/routines/` never import the Progress_Store and never name a storage API; the existing isolation scans must pass unchanged. The Resume_Intent is a plain module variable, not storage. ADR 0004: no task creates or edits a GLB or a Still_Image; leave `assets/` and `.kiro/settings/mcp.json` untouched.
- The Workout_Engine and the Progress_Store read no clock. `performance.now()` is read for `restoreWorkout` only inside `useWorkoutRun`. `Date.now()` is read only in the `onFinished` handler and the Discard handler of `src/ui/progress/`.
- Raising `schemaVersion` to 2 makes every test that writes or expects version 1 fail until its task updates it (tasks 3.4 to 3.7 and 7.2). Do not weaken a test: change the version, keep the rule. The checkpoints before task 10 therefore run only the test files named in them.
- Property tests use `fast-check` with `numRuns: 200` and the tag comment `// Feature: resume-after-refresh, Property N: …`. Engine tests pass every clock as an argument and use no fake timers. Store tests use the in-memory adapter and never real time.
- Light Playwright: the E2E specs use the production build and software WebGL. While developing, run one spec file and one project at a time with `--workers=1`, for example `npx playwright test tests/e2e/resume-after-refresh.spec.ts --project=phone --workers=1`. Run the whole suite only at the final checkpoint (task 10), with a long timeout (up to 1,800,000 ms): it builds the Site first.
- Ask the user before every commit. Stage files by name, never with `git add -A` or `git add .`. Never push.

## Tasks

- [x] 1. Strings_Module additions
  - [x] 1.1 Add the new English Locale entries to `src/ui/strings.ts`
    - Add every identifier of the design's "Strings_Module additions": `resume.loading`, `resume.heading`, `resume.text`, `resume.text.rest`, `resume.awayNote`, `resume.question`, `resume.resume`, `resume.discard`, `resume.discard.hint`, `resume.discarded`, `workout.paused.restored`, `workout.announce.paused.restored`
    - Templates: `resume.text` and `resume.text.rest` take `{routine}`, `{exercise}`, `{number}`, `{count}`, `{candy}`; `resume.discarded` takes `{candy}`
    - _Requirements: 13.1, 13.2, 13.3, 13.5_

  - [x] 1.2 Update the string tests
    - `tests/unit/strings-format.test.ts`: list `resume.text` and `resume.text.rest` (`routine`, `exercise`, `number`, `count`, `candy`) and `resume.discarded` (`candy`) by hand
    - `tests/unit/strings.test.ts`: extend the shaming-word test to the prefix `resume.`; add the examples "every new resume identifier is non-blank", "the restored pause text and announcement differ from the user and auto texts", "the restored pause text says the time away does not count"; the existing Avoid-word, form-claim and "saved or kept" tests must pass over the new strings with no new exception (the `summary.balance` exception stays the only one)
    - _Requirements: 13.2, 13.3, 13.4, 13.5_

- [x] 2. Workout_Engine: checkpoint and restore
  - [x] 2.1 Add the Pause_Cause `restored` and create `src/workout-engine/checkpoint.ts`
    - `src/workout-engine/types.ts`: `PauseCause = 'user' | 'auto' | 'restored'` with the updated doc comment; `Phase` unchanged; fix its "Ticket 09 adds nothing here" comment so it stays true
    - `src/workout-engine/checkpoint.ts`: `checkpointVersion`, `WorkoutCheckpoint` (`{ version: 1; workout: Workout }`), `checkpointOf` (null in `summary`) and `restoreWorkout(value, routine, at)` exactly as the design's seven steps: shape reads guarded with `typeof` and `Array.isArray`, slots compared with `buildSetSlots(routine)`, the resolved-Sets prefix rule, finite-number and ordering checks, then the rebase with `delta = at - freeze`, `pause: { cause: 'restored', from, at }` and `clock: at`. Returns a newly built Workout, never the input object; never throws; non-finite `at` gives null
    - `src/workout-engine/index.ts`: export `checkpointOf`, `restoreWorkout`, `checkpointVersion` and the type `WorkoutCheckpoint`
    - Imports only `./…` files and types from `@/catalog`; no `Date`, `performance`, timers, DOM or storage name (the existing scan must pass unchanged)
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 3.1, 3.2, 3.3, 3.4, 3.5, 4.1, 4.2, 4.3, 4.4, 4.5_

  - [x] 2.2 Add the reachable-Workout support in `tests/unit/support/workout.ts`
    - A `reachableWorkoutArbitrary` that applies the existing command-script player to a generated Routine_Entry and keeps Workouts whose phase is not `summary` (exercising, resting and paused, including user and auto pauses), returning the Routine_Entry and the Workout; a `corruptionArbitrary` and `applyCorruption(checkpoint, corruption)` for the corruption kinds listed under the design's generators. Keep the existing arbitraries unchanged
    - _Requirements: 15.1, 15.2_

  - [x] 2.3 Write property tests for checkpoint and restore
    - **Property 1: Checkpoint round trip** and **Property 2: Restore returns the same Workout, paused**
    - File `tests/unit/workout-checkpoint.test.ts`, one `fc.assert` per property. Property 2 compares the held view with `workoutView` of the original at its Freeze_Instant (for a paused original, its own paused view's `held`) and the confirmed, skipped, slots and `pausedMs` fields. Add the examples "a summary has no checkpoint", "a user-paused Workout restores with the cause restored", "a seconds Set that had run to its target restores ready to confirm", "a restored Workout shows the cause restored in its view". `numRuns: 200` and the tag comments
    - **Validates: Requirements 1.1, 1.2, 1.5, 2.1, 2.2, 2.3, 2.4, 2.6, 2.7**

  - [x] 2.4 Write the property test for closed time
    - **Property 3: Closed time never counts**
    - File `tests/unit/workout-closed-time.test.ts`: two restore clocks give equal held views; `advance` of a restored Workout by any amount leaves its view unchanged; for any `at`, `r` and `d`, `resumeWorkout` at `at + r` then `quitWorkout` at `at + r + d` gives an `activeMs` equal to the original's active time at its Freeze_Instant plus `d`. Add the examples "a Rest with 12 s left restores with 12 s left and resumes with 12 s left", "an hour of closed time adds no Active_Time", "a Rest does not end while the Workout is restored". `numRuns: 200` and the tag comment
    - **Validates: Requirements 2.5, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6**

  - [x] 2.5 Write property tests for rejected and arbitrary checkpoints
    - **Property 4: Corrupted checkpoints are rejected** and **Property 5: Restore is total and its results are safe**
    - File `tests/unit/workout-restore-reject.test.ts`, one `fc.assert` per property. Property 5 uses `fc.jsonValue()` and valid checkpoints with random fields replaced by random JSON, and runs `workoutView`, every command and `checkpointOf` on every accepted result at later clock values. Add the examples for each envelope rejection (not an object, `version` 2, no `workout`), a Routine id mismatch, a changed Set_Slot, a phase of `summary`, a non-finite time and a non-finite `at`. `numRuns: 200` and the tag comments
    - **Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5, 4.6**

- [x] 3. Progress_Store: Schema_Version 2
  - [x] 3.1 Update the types, the pure rules and the codec
    - `src/progress-store/types.ts`: `schemaVersion = 2`; `ProgressData.schemaVersion: 2` and `checkpoint: WorkoutCheckpoint | null`; `ProgressSnapshot.checkpoint`; `SaveCheckpointResult`; `saveCheckpoint`, `clearCheckpoint` and `finishWorkout` on `ProgressStore`; `import type { WorkoutCheckpoint, WorkoutOutcome } from '@/workout-engine'` only
    - `src/progress-store/rules.ts`: `emptyProgress` with `checkpoint: null`; `isCheckpointEnvelope`, `withCheckpoint`, `withoutCheckpoint`, `FinishOutcome` and `finishWorkout` as in the design (a duplicate returns the data without checkpoint, or null when there is none); `snapshotOf` copies the checkpoint with a JSON round trip; `grantWelcomeGift` and `recordWorkout` carry the checkpoint unchanged
    - `src/progress-store/codec.ts`: a private `parseCore`, a version table (`1` migrates to `2` with `checkpoint: null`; `2` reads the `checkpoint` member: missing is `none`, null is null, an envelope is kept, anything else becomes null while the core is kept), `newer` for versions above 2 decided before any shape check, `none` for versions below 1; replace the header note about "schema version 2" with the table; `parseProgress` never throws
    - No import of React, Three.js, the UI, the Catalog or runtime Workout_Engine code; no `Date`, `performance`, `window` or `document`
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 5.9, 5.10, 6.1, 6.3, 6.10, 6.11, 6.12_

  - [x] 3.2 Add the checkpoint operations to the store and the module index
    - `src/progress-store/store.ts`: `saveCheckpoint`, `clearCheckpoint` and `finishWorkout` on the existing read, apply, write, notify path with one `setItem` per change; `sameView` also compares the JSON text of the checkpoint; no write on load; the `newer` and throwing-adapter rules apply to the new operations; a no-op returns the same snapshot object and calls no listener
    - `src/progress-store/index.ts`: export `SaveCheckpointResult` and keep every existing export
    - _Requirements: 5.3, 6.1, 6.2, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9, 6.13, 6.14, 6.15_

  - [x] 3.3 Extend the test support in `tests/unit/support/progress.ts`
    - Change every built `ProgressData` and stored text to version 2 with a `checkpoint`; add an engine-made checkpoint arbitrary (from `reachableWorkoutArbitrary`), a v1 data arbitrary (`v1TextArbitrary`), the operations `saveCheckpoint(c)`, `clearCheckpoint` and `finish(record)` to the operation arbitrary, the model and `runOperations`; the spy adapter keeps counting `setItem` calls. Keep the existing helpers working for the ticket 08 tests
    - _Requirements: 15.1, 15.2_

  - [x] 3.4 Update and extend the codec tests
    - **Property 6: Migration from version 1 keeps Candy and history**, **Property 7: Version 2 serialisation round trip** and **Property 8: A damaged checkpoint never costs Candy**
    - File `tests/unit/progress-codec.test.ts`: change the version 1 data and assertions to version 2 (keep each rule); add the examples "version 1 text parses as version 2 with no checkpoint", "a missing checkpoint member in version 2 parses as no data", "version 3 parses as newer", "version 0 parses as no data", "a junk checkpoint parses with the Candy and history kept", "the stored text carries the schema version 2"; Property 6 also creates a store over the version 1 text and compares its snapshot. `numRuns: 200` and the tag comments
    - **Validates: Requirements 5.1, 5.2, 5.4, 5.5, 5.6, 5.7, 5.8, 5.9, 5.10**

  - [x] 3.5 Update and extend the store tests
    - **Property 10: Checkpoint operations persist and keep the Candy invariants**
    - File `tests/unit/progress-store.test.ts`: existing properties run over the extended operation sequence; Property 10 checks the model, reload equality, the gift rule, the balance equation, unique ids and one `setItem` per changing operation. Add the examples "a version 1 store writes nothing on load and writes version 2 on the first change", "saveCheckpoint leaves Candy and history alone", "recordWorkout leaves the checkpoint alone", "the checkpoint survives a new store over the same storage", "a snapshot's checkpoint is a copy", "listeners hear each checkpoint change once and a no-op not at all". `numRuns: 200` and the tag comment
    - **Validates: Requirements 5.3, 6.2, 6.5, 6.9, 6.12, 6.13, 6.16, 6.17**

  - [x] 3.6 Update and extend the rules tests
    - **Property 9: Only envelopes are saved** and **Property 11: Finishing is atomic and idempotent**
    - File `tests/unit/progress-rules.test.ts`: Property 9 uses an oracle predicate for the envelope and the spy adapter; Property 11 uses engine-made checkpoints, counts `setItem` calls and covers a duplicate with a checkpoint present, a duplicate without one, and an invalid record. Add the examples "a finished Workout adds its Candy and clears the checkpoint in one write", "finishing a Workout twice records it once", "a duplicate finish clears a stale checkpoint and adds no Candy". `numRuns: 200` and the tag comments
    - **Validates: Requirements 6.3, 6.4, 6.6, 6.7, 6.8, 11.4**

  - [x] 3.7 Update and extend the memory-only mode tests
    - **Property 12: Memory-only modes keep working**
    - File `tests/unit/progress-modes.test.ts`: the "newer" scenario uses versions from 3 up (`min: 3`); the seeded newer example uses `schemaVersion: 3`; Property 12 runs the extended operation sequence over a throwing adapter and over newer text, and checks the model, the Persistent_Flag and the unchanged stored text. Add the examples "a checkpoint saved over a throwing adapter stays in memory", "a checkpoint is never written over newer data". `numRuns: 200` and the tag comment
    - **Validates: Requirements 6.14, 6.15**

- [x] 4. Checkpoint - Engine and Progress_Store block
  - Run `npx tsc --noEmit` and `npx vitest --run tests/unit/workout-checkpoint.test.ts tests/unit/workout-closed-time.test.ts tests/unit/workout-restore-reject.test.ts tests/unit/progress-codec.test.ts tests/unit/progress-store.test.ts tests/unit/progress-rules.test.ts tests/unit/progress-modes.test.ts tests/unit/strings.test.ts tests/unit/strings-format.test.ts tests/unit/workout-isolation.test.ts tests/unit/progress-boundaries.test.ts`. All must exit 0 with no test skipped. Ensure all tests pass, ask the user if questions arise.

- [x] 5. Workout_Screen: saving and restoring
  - [x] 5.1 Create `src/ui/workout/checkpoint-plan.ts`
    - `checkpointIntervalMs = 5000` and `checkpointKey(w)` as in the design (phase, index, confirmed count, skipped count, pause cause and held phase). Pure; imports only the `Workout` type; no clock and no React
    - _Requirements: 7.1, 7.2, 7.4_

  - [x] 5.2 Write the property test for checkpoint moments
    - **Property 13: Checkpoint moments follow commands, not ticks**
    - File `tests/unit/checkpoint-plan.test.ts`, using the command-script player of `tests/unit/support/workout.ts`: the key differs after each accepted command and after each end of a Rest by time, equals itself after a clock-only `advance`, and is unchanged by a rejected command. Add the examples "the interval is 5000 ms" and "a pause and a resume change the key". `numRuns: 200` and the tag comment
    - **Validates: Requirements 7.1, 7.2, 7.4, 7.10**

  - [x] 5.3 Add restore to the run reducer and the saving hook
    - `src/ui/workout/run.ts`: `RunState.restoreTried`; the action `restore` (`checkpoint: unknown`, `routine`, `now`) that does nothing when a Workout exists and otherwise stores the result of `restoreWorkout` (a Workout or null), sets `restoreTried`, and sets `notice` to null
    - `src/ui/workout/useCheckpointing.ts`: `useCheckpointing(workout, onCheckpoint)` with a latest-workout ref, a save on each `checkpointKey` change, a 5000 ms `setInterval` while the phase is `exercising` or `resting`, and a Checkpoint_Flush on `visibilitychange` (hidden) and `pagehide` while the phase is `exercising`, `resting` or `paused`; it saves through `checkpointOf` (null in the summary means no call) and `onCheckpoint` read through a ref; no clock, no storage name
    - `src/ui/workout/useWorkoutRun.ts`: option object `{ resume?, onCheckpoint? }`; a mount effect that dispatches `restore` with `performance.now()` when `resume` is defined; return `restoring` (`resume !== undefined && !restoreTried`); call `useCheckpointing`
    - `tests/unit/workout-screen-logic.test.ts`: the initial state gains `restoreTried: false`; add the examples "the restore action restores a checkpoint at the given clock and pauses it", "a second restore action is ignored", "a null restore sets restoreTried and leaves the Workout null"
    - _Requirements: 7.1, 7.2, 7.3, 7.5, 7.6, 7.7, 7.8, 7.9, 10.1, 10.8, 10.10_

  - [x] 5.4 Update the Workout_Screen and the Paused_Panel
    - `src/ui/workout/WorkoutScreen.tsx`: props `resume?: WorkoutCheckpoint` and `onCheckpoint?`; pass them to `useWorkoutRun`; while `restoring`, render the h1 and no panel (no Preparing_Panel frame); choose the live-region text by cause (`user`, `auto`, `restored`); move focus to the panel heading on the first panel when `resume` is defined (the existing rule skips the first render)
    - `src/ui/workout/PausedPanel.tsx`: a three-way text choice by `view.cause`, with `workout.paused.restored` for `restored`
    - No import from `@/progress-store` or `@/ui/progress` and no storage name in `src/ui/workout/`
    - _Requirements: 7.8, 10.1, 10.6, 10.7, 10.8, 10.9, 14.5_

- [x] 6. Resume_Prompt and Recording_Bridge
  - [x] 6.1 Create the pure Resume_Prompt modules in `src/ui/progress/`
    - `resume-intent.ts`: `setResumeIntent`, `peekResumeIntent`, `clearResumeIntent` over one module variable; no storage name
    - `checkpoint-info.ts`: `describeCheckpoint(checkpoint)` and `discardRecordOf(checkpoint, finishedAt)` as in the design (read `routineId` safely, find the Routine in the Catalog, `restoreWorkout` at clock 0, `workoutView`; Discard uses `quitWorkout` at 0 and the existing `workoutRecordOf`); both return null for an unusable checkpoint; no clock read
    - `gate.ts`: `decideGate` as in the design (a lock wins; then loading, fresh, resumed with a matching intent, prompt)
    - _Requirements: 9.3, 9.4, 9.5, 9.6, 9.7, 10.3, 11.1, 11.8, 12.5_

  - [x] 6.2 Write the tests for the Resume_Prompt logic
    - **Property 14: Discard records abandoned with the confirmed Candy**
    - File `tests/unit/checkpoint-info.test.ts`: Property 14 over reachable Workouts (valid record, outcome `abandoned`, id `routineId:finishedAt`, `candyEarned` equal to `candyFor` of the confirmed Sets without the bonus and to the Candy of `quitWorkout`; applied twice with `finishWorkout` it records once). Add the examples for `describeCheckpoint` of an exercising, a resting and a paused Workout and of a Routine the Catalog does not hold, and "a Discard after 3 confirmed Sets gives 3 Candy". `numRuns: 200` and the tag comment
    - File `tests/unit/resume-gate.test.ts`: the `decideGate` table of the design's Testing Strategy as examples
    - **Validates: Requirements 9.3, 9.4, 9.5, 9.6, 9.7, 10.3, 11.1, 11.4, 11.8**

  - [x] 6.3 Build the prompt components and the Home_Screen island
    - `src/ui/progress/useProgress.ts`: add `saveCheckpoint`, `clearCheckpoint` and `finishWorkout`; drop `recordWorkout` from the hook (the store keeps it)
    - `src/ui/progress/useUnfinishedWorkout.ts`: the hook with `status`, `info`, `resume` (sets the intent, then `router.push(workoutPath(routine))`) and `discard` (`discardRecordOf` with `Date.now()`, `ensureWelcomeGift`, `finishWorkout`; `clearCheckpoint` when the record is null); an effect that clears a checkpoint that `describeCheckpoint` rejects, once
    - `src/ui/progress/ResumePanel.tsx` and `ResumePanel.module.css`: a `section` labelled by its heading with the heading, the question, the description (`resume.text` or `resume.text.rest`), the away note, the discard hint and two real buttons at least `3rem` tall; tokens only; no animation; not a live region; a `headingRef` with `tabIndex={-1}`
    - `src/ui/progress/ResumePrompt.tsx`: the Home_Screen island; nothing while loading or when there is no prompt; no focus move on Home
    - `src/ui/home/HomeScreen.tsx`: render `<ResumePrompt />` between `<CandyBalance />` and the `<nav>`; the screen stays a server component with one `nav` and one `h1`
    - _Requirements: 9.1, 9.2, 9.7, 9.8, 9.10, 10.2, 11.2, 11.3, 11.5, 11.7, 14.1, 14.2, 14.3, 14.4, 14.6_

  - [x] 6.4 Rewrite the Recording_Bridge `src/ui/progress/RecordedWorkoutScreen.tsx`
    - Add the gate: `decideGate` over the snapshot, the routine id, `peekResumeIntent()` and a `locked` state; lock `fresh` or `resumed` (with the checkpoint) as soon as the gate says so, so the 5 s saves cannot flip the screen; clear an unrestorable checkpoint once; clear the intent after the restored Workout_Screen mounted
    - Render by gate: `loading` shows the h1 (Routine name) and `resume.loading`; `prompt` shows the h1 and the `ResumePanel` with focus on its heading (Resume for this Routine locks `resumed`; for another Routine it sets the intent and navigates; Discard calls the shared discard path, remembers the Candy and locks `fresh`); `fresh` renders `WorkoutScreen` with `onCheckpoint` and, after a Discard, the `resume.discarded` line above it; `resumed` renders `WorkoutScreen` with `resume` and `onCheckpoint`
    - `onCheckpoint` calls `saveCheckpoint` unless the Workout has finished; `onFinished` sets the finished flag, builds the record as in ticket 08 (`Date.now()` only here), grants the Welcome gift, calls `finishWorkout` and keeps the balance for the Summary_Panel
    - `src/app/routines/[slug]/workout/page.tsx` stays unchanged and still names no storage API
    - _Requirements: 7.6, 8.1, 8.2, 8.3, 8.4, 9.3, 9.4, 9.5, 9.6, 9.7, 10.1, 10.2, 10.3, 10.4, 10.5, 10.10, 11.1, 11.2, 11.3, 11.6, 11.7, 14.5, 16.2, 16.3_

- [x] 7. Scans and earlier tests
  - [x] 7.1 Extend the boundary scan
    - `tests/unit/progress-boundaries.test.ts`: add a rule that no file of `src/ui/progress/` names `localStorage`, `sessionStorage` or `indexedDB`, with a fixture that must be flagged and one that must pass; keep every existing rule unchanged. Run `tests/unit/workout-isolation.test.ts` and `tests/unit/viewing-earns-nothing.test.ts` and keep them unchanged
    - _Requirements: 12.1, 12.2, 12.4, 12.5, 15.5_

  - [x] 7.2 Update the earlier E2E specs that this ticket changes
    - `tests/e2e/candy-and-history.spec.ts`: the stored `schemaVersion` is 2; the "newer" seed is `schemaVersion` 3 (the helper default uses the exported `schemaVersion`); every other assertion stays
    - `tests/e2e/support/workout.ts`: `openPreparing` waits for the Preparing_Panel after the Progress_Snapshot is read (the first render of the Workout_Route is now the loading text); check `tests/e2e/workout.spec.ts`, `workout-controls.spec.ts`, `workout-clock.spec.ts`, `workout-pause-coach.spec.ts` and `workout-viewer.spec.ts` for a read of the Preparing_Panel before that wait and fix only the wait
    - `tests/e2e/navigation.spec.ts` and `tests/e2e/layout.spec.ts`: if a Workout_Route check reads the Preparing_Panel from the server HTML, change it to the loading text and one `h1`
    - _Requirements: 15.4, 16.3_

- [x] 8. E2E support and the acceptance spec
  - [x] 8.1 Extend `tests/e2e/support/progress.ts`
    - Helpers: `seedCheckpoint(page, checkpoint)` and `seedVersion1(page, candy, history)` (init scripts), `readCheckpoint(page)`, `reloadMidWorkout(page)` and locators for the Resume_Prompt, its two buttons and the restored Paused_Panel; names come from the Strings_Module and the Catalog
    - _Requirements: 15.3_

  - [x] 8.2 Add `tests/e2e/resume-after-refresh.spec.ts`
    - Both projects, `page.clock.install` before `goto`, `test.use({ timezoneId: 'UTC', reducedMotion: 'reduce' })`. Cover: a reload mid-Workout on the Workout_Route shows the Resume_Prompt and no Preparing_Panel; Resume shows the Paused_Panel with the restored text, the same Exercise, Set, Candy so far and Rest or Set timer; moving the clock by minutes before Resume changes no timer; the Workout continues and finishes with exactly one History_Entry and no prompt after another reload; reload then Discard on the Workout_Route records an abandoned entry with the Candy of the confirmed Sets, raises the balance, clears the prompt and shows the discarded text and the Preparing_Panel; the Home_Screen prompt: Resume navigates to the Workout_Route with no second prompt, and a reload on that route asks again; Discard on Home removes the prompt and updates the balance in place; a prompt for another Routine on a Workout_Route; a checkpoint saved at least every 5 s (clock fast-forward, read the stored checkpoint); a checkpoint saved on `pagehide` between saves; a Workout that reached the summary leaves no checkpoint and no prompt; a seeded version 1 text migrates with its Candy and history intact and is stored as version 2 after the first change; a seeded junk checkpoint is dropped and the Candy stays; a seeded checkpoint of a changed Routine is cleared with nothing recorded; a blocked `setItem` keeps the Workout running; the server HTML of the Workout_Route holds the loading text and one `h1` and neither the Preparing_Panel nor the prompt; no console message matches `/hydrat/i` on Home and the Workout_Route; `localStorage` holds only the Storage_Key and `sessionStorage`, IndexedDB and cookies are empty; the prompt is a labelled region, its buttons are at least `3rem` tall, no horizontal scroll or clipped text at 320 CSS pixels and at 200% text size, computed `animation-name` and `transition-duration` none; the restored Paused_Panel holds the Coach (no draw calls while paused, as in `workout-pause-coach.spec.ts`) on the laptop project
    - _Requirements: 7.2, 7.3, 7.5, 7.6, 7.9, 8.1, 8.2, 8.4, 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8, 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8, 10.9, 11.2, 11.3, 11.5, 11.6, 12.3, 14.1, 14.2, 14.3, 14.4, 14.5, 14.6, 15.3, 16.1, 16.3, 16.4_

- [x] 9. Structure steering
  - [x] 9.1 Update `.kiro/steering/structure.md`
    - In "Current state", mention ticket `09-resume-after-refresh`: the Workout_Engine's checkpoint and restore, Schema_Version 2 with its migration, the Stored_Checkpoint and its operations, the checkpoint saving of the Workout_Screen, and the Resume_Prompt on the Home_Screen and the Workout route. Note the new files only where a listed folder gains them; list no path that is absent from the Repository (`tests/unit/repository-rules.test.ts` checks it)
    - _Requirements: 15.6_

- [x] 10. Checkpoint - Final verification
  - Run `npx tsc --noEmit`, `npx vitest --run`, `npm run build` and `npx playwright test` (the whole suite, long timeout, `--workers=1` if the machine struggles). All four must exit 0 with no test skipped. Fix every failure. Ensure all tests pass, ask the user if questions arise.
  - _Requirements: 15.7_

- [ ] 11. Commit locally
  - [-] 11.1 Ask the user, then commit
    - Ask the user for permission before committing. Run `git status --short` and show the list. Stage each changed file of this ticket by its exact path, never with `git add -A` or `git add .`; flag any file that looks like a secret. Commit locally with a short message such as `Resume or discard an unfinished Workout after a refresh (ticket 09)`. Never push and never amend
    - Leave the User tasks to the user: the real-phone eye checks at the end of `design.md`
    - _Requirements: 15.6, 15.7_

## Notes

- Tasks marked with `*` are optional; none is marked here, because every test sub-task protects a requirement of this ticket.
- Each task references specific requirements for traceability. Checkpoints ensure incremental validation.
- Property tests validate the fourteen universal properties of the design; unit and E2E tests validate examples and edge cases.
- Requirements 1.4, 6.10, 6.11, 7.7, 7.8, 10.10, 12.1, 12.2 and 12.5 are static rules, checked by the existing isolation and boundary scans and the scan added in task 7.1.
- Requirements 7.2, 7.3, 7.5, 7.9 and 14 are browser behaviour, checked by the E2E spec of task 8.2 and the eye checks at the end of `design.md`.
- The known gap of ticket 08 (a Workout closed mid-way records nothing) is closed here for every user who returns: the checkpoint offers Resume or Discard. A user who never returns still records nothing.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "2.1"] },
    { "id": 1, "tasks": ["1.2", "2.2", "3.1", "5.1"] },
    { "id": 2, "tasks": ["2.3", "2.4", "2.5", "3.2", "3.3", "5.2", "5.3", "6.1"] },
    { "id": 3, "tasks": ["3.4", "3.5", "3.6", "3.7", "5.4", "6.2", "6.3"] },
    { "id": 4, "tasks": ["6.4", "7.1"] },
    { "id": 5, "tasks": ["7.2", "8.1"] },
    { "id": 6, "tasks": ["8.2", "9.1"] },
    { "id": 7, "tasks": ["11.1"] }
  ]
}
```
