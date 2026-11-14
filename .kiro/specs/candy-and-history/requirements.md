# Requirements Document

## Introduction

This spec covers ticket `08-candy-and-history` of the Spooky Coach MVP (`.scratch/spooky-coach-mvp/issues/08-candy-and-history.md`). It builds on the committed `happy-path-workout` and `skip-pause-quit` specs. Until now a Workout shows the Candy earned and then forgets it. This ticket adds the Progress_Store: the module that owns the Candy_Balance, the Welcome gift flag and the Workout history, behind an injected Storage_Adapter (in-memory in tests, `localStorage` in the app). A brand-new visitor receives the 15 Candy Welcome gift exactly once. Every Workout that reaches the summary, whether **completed**, **partial** or **abandoned**, adds its Candy to the Candy_Balance and appends one entry to the history. The Home_Screen shows the Candy_Balance. The History_Screen lists past Workouts, newest first, with date, Routine, Workout outcome and Candy earned, plus the total Candy earned.

Constraints from the ADRs and steering:

- ADR 0001: a website, phone-first, also good on a laptop.
- ADR 0002: no backend, all user data in browser storage. This ticket is the first to write to browser storage. **No ADR conflict.** It writes one `localStorage` key and nothing else. Losing data on cleared storage or a new device is accepted.
- ADR 0004: app code consumes delivered assets and never creates them. No asset is touched.
- The Workout_Engine stays pure: it never imports the Progress_Store, React, Three.js or storage, and reads no clock.
- Every user-facing string comes from the Strings_Module. Every colour comes from the design tokens. The glossary "Avoid" words (Points, coins, score, XP, Session, Status, Result and the others in `CONTEXT.md`) never appear.
- The agent never runs the dev server. Shell is PowerShell on Windows.

### Scope

In scope: the `src/progress-store/` module (pure rules, codec, store, in-memory and `localStorage` adapters); the client hook that shares one store per page; the recording of a finished Workout; the balance line on the Summary_Panel; the Candy_Balance on the Home_Screen; the History_Screen; the strings, tests and steering this ticket changes.

Out of scope, with the ticket that owns it (checked against `.scratch/spooky-coach-mvp/issues/`):

- Spending Candy, Unlocks, Coach colors, Accessories, Coach name, equipped look (tickets 10 and 11). The Candy_Balance only goes up in this ticket. The Progress_Data schema is versioned so those tickets can add fields by migration.
- Saving a checkpoint, Resume or Discard after a refresh, and the rule that time while the page was closed never counts (ticket 09). A Workout that ends by closing the tab, refreshing or pressing Back reaches no summary and records nothing here.
- Sound settings, the Candy burst and the "+1" (ticket 12), the accessibility pass (ticket 13), the golden-path smoke test with the witch hat Unlock (ticket 14), nice-to-have Routines (ticket 15).
- Exporting, importing or deleting progress, syncing between tabs while both are open, and any server (ADR 0002).

### Repository state at spec time

Read from the working tree when this spec was written:

