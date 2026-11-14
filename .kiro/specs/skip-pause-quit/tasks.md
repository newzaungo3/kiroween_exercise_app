# Implementation Plan: Skip, Pause and Quit

## Overview

This plan builds ticket `07-skip-pause-quit` as described in `design.md`, in TypeScript strict mode. Work goes bottom-up. First the Strings_Module additions, then the pure Workout_Engine changes with their tests, then the Viewer's Coach_Hold, then a checkpoint. After that come the pure screen logic and the page-visibility hook, the Confirm_Dialog and the panels, the Workout_Screen wiring, the static isolation guard, the E2E support and specs, the steering update, a final checkpoint and a commit that waits for the user.

Ground rules for every task:

- The shell is PowerShell on Windows. The agent may run `npx tsc --noEmit`, `npx vitest --run`, `npm run build` and `npx playwright test`. The agent never runs `npm run dev` or `npm run start`. Use the terminal only for npm, npx, node, uvx and git. Read and write files with the file tools.
- Every user-facing string comes from `src/ui/strings.ts`. Every colour comes from `src/ui/theme/tokens.ts`. Use glossary terms in identifiers, test names and comments. New text uses no glossary Avoid word, never claims or implies correct form, never blames the user, and never says the Candy was saved, kept or added to a balance.
- ADR 0002: this ticket writes nothing to `localStorage`, `sessionStorage`, IndexedDB or cookies, and imports no Progress store. ADR 0004: no task creates or edits a GLB or a Still_Image; leave `assets/` and `.kiro/settings/mcp.json` untouched.
- Engine tests pass the Workout_Clock as an argument. No fake timers and no real time in the engine tests. Property tests use `fast-check` with `numRuns: 200` and the tag comment `// Feature: skip-pause-quit, Property N: …`.
- Between task 2.1 and task 6.4, `npx tsc --noEmit` may fail in `src/ui/workout/WorkoutScreen.tsx`: adding the `paused` view makes its last branch (which passes the view to `SummaryPanel`) a type error until task 6.4 handles it. Every earlier checkpoint therefore runs `npx vitest --run` only. From task 6.4 on, `npx tsc --noEmit` must pass.
- Light Playwright: the E2E specs use the production build and software WebGL. While developing, run one spec file and one project at a time with `--workers=1`, for example `npx playwright test tests/e2e/workout-controls.spec.ts --project=phone --workers=1`. Run the whole suite only at the final checkpoint (task 9), with a long timeout (up to 1,800,000 ms): it builds the Site first.
- Ask the user before every commit. Stage files by name, never with `git add -A` or `git add .`. Never push.

## Tasks

- [x] 1. Strings_Module additions
  - [x] 1.1 Add the new English Locale entries to `src/ui/strings.ts`
    - Add every identifier of the design's "Strings_Module additions": `workout.pause`, `workout.resume`, `workout.skipSet`, `workout.skipRest`, `workout.quit`, `workout.paused.heading`, `workout.paused.user`, `workout.paused.auto`, `workout.dialog.cancel`, `workout.skipSet.dialog.heading`/`.text`/`.confirm`, `workout.quit.dialog.heading`/`.text`/`.confirm`, the announcements `workout.announce.paused.user`, `.paused.auto`, `.resumed`, `.skippedSet`, `.skippedRest`, `.ended`, and `summary.heading.ended`, `summary.outcome.partial`, `summary.outcome.abandoned`, `summary.setsNotReached`, `summary.noBonus`, `summary.sets.heading`, `summary.set.line`, `summary.result.confirmed`, `.skipped`, `.notReached`
    - Candy appears only under `workout.` and `summary.`. The skip and quit dialog texts take `{bonus}`; `workout.announce.resumed`, `.skippedSet` and `.skippedRest` take `{next}`
    - _Requirements: 10.7, 10.8, 11.1, 11.2, 11.6, 11.7, 12.1, 12.2, 12.4, 13.1, 13.3, 13.4, 13.5, 17.1, 17.2, 17.3, 17.4, 17.5_

  - [x] 1.2 Add the new templates to `tests/unit/strings-format.test.ts`
    - List every new template identifier by hand and check each holds exactly the placeholders of the design (`{bonus}`, `{next}`, `{count}`, `{exercise}`, `{number}`, `{state}`)
    - _Requirements: 15.6, 17.1_

  - [x] 1.3 Add the string tests to `tests/unit/strings.test.ts`
    - Test "no pause, skip, quit, dialog or summary string blames or shames the user": no match for `/\b(lazy|fail(ed|ure)?|gave up|give up|weak|quitter|shame)\b/i` under `workout.` and `summary.`
    - Test "the Workout outcome word and the Set result word exist for every value": `summary.outcome.completed`, `.partial`, `.abandoned` and `summary.result.confirmed`, `.skipped`, `.notReached` are non-blank
    - Test "a hidden-page pause text differs from a user pause text": `workout.paused.auto` and `workout.paused.user`, and `workout.announce.paused.auto` and `.user`, differ
    - The existing Avoid-word, form-claim, no-reward and no-"saved or kept" tests must pass over the new strings unchanged
    - _Requirements: 12.5, 12.6, 15.6, 17.2, 17.3, 17.5_

