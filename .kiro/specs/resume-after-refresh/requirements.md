# Requirements Document

## Introduction

This spec covers ticket `09-resume-after-refresh` of the Spooky Coach MVP (`.scratch/spooky-coach-mvp/issues/09-resume-after-refresh.md`). It builds on the committed `skip-pause-quit` and `candy-and-history` specs. Until now a Workout lives only in page memory. A refresh, a closed tab or a crashed browser ends it silently and records nothing (the known gap that ticket 08 left). This ticket adds the **Workout_Checkpoint**: a plain-data copy of the running Workout that the Progress_Store keeps under the same `localStorage` key as the Candy and the history. On the next visit the Site offers **Resume or Discard**. Resume returns the user to the same Exercise and Set, paused, with the Candy earned and the timers as they were; the time while the page was closed never counts. Discard records the Workout as **abandoned**, with the Candy already earned for the confirmed Sets.

Constraints from the ADRs and steering:

- ADR 0001: a website, phone-first, also good on a laptop.
- ADR 0002: no backend, all user data in browser storage. This ticket adds data (the Workout_Checkpoint) to the one existing `localStorage` key and writes nothing anywhere else. **No ADR conflict.** Losing the checkpoint on cleared storage or a new device is accepted.
- ADR 0004: app code consumes delivered assets and never creates them. No asset is touched.
- Tech steering: the Workout_Engine serialises to a checkpoint and restores from one and stays pure (no React, Three.js, storage or clock). The Progress_Store owns the checkpoint. The Workout saves its checkpoint on every state change and at least every 5 seconds while active. Time while the page was closed never counts. The Workout auto-pauses when the page is hidden. All user-facing strings come from the Strings_Module.
- The glossary "Avoid" words (Session, Status, Result, Points, coins, score, XP and the others in `CONTEXT.md`) never appear in UI text, identifiers, tests or comments.
- The agent never runs the dev server. Shell is PowerShell on Windows.

### Scope

In scope: `checkpointOf` and `restoreWorkout` in the Workout_Engine and the new `restored` Pause_Cause; Progress_Data Schema_Version 2 with its migration from version 1; the checkpoint operations of the Progress_Store (save, clear and the atomic finish of a Workout); the checkpoint saving of the Workout_Screen; the Resume_Prompt on the Home_Screen and on the Workout route; Resume and Discard; the strings, tests and steering this ticket changes.

Out of scope, with the ticket that owns it (checked against `.scratch/spooky-coach-mvp/issues/`):

- Unlocks, Coach colors, Accessories, Coach name, equipped look and settings (tickets 10 and 11). Schema_Version 2 adds only the checkpoint; those tickets add their fields by the next migration.
- The Candy burst, the "+1" and sound (ticket 12), the accessibility pass (ticket 13), the golden-path smoke test (ticket 14), nice-to-have Routines (ticket 15).
- Syncing a checkpoint between two open tabs, a second device or an account (ADR 0002). Two tabs that run a Workout at once may overwrite each other's checkpoint; the last write wins.
- A confirmation before Discard, export or import of progress, and any server.
- Browser Back and in-app navigation away from a running Workout still leave without a prompt (as in ticket 07). The checkpoint saved before the user left is offered on the next visit.

### Repository state at spec time

Read from the working tree when this spec was written:

- `src/workout-engine/` holds `candy.ts`, `engine.ts`, `index.ts`, `reps.ts`, `slots.ts` and `types.ts`. `Workout` is plain, JSON-safe data: `routineId`, `slots`, `startedAt`, `clock`, `phase` (`exercising`, `resting`, `paused` or `summary`), `index`, `phaseStartedAt`, `confirmed`, `finishedAt`, `pause` (`cause`, `from`, `at`), `pausedMs`, `skipped` and `outcome`. All times are Workout_Clock values in milliseconds from `performance.now()`, which restarts near 0 on every page load. `PauseCause` is `'user' | 'auto'`. The `types.ts` comment on `Phase` says "Ticket 09 adds nothing here"; this spec keeps that true for `Phase` and adds one Pause_Cause instead. The engine has no serialise or restore function.
- `src/progress-store/` holds `types.ts`, `rules.ts`, `codec.ts`, `store.ts`, `memory-storage.ts`, `local-storage.ts` and `index.ts`. `schemaVersion` is 1, `ProgressData` is `{ schemaVersion: 1, candy, welcomeGiftGranted, history }` and `codec.ts` says where a version table goes "when schema version 2 exists". `parseProgress` returns `none` for any version below the current one, so a naive bump to 2 would **discard every user's Candy and history**. `ProgressStore` offers `snapshot`, `grantWelcomeGift`, `recordWorkout` and `subscribe`.
- `src/ui/workout/useWorkoutRun.ts` owns the run state (`runReducer`), reads `performance.now()` in handlers and in a 250 ms tick, and auto-pauses on `visibilitychange`. `WorkoutScreen.tsx` takes `routine`, `onFinished` and `recordedBalance`. It imports no Progress_Store and names no storage API (the isolation scan `tests/unit/workout-isolation.test.ts` enforces it).
- `src/ui/progress/` holds `useProgress.ts` (one lazy store per page, `useSyncExternalStore`, Welcome gift on mount), `CandyBalance.tsx` (Home_Screen island), `RecordedWorkoutScreen.tsx` (the Recording_Bridge: builds the record at the summary, grants the gift, records) and `workout-record.ts`. Only `src/ui/progress/` and `src/progress-store/` may import `@/progress-store` (`tests/unit/progress-boundaries.test.ts`).
- `src/app/routines/[slug]/workout/page.tsx` renders `RecordedWorkoutScreen` for every prerendered Routine slug. `HomeScreen` is a server component that renders the `CandyBalance` island.
- `PausedPanel` shows `workout.paused.auto` when the Pause_Cause is `auto` and `workout.paused.user` otherwise. `WorkoutScreen` picks the live-region text the same way.