- `src/workout-engine/` holds `candy.ts`, `engine.ts`, `index.ts`, `reps.ts`, `slots.ts` and `types.ts`. `workoutView` returns a `SummaryView` with `outcome` (`completed`, `partial` or `abandoned`), `candyEarned`, `setsConfirmed`, `setsSkipped`, `setsNotReached`, `activeMs`, `bonusIncluded` and `results`. `candyFor(confirmed, total)` gives 1 Candy per confirmed Set plus 5 only when every Set is confirmed. The Workout_Engine already holds the Candy rule; this ticket adds no Candy rule.
- `src/progress-store/` does not exist. `src/app/history/page.tsx` renders `PlaceholderScreen` for History. `src/ui/sections.ts` lists `history` among the Placeholder sections (`crypt` and `history`).
- `src/ui/workout/WorkoutScreen.tsx` is the client island that runs a Workout. `src/app/routines/[slug]/workout/page.tsx` renders it. `SummaryPanel` shows outcome, Sets confirmed, Sets skipped, Sets not reached, Active time, Candy earned, the bonus or no-bonus line and the Set list. It says nothing about a balance.
- `HomeScreen` is a server component with the title, tagline and Home_Navigation. It shows no Candy.
- Several existing tests encode the rule "nothing is stored yet" and are superseded by this ticket (see Requirement 13): `tests/unit/workout-isolation.test.ts` (Workout UI and routes import no Progress_Store; keeps passing, see the bridge below), `tests/unit/strings.test.ts` (no Summary string mentions a balance), `tests/e2e/workout.spec.ts` and `tests/e2e/workout-controls.spec.ts` (browser stores are empty after a Workout), `tests/e2e/navigation.spec.ts` and `tests/unit/strings.test.ts` (History is a Placeholder). `tests/unit/viewing-earns-nothing.test.ts` and `tests/e2e/viewing-earns-nothing.spec.ts` stay true and unchanged: browsing writes nothing.

### Interpretations made

- **One recording point: the summary.** A Workout is recorded exactly once, when it reaches the summary. All three Workout outcomes are recorded, including a Workout with 0 Candy (for example an **abandoned** Workout quit before any Set). The ticket says "finished or abandoned"; **partial** is a finished Workout.
- **The bridge keeps the Workout code storage-free.** `src/ui/workout/` keeps its rule of importing no Progress_Store. `WorkoutScreen` gains an optional `onFinished(view)` callback and an optional `recordedBalance` prop. A new component `RecordedWorkoutScreen` in `src/ui/progress/` calls the Progress_Store. The Workout route renders `RecordedWorkoutScreen`. The wall-clock date is read there, outside the engine.
- **The Welcome gift is granted on the first screen that shows or changes Candy.** Those screens are the Home_Screen, the History_Screen and the Workout_Screen. Browsing screens (Exercises, Stretches, Routine list and detail) never touch the Progress_Store, so "viewing earns nothing and stores nothing" stays true. A visitor who lands deep inside the Exercises section sees no Candy and gets the gift on first visiting Home, History or a Workout.
- **Total Candy earned excludes the Welcome gift.** It is the sum of Candy earned over the history. The Candy_Balance includes the Welcome gift. Until Unlocks exist, balance = Welcome gift (when granted) + total Candy earned.
- **History order is recording order.** Newest first means last recorded first. The stored `finishedAt` is for display only, so a changed device clock cannot reorder the list.
- **Record identity.** A Workout_Record id is the Routine id, a colon and `finishedAt` in milliseconds. A second attempt to record the same Workout (React Strict Mode runs effects twice in development) is ignored.
- **Unreadable data starts fresh.** Stored text that is not valid Progress_Data is treated as no data, so a visitor with damaged data gets a new Welcome gift on the next change. Data written by a newer app version is never overwritten: the Progress_Store then works in memory only. A browser that refuses storage (private mode, quota) also falls back to memory, and the Home_Screen says so.
- **The first-visit message is shown only on the visit that granted the gift.** After a reload the Home_Screen shows the balance only.
- **Candy wording.** Earlier specs forbade any text saying the Candy was saved or added to a balance, because nothing was stored. This ticket stores it, so the Summary_Panel may now state the new Candy_Balance. The rule stays in force for every other Workout, Summary, Routine and Safety_Message string.

## Glossary

