# Requirements Document

## Introduction

This spec covers ticket `06-happy-path-workout` of the Spooky Coach MVP (`.scratch/spooky-coach-mvp/issues/06-happy-path-workout.md`). The user opens Routines, reads "Graveyard Shift" (every Exercise, Sets, targets, Rest and an approximate length), sees the Coach's safety message, starts a Workout and is guided Set by Set with the Coach demonstrating. Rep Sets are confirmed with an adjustable rep count. Timed Sets and Stretches count down, stop at the target and wait for confirmation. A Rest timer starts after each confirmed Set and shows what comes next. A summary ends the Workout with the Workout outcome **completed**, Sets confirmed, Active_Time and Candy earned. The pure Workout_Engine (`src/workout-engine/`) drives all of it from an injected clock.

Constraints from the ADRs and steering, unchanged from earlier specs:

- ADR 0001: a website, phone-first, also good on a laptop.
- ADR 0002: no backend. This ticket also writes nothing to browser storage (Requirement 14). **No ADR conflict.**
- ADR 0004: app code consumes the delivered GLB files and Still_Images. It never creates or edits them.
- Every user-facing string comes from the Strings_Module. Every colour comes from the design tokens. The glossary "Avoid" words check and the "no form-correctness claim" check apply to every new string.
- The agent never runs the dev server. Shell is PowerShell on Windows.

### Scope

In scope: the Workout_Engine (start, advance time, confirm Set, derived view, Candy rule, summary); the Routine_List_Screen and Routine_Detail_Screen (replacing the Routines Placeholder_Screen); the Workout_Screen with its Preparing, Set, Rest and Summary panels; the Viewer inside the Workout_Screen; the tests and steering this ticket changes.

Out of scope, with the ticket that owns it (checked against `.scratch/spooky-coach-mvp/issues/`):

- Skip Set, skip Rest, pause, resume, auto-pause on a hidden tab, quit, and the **partial** and **abandoned** outcomes (ticket 07).
- Progress store, Candy balance, Welcome gift, Workout history, balance on the Home_Screen (ticket 08). This ticket does not credit Candy to anything.
- Checkpoint save, Resume or Discard after a refresh (ticket 09).
- Crypt, Coach colors and Accessories (tickets 10 and 11), Candy burst and sound (ticket 12), the accessibility pass (ticket 13), the golden-path smoke test with a fast clock hook (ticket 14), nice-to-have Routines (ticket 15).
- Producing or editing any GLB or Still_Image (ADR 0004).

### Repository state at spec time

Checked on the working tree on 2026-11-13:

- The Catalog holds five Exercise_Entries and the Routine_Entry `graveyard-shift` (`src/catalog/routines.ts`) with `steps` (Skeleton Jacks 2 × 20 reps, Rest 30 s; Grave Rise 3 × 10 reps, Rest 30 s; Coffin Push 2 × 8 reps, Rest 45 s) and `coolDown` (Gravestone Lean 1 × 30 s, Bat Hang 1 × 30 s, Rest 10 s each). `findRoutine`, `routines`, `routineSeconds` (578) and `routineMinutes` (10) exist. That is 9 Sets in total.
- `src/workout-engine/` and `src/progress-store/` do not exist. No source file mentions Candy.
- `src/app/routines/page.tsx` renders `PlaceholderScreen` for the Routines Section. `src/ui/sections.ts` types `ListSectionId` as `'exercises' | 'stretches'` and `PlaceholderSectionId` as the rest. `strings.ts` holds `section.routines.message`.
- `ViewerIsland` takes one `ExerciseEntry`, creates one controller per load attempt, and owns Playback_Speed inside its own controller. `viewer/logic/playback.ts` says the Viewer owns no shared clock.
- `safety.heading` and `safety.coachMessage` exist in the Strings_Module and already say the Coach cannot see the user or check form.
- `tests/unit/viewing-earns-nothing.test.ts` scans `src/catalog`, `src/viewer`, `src/ui/exercises`, `src/app/exercises` and `src/app/stretches` for imports of `progress-store` and `workout-engine` and for browser-storage use. The Workout_Screen folders are not scanned, so it needs no change.
- `tests/e2e/navigation.spec.ts`, `tests/unit/strings.test.ts` and `tests/e2e/support/screens.ts` still treat Routines as a Placeholder_Screen. Requirement 15 updates them.
- `fast-check` is already a dev dependency and `tests/unit/routine-length.test.ts` uses it.

