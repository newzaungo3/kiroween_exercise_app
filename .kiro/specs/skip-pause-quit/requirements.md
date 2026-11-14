# Requirements Document

## Introduction

This spec covers ticket `07-skip-pause-quit` of the Spooky Coach MVP (`.scratch/spooky-coach-mvp/issues/07-skip-pause-quit.md`). It builds on the committed `happy-path-workout` spec. During a Workout the user can skip a Set (after a confirmation), skip a Rest early, pause and resume, and quit (after a confirmation). The Workout pauses itself when the tab is hidden or the phone locks, and only the user can resume it. Pausing stops the Workout timers and the Coach together. A skipped Set earns 0 Candy and removes the Completion_Bonus. A Workout that reaches the summary with a skipped Set has the Workout outcome **partial**. Quitting gives **abandoned** and keeps the per-Set Candy already earned. The pure Workout_Engine (`src/workout-engine/`) owns every rule and stays driven by an injected clock.

Constraints from the ADRs and steering, unchanged from earlier specs:

- ADR 0001: a website, phone-first, also good on a laptop.
- ADR 0002: no backend. This ticket still writes nothing to browser storage (Requirement 14). **No ADR conflict.**
- ADR 0004: app code consumes the delivered GLB files and Still_Images. It never creates or edits them.
- Every user-facing string comes from the Strings_Module. Every colour comes from the design tokens. The glossary "Avoid" words check, the "no form-correctness claim" check and the "no text says the Candy was saved" check apply to every new string.
- The agent never runs the dev server. Shell is PowerShell on Windows.

### Scope

In scope: the Workout_Engine commands and views for skip Set, skip Rest, pause, resume, auto-pause and quit; the `paused` phase; the **partial** and **abandoned** Workout outcomes; the Active_Time rule that excludes paused time; the Workout_Screen controls, Confirm_Dialog, Paused_Panel and Summary_Panel changes; the Coach_Hold input of the Viewer; the page-visibility hook; the tests and steering this ticket changes.

Out of scope, with the ticket that owns it (checked against `.scratch/spooky-coach-mvp/issues/`):

- Progress store, Candy balance, Welcome gift, Workout history (ticket 08). This ticket credits Candy to nothing and records no outcome anywhere.
- Checkpoint save, Resume or Discard after a refresh or close (ticket 09). Time while the page was closed is therefore not handled here.
- Crypt, Coach colors and Accessories (tickets 10 and 11), Candy burst and sound (ticket 12), the accessibility pass (ticket 13), the golden-path smoke test (ticket 14), nice-to-have Routines (ticket 15).
- Producing or editing any GLB or Still_Image (ADR 0004).

### Repository state at spec time

Read from the working tree when this spec was written:

- `src/workout-engine/` holds `candy.ts`, `engine.ts`, `index.ts`, `reps.ts`, `slots.ts` and `types.ts`. `types.ts` has `Phase = 'exercising' | 'resting' | 'summary'` and `WorkoutOutcome = 'completed'`, each with a comment that ticket 07 extends it. The `Workout` value holds `startedAt`, `clock`, `phase`, `index`, `phaseStartedAt`, `confirmed` and `finishedAt`. `engine.ts` exports `startWorkout`, `advance`, `confirmSet` and `workoutView`. `workoutView` returns `outcome: 'completed'` for every summary, and `setsSkipped` as total minus confirmed. `candy.ts` has `candyFor(confirmedSets, totalSets)`, which already gives 0 Candy per skipped Set and adds the bonus only when every Set is confirmed.
- `src/workout-engine/index.ts` re-exports the commands and the types. Rejected commands return the same Workout object.
- `src/ui/workout/run.ts` is a pure reducer with the actions `start`, `tick` and `confirm`. `useWorkoutRun.ts` reads `performance.now()` in handlers and in a 250 ms `setInterval` that runs only in the `exercising` and `resting` phases, and returns `{ view, start, confirm }`.
- `WorkoutScreen.tsx` hosts one `CoachViewer` (a memo around `ViewerIsland`) keyed by Exercise id, above the Preparing, Set, Rest and Summary panels. It shows no Viewer on the summary and keeps a polite live region keyed to the panel heading.
- `ViewerIsland` takes only an `exercise` prop. The Viewer controller (`src/viewer/logic/controller.ts`) owns the Demo_Clip play state, Playback_Speed and visibility (`setVisibility({ pageHidden, inView })`). Under the Reduced_Motion_Preference the Coach starts paused. No input exists for pausing the Coach from outside the Viewer, so this ticket adds one (Requirement 9).
- `playback.ts` documents that the Viewer owns no shared clock, so Playback_Speed cannot change Workout time. `tests/unit/workout-isolation.test.ts` scans that the engine imports nothing from the Viewer and the Viewer nothing from the engine. `tests/e2e/workout-clock.spec.ts` proves in the browser that speed changes and the Coach's Play/Pause leave the Rest timer alone.
- No source file of the Workout_Screen has a skip, pause or quit control. The `happy-path-workout` spec lists this as a known gap.