- **Site**, **Strings_Module**, **Placeholder_Screen**, **Home_Screen**, **Home_Navigation**, **Phone_Viewport**, **Laptop_Viewport**, **Build**, **Type_Check**, **Unit_Suite**, **E2E_Suite**, **Builder**: As defined in the `spooky-site-skeleton` spec.
- **Catalog**, **Routine_Entry**, **Spooky_Name**: As defined in the `exercise-page-3d-coach`, `catalog-and-stretches` and `happy-path-workout` specs.
- **Workout_Engine**, **Workout_Screen**, **Summary_Panel**, **Workout_View**, **Completion_Bonus**: As defined in the `happy-path-workout` and `skip-pause-quit` specs.
- **Candy**, **Welcome gift**, **Routine**, **Workout**, **Workout outcome**, **Set**, **Unlock**: As defined in CONTEXT.md.
- **Progress_Store**: The module in `src/progress-store/` that owns the Candy_Balance, the Welcome gift flag and the Workout history, and reads and writes browser storage only through a Storage_Adapter.
- **Storage_Adapter**: The object the Progress_Store receives when created. It offers `getItem(key)` and `setItem(key, value)` over strings. Tests use the in-memory adapter; the app uses the `localStorage` adapter.
- **Storage_Key**: The one browser storage key the Progress_Store uses: `spooky-coach:progress`.
- **Progress_Data**: The JSON value stored under the Storage_Key: `schemaVersion`, `candy`, `welcomeGiftGranted` and `history`.
- **Schema_Version**: The integer `schemaVersion` of the Progress_Data. This ticket writes 1.
- **Candy_Balance**: The `candy` number of the Progress_Data: the Candy the user holds.
- **Workout_Record**: What the Progress_Store receives for one finished Workout: `id`, `routineId`, `finishedAt` (milliseconds since the Unix epoch), `outcome` and `candyEarned`.
- **History_Entry**: One Workout_Record as stored in the history.
- **Total_Candy_Earned**: The sum of `candyEarned` over all History_Entries.
- **Progress_Snapshot**: The read-only view the Progress_Store gives to the UI: Candy_Balance, Welcome gift flag, History_Entries newest first, Total_Candy_Earned, Schema_Version and `persistent`.
- **Persistent_Flag**: The `persistent` member of the Progress_Snapshot. It is false when the Progress_Store works in memory only.
- **Recording_Bridge**: The `RecordedWorkoutScreen` component in `src/ui/progress/`. It connects the Workout_Screen to the Progress_Store.
- **Balance_Line**: The text on the Home_Screen that shows the Candy_Balance.
- **History_Screen**: The screen at `/history`.

## Requirements

### Requirement 1: Progress_Store module and boundaries

**User Story:** As the Builder, I want one small module that owns Candy and history behind an injected storage, so that Vitest proves every rule against an in-memory storage and the app uses `localStorage`.

#### Acceptance Criteria

1. THE Progress_Store SHALL expose an operation that returns the Progress_Snapshot, an operation that grants the Welcome gift, an operation that records a Workout_Record, and an operation that registers a change listener.
2. THE Progress_Store SHALL receive its Storage_Adapter as an argument when created and SHALL read and write browser storage only through it.
3. THE Progress_Store SHALL import nothing at runtime from React, Three.js, the Viewer, the UI, the app routes, the Catalog or the Workout_Engine, and SHALL import only types from the Workout_Engine.
4. THE Progress_Store SHALL read no clock; every timestamp it stores comes in the Workout_Record.
5. THE Workout_Engine SHALL import nothing from the Progress_Store, and the existing isolation scan (`tests/unit/workout-isolation.test.ts`) SHALL pass for `src/workout-engine/`, `src/ui/workout/` and `src/app/routines/` without a change to its rules.
6. THE Progress_Store SHALL provide an in-memory Storage_Adapter and a `localStorage` Storage_Adapter, and exactly one file of `src/progress-store/` SHALL name `localStorage`.

### Requirement 2: Persistence and the schema version

**User Story:** As a returning user, I want my Candy and history to survive a reload, so that the work I did in earlier Workouts still counts.

#### Acceptance Criteria