### Open decisions (all decided)

1. **Safety message before the first Workout. Decided by the user on 2026-11-13: no storage in this ticket.** No "has seen" flag exists before ticket 08. The Preparing_Panel therefore shows the Coach's safety message before **every** Workout start, and the Workout begins only after the user presses the start button. Requirement 10 is written for this. Showing it more often than "first" is a deliberate superset of the ticket.
2. **Candy in this ticket. Decided by the user on 2026-11-13: computed and shown only.** The Workout_Engine computes Candy earned and the Summary_Panel shows it. Nothing is added to a balance, stored or granted until ticket 08. Requirement 14 is written for this, and no string may say the Candy was saved or added to a balance.

### Interpretations made

- "Preparing" in the steering flow (preparing → active) is the Preparing_Panel of the Workout_Screen, a screen state. The Workout_Engine starts when the user presses start, so its phases are `exercising`, `resting` and `summary`. Ticket 07 adds `paused`.
- "Active time" is the time from the start of the Workout to the confirmation of its final Set, Rest included. Ticket 07 will exclude paused time.
- No Rest follows the final Set of the Routine. The summary appears at once. A Rest follows every other Set, including the last Set of an Exercise, and uses that Routine_Step's Rest. This settles the question left open in the `catalog-and-stretches` spec. The length estimate still counts every Rest, so the estimate is an upper bound of up to 10 s.
- When a Rest reaches 0, the next Set starts by itself. The next Set's clock starts at the instant the Rest ended, not at the next tick, so a late tick loses no time.
- A timed Set can be confirmed only once its countdown has reached 0, because the ticket says it waits for confirmation at the target. Ticket 07's Skip Set covers a user who cannot finish.
- A rep Set earns its Candy whatever the actual reps are, including 0. The user's count is recorded, never checked.
- Requirement 5.4 reads the bonus rule over "every Set confirmed". Because skipping arrives in ticket 07, the only reachable Workout outcome here is **completed**. The Workout_Engine still computes the bonus from "confirmed Sets equal total Sets", so ticket 07 adds skipping without changing the rule.
- Until ticket 07, the Workout_Screen has no quit or leave control, and a hidden tab keeps counting time. Until ticket 09, a refresh mid-Workout loses the Workout. These are known gaps, not defects of this ticket. Browser Back leaves the Workout without a prompt.
- Because the Workout_Screen has a Viewer, "Viewer speed never changes Workout time" is proved structurally (no module shares a clock or a speed value) and in the browser (Requirement 7).

## Glossary