- [x] 2. Workout_Engine: skip, pause, resume and quit
  - [x] 2.1 Extend `src/workout-engine/types.ts`
    - `Phase` gains `'paused'`; `WorkoutOutcome = 'completed' | 'partial' | 'abandoned'`; add `PauseCause`, `PauseState` and `SetResult` (`'confirmed' | 'skipped' | 'notReached' | 'pending'`)
    - `Workout` gains `pause: PauseState | null`, `pausedMs: number`, `skipped: readonly number[]`, `outcome: WorkoutOutcome | null`, all `readonly` and JSON-safe
    - `ViewBase` gains `results: readonly SetResult[]`; add `PausedView` (`cause`, `held: ExercisingView | RestingView`); `SummaryView` gains `setsNotReached` and a `results` typed without `'pending'`; `WorkoutView` includes `PausedView`
    - Remove the "ticket 07 adds…" comments that this change fulfils. `import type` from `@/catalog` only
    - _Requirements: 1.3, 7.4, 7.5_

  - [x] 2.2 Implement the new commands in `src/workout-engine/engine.ts` and `index.ts`
    - `startWorkout` sets `pause: null`, `pausedMs: 0`, `skipped: []`, `outcome: null`
    - `advance`: in `paused`, move only `clock`; no Rest end. `confirmSet`: set `outcome` to `'partial'` when `skipped` is not empty and `'completed'` otherwise at the final Set
    - Add `skipSet`, `skipRest`, `pauseWorkout`, `autoPause`, `resumeWorkout`, `quitWorkout` exactly as the design's command table: each advances to its own clock value first, applies its rule on the phase that holds then, and returns the same Workout object on any rejection. `resumeWorkout` moves `phaseStartedAt` and `pausedMs` forward by the paused duration; `quitWorkout` from `paused` ends at `pause.at`
    - `workoutView`: a `timeOf` helper (`pause.at` while paused), `results` for every phase, the `paused` view with `held`, and the extended `summary` view (`outcome`, `setsSkipped = skipped.length`, `setsNotReached`, `activeMs = finishedAt − startedAt − pausedMs`, `bonusIncluded`). Keep `candyFor` unchanged
    - `index.ts` exports the six commands and the new types. No parameter takes Viewer speed, camera or play state. No import from React, Three.js, the Viewer, the UI, the app or storage, and no real time
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 3.1, 3.2, 3.3, 3.4, 3.5, 4.1, 4.2, 4.3, 4.4, 4.6, 4.7, 4.8, 4.9, 4.10, 5.1, 5.2, 5.3, 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 16.1, 16.2, 16.5_

  - [x] 2.3 Add the command-script support in `tests/unit/support/workout.ts`
    - A command-script arbitrary: steps `{ kind, wait }` with `kind` one of `confirm` (reps 0–200, a seconds Set waits out its target), `skipSet`, `skipRest`, `pause`, `autoPause`, `resume`, `quit`, `advance`; and a player that applies a script to a generated Routine_Entry, records its own clock, accepted commands and paused spans, and returns the final Workout. Keep the existing arbitraries unchanged
    - _Requirements: 15.1, 15.2_

  - [x] 2.4 Write property test for disallowed commands
    - **Property 5: Disallowed commands change nothing**
    - File `tests/unit/workout-phases.test.ts`: for a reachable Workout and each command at a generated time, derive the phase that holds at the command's time and compare against the allowed-command table; a disallowed command returns the same object. Include `advance` in `summary`. `numRuns: 200` and the tag comment
    - **Validates: Requirements 1.4, 2.5, 3.4, 4.6, 4.7, 4.9, 5.2, 6.6, 6.7**

  - [x] 2.5 Write property tests and examples for skipping
    - **Property 3: A skipped Set earns nothing and starts the next Set at once** and **Property 4: Skipping a Rest starts the next Set and changes no count**
    - File `tests/unit/workout-skip.test.ts`, one `fc.assert` per property. Add the examples "skipping a Set earns 0 Candy", "a Skipped_Set removes the Completion_Bonus" (8 of 9 gives 8), "skipping the final Set gives partial", "a skipped Set starts the next Set with no Rest", "skipping a Rest starts the next Set at once and counts the Rest time already spent", "a skip that arrives after the Rest was due applies to the next Set". `numRuns: 200` and the tag comments
    - **Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.6, 2.7, 3.1, 3.2, 3.3, 3.5**

  - [x] 2.6 Write property tests and examples for pause and resume
    - **Property 1: Pause then resume leaves timers unchanged** and **Property 2: A user pause is not replaced by an Auto_Pause**
    - File `tests/unit/workout-pause.test.ts`, one `fc.assert` per property, with `advance` calls inside the pause. Add the examples "pausing freezes the Set_Timer and the Rest_Timer", "resuming continues from the same point", "Auto_Pause freezes the timers and needs the resume command", "Auto_Pause does not replace a user pause", "a pause after the Rest was due pauses on the next Set", "paused time is not Active_Time". `numRuns: 200` and the tag comments
    - **Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.8, 5.1, 5.2, 5.3**

  - [x] 2.7 Write property test and examples for quitting
    - **Property 7: Quitting gives abandoned and keeps per-Set Candy**
    - File `tests/unit/workout-quit.test.ts`. Add the examples "quitting gives abandoned and keeps per-Set Candy without bonus" (3 confirmed Sets of Graveyard Shift: 3 Candy, 0 skipped, 6 not reached), "quitting from the final Set gives abandoned", "quitting from a pause ends Active_Time at the pause", "quitting with 0 confirmed Sets earns 0 Candy". `numRuns: 200` and the tag comment
    - **Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5, 6.7, 7.9**

  - [x] 2.8 Write property tests and examples for outcome, Active_Time and Set results
    - **Property 6: Resolved Sets, outcome and Candy**, **Property 8: Active_Time excludes paused time** and **Property 9: Set results describe every Set in order**
    - File `tests/unit/workout-outcome.test.ts`, using the command-script player of task 2.3 as the oracle for clock values and paused spans. Add the examples "one skipped Set and eight confirmed give 8 Candy and partial", "every Set confirmed after a pause gives completed with 14 Candy". `numRuns: 200` and the tag comments
    - **Validates: Requirements 2.6, 3.5, 6.4, 6.5, 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8**

  - [x] 2.9 Extend the immutability property
    - **Property 10: New commands leave their argument unchanged**
    - `tests/unit/workout-immutable.test.ts`: add the six new commands (valid and invalid, any time) to the generator, `structuredClone` before each call and expect the argument deep-equal afterwards. Keep the happy-path property in the same file. `numRuns: 200` and the tag comment
    - **Validates: Requirements 1.2**

  - [x] 2.10 Keep the happy-path engine tests green
    - Run `tests/unit/workout-engine.test.ts`, `workout-drive.test.ts`, `workout-advance.test.ts`, `workout-reps.test.ts`, `workout-timed.test.ts`, `workout-slots.test.ts` and `workout-candy.test.ts`. Change a test only where Requirement 16 supersedes it: a whole-object equality on a summary view gains the new fields (`results`, `setsNotReached`) and the outcome stays `completed`; the isolation scan needs no rule change
    - _Requirements: 1.5, 15.3, 16.1, 16.2, 16.5_