### Interpretations made

- **A checkpoint is a copy of the Workout, not of the clock.** The Workout_Clock restarts on every page load, so a saved clock value means nothing to the next page. The engine rebases the whole Workout onto the new clock when it restores it (Requirement 2). The Progress_Store keeps the Workout as opaque plain data and reads no clock; the checkpoint carries no wall-clock timestamp.
- **Restore always pauses.** A restored Workout never continues by itself. It is paused at the instant the Workout stopped counting, and only the user presses Resume. The ticket says the same: "returns them to the same Exercise and Set, paused".
- **The freeze instant.** A Workout that was exercising or resting froze at the latest Workout_Clock value the checkpoint holds. A Workout that was already paused froze at its pause instant. The time between the last save and the close is lost to the user (at most the 5 second save interval, plus the 250 ms tick); the engine never invents time.
- **A new Pause_Cause `restored`.** Reusing `auto` would make the Paused_Panel say the page was hidden, which is false. The engine therefore gains the cause `restored`, and the Paused_Panel and the live region get their own texts. `Phase` does not change. A Workout that was already paused by the user restores with the cause `restored` too, so the user learns that the page was reloaded.
- **Where the prompt shows.** Two screens: the **Home_Screen** (where a visitor lands when reopening the site) and the **Workout route** (where a refresh mid-Workout lands, and where Start would otherwise overwrite the checkpoint). Both are Candy screens that already touch the Progress_Store. The browsing screens (Exercises, Stretches, Routine list and Routine detail) never read the Progress_Store, so browsing stays storage-free ("viewing earns nothing") and an unfinished Workout does not nag the user there. History does not show the prompt.
- **Resume from the Home_Screen does not ask twice.** Resume on the Home_Screen navigates to the Routine's Workout route and tells that route, through a module-level value that lives only in page memory, that the user already chose Resume. A reload clears it, so a reload asks again. The value is not browser storage.
- **Start is blocked while a checkpoint is undecided.** On the Workout route, while a restorable checkpoint exists, the Resume_Prompt replaces the Preparing_Panel. A new Workout therefore never overwrites an unfinished one without Discard.
- **Discard records "now".** The Workout_Record of a Discarded Workout has `finishedAt` set to the wall-clock time of the Discard, the id `routineId:finishedAt` as in ticket 08, the outcome **abandoned** and the Candy of the confirmed Sets (no Completion_Bonus), exactly what quitting at the pause would record. The History order is recording order, so the date shown is the day the user chose Discard.
- **Finishing is one write.** Recording a finished Workout and removing its checkpoint happen in one `setItem` call (`finishWorkout`). A crash between two writes could otherwise leave a recorded Workout whose checkpoint is offered again, and a Discard would then record it a second time.
- **A damaged checkpoint never costs Candy.** If the stored checkpoint is unreadable, stale or for a Routine that changed, the Candy, the Welcome gift flag and the history are kept and only the checkpoint is dropped. Nothing is recorded for a checkpoint that cannot be restored.
- **A Workout nobody returns to records nothing.** The checkpoint stays until the user decides. This is the same as before the ticket for a user who never comes back; there is no timer and no expiry.

## Glossary