- **Site**, **Strings_Module**, **Placeholder_Screen**, **Home_Screen**, **Phone_Viewport**, **Laptop_Viewport**, **Build**, **Type_Check**, **Unit_Suite**, **E2E_Suite**, **Builder**: As defined in the `spooky-site-skeleton` spec.
- **Catalog**, **Exercise_Entry**, **Spooky_Name**, **Real_Name**, **Safety_Message**, **Viewer**, **Playback_Speed**, **Reduced_Motion_Preference**, **Exercise_Detail_Screen**, **Routine_Entry**, **Routine_Step**, **Rest**, **Estimated_Length**: As defined in the `exercise-page-3d-coach` and `catalog-and-stretches` specs.
- **Routine**, **Cool-down**, **Workout**, **Set**, **Workout outcome**, **Candy**, **Exercise**, **Stretch**, **Coach**: As defined in CONTEXT.md.
- **Workout_Engine**: The module `src/workout-engine/`: pure logic that runs one Workout from a Routine_Entry and a clock value passed in by the caller.
- **Workout_Clock**: The millisecond time value that the caller passes to every Workout_Engine command. The Workout_Engine never reads real time.
- **Set_Slot**: One Set of the Workout, in order: its Exercise_Entry identifier, its Set number within its Routine_Step, the number of Sets of that Routine_Step, its target and the Rest after it.
- **Set_Number**: The 1-based position of a Set within its Routine_Step, shown as "Set 2 of 3".
- **Actual_Reps**: The whole number of reps, from 0 to 200, that the user reports when confirming a rep Set.
- **Rest_Timer**: The countdown of seconds between one Set and the next.
- **Set_Timer**: The countdown of a timed Set from its target seconds to 0.
- **Active_Time**: The time from the start of the Workout to the confirmation of its final Set.
- **Completion_Bonus**: The 5 Candy added when every Set of the Workout, Cool-down included, is confirmed.
- **Workout_View**: The plain data the Workout_Engine exposes after each command: phase, current Set_Slot, Set_Number, Set_Timer or Rest_Timer remaining, next Set_Slot, Candy earned so far, and the summary once the Workout ends.
- **Routine_List_Screen**: The screen at `/routines` that lists every Routine_Entry. Replaces the Routines Placeholder_Screen.
- **Routine_Detail_Screen**: The screen at `/routines/<slug>` that shows one Routine_Entry in full.
- **Workout_Screen**: The screen at `/routines/<slug>/workout` that guides the Workout. It shows one panel at a time.
- **Preparing_Panel**: The first panel of the Workout_Screen: the Routine name, the Safety_Message and the start button.
- **Set_Panel**: The Workout_Screen panel shown in the `exercising` phase.
- **Rest_Panel**: The Workout_Screen panel shown in the `resting` phase.
- **Summary_Panel**: The Workout_Screen panel shown in the `summary` phase.
- **Progress_Code**: Code that awards, spends or stores Candy or Workout data: the future `src/progress-store/` and the checkpoint code of ticket 09.

## Requirements

### Requirement 1: Workout_Engine is pure logic

**User Story:** As the Builder, I want the Workout_Engine to be pure logic driven by an injected clock, so that Vitest can prove every Workout rule without real time, React, Three.js or storage.

#### Acceptance Criteria

1. THE Workout_Engine SHALL expose a command that starts a Workout from a Routine_Entry and a Workout_Clock value, a command that advances the Workout to a Workout_Clock value, a command that confirms the current Set at a Workout_Clock value, and a function that returns the Workout_View.
2. THE Workout_Engine SHALL import nothing from React, Three.js, the Viewer, the UI, the app routes or browser storage, and SHALL import from the Catalog only types.
3. THE Workout_Engine SHALL read no real time source (`Date`, `performance`, `setTimeout`, `setInterval`, `requestAnimationFrame`) and SHALL derive every time value from the Workout_Clock values it receives.
4. THE Workout_Engine SHALL keep its state immutable: each command SHALL return a new Workout value and leave the argument unchanged.
5. THE Workout_Engine SHALL expose no input for Viewer Playback_Speed, camera state or play state.
6. IF a command receives a Workout_Clock value earlier than the latest value the Workout has already seen, THEN THE Workout_Engine SHALL treat the value as equal to that latest value.
7. THE Unit_Suite SHALL include a test that fails when a source file of `src/workout-engine/` contains an import of React, Three.js, `@/viewer`, `@/ui`, `@/app` or browser-storage APIs, or a reference to a real time source.

### Requirement 2: Set order from a Routine

**User Story:** As a user, I want the Workout to take me through the Routine's Sets in order, so that I do every Exercise and finish with the Cool-down.

#### Acceptance Criteria