- [x] 3. Viewer: Coach_Hold
  - [x] 3.1 Add `setHold` to `src/viewer/logic/controller.ts`
    - `ViewerSnapshot` gains `held: boolean` (rebuilt only when a shown value changes). A controller-level `held` variable, so a hold set before the scene is ready still applies. `setHold(held)`: ignore a repeated value; on, `playback = suspend(playback)`; publish; off and playing, `requestFrame()`. The hold never changes `playing`
    - `frame(now)`: tick the Demo_Clip only when visible and not held, otherwise `suspend`; `keepDrawing = visible && ((playing && !held) || tween !== null || gesture is active)`. `togglePlay` returns without change while held. `setSpeed` requests a frame only when `playing && !held`. Update the header comment. No import from the engine, React, Three.js, DOM or storage
    - _Requirements: 9.1, 9.2, 9.4, 9.5, 9.6, 9.7, 8.2_

  - [x] 3.2 Add the hold input to the Viewer controls and island
    - `src/viewer/controls/PlaybackControls.tsx`: `playDisabled?: boolean`; the play button uses `disabled || playDisabled`; the speed buttons keep `disabled` only
    - `src/viewer/ViewerIsland.tsx`: `hold?: boolean` (default `false`), passed as `playDisabled={snapshot.held}` and applied with `useEffect(() => controller?.setHold(hold), [controller, hold])`. CameraControls and the load state are untouched
    - _Requirements: 9.1, 9.3, 9.4, 9.7, 9.8_

  - [x] 3.3 Write property test and examples for Coach_Hold
    - **Property 11: A held Coach stays frozen and keeps its play state**
    - `tests/unit/viewer-controller.test.ts`: add `describe('Coach_Hold')` using `readyViewer` and an injected clock. The property drives random frame, toggle-play, set-speed, camera and `setHold` steps against a small model of the clip time and play state. Add the examples "a held Coach draws no frame once the camera stops", "releasing the hold restarts the Render_Loop when the Coach is playing", "a Coach paused by the user stays paused after a hold", "a Coach that started paused under the Reduced_Motion_Preference stays paused after a hold", "speed changes while held keep the frame". `numRuns: 200` and the tag comment
    - **Validates: Requirements 9.2, 9.5, 9.6, 9.9**