### Interpretations made

- **No Rest after a skipped Set.** The user who skips a Set wants to move on, so the next Set starts at once. A Rest follows only a confirmed Set. This is a judgement call; the ticket does not say.
- **The Confirm_Dialog is screen logic, not engine logic.** The engine commands `skip Set` and `quit` take effect when called. The Workout_Screen asks first (Requirement 10). The Workout keeps running while a Confirm_Dialog is open, because the dialog stops no timer and the user who cancels has lost no time.
- **Unreached Sets after a quit.** The glossary defines **partial** as "reached the summary with skipped Sets". After a quit, Sets that were never reached are not skipped by the user. The summary therefore reports them apart, as not reached, and `setsSkipped` counts only Sets the user skipped.
- **Quitting from the final Set.** A quit always gives **abandoned**, even if every other Set was confirmed. Only reaching the end of the Routine gives **completed** or **partial**.
- **Active_Time.** The happy-path spec defined Active_Time as the time from start to the final confirmation, Rest included, and said ticket 07 excludes paused time. This spec does that and ends the span at the final Set's resolution (confirm or skip) or at the quit.
- **Candy wording.** The ticket says quitting "keeps" the per-Set Candy. Until ticket 08, no text may say Candy was saved, added to a balance or kept for later (happy-path Requirement 13.6). The Summary_Panel therefore shows Candy earned for the confirmed Sets and says nothing about storage.
- **Return after auto-pause.** The Workout does not resume when the tab becomes visible. The user presses resume.
- **Back button.** Browser Back still leaves the Workout without a prompt. The quit button is the supported way to end a Workout. Blocking Back is not in the ticket.

## Glossary