- **Site**, **Strings_Module**, **Home_Screen**, **Phone_Viewport**, **Laptop_Viewport**, **Build**, **Type_Check**, **Unit_Suite**, **E2E_Suite**, **Builder**: As defined in the `spooky-site-skeleton` spec.
- **Catalog**, **Routine_Entry**, **Spooky_Name**: As defined in the `exercise-page-3d-coach`, `catalog-and-stretches` and `happy-path-workout` specs.
- **Workout_Engine**, **Workout_Clock**, **Set_Slot**, **Set_Timer**, **Rest_Timer**, **Completion_Bonus**, **Workout_View**, **Workout_Screen**, **Preparing_Panel**, **Summary_Panel**: As defined in the `happy-path-workout` spec.
- **Paused_Panel**, **Pause_Cause**, **Auto_Pause**, **Coach_Hold**, **Active_Time**: As defined in the `skip-pause-quit` spec. **Pause_Cause** gains the value **restored** (below).
- **Progress_Store**, **Storage_Adapter**, **Storage_Key**, **Progress_Data**, **Schema_Version**, **Candy_Balance**, **Workout_Record**, **History_Entry**, **Progress_Snapshot**, **Persistent_Flag**, **Recording_Bridge**: As defined in the `candy-and-history` spec. **Progress_Data**, **Schema_Version** and **Progress_Snapshot** are extended below.
- **Candy**, **Routine**, **Cool-down**, **Workout**, **Workout outcome**, **Set**, **Welcome gift**, **Exercise**, **Stretch**, **Coach**: As defined in CONTEXT.md.
- **Workout_Checkpoint**: The plain-data copy of a Workout that the Workout_Engine produces with `checkpointOf` and accepts in `restoreWorkout`: `{ version: 1, workout }`, where `workout` is the Workout value. JSON-safe. It carries no wall-clock time.
- **Checkpoint_Version**: The integer `version` of a Workout_Checkpoint. This ticket writes 1.
- **Stored_Checkpoint**: The `checkpoint` member of the Progress_Data: a Workout_Checkpoint or null.
- **Restorable_Checkpoint**: A Workout_Checkpoint that `restoreWorkout` accepts for a given Routine_Entry.
- **Restored_Pause**: The pause of a restored Workout. Its Pause_Cause is **restored**.
- **Freeze_Instant**: The Workout_Clock value at which a checkpointed Workout stopped counting: the pause instant when the Workout was paused, and the latest Workout_Clock value of the checkpoint otherwise.
- **Closed_Time**: The time between the Freeze_Instant and the moment the restored Workout is created. It never counts as Active_Time, Set time or Rest time.
- **Checkpoint_Interval**: 5000 ms, the longest time between two checkpoint saves while a Set or a Rest is running.
- **Checkpoint_Moment**: A change of the Workout that calls for an immediate checkpoint save: a start, an accepted confirm, skip Set, skip Rest, pause, Auto_Pause or resume, and the end of a Rest by time.
- **Checkpoint_Flush**: A checkpoint save made at once when the page becomes hidden or is being hidden for good (`visibilitychange` to hidden, `pagehide`).
- **Finish_Operation**: The Progress_Store operation `finishWorkout(record)`: it records a Workout_Record and clears the Stored_Checkpoint in one write.
- **Resume_Prompt**: The panel that offers **Resume** and **Discard** for a Restorable_Checkpoint.
- **Resume**: The Resume_Prompt choice that restores the Workout.
- **Discard**: The Resume_Prompt choice that records the Workout as **abandoned** and clears the Stored_Checkpoint.
- **Resume_Intent**: The module-level value, held in page memory only, that tells the Workout route that the user already chose Resume on the Home_Screen.
- **Workout_Route**: The route `/routines/[slug]/workout`.

## Requirements

### Requirement 1: Workout_Engine checkpoint and restore commands

**User Story:** As the Builder, I want the engine to turn a Workout into a checkpoint and back with pure functions, so that Vitest proves the round trip without React, storage or real time.

#### Acceptance Criteria

1. WHEN `checkpointOf` receives a Workout whose phase is `exercising`, `resting` or `paused`, THE Workout_Engine SHALL return a Workout_Checkpoint with Checkpoint_Version 1 that holds that Workout as plain, JSON-safe data.
2. WHEN `checkpointOf` receives a Workout whose phase is `summary`, THE Workout_Engine SHALL return null.
3. THE Workout_Engine SHALL provide `restoreWorkout(value, routine, at)` that takes any value, a Routine_Entry and a Workout_Clock value `at`, and returns a Workout or null.
4. THE Workout_Engine SHALL import nothing from the Progress_Store, React, Three.js, the Viewer, the UI or the app, SHALL name no clock, timer, DOM or browser storage, and SHALL take the Workout_Clock as an argument, so that the existing isolation scan passes without a change to its rules.
5. FOR ALL reachable Workouts whose phase is not `summary`, `restoreWorkout` SHALL return a Workout when it receives the value that `JSON.parse` gives for `JSON.stringify` of `checkpointOf` of that Workout (round-trip property).

### Requirement 2: Restore returns the same Workout, paused, on a new clock

**User Story:** As a user who refreshed the page, I want to come back to the same Exercise, Set, Candy and timers, paused, so that I lose nothing but the moment I was away.

#### Acceptance Criteria

1. WHEN `restoreWorkout` accepts a Workout_Checkpoint, THE Workout_Engine SHALL return a Workout in the `paused` phase whose clock is `at` and whose pause has the Pause_Cause `restored`, the held phase of the checkpointed Workout and the pause instant `at`.
2. WHEN `restoreWorkout` accepts a Workout_Checkpoint, THE Workout_Engine SHALL return a Workout whose held Workout_View has the same Set_Slot, the same position, the same results, the same Candy earned and the same Set_Timer or Rest_Timer remaining time as the Workout_View of the checkpointed Workout at its Freeze_Instant.
3. WHEN the checkpointed Workout was paused, THE Workout_Engine SHALL restore it with the same held phase and the Pause_Cause `restored`.
4. THE Workout_Engine SHALL keep the confirmed Sets, the skipped Sets, the Set_Slots and the paused time of finished pauses of the checkpointed Workout unchanged in the restored Workout.
5. WHEN `resumeWorkout` is called on a restored Workout, THE Workout_Engine SHALL continue the held phase with the remaining time that the held Workout_View showed.
6. THE Workout_Engine SHALL accept the Pause_Cause `restored` in its types and views, and `pauseWorkout`, `autoPause` and `resumeWorkout` SHALL otherwise behave as before.
7. FOR ALL reachable Workouts whose phase is not `summary` and FOR ALL clock values `at`, the held Workout_View of the restored Workout SHALL equal the Workout_View that the checkpointed Workout shows at its Freeze_Instant (invariant property).