1. THE Progress_Store SHALL store the Progress_Data as one JSON text under the Storage_Key, and the Progress_Data SHALL carry the Schema_Version 1.
2. WHEN a Progress_Store is created over a Storage_Adapter that holds valid Progress_Data, THE Progress_Store SHALL report the Candy_Balance, the Welcome gift flag and the History_Entries that the Progress_Data holds.
3. WHEN a Progress_Store is created over a Storage_Adapter that holds no text under the Storage_Key, THE Progress_Store SHALL report a Candy_Balance of 0, a Welcome gift flag of false and an empty history, and SHALL write nothing until a change is made.
4. WHEN a change is made, THE Progress_Store SHALL read the stored text again, apply the change to what it read, and write the whole Progress_Data with a single `setItem` call.
5. IF the stored text is not valid JSON or does not match the Progress_Data shape, THEN THE Progress_Store SHALL treat it as no data.
6. IF the stored Schema_Version is greater than 1, THEN THE Progress_Store SHALL work in memory only, SHALL write nothing to the Storage_Adapter, and SHALL set the Persistent_Flag to false.
7. IF the Storage_Adapter throws on a read or a write, THEN THE Progress_Store SHALL keep working in memory for the rest of the page and SHALL set the Persistent_Flag to false.
8. FOR ALL valid Progress_Data, parsing the text that serialising produced SHALL give Progress_Data equal to the original (round-trip property).
9. FOR ALL sequences of Progress_Store operations, a new Progress_Store created over the same Storage_Adapter SHALL report the same Progress_Snapshot as the Progress_Store that ran the operations (persistence property).

### Requirement 3: Welcome gift

**User Story:** As a brand-new visitor, I want a starting amount of Candy, so that I can look forward to my first Unlock before I finish a Workout.

#### Acceptance Criteria

1. WHEN the grant operation is called and the Welcome gift flag is false, THE Progress_Store SHALL add 15 to the Candy_Balance, set the Welcome gift flag to true, write the Progress_Data, and report that the gift was granted.
2. WHEN the grant operation is called and the Welcome gift flag is true, THE Progress_Store SHALL change nothing, write nothing and report that no gift was granted.
3. WHEN a new Progress_Store is created over a Storage_Adapter whose Progress_Data has the Welcome gift flag true, THE Progress_Store SHALL report the flag as true, so the gift is never granted again after a reload.
4. THE Progress_Store SHALL keep the Welcome gift out of the history and out of the Total_Candy_Earned.
5. FOR ALL sequences of grant and record operations with any number of reloads in between, THE Progress_Store SHALL have granted the Welcome gift at most once, and the Candy_Balance SHALL include 15 for it if and only if it was granted.

### Requirement 4: Recording a finished Workout

**User Story:** As a user who finished or quit a Workout, I want the Candy I earned added to my balance and the Workout written to my history, so that nothing I did is lost.

#### Acceptance Criteria

1. WHEN a valid Workout_Record is recorded, THE Progress_Store SHALL add its `candyEarned` to the Candy_Balance, append it to the history as a History_Entry, write both in one write, and report that it was recorded with the new Candy_Balance.
2. THE Progress_Store SHALL accept a Workout_Record as valid if and only if its `id` and `routineId` are non-empty text, its `finishedAt` is an integer from 0 to 8,640,000,000,000,000 (the range a `Date` can show), its `outcome` is `completed`, `partial` or `abandoned`, and its `candyEarned` is a non-negative safe integer.
3. IF a Workout_Record is not valid, THEN THE Progress_Store SHALL change nothing, write nothing and report that it was not recorded because it is invalid.
4. IF a History_Entry with the same `id` already exists, THEN THE Progress_Store SHALL change nothing, write nothing and report that it was not recorded because it is a duplicate.
5. THE Progress_Store SHALL accept a Workout_Record with `candyEarned` 0 and a Workout_Record with the outcome `partial` or `abandoned`.
6. FOR ALL valid Workout_Records, recording the same Workout_Record twice SHALL leave the Progress_Data equal to recording it once (idempotence property).
7. FOR ALL Workout_Records that are not valid, the Progress_Data SHALL be equal before and after the record operation (error-condition property).

### Requirement 5: Balance, history order and total

**User Story:** As a user, I want my balance, my total and my history to agree, so that I can trust the numbers.

#### Acceptance Criteria