- [x] 4. Checkpoint - Engine and Viewer block
  - Run `npx vitest --run` (not `tsc`; see the ground rules). It must exit 0 with no test skipped. Ensure all tests pass, ask the user if questions arise.

- [x] 5. Screen logic and page visibility
  - [x] 5.1 Create `src/ui/workout/dialogs.ts`
    - `DialogKind = 'skipSet' | 'quit'` and `dialogApplies(kind, phase)`: skip Set applies only in `exercising`; quit applies in `exercising`, `resting` and `paused`. No React, no storage
    - _Requirements: 10.10_

  - [x] 5.2 Extend the run reducer `src/ui/workout/run.ts`
    - `RunState` gains `notice: RunNotice | null`; `initialRunState` has `notice: null`; `RunAction` gains `skipSet`, `skipRest`, `pause`, `autoPause`, `resume`, `quit`. Every action except `start` is ignored while `workout` is `null`. `tick` keeps `notice`; `confirm`, `pause`, `autoPause` and `quit` clear it; an accepted `skipSet`, `skipRest` or `resume` (the engine returned a new object) sets `'skippedSet'`, `'skippedRest'` or `'resumed'`; a rejected one returns the state unchanged
    - _Requirements: 10.3, 10.4, 11.4, 11.5, 11.9, 13.3, 13.4_

  - [x] 5.3 Create the page-visibility hook and extend `useWorkoutRun`
    - `src/ui/workout/usePageHidden.ts`: `useOnPageHidden(onHidden, enabled)` keeps the latest handler in a ref, attaches a `visibilitychange` listener to `document` only while `enabled`, calls the handler when `document.visibilityState === 'hidden'` (and once at once when enabled while already hidden), does nothing when the page becomes visible, and removes the listener on cleanup. It reads no clock. Export a pure `shouldAutoPause(visibilityState, enabled)` that the hook uses
    - `src/ui/workout/useWorkoutRun.ts`: return `{ view, notice, start, confirm, skipSet, skipRest, pause, resume, quit }`, each handler dispatching with `performance.now()` read inside it; call `useOnPageHidden` with a handler that dispatches `autoPause` and `enabled` true only in `exercising` and `resting`. The tick effect stays as it is, so no interval runs in `paused` or `summary`. No storage API
    - _Requirements: 5.4, 5.5, 5.6, 5.7, 11.4, 11.5, 11.9, 11.10, 14.1_

  - [x] 5.4 Add the reducer and dialog tests to `tests/unit/workout-screen-logic.test.ts`
    - "the pause, skip, resume and quit actions are ignored before the start", "a rejected skip Set keeps the state and the notice", "an accepted skip Rest sets the notice and a later confirm clears it", "a resume sets the resumed notice", "an Auto_Pause after a user pause keeps the cause user", and a `dialogApplies` table: skip Set only in `exercising`, quit in `exercising`, `resting` and `paused`, neither in `summary`
    - _Requirements: 5.2, 10.10, 11.4, 11.9, 13.3, 13.4_

  - [x] 5.5 Write the page-visibility tests `tests/unit/page-visibility.test.ts`
    - Test `shouldAutoPause` as a table (hidden and enabled is true; visible, or disabled, is false). If the Vitest environment provides a DOM, also test the hook's listener wiring with a fake event target: called on hidden while enabled, not when visible, not when disabled, once on enable while already hidden, removed on cleanup. Otherwise the wiring is covered by the Playwright spec of task 7.2
    - _Requirements: 5.4, 5.5, 5.6_