### Requirement 3: Closed time never counts

**User Story:** As a user who closed the page for an hour, I want that hour left out of my Workout, so that my Active_Time and my timers stay honest.

#### Acceptance Criteria

1. THE Workout_Engine SHALL give the restored Workout the same held Workout_View whatever the value of `at` and whatever the length of the Closed_Time.
2. WHEN a restored Workout is resumed at `at` plus a time `r` and ended at `at` plus `r` plus `d`, THE Workout_Engine SHALL report an Active_Time equal to the Active_Time of the checkpointed Workout at its Freeze_Instant plus `d`.
3. WHILE a Workout is in a Restored_Pause, THE Workout_Engine SHALL end no Rest by time and SHALL advance no Set_Timer.
4. WHEN a Workout whose Rest had `m` ms remaining at its Freeze_Instant is restored and resumed, THE Workout_Engine SHALL show `m` ms of Rest remaining at the resume instant.
5. THE Workout_Engine SHALL count the Closed_Time as no Active_Time, no Set time and no Rest time.
6. FOR ALL reachable Workouts, FOR ALL restore times `at` and FOR ALL resume delays `r` and run times `d`, the Active_Time of the ended Workout SHALL be independent of `at` and of `r` (metamorphic property).

### Requirement 4: Unusable checkpoints are rejected, never thrown

**User Story:** As a user whose storage holds an old, damaged or foreign checkpoint, I want the Site to ignore it safely, so that a bad checkpoint never breaks the Workout screen or my Candy.

#### Acceptance Criteria

1. IF the value passed to `restoreWorkout` is not an object, has no `version` equal to 1, or has no `workout` object, THEN THE Workout_Engine SHALL return null.
2. IF the `routineId` of the checkpointed Workout differs from the id of the Routine_Entry, or its Set_Slots differ from the Set_Slots that the Routine_Entry builds, THEN THE Workout_Engine SHALL return null.
3. IF the phase of the checkpointed Workout is `summary` or is not one of `exercising`, `resting` and `paused`, THEN THE Workout_Engine SHALL return null.
4. IF the checkpointed Workout has an index outside its Set_Slots, a confirmed or skipped index outside its Set_Slots, a repeated index, an index both confirmed and skipped, an Actual_Reps value that does not fit the Set's target, a number that is not a finite non-negative number, a `pause` that does not match its phase, or an outcome or finish time in a Workout that has not finished, THEN THE Workout_Engine SHALL return null.
5. THE `restoreWorkout` function SHALL return null or a Workout for every input and SHALL throw for none.
6. FOR ALL values that `JSON.parse` can produce, `restoreWorkout` SHALL not throw, and WHEN it returns a Workout, THE `workoutView` function and every Workout_Engine command SHALL accept that Workout without throwing (error-condition property).

### Requirement 5: Progress_Data Schema_Version 2 and the migration from version 1

**User Story:** As a returning user, I want my Candy and history to survive the app update that adds checkpoints, so that the update costs me nothing.

#### Acceptance Criteria

1. THE Progress_Store SHALL write Progress_Data with the Schema_Version 2 and a `checkpoint` member that is null or a Workout_Checkpoint, under the same Storage_Key and in one JSON text.
2. WHEN the stored text is valid Progress_Data of Schema_Version 1, THE Progress_Store SHALL report the same Candy_Balance, Welcome gift flag and History_Entries, and a Stored_Checkpoint of null.
3. WHEN the stored text is valid Schema_Version 1 data and the Progress_Store is created, THE Progress_Store SHALL write nothing until a change is made, and THE first change SHALL write the whole Progress_Data with the Schema_Version 2.
4. IF the stored text is of Schema_Version 1 and does not match the version 1 shape, THEN THE Progress_Store SHALL treat it as no data, as before.
5. IF the stored Schema_Version is greater than 2, THEN THE Progress_Store SHALL work in memory only, write nothing to the Storage_Adapter and set the Persistent_Flag to false, as it does today for a newer version.
6. IF the stored Schema_Version is less than 1, THEN THE Progress_Store SHALL treat the text as no data.
7. IF the `checkpoint` member of stored Schema_Version 2 data is present but is not null and does not have the checkpoint envelope shape (Requirement 6.3), THEN THE Progress_Store SHALL report a Stored_Checkpoint of null and SHALL keep the Candy_Balance, the Welcome gift flag and the History_Entries that the data holds.
8. IF the `checkpoint` member of stored Schema_Version 2 data is missing, THEN THE Progress_Store SHALL treat the text as no data.
9. FOR ALL valid Schema_Version 1 data, parsing it SHALL give Schema_Version 2 data with the same `candy`, `welcomeGiftGranted` and `history` and a `checkpoint` of null (migration property).
10. FOR ALL valid Schema_Version 2 data, parsing the text that serialising produced SHALL give data equal to the original (round-trip property).