1. WHEN a Workout starts from a Routine_Entry, THE Workout_Engine SHALL create one Set_Slot for each Set of each Routine_Step in `steps`, then one for each Set of each Routine_Step in `coolDown`, each Routine_Step in the order the Routine_Entry lists it.
2. THE Workout_Engine SHALL give each Set_Slot the Exercise_Entry identifier, Set_Number, number of Sets, target and Rest of its Routine_Step.
3. WHEN a Workout starts, THE Workout_Engine SHALL set the phase to `exercising` on the first Set_Slot with Set_Number 1.
4. WHEN a Workout starts from "Graveyard Shift", THE Workout_Engine SHALL create 9 Set_Slots: Skeleton Jacks twice, Grave Rise three times, Coffin Push twice, Gravestone Lean once and Bat Hang once.
5. THE Workout_View SHALL expose the number of Set_Slots in the Workout.

### Requirement 3: Confirming a Set

**User Story:** As a user, I want to confirm each Set myself, and for reps to tell the app what I actually did, so that my record is honest and the app never pretends to count.

#### Acceptance Criteria

1. WHILE the phase is `exercising` and the current Set_Slot has a reps target, THE Workout_View SHALL expose the target reps as the default Actual_Reps.
2. WHEN the user confirms a rep Set with an Actual_Reps that is an integer from 0 to 200, THE Workout_Engine SHALL record the Set as confirmed with that Actual_Reps.
3. WHEN the user confirms a rep Set without an Actual_Reps, THE Workout_Engine SHALL record the Set as confirmed with the target reps.
4. IF the user confirms a rep Set with an Actual_Reps that is not an integer from 0 to 200, THEN THE Workout_Engine SHALL leave the Workout unchanged.
5. WHILE the phase is `exercising` and the current Set_Slot has a seconds target, THE Workout_View SHALL expose the Set_Timer remaining as the target seconds minus the time elapsed since the Set started, never below 0.
6. WHEN the Set_Timer reaches 0, THE Workout_Engine SHALL keep the phase `exercising` on the same Set_Slot and keep the Set_Timer at 0 until the user confirms.
7. IF the user confirms a timed Set while its Set_Timer remaining is greater than 0, THEN THE Workout_Engine SHALL leave the Workout unchanged.
8. IF a confirm command arrives while the phase is `resting` or `summary`, THEN THE Workout_Engine SHALL leave the Workout unchanged.
9. WHEN the user confirms a Set that is not the final Set_Slot and the Rest of that Set_Slot is greater than 0, THE Workout_Engine SHALL set the phase to `resting`.
10. WHEN the user confirms a Set that is not the final Set_Slot and the Rest of that Set_Slot is 0, THE Workout_Engine SHALL set the phase to `exercising` on the next Set_Slot.
11. WHEN the user confirms the final Set_Slot, THE Workout_Engine SHALL set the phase to `summary` and fix the Workout outcome as **completed**.

### Requirement 4: Rest timing

**User Story:** As a user, I want a Rest timer after each Set that shows what comes next, so that I can recover and get ready.

#### Acceptance Criteria

1. WHILE the phase is `resting`, THE Workout_View SHALL expose the Rest_Timer remaining as the Rest seconds minus the time elapsed since the Rest started, never below 0.
2. WHILE the phase is `resting`, THE Workout_View SHALL expose the next Set_Slot: its Exercise_Entry identifier, Set_Number, number of Sets and target.
3. WHEN the Rest_Timer remaining reaches 0, THE Workout_Engine SHALL set the phase to `exercising` on the next Set_Slot and start that Set's clock at the Workout_Clock value at which the Rest ended.
4. WHEN a single advance command crosses the end of a Rest, THE Workout_Engine SHALL count the time after that end as time of the next Set, so that the Workout_View equals the Workout_View after advancing in several smaller steps to the same Workout_Clock value.
5. THE Workout_Engine SHALL start no Rest after the final Set_Slot.
6. THE Workout_Engine SHALL use the Rest of the Set_Slot just confirmed, which is the Rest of its Routine_Step.

### Requirement 5: Candy rules

**User Story:** As a user, I want 1 Candy for every confirmed Set and a bonus for finishing everything, so that finishing a Routine is worth it.