1. THE Progress_Snapshot SHALL list the History_Entries newest first, which is the reverse of the order in which they were recorded.
2. THE Progress_Snapshot SHALL report the Total_Candy_Earned as the sum of `candyEarned` over its History_Entries.
3. THE Progress_Snapshot SHALL report a Candy_Balance equal to 15 when the Welcome gift was granted and 0 otherwise, plus the Total_Candy_Earned.
4. FOR ALL sequences of operations with any number of reloads in between, THE Progress_Snapshot SHALL satisfy Acceptance Criteria 1 to 3 (invariant property).
5. WHEN a caller changes the objects or arrays of a Progress_Snapshot, THE Progress_Store SHALL report the unchanged Progress_Data in its next Progress_Snapshot.
6. WHEN the Progress_Data changes, THE Progress_Store SHALL call every registered listener once and SHALL return a new Progress_Snapshot object; WHEN nothing changes, THE Progress_Store SHALL return the same Progress_Snapshot object as before.

### Requirement 6: Recording a Workout from the Workout_Screen

**User Story:** As a user, I want a Workout to count the moment I see its summary, whichever way it ended, so that I never have to press a save button.

#### Acceptance Criteria

1. WHEN the Workout reaches the summary, THE Workout_Screen SHALL call its `onFinished` callback exactly once with the summary Workout_View, whatever the Workout outcome.
2. WHEN `onFinished` is called, THE Recording_Bridge SHALL build a Workout_Record whose `routineId` is the Routine_Entry id, whose `outcome` and `candyEarned` are those of the summary Workout_View, whose `finishedAt` is the wall-clock time at that moment in milliseconds, and whose `id` is the Routine_Entry id, a colon and `finishedAt`.
3. WHEN the Recording_Bridge has built the Workout_Record, THE Recording_Bridge SHALL grant the Welcome gift if it was not granted yet and then record the Workout_Record.
4. WHEN the Workout outcome is **abandoned**, THE Recording_Bridge SHALL record the Candy for the confirmed Sets and no Completion_Bonus, because the Workout_Engine reports that Candy in the summary Workout_View.
5. FOR ALL Workouts that reach the summary, the `candyEarned` of the Workout_Record SHALL equal the `candyEarned` of the summary Workout_View, and the Workout_Record SHALL be valid (property over the Workout_Engine's command scripts).
6. WHEN a Workout ends without reaching the summary, THE Recording_Bridge SHALL record nothing.
7. THE `src/ui/workout/` folder, THE `src/workout-engine/` folder and THE `src/app/routines/` folder SHALL reference no browser storage and SHALL import nothing from `src/progress-store/`.
8. IF recording fails or the Persistent_Flag is false, THEN THE Summary_Panel SHALL still show every item it shows today.
9. THE Recording_Bridge SHALL read the wall-clock time only inside the `onFinished` handler.

### Requirement 7: Balance on the Summary_Panel

**User Story:** As a user finishing a Workout, I want to see my new Candy balance, so that I know what the Workout gave me.

#### Acceptance Criteria

1. WHEN the Workout_Record was recorded, THE Summary_Panel SHALL show a line with the Candy_Balance after the recording, in addition to the existing Candy earned line.
2. WHILE the Workout_Record was not recorded, THE Summary_Panel SHALL show no balance line.
3. THE Summary_Panel SHALL keep every other item of the happy-path and skip-pause-quit specs unchanged.
4. THE Summary_Panel SHALL word the balance line without a claim about form, a reward beyond Candy, or a debt.

### Requirement 8: Candy_Balance on the Home_Screen

**User Story:** As a user, I want to see my Candy on the home screen, so that I remember what I am working toward.

#### Acceptance Criteria

1. WHEN the Home_Screen has read the Progress_Snapshot, THE Home_Screen SHALL show the Balance_Line with the Candy_Balance.
2. WHILE the Home_Screen has not yet read the Progress_Snapshot, THE Home_Screen SHALL show a loading text in the place of the Balance_Line.
3. WHEN the Home_Screen caused the Welcome gift to be granted, THE Home_Screen SHALL show a Welcome gift text with the amount of 15 Candy for the rest of that visit.
4. WHEN the Home_Screen is shown again after a reload, THE Home_Screen SHALL show the Balance_Line and no Welcome gift text.
5. IF the Persistent_Flag is false, THEN THE Home_Screen SHALL show a text that says the Candy will be forgotten when the user leaves the page.
6. THE Home_Screen SHALL keep the title, the tagline and the Home_Navigation of the skeleton spec unchanged, with one `nav` landmark and one `h1`.

### Requirement 9: History_Screen

**User Story:** As a user, I want to see my past Workouts, so that I can see what I have done and how much Candy it earned.

#### Acceptance Criteria

1. THE Site SHALL serve the History_Screen at `/history` as a prerendered page with one `h1` showing the History section name, and SHALL stop showing a Placeholder_Screen there.
2. WHEN the History_Screen has read the Progress_Snapshot, THE History_Screen SHALL show the Total_Candy_Earned in one line.
3. WHEN the history is not empty, THE History_Screen SHALL list the History_Entries newest first, and each item SHALL show the date and time of `finishedAt`, the Spooky_Name of the Routine, the Workout outcome as a word and the Candy earned.
4. WHEN the history is empty, THE History_Screen SHALL show a text that says no Workouts exist yet and a link to the Routine list.
5. IF a History_Entry names a Routine id that the Catalog does not hold, THEN THE History_Screen SHALL show a fallback Routine text for that item instead of failing.
6. WHILE the History_Screen has not yet read the Progress_Snapshot, THE History_Screen SHALL show a loading text and no list.
7. THE History_Screen SHALL include a link back to the Home_Screen.
8. THE History_Screen SHALL format the date and time with the English locale and the browser's time zone, through one function that takes the time and an optional time zone.
9. THE `sections.ts` module SHALL list `history` as a list-style Section, and the Placeholder_Screen SHALL remain only for the Crypt.

### Requirement 10: Browsing earns nothing and the storage footprint

**User Story:** As the Builder, I want the storage footprint to be exactly one key that only Candy screens touch, so that ADR 0002 and "viewing earns nothing" stay provable.

#### Acceptance Criteria

1. THE Progress_Store SHALL be used by the Home_Screen, the History_Screen and the Recording_Bridge only.
2. WHEN a visitor with empty browser storage opens only the Exercise, Stretch and Routine screens, THE Site SHALL leave `localStorage`, `sessionStorage`, IndexedDB and cookies empty.
3. THE existing scan `tests/unit/viewing-earns-nothing.test.ts` and THE existing spec `tests/e2e/viewing-earns-nothing.spec.ts` SHALL pass without a change.
4. WHEN the Home_Screen, the History_Screen or a Workout has run, THE Site SHALL hold exactly one `localStorage` key, the Storage_Key, and nothing in `sessionStorage`, IndexedDB or cookies.
5. THE Site SHALL send no network request other than GET or HEAD to its own origin, and SHALL set no cookie, with the Progress_Store in use (the existing no-backend checks pass unchanged).

### Requirement 11: Strings and wording

**User Story:** As the Builder, I want every new text in the Strings_Module and in the glossary's terms, so that Thai can be added later and the wording stays consistent.

#### Acceptance Criteria

1. THE Strings_Module SHALL hold every text of this ticket: the Balance_Line, the loading texts, the Welcome gift text, the not-persistent text, the summary balance line, the History_Screen total, empty text, list label and fallback Routine text.
2. THE new strings SHALL use the terms Candy, Welcome gift, Routine, Workout and Workout outcome, and SHALL NOT use Points, coins, score, XP, Session, Status or Result.
3. THE new strings SHALL NOT imply that the app checked or approved the user's form.
4. THE new strings SHALL NOT shame the user for a **partial** or **abandoned** Workout.
5. THE new template strings SHALL be listed with their placeholders in `tests/unit/strings-format.test.ts`.
6. THE rule "no Workout, Summary, Routine or Safety_Message string says the Candy was saved or added to a balance" SHALL still hold for every such string except the one balance line of the Summary_Panel, and the rule "no Exercise, Stretch, Viewer or Safety_Message string mentions Candy" SHALL still hold.
7. THE Strings_Module SHALL no longer hold the History placeholder message.

### Requirement 12: Accessibility and layout

**User Story:** As a user on a phone with large text or a screen reader, I want the balance and the history to be readable and reachable, so that I can use them like the rest of the Site.

#### Acceptance Criteria

1. THE History_Screen SHALL render the history as an ordered list inside a labelled region, and each item SHALL give the outcome as a word, never by colour alone.
2. THE date of each History_Entry SHALL be a `time` element whose `dateTime` attribute holds the ISO 8601 text of `finishedAt`.
3. THE Home_Screen and the History_Screen SHALL show no horizontal scroll and no clipped text at 320 CSS pixels wide and at 200% text size.
4. THE History_Screen links and buttons SHALL be at least `3rem` tall.
5. THE new screens SHALL use design tokens for every colour and SHALL add no animation or transition.
6. THE Balance_Line and the History_Screen SHALL not be live regions, and THE loading texts SHALL be replaced in place by the loaded content.

### Requirement 13: Tests and repository rules

**User Story:** As the Builder, I want tests that protect each rule of this ticket and existing tests that stay honest, so that a regression fails the build.

#### Acceptance Criteria

1. THE Unit_Suite SHALL contain Vitest tests for the Welcome gift granted once, the Candy_Balance persisting across a new Progress_Store over the same Storage_Adapter, the history order, the Candy added for each outcome, the schema version in the stored text, and every error case of Requirements 2 and 4.
2. THE property tests SHALL use `fast-check` with `numRuns` of 200 and a tag comment `// Feature: candy-and-history, Property N: …`, and engine-side tests SHALL pass any clock as an argument.
3. THE E2E_Suite SHALL contain a spec for the ticket's acceptance path: a new visitor sees the Welcome gift on the Home_Screen; a reload shows the same balance and no gift text; a completed Workout of the Routine "Graveyard Shift" adds its 14 Candy and shows the balance on the summary; the History_Screen shows the entry and the total; a Workout with a skipped Set and a quit Workout add their Candy and appear newest first.
4. WHEN a test of an earlier spec asserts that browser storage is empty after a Workout or that History is a Placeholder_Screen, THE test SHALL be changed to the new rule (only the Storage_Key is held; History is a list screen) and SHALL NOT be weakened in any other way.
5. THE test scans SHALL cover `src/progress-store/`: no import from React, Three.js, the Viewer, the UI, the routes, the Catalog or runtime Workout_Engine code; no browser storage name outside the `localStorage` adapter file; no `Date` or `performance`.
6. THE `.kiro/steering/structure.md` file SHALL list the `progress-store/` folder as present, and SHALL mention this ticket in "Current state", and `tests/unit/repository-rules.test.ts` SHALL pass.
7. THE Type_Check (`npx tsc --noEmit`), THE Unit_Suite, THE Build and THE E2E_Suite SHALL pass with no test skipped.

### Requirement 14: Static build and hydration

**User Story:** As the Builder, I want the Site to stay a static build that never reads storage on the server, so that it deploys to Vercel unchanged and the first paint matches the hydrated page.

#### Acceptance Criteria

1. THE Site SHALL keep every page statically prerendered, including `/history`.
2. THE Progress_Store SHALL be created and read only in the browser, after the first client render.
3. THE server-rendered HTML of the Home_Screen and the History_Screen SHALL contain the loading text and no Candy number or History_Entry.
4. WHEN the page hydrates, THE Home_Screen and the History_Screen SHALL replace the loading text without a hydration warning in the browser console.
5. THE Site SHALL need no environment variable, server code or API route for this ticket.