### Requirement 6: Progress_Store checkpoint operations

**User Story:** As the Builder, I want the Progress_Store to own the checkpoint behind the same injected storage, so that Vitest proves every rule against an in-memory storage.

#### Acceptance Criteria

1. THE Progress_Store SHALL provide the operations `saveCheckpoint(checkpoint)`, `clearCheckpoint()` and `finishWorkout(record)`, and THE Progress_Snapshot SHALL report the Stored_Checkpoint as `checkpoint`.
2. WHEN `saveCheckpoint` receives a value of the checkpoint envelope shape, THE Progress_Store SHALL read the stored text again, replace the Stored_Checkpoint, leave the Candy_Balance, the Welcome gift flag and the history unchanged, write the whole Progress_Data with a single `setItem` call and report that it was saved.
3. THE Progress_Store SHALL accept a value as a checkpoint envelope if and only if it is an object whose `version` is 1 and whose `workout` is an object with a non-empty text `routineId`; the Progress_Store SHALL NOT judge the rest of the Workout.
4. IF `saveCheckpoint` receives a value that is not of the checkpoint envelope shape, THEN THE Progress_Store SHALL change nothing, write nothing and report that it was not saved because it is invalid.
5. WHEN `clearCheckpoint` is called and a Stored_Checkpoint exists, THE Progress_Store SHALL set it to null with a single `setItem` call; WHEN no Stored_Checkpoint exists, THE Progress_Store SHALL change nothing and write nothing.
6. WHEN `finishWorkout` receives a valid Workout_Record whose id is new, THE Progress_Store SHALL add its `candyEarned` to the Candy_Balance, append it to the history, set the Stored_Checkpoint to null and write all three with a single `setItem` call, and report that it was recorded with the new Candy_Balance.
7. WHEN `finishWorkout` receives a valid Workout_Record whose id already exists in the history, THE Progress_Store SHALL leave the Candy_Balance and the history unchanged, set the Stored_Checkpoint to null with a single `setItem` call when one exists, and report that it was not recorded because it is a duplicate.
8. IF `finishWorkout` receives a Workout_Record that is not valid, THEN THE Progress_Store SHALL change nothing, write nothing and report that it was not recorded because it is invalid.
9. WHEN `recordWorkout` (the operation of ticket 08) is called, THE Progress_Store SHALL leave the Stored_Checkpoint unchanged.
10. THE Progress_Store SHALL read no clock, and THE Workout_Checkpoint SHALL carry no timestamp.
11. THE Progress_Store SHALL import only types from the Workout_Engine, SHALL import nothing at runtime from the Workout_Engine, React, Three.js, the Viewer, the UI, the app routes or the Catalog, and SHALL keep exactly one file that names `localStorage`.
12. THE Progress_Snapshot SHALL give a copy of the Stored_Checkpoint, so that WHEN a caller changes the returned object, THE Progress_Store SHALL report the unchanged Stored_Checkpoint in its next Progress_Snapshot.
13. WHEN a checkpoint operation changes the Progress_Data, THE Progress_Store SHALL call every registered listener once and return a new Progress_Snapshot object; WHEN it changes nothing, THE Progress_Store SHALL return the same Progress_Snapshot object as before.
14. WHILE the Progress_Store works in memory only, because the Storage_Adapter throws or the stored Schema_Version is newer, THE Progress_Store SHALL apply the checkpoint operations in memory and SHALL keep the Persistent_Flag false.
15. WHILE the stored Schema_Version is greater than 2, THE Progress_Store SHALL write nothing to the Storage_Adapter for any checkpoint operation.
16. FOR ALL sequences of grant, record, save checkpoint, clear checkpoint, finish and reload operations, a new Progress_Store over the same Storage_Adapter SHALL report the same Progress_Snapshot as the Progress_Store that ran the sequence, the Welcome gift SHALL have been granted at most once, and the Candy_Balance SHALL equal 15 when the Welcome gift was granted and 0 otherwise, plus the Total_Candy_Earned (invariant property).
17. FOR ALL sequences of operations, THE Stored_Checkpoint SHALL be null after a `finishWorkout` whose record is valid, and the history SHALL hold each record id at most once (invariant property).

### Requirement 7: Saving the checkpoint while a Workout runs

**User Story:** As a user whose phone may die or whose tab may be closed at any moment, I want the Workout saved often, so that Resume has something recent to restore.

#### Acceptance Criteria