#### Acceptance Criteria

1. THE Workout_View SHALL expose Candy earned so far as the number of confirmed Sets, plus the Completion_Bonus once the phase is `summary` with every Set confirmed.
2. WHEN the user confirms a Set, THE Workout_Engine SHALL raise Candy earned so far by 1, whatever the Set's Exercise_Entry Kind, the target and the Actual_Reps.
3. THE Workout_Engine SHALL add the Completion_Bonus of 5 Candy only when the number of confirmed Sets equals the number of Set_Slots, which includes every Cool-down Set.
4. WHILE any Set_Slot of the Routine_Entry, a Cool-down Set_Slot included, is not yet confirmed, THE Workout_View SHALL show Candy earned so far without the Completion_Bonus.
5. THE Workout_Engine SHALL expose the Candy rule as a pure function of the number of confirmed Sets and the number of Set_Slots, so that tests can check it for any counts.
6. WHEN a Workout of "Graveyard Shift" ends with all 9 Sets confirmed, THE Workout_View SHALL show 14 Candy earned.

### Requirement 6: Summary

**User Story:** As a user, I want a summary at the end, so that I can see what I did and what I earned.

#### Acceptance Criteria

1. WHILE the phase is `summary`, THE Workout_View SHALL expose the Workout outcome, the number of Sets confirmed, the number of Sets skipped, Active_Time in milliseconds and Candy earned.
2. THE Workout_Engine SHALL set Active_Time to the Workout_Clock value of the final confirmation minus the Workout_Clock value of the start.
3. WHILE the phase is `summary`, THE Workout_Engine SHALL leave the summary unchanged when it receives an advance or a confirm command.
4. WHEN the Workout reaches `summary`, THE Workout_View SHALL report 0 Sets skipped and the Workout outcome **completed**, because skipping arrives in ticket 07.

### Requirement 7: Workout time depends only on the Workout_Clock

**User Story:** As a user, I want the Viewer's slow motion to leave my Workout timers alone, so that a Set or Rest never gets longer because I slowed the Coach.

#### Acceptance Criteria

1. THE Workout_Engine SHALL give every time value of the Workout_View as a function of the Workout_Clock values and the commands only.
2. THE source files of the Viewer SHALL import nothing from `src/workout-engine/`, and THE source files of the Workout_Engine SHALL import nothing from the Viewer.
3. WHEN the user changes the Viewer Playback_Speed to 0.5× or 0.75× on the Workout_Screen, THE Set_Timer and the Rest_Timer SHALL keep counting down at the same rate as at 1×.
4. WHEN the user pauses the Coach with the Viewer play control on the Workout_Screen, THE Set_Timer and the Rest_Timer SHALL keep counting down.
5. THE Workout_Screen SHALL change no Set target, Set_Number, Rest or Candy value when the Viewer Playback_Speed or play state changes.
6. THE E2E_Suite SHALL include a test that sets the Playback_Speed to 0.5×, moves a controlled browser clock forward by a known number of seconds, and checks that the displayed timer fell by that number.

### Requirement 8: Routine_List_Screen

**User Story:** As a user, I want a Routines section that lists each Routine with its length, so that I can pick one that fits my time.

#### Acceptance Criteria

1. WHEN a visitor activates the Routines Navigation_Entry on the Home_Screen, or requests `/routines` directly or by reload, THE Site SHALL show the Routine_List_Screen in place of the Routines Placeholder_Screen.
2. THE Routine_List_Screen SHALL display one level-1 page heading with the Section name "Routines" from the Strings_Module, and SHALL set a document title from the Strings_Module that contains "Routines".
3. THE Routine_List_Screen SHALL display one list entry for each Routine_Entry in Catalog order, each showing the Routine name, the Estimated_Length as an approximate number of whole minutes, the number of Exercises in `steps` and the number of Stretches in `coolDown`.
4. THE Routine_List_Screen SHALL make each list entry a single link to `/routines/<slug>` whose accessible name begins with the Routine name.
5. THE Routine_List_Screen SHALL provide a link to the Home_Screen at `/` whose accessible name comes from the Strings_Module.
6. THE Routine_List_Screen SHALL render without loading a Coach_Asset, a Still_Image or the 3D rendering library.
7. THE Site SHALL show a Placeholder_Screen only for the Crypt and History Sections, and THE Strings_Module SHALL hold no Placeholder_Screen message for the Routines Section.