- [x] 6. Confirm_Dialog, panels and Workout_Screen
  - [x] 6.1 Build the Confirm_Dialog
    - `src/ui/workout/ConfirmDialog.tsx` and `ConfirmDialog.module.css`: a native `<dialog>` opened with `showModal()` on mount and closed on cleanup, `aria-labelledby` its heading and `aria-describedby` its text (ids from `useId`), initial focus on the cancel button, the `cancel` event (Escape) `preventDefault`ed and routed to `onCancel`, a click whose target is the `<dialog>` itself routed to `onCancel`, buttons cancel first and confirm second. The scrim is the full-viewport `<dialog>` background, a token colour mixed with transparency, with `::backdrop` transparent. Buttons at least `3rem` tall, no animation or transition, no colour literal
    - _Requirements: 10.5, 10.6, 10.9, 10.11, 11.12, 13.5, 13.7_

  - [x] 6.2 Add the controls to the Set and Rest panels and build the Paused_Panel
    - `SetPanel.tsx`: remove the local rep text state; take `repsText` and `onRepsText` props; add a control row below the confirm button with `workout.pause` (`onPause`), `workout.skipSet` (`onAskSkipSet(event.currentTarget)`) and `workout.quit` (`onAskQuit(event.currentTarget)`). `RestPanel.tsx`: replace the "no skip control" comment; add `workout.pause`, `workout.skipRest` (`onSkipRest`, no dialog) and `workout.quit`. The Rest_Panel has no skip Set button and the Set_Panel no skip Rest button
    - `PausedPanel.tsx`: heading `workout.paused.heading` (focusable), the cause message from `view.cause`, the Spooky_Name of the held Exercise, `workout.set.of` and `workout.set.position` for an `exercising` hold or the `workout.rest.next` line for a `resting` hold, a `role="timer"` labelled `workout.timer.set` or `workout.timer.rest` with `formatCountdown` for a seconds Set or a Rest (none for a rep Set), a primary `workout.resume` button and a `workout.quit` button. No confirm, skip or rep controls
    - `Panels.module.css`: a wrapping control row, a secondary button style, tokens only, buttons at least `3rem` tall and as wide as their text, no animation or transition, no `accesskey`
    - _Requirements: 11.1, 11.2, 11.3, 11.5, 11.6, 11.7, 11.8, 11.9, 11.11, 11.12, 11.13, 13.5, 13.6, 13.7, 17.5_

  - [x] 6.3 Update the Summary_Panel
    - `SummaryPanel.tsx`: heading `summary.heading` for **completed** and **partial** and `summary.heading.ended` for **abandoned**; the outcome word from `summary.outcome.${outcome}`; Sets confirmed, Sets skipped, `summary.setsNotReached` only when greater than 0, Active time, Candy earned; the bonus line only for **completed**, `summary.noBonus` for **partial** and **abandoned**; `summary.sets.heading` and an ordered list with one `summary.set.line` per Set (Spooky_Name, Set_Number, count, result word) so a skipped Set shows in words and not by colour; the two links unchanged. Nothing says the Candy was saved. Add the list styles to `Panels.module.css` after task 6.2
    - _Requirements: 6.3, 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.7, 16.1_

  - [x] 6.4 Wire the Workout_Screen and the CoachViewer
    - `CoachViewer.tsx`: add the `hold` prop and pass it to `ViewerIsland`
    - `WorkoutScreen.tsx`: take `notice` and the new handlers from `useWorkoutRun`; add the `paused` branch (viewer entry from `view.held`, `PausedPanel`, `hold = true`; every other branch `hold = false`); add `'paused'` to `panelKey` so focus moves to the Paused_Panel heading and back; hold the rep text draft keyed by Set position and pass it to the Set_Panel; hold the dialog state `{ kind, opener } | null`, open it from the panel buttons, send `skipSet` or `quit` on the confirming button, close with `opener.focus()` on cancel, Escape or backdrop, and close without a command and without focus return when `dialogApplies` is false; compose the announcements (`paused.user`, `paused.auto`, `resumed`, `skippedSet`, `skippedRest`, `summary`, `ended`) so the live region changes only with the panel and never carries a timer; pass `outcome`-based heading text through `SummaryPanel`. After this task `npx tsc --noEmit` must pass
    - _Requirements: 5.5, 8.3, 8.4, 9.3, 9.8, 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8, 10.9, 10.10, 11.4, 11.5, 11.9, 11.10, 12.8, 13.1, 13.2, 13.3, 13.4, 14.3_

  - [x] 6.5 Extend the isolation scan and the source-rule coverage
    - `tests/unit/workout-isolation.test.ts`: confirm the existing rules cover the new and changed files of `src/workout-engine/`, `src/ui/workout/` and `src/viewer/` (no storage API, no `progress-store`, the Viewer imports nothing from the engine, the engine imports nothing from the Viewer); add a fixture that must be flagged (a Viewer file importing `@/workout-engine`) and one that must pass
    - `tests/unit/source-rules.test.ts`: make sure the new `.tsx` and `.ts` files under `src/ui/workout/` fall under the text and colour scans (the coverage lists already include the folder; add nothing unless a new folder appears)
    - _Requirements: 1.5, 8.2, 9.1, 14.1_