1. WHEN a Checkpoint_Moment happens, THE Workout_Screen SHALL call its `onCheckpoint` callback once with the Workout_Checkpoint of the new Workout state, in the same event turn.
2. WHILE the Workout is in the `exercising` or `resting` phase, THE Workout_Screen SHALL call `onCheckpoint` with the Workout_Checkpoint of the latest Workout state at least once every 5000 ms (the Checkpoint_Interval).
3. WHEN the page becomes hidden or `pagehide` fires while the Workout is in the `exercising`, `resting` or `paused` phase, THE Workout_Screen SHALL make a Checkpoint_Flush by calling `onCheckpoint` with the Workout_Checkpoint of the latest Workout state at once.
4. WHEN the Workout_Clock tick changes only the clock of the Workout, THE Workout_Screen SHALL make no Checkpoint_Moment call.
5. WHILE the Workout is in the `paused` phase, THE Workout_Screen SHALL call `onCheckpoint` for the pause itself and for a Checkpoint_Flush and for no other reason.
6. WHILE the Preparing_Panel shows or the Workout has reached the summary, THE Workout_Screen SHALL call `onCheckpoint` never, so that no late timer or Checkpoint_Flush writes a checkpoint after the Workout finished.
7. THE Workout_Screen SHALL build every checkpoint with `checkpointOf` and SHALL re-implement no engine rule.
8. THE `src/ui/workout/` folder SHALL import nothing from `src/progress-store/` and SHALL name no browser storage; the Recording_Bridge SHALL pass `onCheckpoint` and SHALL call the Progress_Store.
9. IF saving a checkpoint fails or the Persistent_Flag is false, THEN THE Workout_Screen SHALL keep running the Workout with every control working.
10. FOR ALL command scripts, a pure function SHALL report a Checkpoint_Moment after each accepted command and after each end of a Rest by time, and SHALL report none after a tick that changes only the clock (property over the Workout_Engine's command scripts).

### Requirement 8: Clearing the checkpoint at the summary

**User Story:** As a user who finished a Workout, I want no Resume offer for it afterwards, so that a finished Workout is never offered again or recorded twice.

#### Acceptance Criteria

1. WHEN the Workout reaches the summary, whatever its Workout outcome, THE Recording_Bridge SHALL call `finishWorkout` once with the Workout_Record built as in ticket 08, so that the history entry, the Candy and the cleared checkpoint are written together.
2. WHEN a Workout has reached the summary, THE Site SHALL offer no Resume_Prompt for it on the next visit.
3. THE Recording_Bridge SHALL keep every rule of ticket 08 for recording (the id, `finishedAt` from `Date.now()` read only in the finish handler, the Welcome gift granted first, no double recording), with `finishWorkout` in the place of `recordWorkout`.
4. WHEN a Workout was Resumed and then completed, partially completed or quit, THE Progress_Store SHALL hold exactly one History_Entry for it and a Stored_Checkpoint of null.

### Requirement 9: The Resume_Prompt

**User Story:** As a user who reopens the Site mid-Workout, I want a clear "Resume or Discard?" before anything else can overwrite my Workout, so that I decide what happens to it.

#### Acceptance Criteria

1. WHEN the Home_Screen has read a Progress_Snapshot whose Stored_Checkpoint is a Restorable_Checkpoint, THE Home_Screen SHALL show the Resume_Prompt with a heading, the Spooky_Name of the Routine, the Exercise name, the Set position, the Candy earned so far, a sentence that the time away does not count, a Resume button and a Discard button.
2. WHILE the Home_Screen has not yet read the Progress_Snapshot, THE Home_Screen SHALL show no Resume_Prompt.
3. WHEN the Workout_Route has read a Progress_Snapshot whose Stored_Checkpoint is a Restorable_Checkpoint and the user has not yet chosen Resume or Discard, THE Workout_Route SHALL show the Resume_Prompt in the place of the Preparing_Panel.
4. WHILE the Workout_Route has not yet read the Progress_Snapshot, THE Workout_Route SHALL show a loading text and neither the Preparing_Panel nor the Resume_Prompt.
5. WHEN the Workout_Route has read a Progress_Snapshot whose Stored_Checkpoint is null and no Resume_Intent exists, THE Workout_Route SHALL show the Preparing_Panel as before.
6. WHEN the Stored_Checkpoint is for a Routine other than the Routine of the Workout_Route, THE Resume_Prompt SHALL name the Routine of the checkpoint.
7. IF the Stored_Checkpoint is not a Restorable_Checkpoint for its Routine, THEN THE Site SHALL clear it with `clearCheckpoint`, record nothing and show no Resume_Prompt.
8. THE Site SHALL render the Home_Screen and the Workout_Route to static HTML that contains no Resume_Prompt, so that the Resume_Prompt appears only after the browser has read the Progress_Snapshot.
9. THE Exercise, Stretch, Routine list and Routine detail screens SHALL neither read the Progress_Store nor show the Resume_Prompt.
10. THE Resume_Prompt SHALL describe the Workout with the Routine, the Exercise and the Set, SHALL claim nothing about form and SHALL not blame the user.

### Requirement 10: Resume

**User Story:** As a user who chose Resume, I want to be back on the same Exercise and Set, paused, so that I can pick up when I am ready.

#### Acceptance Criteria

1. WHEN the user presses Resume on the Workout_Route for the Routine of the Stored_Checkpoint, THE Recording_Bridge SHALL show the Workout_Screen with the restored Workout, in the Paused_Panel, for the same Exercise, Set, results and Candy earned and with the Set_Timer or Rest_Timer remaining time of the checkpoint.
2. WHEN the user presses Resume on the Home_Screen, THE Home_Screen SHALL set the Resume_Intent for the Routine of the checkpoint and navigate to that Routine's Workout_Route.
3. WHEN the Workout_Route opens with a Resume_Intent for its Routine and a Restorable_Checkpoint, THE Workout_Route SHALL show the restored Workout at once, with no second Resume_Prompt.
4. WHEN the page is reloaded, THE Site SHALL hold no Resume_Intent, and the Resume_Prompt SHALL show again.
5. WHEN the user presses Resume on the Workout_Route for a Routine other than the Routine of the Stored_Checkpoint, THE Workout_Route SHALL set the Resume_Intent and navigate to the Workout_Route of the checkpoint's Routine.
6. WHILE the restored Workout is in the Restored_Pause, THE Paused_Panel SHALL show a text for the Pause_Cause `restored` that says the Workout is paused where it was left and that the time away does not count, and THE Workout_Screen SHALL announce that text in its live region.
7. WHILE the restored Workout is in the Restored_Pause, THE Workout_Screen SHALL hold the Coach (Coach_Hold) as it does for any pause, so that the Coach starts paused.
8. THE Workout_Screen SHALL show no frame of the Preparing_Panel between the Resume and the Paused_Panel.
9. WHEN the user presses the resume control of the Paused_Panel, THE Workout_Screen SHALL continue the Workout as it does after any pause.
10. THE `restoreWorkout` call SHALL read the Workout_Clock from `performance.now()` only inside the Workout run hook, and the checkpoint SHALL stay in the Progress_Store, with saving continuing as in Requirement 7, until the Workout reaches the summary.

### Requirement 11: Discard

**User Story:** As a user who does not want to continue, I want Discard to end the Workout and keep what I earned, so that the Sets I confirmed still count.

#### Acceptance Criteria

1. WHEN the user presses Discard, THE Recording_Bridge SHALL restore the checkpoint, quit the restored Workout and build a Workout_Record with the Routine id, the outcome **abandoned**, the Candy of the confirmed Sets and no Completion_Bonus, a `finishedAt` of `Date.now()` read in that handler, and the id `routineId:finishedAt`.
2. WHEN the Workout_Record is built, THE Recording_Bridge SHALL grant the Welcome gift if it was not granted yet and then call `finishWorkout`.
3. WHEN Discard has finished, THE Progress_Snapshot SHALL show a Stored_Checkpoint of null, a History_Entry with the outcome **abandoned** and the Candy of the confirmed Sets, and a Candy_Balance that includes that Candy.
4. WHEN Discard is pressed twice or from two tabs, THE Progress_Store SHALL record the Workout at most once.
5. WHEN Discard has finished on the Home_Screen, THE Home_Screen SHALL remove the Resume_Prompt and show the new Candy_Balance in place.
6. WHEN Discard has finished on the Workout_Route, THE Workout_Route SHALL show a text that says the Workout was recorded as abandoned, with the Candy for the confirmed Sets, and the Preparing_Panel of that Routine.
7. THE Recording_Bridge SHALL read the wall-clock time only inside the `onFinished` and Discard handlers.
8. FOR ALL Restorable_Checkpoints, the Workout_Record of Discard SHALL be valid, SHALL have the outcome `abandoned` and SHALL have a `candyEarned` equal to `candyFor` of the confirmed Sets and the total Sets without the bonus (property over the Workout_Engine's command scripts).

### Requirement 12: Boundaries and storage footprint

**User Story:** As the Builder, I want the new storage to stay inside one key that only Candy screens touch, so that ADR 0002 and "viewing earns nothing" stay provable.

#### Acceptance Criteria

1. THE Progress_Store SHALL be used by the Home_Screen, the History_Screen, the Recording_Bridge and the Resume_Prompt only, and only `src/ui/progress/` and `src/progress-store/` SHALL import `@/progress-store`.
2. THE `src/workout-engine/`, `src/ui/workout/` and `src/app/routines/` folders SHALL reference no browser storage and SHALL import nothing from `src/progress-store/`, and the existing isolation scans SHALL pass without a change to their rules.
3. WHEN the Home_Screen, the History_Screen or a Workout has run, THE Site SHALL hold exactly one `localStorage` key, the Storage_Key, and nothing in `sessionStorage`, IndexedDB or cookies.
4. WHEN a visitor with empty browser storage opens only the Exercise, Stretch and Routine screens, THE Site SHALL leave `localStorage`, `sessionStorage`, IndexedDB and cookies empty, and `tests/unit/viewing-earns-nothing.test.ts` and `tests/e2e/viewing-earns-nothing.spec.ts` SHALL pass without a change.
5. THE Resume_Intent SHALL be a module-level value in `src/ui/progress/` and SHALL not be written to any browser storage, cookie or URL.
6. THE Site SHALL send no network request other than GET or HEAD to its own origin and SHALL set no cookie.

### Requirement 13: Strings and wording

**User Story:** As the Builder, I want every new text in the Strings_Module and in the glossary's terms, so that Thai can be added later and the wording stays consistent.

#### Acceptance Criteria

1. THE Strings_Module SHALL hold every text of this ticket: the Resume_Prompt heading, description, time-away sentence, Resume and Discard labels, the loading text of the Workout_Route, the Discard confirmation text, the Paused_Panel text and the live-region text for the Pause_Cause `restored`.
2. THE new strings SHALL use the terms Workout, Set, Routine, Candy, Workout outcome and Exercise and SHALL NOT use Session, Status, Result, Points, coins, score or XP.
3. THE new strings SHALL NOT imply that the app checked or approved the user's form, and SHALL NOT shame the user for leaving, discarding or being away.
4. THE new template strings SHALL be listed with their placeholders in `tests/unit/strings-format.test.ts`.
5. THE new strings under `workout.` SHALL NOT say the Candy was saved, kept, stored or added to a balance, so that the existing rule for `workout.`, `summary.`, `routine.` and `safety.` strings holds without an exception.

### Requirement 14: Accessibility and layout

**User Story:** As a user on a phone with large text or a screen reader, I want the prompt to be readable, reachable and labelled, so that I can decide without sight of the screen.

#### Acceptance Criteria

1. THE Resume_Prompt SHALL be a labelled region (`section` with `aria-labelledby` to its heading) with the Resume and Discard buttons as real buttons.
2. THE Resume_Prompt buttons SHALL be at least `3rem` tall and SHALL have text labels, not colour or icon alone.
3. THE Resume_Prompt SHALL reflow with no horizontal scroll and no clipped text at 320 CSS pixels wide and at 200% text size.
4. THE Resume_Prompt SHALL use design tokens for every colour and SHALL add no animation or transition.
5. WHEN the Workout_Route shows the Resume_Prompt or the restored Paused_Panel, THE Workout_Screen SHALL move focus to the panel heading, as it does for other panels.
6. THE Resume_Prompt SHALL not be a live region, and the loading text SHALL be replaced in place by the loaded content.

### Requirement 15: Tests and repository rules

**User Story:** As the Builder, I want tests that protect each rule of this ticket and earlier tests that stay honest, so that a regression fails the build.

#### Acceptance Criteria

1. THE Unit_Suite SHALL contain Vitest tests for the checkpoint round trip, for "closed-page time is not counted" (Requirement 3), for every rejection of Requirement 4, for the migration from version 1 to version 2 with Candy and history kept, for the checkpoint operations of the Progress_Store and for the Checkpoint_Moment function, all with an injected clock and an in-memory Storage_Adapter.
2. THE property tests SHALL use `fast-check` with `numRuns` of 200 and a tag comment `// Feature: resume-after-refresh, Property N: …`.
3. THE E2E_Suite SHALL contain a spec for the ticket's acceptance path: mid-Workout reload on the Workout_Route shows the Resume_Prompt and no Preparing_Panel; Resume shows the Paused_Panel for the same Exercise, Set, Candy and timer; time passing while paused leaves the timer unchanged; the Workout continues and finishes with one History_Entry and no prompt on the next visit; a reload followed by Discard records an abandoned History_Entry with the Candy of the confirmed Sets and clears the prompt; the Home_Screen prompt with Resume navigating without a second prompt; a Workout that reached the summary leaves no prompt; stored version 1 data is migrated with its Candy and history intact; a damaged checkpoint is dropped with Candy and history kept.
4. WHEN a test of an earlier spec asserts Schema_Version 1 in stored text, asserts that a version 2 stored text is the "newer" case, or asserts that the Workout_Route shows the Preparing_Panel in its first render, THE test SHALL be changed to the new rule (Schema_Version 2, version 3 is the newer case, the Preparing_Panel shows after the Progress_Snapshot is read) and SHALL NOT be weakened in any other way.
5. THE test scans SHALL still cover `src/progress-store/` and `src/workout-engine/` with their existing rules, and SHALL cover `src/ui/progress/` for the rule that the Resume_Intent is not browser storage.
6. THE `.kiro/steering/structure.md` file SHALL mention this ticket in "Current state", and `tests/unit/repository-rules.test.ts` SHALL pass.
7. THE Type_Check (`npx tsc --noEmit`), THE Unit_Suite, THE Build and THE E2E_Suite SHALL pass with no test skipped.

### Requirement 16: Static build and hydration

**User Story:** As the Builder, I want the Site to stay a static build that never reads storage on the server, so that it deploys to Vercel unchanged and the first paint matches the hydrated page.

#### Acceptance Criteria

1. THE Site SHALL keep every page statically prerendered, including every Workout_Route.
2. THE Progress_Store SHALL be created and read only in the browser, after the first client render.
3. THE server-rendered HTML of the Workout_Route SHALL contain the loading text, SHALL contain no Preparing_Panel and no Resume_Prompt, and THE server-rendered HTML of the Home_Screen SHALL contain no Resume_Prompt.
4. WHEN the page hydrates, THE Home_Screen and the Workout_Route SHALL replace the loading text without a hydration warning in the browser console.
5. THE Site SHALL need no environment variable, server code or API route for this ticket.