### Requirement 9: Routine_Detail_Screen

**User Story:** As a user, I want to see a Routine's full list of Exercises, Sets, targets and Rest before I start, so that I know what is coming.

#### Acceptance Criteria

1. WHEN a visitor requests `/routines/<slug>` for the slug of a Routine_Entry, directly, by reload or from the Routine_List_Screen, THE Site SHALL show that Routine_Entry's Routine_Detail_Screen.
2. IF a visitor requests `/routines/<slug>` for a slug that no Routine_Entry has, THEN THE Site SHALL show the not-found screen with HTTP status 404.
3. THE Build SHALL prerender one Routine_Detail_Screen and one Workout_Screen per Routine_Entry, and THE Site SHALL have no route rendered on demand.
4. THE Routine_Detail_Screen SHALL display one level-1 page heading with the Routine name, SHALL set a document title from the Strings_Module that contains the Routine name, and SHALL provide a back link to `/routines` named from the Strings_Module.
5. THE Routine_Detail_Screen SHALL display the Estimated_Length as approximately the rounded number of minutes, using the singular text for 1 minute and the plural text otherwise.
6. THE Routine_Detail_Screen SHALL display the Routine_Steps of `steps` in order as an ordered list, each entry showing the Spooky_Name, the number of Sets, the target as reps or seconds, and the Rest in seconds.
7. THE Routine_Detail_Screen SHALL display the Routine_Steps of `coolDown` in order under a separate heading that names the Cool-down, with the same fields as Requirement 9.6.
8. THE Routine_Detail_Screen SHALL make the Spooky_Name of each Routine_Step a link to that entry's Exercise_Detail_Screen, by Kind.
9. THE Routine_Detail_Screen SHALL provide one link to `/routines/<slug>/workout` whose accessible name comes from the Strings_Module and names starting the Workout.
10. THE Routine_Detail_Screen SHALL render without loading a Coach_Asset, a Still_Image or the 3D rendering library.

### Requirement 10: Preparing_Panel and the safety message

**User Story:** As a first-time user, I want to read the Coach's safety message before I start, so that I know the Coach cannot see me or check my form.

#### Acceptance Criteria

1. WHEN a visitor opens the Workout_Screen, directly, by reload or from the Routine_Detail_Screen, THE Workout_Screen SHALL show the Preparing_Panel and SHALL not have started the Workout_Engine.
2. THE Preparing_Panel SHALL display the Routine name, the Estimated_Length, the Safety_Message heading and text from the Strings_Module, and one start button.
3. WHEN the user presses the start button, THE Workout_Screen SHALL start the Workout_Engine with the Routine_Entry and the current Workout_Clock value, and SHALL show the Set_Panel.
4. THE Preparing_Panel SHALL show the Safety_Message before every Workout, because no stored flag exists before ticket 08.
5. THE Preparing_Panel SHALL render without loading a Coach_Asset, a Still_Image or the 3D rendering library.
6. THE Workout_Screen SHALL provide, on the Preparing_Panel, a link back to the Routine_Detail_Screen named from the Strings_Module.

### Requirement 11: Set_Panel

**User Story:** As a user in a Workout, I want to see the current Exercise, Set number, target and the Coach demonstrating it, so that I know exactly what to do.

#### Acceptance Criteria