- [x] 7. E2E support and specs
  - [x] 7.1 Extend `tests/e2e/support/workout.ts`
    - Add `skipCurrentSet(page)` (presses skip Set and the dialog's confirming button), `pauseWorkout(page)`, `resumeWorkout(page)`, `quitWorkout(page)` (presses quit and confirms), and let `completeWorkout` skip chosen Set positions. Button names come from the Strings_Module
    - _Requirements: 15.4_

  - [x] 7.2 Add `tests/e2e/workout-controls.spec.ts`
    - Both projects, `page.clock.install()` before `goto`, `test.use({ reducedMotion: 'reduce' })`. Cover, with expected values from the Catalog and the Strings_Module: skip Set asks first and Cancel, Escape and a backdrop click change nothing and return focus to the skip button; the dialog's role, heading, text (0 Candy and the lost bonus) and initial focus on cancel; confirming shows the next Set with no Rest and announces it; a skipped Set ends in the summary as Partial with 8 confirmed, 1 skipped, Candy earned 8, the no-bonus text and the skipped Set named in words; skip Rest goes straight to the next Set with no dialog; pause freezes the displayed timer across `fastForward('00:30')` and resume continues from it; the Paused_Panel has the heading, Exercise name, "Set n of m", the user cause text and no confirm, skip or rep controls; `simulatePageHidden(page, true)` pauses with the auto text, `simulatePageHidden(page, false)` leaves the Paused_Panel, only Resume continues, and a hidden event on the Preparing_Panel or the summary does nothing; a user pause stays `user` after a hidden event; quit asks first, then shows Abandoned with 3 confirmed, 0 skipped, 6 not reached, Candy earned 3 and no bonus line, also from the Paused_Panel; a skip dialog open when the page becomes hidden closes, the Paused_Panel shows with focus on its heading and the Set is not skipped after resume; after every run the browser stores are empty and a refresh in `paused` or `summary` shows the Preparing_Panel; no text matches "perfect form"; at 320 CSS pixels and at 200% text size the control row, the Paused_Panel and the dialog show no horizontal scroll and no clipped button; computed `animation-name` and `transition-duration` of the Paused_Panel, the dialog and the controls are none. Run the shared theme and layout checks over the Paused_Panel and the dialog
    - _Requirements: 2.2, 2.3, 2.4, 3.2, 4.2, 4.3, 4.4, 5.4, 5.5, 5.6, 6.2, 6.3, 6.5, 7.8, 7.9, 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8, 10.10, 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11.7, 11.8, 11.9, 11.12, 12.1, 12.2, 12.4, 12.5, 12.6, 13.1, 13.2, 13.3, 13.4, 13.7, 14.2, 14.3, 15.4, 15.5_

  - [x] 7.3 Add `tests/e2e/workout-pause-coach.spec.ts`
    - Laptop project, software WebGL, real time (no `page.clock`), `countDrawCalls` and `waitForCoach`: a playing Coach keeps drawing in Set 1; Pause settles the draw count and no frames draw for 1.5 s; Resume draws frames again and the GLB is requested once; with the Coach paused by its own Pause button first, a Workout pause and resume leaves it paused; under `reducedMotion: 'reduce'` the Coach starts paused and stays paused after a pause and resume; while the Workout is paused the Coach's play button is disabled and the speed and camera buttons are enabled; the same holds across `simulatePageHidden` auto-pause; at the summary no Viewer region remains
    - _Requirements: 8.4, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8, 12.8, 13.7, 15.4_

  - [x] 7.4 Update the existing Workout specs
    - `tests/e2e/workout.spec.ts`: replace the "Rest shows no skip control" check with the new Rest controls (Skip Rest, Pause, Quit by name) and assert the Set controls (Pause, Skip this Set, Quit); nothing is weakened
    - `tests/e2e/workout-clock.spec.ts`: keep every test as it is and add one test: while paused, pressing Viewer speed 0.5× leaves the frozen timer unchanged, and after the resume the timer continues at the normal rate
    - _Requirements: 8.3, 8.4, 8.5, 11.1, 11.2, 11.3, 16.3, 16.4_

- [x] 8. Structure steering
  - [x] 8.1 Update `.kiro/steering/structure.md`
    - In "Current state", mention ticket `07-skip-pause-quit`: the Workout engine's skip, pause, resume, Auto_Pause and quit commands and the `paused` phase, the Coach_Hold input of the Viewer, and the Confirm_Dialog and Paused_Panel of the Workout screen. List no path that is absent from the Repository (`tests/unit/repository-rules.test.ts` checks it); the tree needs no new folder
    - _Requirements: 15.8_

- [x] 9. Checkpoint - Final verification
  - Run `npx tsc --noEmit`, `npx vitest --run`, `npm run build` and `npx playwright test` (the whole suite, long timeout, `--workers=1` if the machine struggles). All four must exit 0 with no test skipped. Fix every failure. Ensure all tests pass, ask the user if questions arise.
  - _Requirements: 15.7_

- [x] 10. Commit locally
  - [x] 10.1 Ask the user, then commit
    - Ask the user for permission before committing. Run `git status --short` and show the list. Stage each changed file of this ticket by its exact path, never with `git add -A` or `git add .`; flag any file that looks like a secret. Commit locally with a short message such as `Add skip, pause and quit to the Workout (ticket 07)`. Never push and never amend
    - Leave the User tasks to the user: the real-phone eye checks at the end of `design.md`
    - _Requirements: 15.7, 15.8_

## Notes

- Tasks marked with `*` are optional; none is marked here, because every test sub-task protects a requirement of this ticket.
- Each task references specific requirements for traceability. Checkpoints ensure incremental validation.
- Property tests validate the eleven universal properties of the design; unit and E2E tests validate examples and edge cases.
- Requirements 1.5, 8.2, 9.1 and 14.1 are static rules, checked by the isolation scan of tasks 2.10 and 6.5.
- Requirement 15.7 includes `npm run build`; the Playwright web server also builds, so a failing build shows up in both places.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "2.1", "3.1"] },
    { "id": 1, "tasks": ["1.2", "1.3", "2.2", "3.2", "5.1"] },
    { "id": 2, "tasks": ["2.3", "2.10", "3.3", "5.2"] },
    { "id": 3, "tasks": ["2.4", "2.5", "2.6", "2.7", "2.8", "2.9", "5.3"] },
    { "id": 4, "tasks": ["5.4", "5.5", "6.1", "6.2"] },
    { "id": 5, "tasks": ["6.3"] },
    { "id": 6, "tasks": ["6.4"] },
    { "id": 7, "tasks": ["6.5", "7.1", "8.1"] },
    { "id": 8, "tasks": ["7.2", "7.3", "7.4"] },
    { "id": 9, "tasks": ["10.1"] }
  ]
}
```