- **Site**, **Strings_Module**, **Placeholder_Screen**, **Home_Screen**, **Phone_Viewport**, **Laptop_Viewport**, **Build**, **Type_Check**, **Unit_Suite**, **E2E_Suite**, **Builder**: As defined in the `spooky-site-skeleton` spec.
- **Catalog**, **Exercise_Entry**, **Spooky_Name**, **Safety_Message**, **Viewer**, **Playback_Speed**, **Reduced_Motion_Preference**, **Routine_Entry**, **Routine_Step**, **Rest**: As defined in the `exercise-page-3d-coach` and `catalog-and-stretches` specs.
- **Workout_Engine**, **Workout_Clock**, **Set_Slot**, **Set_Number**, **Actual_Reps**, **Rest_Timer**, **Set_Timer**, **Completion_Bonus**, **Workout_View**, **Workout_Screen**, **Preparing_Panel**, **Set_Panel**, **Rest_Panel**, **Summary_Panel**, **Progress_Code**: As defined in the `happy-path-workout` spec. **Active_Time** is redefined below.
- **Routine**, **Cool-down**, **Workout**, **Set**, **Workout outcome**, **Candy**, **Exercise**, **Stretch**, **Coach**: As defined in CONTEXT.md.
- **Skipped_Set**: A Set that the user skipped with the skip Set command. It earns 0 Candy.
- **Not_Reached_Set**: A Set that the Workout never started because the user quit first.
- **Set_Result**: The state of one Set_Slot in the Workout_View: **confirmed**, **skipped**, **not reached** (after a quit), or **pending** (still ahead or current).
- **Active_Time**: The time from the start of the Workout to the end of the Workout (the final Set's confirm or skip, or the quit), minus all paused time.
- **Pause_Cause**: Why the Workout is paused: **user** (the user pressed pause) or **auto** (the Workout_Screen paused it because the page became hidden).
- **Auto_Pause**: The Workout_Engine command that pauses with Pause_Cause **auto**.
- **Paused_Panel**: The Workout_Screen panel shown in the `paused` phase.
- **Confirm_Dialog**: The modal question the Workout_Screen shows before a skip Set or a quit.
- **Page_Hidden**: The state of the page when `document.visibilityState` is `hidden`, which includes a switched tab, a minimised window and a locked phone.
- **Coach_Hold**: The input that the Workout_Screen gives the Viewer to stop the Coach's Demo_Clip while the Workout is paused.

## Requirements

### Requirement 1: Engine stays pure and gains new commands

**User Story:** As the Builder, I want the new commands in the same pure, clock-injected Workout_Engine, so that Vitest proves every rule without real time, React, Three.js or storage.

#### Acceptance Criteria

1. THE Workout_Engine SHALL expose a command that skips the current Set at a Workout_Clock value, a command that skips the current Rest at a Workout_Clock value, a command that pauses at a Workout_Clock value, an Auto_Pause command at a Workout_Clock value, a command that resumes at a Workout_Clock value, and a command that quits at a Workout_Clock value.
2. THE Workout_Engine SHALL keep the rules of happy-path Requirement 1: no import from React, Three.js, the Viewer, the UI, the app routes or browser storage; no real time source; immutable state; no Viewer Playback_Speed, camera or play input; and a Workout_Clock value earlier than the latest value seen treated as that latest value.
3. THE Workout_Engine SHALL type `Phase` as `exercising`, `resting`, `paused` or `summary`, and SHALL type the Workout outcome as `completed`, `partial` or `abandoned`.
4. IF a command is not allowed in the current phase, THEN THE Workout_Engine SHALL return the same Workout object unchanged.
5. THE existing isolation scan (`tests/unit/workout-isolation.test.ts`) SHALL pass for every new and changed file of `src/workout-engine/` without a change to its rules.

### Requirement 2: Skipping a Set

**User Story:** As a user who cannot do a Set, I want to skip it and move on, so that I can finish the Workout without confirming something I did not do.

#### Acceptance Criteria

1. WHILE the phase is `exercising`, THE Workout_Engine SHALL accept the skip Set command for the current Set_Slot, whether its target is reps or seconds and whatever its Set_Timer remaining.
2. WHEN the skip Set command is accepted, THE Workout_Engine SHALL record the Set_Slot as a Skipped_Set and SHALL leave Candy earned so far unchanged.
3. WHEN a Set_Slot is skipped and it is not the final Set_Slot, THE Workout_Engine SHALL set the phase to `exercising` on the next Set_Slot and start that Set's clock at the Workout_Clock value of the command, with no Rest.
4. WHEN the final Set_Slot is skipped, THE Workout_Engine SHALL set the phase to `summary` and fix the Workout outcome as **partial**.
5. IF the skip Set command arrives while the phase is `resting`, `paused` or `summary`, THEN THE Workout_Engine SHALL return the Workout unchanged.
6. THE Workout_Engine SHALL record each Set_Slot as at most one of confirmed or skipped.
7. WHEN a skip Set command arrives at a Workout_Clock value after the end of the current Rest was already due, THE Workout_Engine SHALL first advance to that value and apply the skip to the Set that is current at that value.

### Requirement 3: Skipping a Rest

**User Story:** As a user who feels ready, I want to end a Rest early, so that I can start the next Set at once.

#### Acceptance Criteria

1. WHILE the phase is `resting`, THE Workout_Engine SHALL accept the skip Rest command.
2. WHEN the skip Rest command is accepted, THE Workout_Engine SHALL set the phase to `exercising` on the next Set_Slot and start that Set's clock at the Workout_Clock value of the command.
3. WHEN the skip Rest command is accepted, THE Workout_Engine SHALL leave the confirmed Sets, the Skipped_Sets and Candy earned so far unchanged.
4. IF the skip Rest command arrives while the phase is `exercising`, `paused` or `summary`, THEN THE Workout_Engine SHALL return the Workout unchanged.
5. THE Workout_Engine SHALL count the Rest time already spent before a skip Rest as Active_Time.

### Requirement 4: Pause and resume

**User Story:** As a user who is interrupted, I want to pause and resume from the same point, so that I lose no part of a Set or a Rest.

#### Acceptance Criteria

1. WHILE the phase is `exercising` or `resting`, THE Workout_Engine SHALL accept the pause command and set the phase to `paused` with the Pause_Cause **user**.
2. WHILE the phase is `paused`, THE Workout_View SHALL expose the Pause_Cause and the Set_Timer or Rest_Timer remaining as they were at the Workout_Clock value of the pause, and the Set_Slot that was current.
3. WHILE the phase is `paused`, THE Workout_Engine SHALL keep every timer value unchanged when it receives an advance command with any later Workout_Clock value.
4. WHEN the resume command is accepted, THE Workout_Engine SHALL set the phase to the phase held before the pause, and SHALL set the Set_Timer or Rest_Timer remaining equal to the value it had at the Workout_Clock value of the pause.
5. FOR ALL pause durations, pausing a Workout and resuming it SHALL leave the Set_Timer remaining or Rest_Timer remaining after the resume equal to the value just before the pause (round-trip property).
6. IF the pause command arrives while the phase is `paused` or `summary`, THEN THE Workout_Engine SHALL return the Workout unchanged.
7. IF the resume command arrives while the phase is not `paused`, THEN THE Workout_Engine SHALL return the Workout unchanged.
8. WHEN a pause command arrives at a Workout_Clock value after the end of the current Rest was already due, THE Workout_Engine SHALL first advance to that value and pause on the Set that is current at that value.
9. WHILE the phase is `paused`, THE Workout_Engine SHALL return the Workout unchanged for the confirm Set, skip Set and skip Rest commands.
10. THE Workout_Engine SHALL accept the quit command while the phase is `paused`.

### Requirement 5: Auto-pause

**User Story:** As a user whose phone locks or who switches tabs, I want the Workout to stop by itself and wait for me, so that no time passes while I am not looking.

#### Acceptance Criteria

1. WHILE the phase is `exercising` or `resting`, THE Workout_Engine SHALL accept the Auto_Pause command and set the phase to `paused` with the Pause_Cause **auto**.
2. IF the Auto_Pause command arrives while the phase is `paused` or `summary`, THEN THE Workout_Engine SHALL return the Workout unchanged, so that a Workout paused by the user keeps the Pause_Cause **user**.
3. THE Workout_Engine SHALL give a Workout paused by Auto_Pause exactly the same timer behaviour as a Workout paused by the user, and SHALL leave the Workout paused until the resume command.
4. WHEN the Workout_Screen sees Page_Hidden while the phase is `exercising` or `resting`, THE Workout_Screen SHALL send the Auto_Pause command with the Workout_Clock value at the moment it handles the event.
5. WHEN the page becomes visible again, THE Workout_Screen SHALL leave the Workout paused and show the Paused_Panel until the user presses the resume button.
6. WHILE the phase is `preparing` (no Workout started) or `summary`, THE Workout_Screen SHALL ignore page visibility changes.
7. THE Workout_Screen SHALL count none of the time between the Auto_Pause and the resume as Active_Time, Set time or Rest time, even if the browser throttled or delayed its timers while the page was hidden.

### Requirement 6: Quit and the abandoned outcome

**User Story:** As a user who has to stop, I want to quit and still see what I earned, so that the Sets I confirmed still count.

#### Acceptance Criteria

1. WHILE the phase is `exercising`, `resting` or `paused`, THE Workout_Engine SHALL accept the quit command.
2. WHEN the quit command is accepted, THE Workout_Engine SHALL set the phase to `summary` and fix the Workout outcome as **abandoned**, whatever the number of confirmed Sets, including 0, and including a quit from the final Set_Slot.
3. WHEN the Workout outcome is **abandoned**, THE Workout_View SHALL show Candy earned equal to the number of confirmed Sets, with no Completion_Bonus.
4. WHEN the quit command is accepted, THE Workout_Engine SHALL end the Active_Time at the Workout_Clock value of the quit, or at the Workout_Clock value of the pause if the phase was `paused`.
5. WHEN the quit command is accepted, THE Workout_Engine SHALL record every Set_Slot that is neither confirmed nor skipped as a Not_Reached_Set.
6. IF the quit command arrives while the phase is `summary`, THEN THE Workout_Engine SHALL return the Workout unchanged.
7. WHILE the phase is `summary`, THE Workout_Engine SHALL leave the summary unchanged for every command, including the new ones.

### Requirement 7: Outcome, Candy and Active_Time

**User Story:** As a user, I want Candy and the outcome to follow plain rules, so that I know what I earned and why.

#### Acceptance Criteria

1. WHEN every Set_Slot is confirmed and the Workout reaches `summary` at the final Set, THE Workout_Engine SHALL fix the Workout outcome as **completed**.
2. WHEN the Workout reaches `summary` at the final Set_Slot with at least one Skipped_Set, THE Workout_Engine SHALL fix the Workout outcome as **partial**.
3. THE Workout_Engine SHALL give Candy earned so far as the number of confirmed Sets, plus the Completion_Bonus of 5 only when the number of confirmed Sets equals the number of Set_Slots, using the existing `candyFor` function without change.
4. THE Workout_View SHALL expose, for every phase, the Set_Result of each Set_Slot in Workout order.
5. WHILE the phase is `summary`, THE Workout_View SHALL expose the Workout outcome, the number of confirmed Sets, the number of Skipped_Sets, the number of Not_Reached_Sets, Active_Time in milliseconds and Candy earned.
6. THE Workout_Engine SHALL set Active_Time to the Workout_Clock value of the end of the Workout, minus the Workout_Clock value of the start, minus the total time spent in the `paused` phase.
7. FOR ALL sequences of confirm, skip Set, skip Rest, pause, resume and advance commands that end in `summary` at the final Set_Slot, THE Workout_View SHALL show the number of confirmed Sets plus the number of Skipped_Sets equal to the number of Set_Slots, and the Workout outcome **completed** if and only if the number of Skipped_Sets is 0.
8. WHEN a Workout of "Graveyard Shift" has one Skipped_Set and 8 confirmed Sets at the summary, THE Workout_View SHALL show 8 Candy earned and the Workout outcome **partial**.
9. WHEN a Workout of "Graveyard Shift" is quit after 3 confirmed Sets, THE Workout_View SHALL show 3 Candy earned, 0 Skipped_Sets, 6 Not_Reached_Sets and the Workout outcome **abandoned**.

### Requirement 8: Workout time depends only on the Workout_Clock

**User Story:** As a user, I want the Viewer's controls to leave my Workout timers alone, even with the new pause, so that a Set or Rest never grows because I changed the Coach.

#### Acceptance Criteria

1. THE Workout_Engine SHALL give every time value of the Workout_View as a function of the Workout_Clock values and the commands only.
2. THE source files of the Viewer SHALL import nothing from `src/workout-engine/`, and THE source files of the Workout_Engine SHALL import nothing from the Viewer.
3. WHILE the Workout is not paused, THE Workout_Screen SHALL keep the Set_Timer and the Rest_Timer counting at the same rate when the user changes the Viewer Playback_Speed to 0.5× or 0.75×, or presses the Viewer play control.
4. WHILE the Workout is paused, THE Workout_Screen SHALL leave the Viewer Playback_Speed, camera and Camera_Preset unchanged.
5. THE E2E_Suite SHALL keep the tests of `tests/e2e/workout-clock.spec.ts` passing without weakening them.

### Requirement 9: Pausing stops the Coach

**User Story:** As a user, I want a paused Workout to stop the Coach as well, so that nothing keeps moving while I am stopped.

#### Acceptance Criteria

1. THE Viewer SHALL accept a Coach_Hold input from its host, as a plain boolean value, and SHALL import nothing from `src/workout-engine/` to do so.
2. WHILE the Coach_Hold is on, THE Viewer SHALL show the Demo_Clip frozen on its current frame, stop advancing the Demo_Clip, and stop the Render_Loop except for a camera move the user makes.
3. WHILE the phase is `paused`, THE Workout_Screen SHALL turn the Coach_Hold on, whatever the Pause_Cause.
4. WHILE the Coach_Hold is on, THE Viewer SHALL disable the Viewer play control so that the user cannot start the Coach, and SHALL leave the Camera_Controls and the Playback_Speed buttons usable.
5. WHEN the Coach_Hold turns off, THE Viewer SHALL return the Coach to the play state it had before the Coach_Hold turned on, so that a Coach the user had paused, or one that started paused under the Reduced_Motion_Preference, stays paused.
6. WHEN the Coach_Hold turns off, THE Viewer SHALL continue the Demo_Clip from the frame it was frozen on, with no jump forward by the paused time.
7. WHEN the Coach_Hold turns on or off, THE Viewer SHALL keep the Coach_Asset loaded, so that no new download and no remount happens.
8. THE Workout_Screen SHALL keep the same mounted Viewer from the moment of the pause until the resume.
9. THE Unit_Suite SHALL test the Viewer controller, driven by an injected clock, for Requirements 9.2, 9.5 and 9.6.

### Requirement 10: Confirm_Dialog for skip Set and quit

**User Story:** As a user, I want to be asked before I skip a Set or quit, so that a stray tap cannot cost me Candy or end my Workout.

#### Acceptance Criteria

1. WHEN the user presses the skip Set button, THE Workout_Screen SHALL show a Confirm_Dialog and SHALL not send the skip Set command.
2. WHEN the user presses the quit button, THE Workout_Screen SHALL show a Confirm_Dialog and SHALL not send the quit command.
3. WHEN the user presses the confirming button of the skip Set Confirm_Dialog, THE Workout_Screen SHALL send the skip Set command with the current Workout_Clock value and close the dialog.
4. WHEN the user presses the confirming button of the quit Confirm_Dialog, THE Workout_Screen SHALL send the quit command with the current Workout_Clock value and close the dialog.
5. WHEN the user presses the cancel button, presses the Escape key, or activates the backdrop of a Confirm_Dialog, THE Workout_Screen SHALL close the dialog and send no command.
6. THE Confirm_Dialog SHALL have the role of a dialog, SHALL be labelled by its heading and described by its text, SHALL move focus into itself when it opens, with initial focus on the cancel button, SHALL keep focus inside itself while it is open, and SHALL return focus to the control that opened it when it closes without a command.
7. THE skip Set Confirm_Dialog SHALL state that the Set earns 0 Candy and that the Completion_Bonus is lost for this Workout.
8. THE quit Confirm_Dialog SHALL state that the Workout ends and that Candy for confirmed Sets so far still counts in the summary, using words that do not say the Candy is saved or kept for later.
9. THE Confirm_Dialog SHALL stop no Workout timer, because the engine pauses only on the pause command or Auto_Pause.
10. IF the Workout leaves the phase that a Confirm_Dialog applies to while the dialog is open (for example an Auto_Pause during a skip Set dialog), THEN THE Workout_Screen SHALL close that dialog and send no command.
11. THE Confirm_Dialog SHALL add no animation and SHALL honour the Reduced_Motion_Preference.

### Requirement 11: Workout_Screen controls

**User Story:** As a user mid-Workout, I want clear pause, skip and quit controls on each panel, so that I can reach them with one thumb.

#### Acceptance Criteria

1. WHILE the phase is `exercising`, THE Set_Panel SHALL show a pause button, a skip Set button and a quit button, each with a visible text name from the Strings_Module.
2. WHILE the phase is `resting`, THE Rest_Panel SHALL show a pause button, a skip Rest button and a quit button, each with a visible text name from the Strings_Module.
3. WHILE the phase is `resting`, THE Rest_Panel SHALL show no skip Set button, and WHILE the phase is `exercising`, THE Set_Panel SHALL show no skip Rest button.
4. WHEN the user presses the skip Rest button, THE Workout_Screen SHALL send the skip Rest command with the current Workout_Clock value and SHALL send no Confirm_Dialog.
5. WHEN the user presses the pause button, THE Workout_Screen SHALL send the pause command with the current Workout_Clock value and show the Paused_Panel.
6. WHILE the phase is `paused`, THE Paused_Panel SHALL show a heading, the Spooky_Name of the current Exercise_Entry, the Set_Number and number of Sets, the Set_Timer or Rest_Timer remaining as it was at the pause, a resume button, and a quit button.
7. WHILE the Pause_Cause is **auto**, THE Paused_Panel SHALL show a message from the Strings_Module that the Workout paused because the page was hidden.
8. WHILE the phase is `paused`, THE Workout_Screen SHALL show no confirm button, no skip Set button, no skip Rest button and no rep field.
9. WHEN the user presses the resume button, THE Workout_Screen SHALL send the resume command with the current Workout_Clock value and show the panel of the phase held before the pause.
10. WHILE the phase is `paused`, THE Workout_Screen SHALL run no tick interval.
11. THE Workout_Screen SHALL show no pause, skip or quit control on the Preparing_Panel or the Summary_Panel.
12. THE Workout_Screen SHALL size every new button to at least the touch target size of the existing Workout_Screen buttons, and SHALL lay the controls out without clipping or horizontal scrolling at 320 CSS pixels wide, at 200% text size, and in the Laptop_Viewport.
13. THE Workout_Screen SHALL use no shortcut key for any new control.

### Requirement 12: Summary_Panel for partial and abandoned

**User Story:** As a user, I want an honest summary of a partial or abandoned Workout, so that I see exactly what I did and what I earned.

#### Acceptance Criteria

1. WHILE the phase is `summary`, THE Summary_Panel SHALL display the Workout outcome in words from the Strings_Module for **completed**, **partial** and **abandoned**, the number of Sets confirmed, the number of Sets skipped, the number of Sets not reached when it is greater than 0, Active_Time in minutes and seconds, and Candy earned.
2. WHILE the phase is `summary`, THE Summary_Panel SHALL list every Set in Workout order with its Spooky_Name, Set_Number and Set_Result as text, so that a Skipped_Set is shown as skipped in words and not by colour alone.
3. WHILE the Workout outcome is **completed**, THE Summary_Panel SHALL display that the Candy earned includes the Completion_Bonus of 5.
4. WHILE the Workout outcome is **partial** or **abandoned**, THE Summary_Panel SHALL display no Completion_Bonus line, and SHALL state that the Completion_Bonus needs every Set confirmed.
5. THE Summary_Panel SHALL contain no text that claims or implies that the user's form was correct, including the phrase "perfect form", and no text that blames or shames the user for skipping or quitting.
6. THE Summary_Panel SHALL tell the user nothing that implies the Candy was saved, added to a balance or kept for later.
7. THE Summary_Panel SHALL keep its link back to the Routine_Detail_Screen and its link to the Home_Screen, both named from the Strings_Module.
8. WHEN the Workout reaches `summary` by any route, THE Workout_Screen SHALL unmount the Viewer and release its WebGL context.

### Requirement 13: Accessibility and motion

**User Story:** As a user of assistive technology or reduced motion, I want the new controls to be announced and calm, so that I can pause, skip and quit as easily as anyone.

#### Acceptance Criteria

1. WHEN the phase changes to or from `paused`, THE Workout_Screen SHALL announce the new state in the polite live region, naming whether the Workout paused because of the user or because the page was hidden, and SHALL not announce each second of a timer.
2. WHEN the phase changes to `paused`, THE Workout_Screen SHALL move focus to the Paused_Panel heading, and WHEN the Workout resumes, SHALL move focus to the heading of the restored panel.
3. WHEN the skip Set command takes effect, THE Workout_Screen SHALL announce in the polite live region that the Set was skipped and which Set comes next.
4. WHEN the skip Rest command takes effect, THE Workout_Screen SHALL announce that the Rest ended and which Set comes next.
5. THE Workout_Screen SHALL give every new button and dialog control a name from the Strings_Module that identifies its action without relying on colour, position or icon alone.
6. THE Paused_Panel SHALL keep the frozen timer readable as text and SHALL expose it as a timer role with the label used by the running panels.
7. WHERE the Reduced_Motion_Preference is set, THE Workout_Screen SHALL add no animation or transition for the Paused_Panel, the Confirm_Dialog or the controls, and SHALL leave the Coach paused after a resume if it was paused before.

### Requirement 14: Nothing is stored

**User Story:** As the product owner, I want this ticket to store nothing, so that the Progress store (ticket 08) is the single owner of Candy, outcomes and history.

#### Acceptance Criteria

1. THE source files of the Workout_Engine, the Workout_Screen and the Viewer changes of this ticket SHALL reference no browser-storage API (`localStorage`, `sessionStorage`, `indexedDB`, `document.cookie`) and SHALL import no Progress_Code.
2. WHEN a visitor skips Sets, pauses, resumes, is auto-paused and quits or finishes a Workout, THE Site SHALL leave `localStorage`, `sessionStorage`, IndexedDB and cookies empty.
3. WHEN a visitor refreshes the Workout_Screen in the `exercising`, `resting`, `paused` or `summary` phase, THE Site SHALL show the Preparing_Panel again with no Set recorded and no outcome recorded.

### Requirement 15: Tests and steering that this ticket changes

**User Story:** As the Builder, I want the earlier tests and the steering updated, so that the suites describe the Site as it is and stay green.

#### Acceptance Criteria

1. THE Unit_Suite SHALL include Workout_Engine tests, named after the rule they protect in glossary terms and driven by a Workout_Clock argument with no fake timers and no real time, for each of: skipping a Set earns 0 Candy; a Skipped_Set removes the Completion_Bonus; skipping the final Set gives **partial**; a skipped Set starts the next Set with no Rest; skipping a Rest starts the next Set at once and counts the Rest time already spent; pausing freezes the Set_Timer and the Rest_Timer; resuming continues from the same point; Auto_Pause freezes the timers and needs the resume command; Auto_Pause does not replace a user pause; quitting gives **abandoned** and keeps per-Set Candy without bonus; commands not allowed in a phase leave the Workout unchanged; paused time is not Active_Time.
2. THE Unit_Suite SHALL include `fast-check` property tests, each run at least 100 times, for: pause then resume after any duration leaves the timers unchanged (Requirement 4.5); confirmed plus skipped Sets equal the Set_Slot count at a non-quit summary and the outcome is **completed** only with 0 Skipped_Sets (Requirement 7.7); Candy earned equals the number of confirmed Sets plus 5 only when all are confirmed, over any command sequence; Active_Time never includes paused time; a Workout that has not ended always reports a phase of `exercising`, `resting` or `paused`.
3. THE Unit_Suite SHALL keep every happy-path engine test passing, changing a test only where Requirement 16 supersedes it.
4. THE E2E_Suite SHALL include browser tests, driven by `page.clock`, for: skip Set asks first and cancel changes nothing; confirming the skip shows the next Set and the summary lists the Set as skipped with no bonus and the outcome partial; skip Rest goes straight to the next Set; pause freezes the displayed timer across a clock jump and resume continues from it; pausing stops the Coach and resume restores the play state it had; a `visibilitychange` to hidden pauses the Workout and a return to visible leaves it paused until resume is pressed; quit asks first, then shows the outcome abandoned with the Candy of the confirmed Sets; focus moves into the Confirm_Dialog and returns on cancel.
5. THE E2E_Suite SHALL run its shared checks (theme, layout, no backend, no browser storage) over the Paused_Panel and the Confirm_Dialog.
6. THE Strings_Module tests SHALL check that no new Workout, Summary, pause, skip, quit or dialog string uses a glossary Avoid word, claims or implies correct form, says the Candy was saved or kept for later, or blames the user.
7. THE Unit_Suite and the E2E_Suite SHALL pass with `npx tsc --noEmit`, `npx vitest --run`, `npm run build` and `npx playwright test` all exiting 0, with no test skipped.
8. THE structure steering SHALL record ticket 07 in its "Current state" text, and SHALL list no path that is absent from the Repository.

### Requirement 16: Superseded happy-path rules

**User Story:** As the Builder, I want the happy-path rules this ticket replaces to be named, so that tests and docs change in one place and nothing contradicts.

#### Acceptance Criteria

1. THE Workout_Engine SHALL replace happy-path Requirement 6.4 (the summary reports 0 Sets skipped and the outcome **completed**) with Requirement 7.1, 7.2 and 7.5 of this spec.
2. THE Workout_Engine SHALL replace the happy-path reading that Active_Time includes all time from start to final confirmation with Requirement 7.6 of this spec.
3. THE Rest_Panel SHALL replace happy-path Requirement 12.4 (no skip control) with Requirement 11.2 of this spec.
4. THE Workout_Screen SHALL replace the happy-path statement that it has no quit or leave control with Requirement 11.1 and 11.2 of this spec, and THE Workout_Engine SHALL replace the statement that a hidden tab keeps counting time with Requirement 5 of this spec.
5. THE Workout_Engine SHALL keep happy-path Requirements 2, 3.1 to 3.11, 4 and 5 unchanged, except that a skipped Set is a second way to resolve a Set (Requirement 2 of this spec).

### Requirement 17: Strings

**User Story:** As the Builder, I want every new text in one module, so that Thai can be added later without touching components.

#### Acceptance Criteria

1. THE Strings_Module SHALL hold every user-facing text of this ticket: button names, Paused_Panel texts, both Confirm_Dialog texts, live-region announcements, Set_Result words, the summary lines for skipped and not reached Sets, and the Workout outcome words **partial** and **abandoned**.
2. THE Strings_Module SHALL hold the Workout outcome words under identifiers built from the outcome name, `summary.outcome.partial` and `summary.outcome.abandoned`, beside the existing `summary.outcome.completed`, so that components do not change.
3. THE Strings_Module SHALL use the glossary terms Workout, Set, Routine, Cool-down, Candy and Coach, and SHALL use none of their Avoid words.
4. THE Strings_Module SHALL keep every text that mentions Candy under identifiers that start with `workout.` or `summary.`, so that the existing check that Exercise, Stretch, Viewer, Safety_Message and Routine texts mention no Candy keeps passing.
5. THE Strings_Module SHALL hold the text for a hidden-page pause separately from the text for a user pause.