1. WHILE the phase is `exercising`, THE Set_Panel SHALL display, as text, the Spooky_Name of the current Exercise_Entry, the Set_Number and number of Sets as "Set 2 of 3", the target as reps or seconds, and the position in the Workout in the form "Set 4 of 9 in this Workout".
2. WHILE the phase is `exercising`, THE Set_Panel SHALL show the Viewer for the current Exercise_Entry, with the Coach demonstrating its Demo_Clip.
3. WHILE the phase is `exercising` with a reps target, THE Set_Panel SHALL show a rep field that starts at the target reps, with a button that lowers it by 1, a button that raises it by 1, and a labelled number field.
4. THE Set_Panel SHALL keep the rep field at 0 or higher and at 200 or lower by disabling the lowering button at 0 and the raising button at 200.
5. IF the rep field holds a value that is not an integer from 0 to 200, THEN THE Set_Panel SHALL disable the confirm button and show a message from the Strings_Module that names the allowed range.
6. WHEN the user presses the confirm button on a rep Set, THE Set_Panel SHALL pass the rep field value to the Workout_Engine as the Actual_Reps.
7. WHILE the phase is `exercising` with a seconds target, THE Set_Panel SHALL show the Set_Timer remaining in minutes and seconds, counting down each second, and SHALL keep the confirm button disabled until the Set_Timer remaining is 0.
8. WHEN the Set_Timer reaches 0, THE Set_Panel SHALL show a message from the Strings_Module that the Set is finished and enable the confirm button.
9. THE Set_Panel SHALL show the Exercise's Safety_Message heading and text in the Coach's voice on every Set, using the existing `safety.*` strings.
10. WHERE the Reduced_Motion_Preference is set, THE Set_Panel SHALL keep the Viewer's own behaviour for that preference and SHALL add no motion of its own.
11. WHEN the current Exercise_Entry changes, THE Set_Panel SHALL give the Viewer a React key made from the Exercise_Entry identifier, so that the camera, Playback_Speed and clip reset as they do on the Exercise_Detail_Screen.
12. WHEN the user confirms a Set whose next Set_Slot has the same Exercise_Entry, THE Workout_Screen SHALL keep the same Viewer mounted, so that the Coach_Asset is not downloaded again.

### Requirement 12: Rest_Panel

**User Story:** As a user, I want the Rest timer to show what comes next, so that I can prepare.

#### Acceptance Criteria

1. WHILE the phase is `resting`, THE Rest_Panel SHALL display the Rest_Timer remaining in minutes and seconds, counting down each second.
2. WHILE the phase is `resting`, THE Rest_Panel SHALL display a "Next" line with the Spooky_Name of the next Exercise_Entry, its Set_Number and number of Sets, and its target as reps or seconds.
3. WHILE the phase is `resting`, THE Rest_Panel SHALL show the Viewer for the next Exercise_Entry, so that the Coach_Asset loads before the next Set.
4. THE Rest_Panel SHALL offer no skip control, because skipping Rest arrives in ticket 07.
5. WHEN the Rest_Timer reaches 0, THE Workout_Screen SHALL show the Set_Panel for the next Set_Slot without a user action.
6. WHEN the phase changes between `exercising`, `resting` and `summary`, THE Workout_Screen SHALL announce the new heading in a polite live region, and SHALL not announce each second of a timer.

### Requirement 13: Summary_Panel

**User Story:** As a user, I want a summary that tells me honestly what I did, so that I see my achievement without any claim about my form.

#### Acceptance Criteria

1. WHILE the phase is `summary`, THE Summary_Panel SHALL display the Workout outcome **completed** in words from the Strings_Module, the number of Sets confirmed, the number of Sets skipped, Active_Time in minutes and seconds, and Candy earned.
2. WHILE the phase is `summary` and the Workout outcome is completed, THE Summary_Panel SHALL display that the Candy earned includes the Completion_Bonus of 5.
3. THE Summary_Panel SHALL contain no text that claims or implies that the user's form was correct, including the phrase "perfect form".
4. THE Summary_Panel SHALL provide a link back to the Routine_Detail_Screen and a link to the Home_Screen, both named from the Strings_Module.
5. THE Summary_Panel SHALL show no Viewer, and WHEN the Workout reaches `summary`, THE Workout_Screen SHALL unmount the Viewer and release its WebGL context.
6. THE Summary_Panel SHALL tell the user nothing that implies the Candy was saved, added to a balance or kept for later.

### Requirement 14: Nothing is stored

**User Story:** As the product owner, I want this ticket to store nothing, so that the Progress store (ticket 08) is the single owner of Candy and Workout data.

#### Acceptance Criteria

1. THE source files of the Workout_Engine, the Routine_List_Screen, the Routine_Detail_Screen, the Workout_Screen and their routes SHALL reference no browser-storage API (`localStorage`, `sessionStorage`, `indexedDB`, `document.cookie`).
2. WHEN a visitor opens the Routine_List_Screen and the Routine_Detail_Screen, and completes a Workout from the Preparing_Panel to the Summary_Panel, THE Site SHALL leave `localStorage`, `sessionStorage`, IndexedDB and cookies empty.
3. THE Workout_Screen SHALL import no Progress_Code.
4. WHEN a visitor refreshes the Workout_Screen mid-Workout, THE Site SHALL show the Preparing_Panel again with no Set recorded.

### Requirement 15: Tests and steering that this ticket changes

**User Story:** As the Builder, I want the earlier tests and the structure steering updated, so that the suites describe the Site as it is and stay green.

#### Acceptance Criteria

1. THE Unit_Suite SHALL list only Crypt and History as Sections that have a Placeholder_Screen message.
2. THE E2E_Suite SHALL expect the Routine_List_Screen, not a Placeholder_Screen message, when it opens the Routines Section from the Home_Screen, by direct request and by reload.
3. THE E2E_Suite SHALL run its shared checks (theme, layout, Decorations, no backend, 3D code only where a Viewer is shown) on the Routine_List_Screen, the Routine_Detail_Screen and the Preparing_Panel.
4. THE E2E_Suite SHALL expect the not-found screen with HTTP 404 for an unknown slug under `/routines/` and under `/routines/<slug>/workout`.
5. THE Unit_Suite SHALL include one test per Workout rule in Requirements 2 to 6, named after the rule it protects in glossary terms, for example "the Completion_Bonus needs every Cool-down Set confirmed".
6. THE Unit_Suite SHALL drive every Workout_Engine test with a Workout_Clock value passed as an argument, with no fake timers and no real time.
7. THE Strings_Module tests SHALL check that no Workout, Summary, Routine or Safety_Message string uses a glossary Avoid word, claims or implies correct form, or says the Candy was saved.
8. THE Unit_Suite and the E2E_Suite SHALL pass with `npx tsc --noEmit`, `npx vitest --run`, `npm run build` and `npx playwright test` all exiting 0, with no test skipped.
9. THE structure steering SHALL list `src/workout-engine/`, `src/ui/routines/`, `src/ui/workout/` and the new route folders, and no path that is absent from the Repository.

### Requirement 16: Strings

**User Story:** As the Builder, I want every new text in one module, so that Thai can be added later without touching components.

#### Acceptance Criteria

1. THE Strings_Module SHALL hold every user-facing text of the Routine_List_Screen, Routine_Detail_Screen and Workout_Screen, including Set, Rest, timer, Next, summary, outcome and error texts.
2. THE Strings_Module SHALL give the approximate length one text for 1 minute and one for other numbers, each with a `{minutes}` placeholder.
3. THE Strings_Module SHALL hold the Workout outcome word **completed** under an identifier built from the outcome name, so that ticket 07 adds `partial` and `abandoned` without editing components.
4. THE Strings_Module SHALL use the glossary terms Workout, Set, Routine, Cool-down, Candy and Coach in these texts, and SHALL use none of their Avoid words.
5. THE Strings_Module SHALL keep every text that mentions Candy under identifiers that start with `workout.` or `summary.`, so that the existing check that Exercise, Stretch, Viewer, Safety_Message and Routine texts mention no Candy keeps passing.
