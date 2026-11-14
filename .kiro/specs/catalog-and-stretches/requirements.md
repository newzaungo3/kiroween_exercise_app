# Requirements Document

## Introduction

This spec covers ticket `05-catalog-and-stretches` of the Spooky Coach MVP (`.scratch/spooky-coach-mvp/issues/05-catalog-and-stretches.md`). The Catalog grows from one Exercise to all must-have content: Grave Rise, Skeleton Jacks, Coffin Push, two Stretches and the Routine "Graveyard Shift" (about 10 minutes, ending in a Cool-down). The Exercises section lists the three Exercises. A separate Stretches section lists the two Stretches and opens them on the same 3D Exercise_Detail_Screen. The Catalog validation function gains the Routine rules, and one test fails if any shipped content breaks a rule.

Constraints from the ADRs and steering, unchanged from `exercise-page-3d-coach`:

- ADR 0001: a website, phone-first, also good on a laptop.
- ADR 0002: no backend and no storage writes in this ticket. No Progress store exists yet (ticket 08).
- ADR 0004: app code consumes the delivered GLB files and Still_Images. It never creates or edits them.
- Every user-facing string comes from the Strings_Module. Every colour comes from the design tokens. The glossary "Avoid" words check and the "no form-correctness claim" check apply to every new string.
- The agent never runs the dev server. Shell is PowerShell on Windows.

### Scope

In scope: Catalog types, content and validation for Kinds, Stretches and Routines; the Routine length estimate; the Stretch_List_Screen; the Stretches detail route; Previous and Next links; the guarantee that switching between Exercise_Detail_Screens resets the Viewer; the guard that viewing earns no Candy; extending the asset checks to every Catalog entry; updating the tests that ticket 03 and ticket 01 wrote and this ticket invalidates.

Out of scope, with the ticket that covers it:

- Routines list, Routine detail, the Workout and everything that consumes a Routine at runtime (ticket 06). The Routines section stays a Placeholder_Screen. In this ticket the Routine_Entry is consumed only by the validation function, the length estimate and tests.
- Candy, the Progress store and the behavioural proof that viewing earns no Candy (ticket 08). This ticket adds a static and storage guard instead (Requirement 10).
- Nice-to-have content: Crypt Crunch, Zombie Burpee, a third Stretch, "Witching Hour", "Moonlight Stretch" (ticket 15).
- Producing or editing any GLB or Still_Image (ADR 0004). All of them are already delivered.
- Accessibility pass on real devices (ticket 13) and the eye check of the new clips on a real phone (human task, listed at the end of the design).

### Repository state at spec time

Checked on `main` at `641d5cb`, working tree clean:

- The Catalog (`src/catalog/`) holds `types.ts`, `validate.ts`, `exercises.ts` (Grave Rise only) and `index.ts`. `index.ts` exports `exercises`, `findExercise(slug)`, `exerciseSlugs()` and `validateCatalog({ exercises })`. `validateCatalog` takes `CatalogDraft` and returns `{ exerciseId, rule }` violations.
- The files below exist under `public/assets/coach/` and are tracked by git (checked with `git ls-files`):
  - `coach_grave_rise.glb`, `coach_skeleton_jacks.glb`, `coach_coffin_push.glb`, `coach_stretch_side_reach.glb`, `coach_stretch_forward_fold.glb`
  - `stills/<clip>_{front,side,back}.png` for `grave_rise`, `skeleton_jacks`, `coffin_push`, `stretch_side_reach` and `stretch_forward_fold`
- Ticket 04 states that every new GLB has a clip named `demo_loop`. **Not verified here**: a text search cannot read the binary GLB. `tests/unit/coach-assets.test.ts` reads the animation names and verifies them once the Catalog references the files.
- `tests/unit/coach-assets.test.ts` and `tests/unit/module-boundaries.test.ts` read their asset paths from the Catalog, but through the `exercises` export. Once `exercises` lists only Kind `exercise` entries, both tests would silently skip the Stretches. Requirement 11 closes this.
- Nothing under `src/` references Candy, a Progress store or a Workout engine. `localStorage`, `sessionStorage` and `indexedDB` appear only in tests and in the Catalog and Viewer-logic scanners.
- Tests this ticket invalidates or must extend: `tests/e2e/navigation.spec.ts` (Stretches expects a Placeholder_Screen message), `tests/unit/strings.test.ts` (hard-coded list of four Placeholder Sections), `tests/e2e/static-build.spec.ts` (expects every detail page to come from `/exercises/[slug]`), `tests/e2e/support/screens.ts` (detail screens built from `/exercises/` only), `tests/unit/catalog.test.ts` (one Exercise, `validateCatalog({ exercises })`, `exerciseId`), `tests/unit/catalog.type-check.ts`, `tests/unit/coach-assets.test.ts`, `tests/unit/module-boundaries.test.ts`, `tests/e2e/not-found.spec.ts`, `tests/e2e/support/webgl.ts` (reads the Exercise from an `/exercises/` URL) and `tests/e2e/exercise-detail.spec.ts` (builds `/exercises/<slug>` paths itself and checks the back link name). The design lists the full set, including `tests/unit/repository-rules.test.ts` through the structure steering.

### Proposed Catalog content

All values are tunable content. The Stretch names are confirmed (Open decision 5).

| Slug | Kind | Spooky_Name | Real_Name | Difficulty | Muscle_Groups | Target | Coach_Asset (`/assets/coach/…`) |
|---|---|---|---|---|---|---|---|
| `grave-rise` | exercise | Grave Rise | Air squat | Beginner | quads, glutes, core | 10 reps | `coach_grave_rise.glb` |
| `skeleton-jacks` | exercise | Skeleton Jacks | Jumping jacks | Beginner | shoulders, glutes, calves | 20 reps | `coach_skeleton_jacks.glb` |
| `coffin-push` | exercise | Coffin Push | Push-up | Intermediate | chest, triceps, shoulders, core | 8 reps | `coach_coffin_push.glb` |
| `gravestone-lean` | stretch | Gravestone Lean | Standing side reach | Beginner | obliques, shoulders | 30 seconds | `coach_stretch_side_reach.glb` |
| `bat-hang` | stretch | Bat Hang | Standing forward fold | Beginner | hamstrings, back, calves | 30 seconds | `coach_stretch_forward_fold.glb` |

Routine "Graveyard Shift" (`graveyard-shift`):

| Part | Entry | Sets | Target | Rest after each Set |
|---|---|---|---|---|
| Exercises | Skeleton Jacks | 2 | 20 reps | 30 s |
| Exercises | Grave Rise | 3 | 10 reps | 30 s |
| Exercises | Coffin Push | 2 | 8 reps | 45 s |
| Cool-down | Gravestone Lean | 1 | 30 seconds | 10 s |
| Cool-down | Bat Hang | 1 | 30 seconds | 10 s |

With 3 seconds per rep this is 180 + 180 + 138 + 40 + 40 = 578 seconds, which rounds to 10 minutes.

### Open decisions (all decided)

The user chose Option A on every decision on 2026-11-13. Each item lists what Option B would have changed, where that helps.

1. **Route of a Stretch's detail screen. Decided: Option A, decided by the user on 2026-11-13.** `/stretches/<slug>`, a second thin route file that renders the same Exercise_Detail_Screen. The URL matches the section, the back link goes to `/stretches`, and `/exercises/<stretch-slug>` returns 404, so a Stretch is reachable only through the Stretches section. Requirements 7.4, 8.1–8.4 and 12.3 are written for this option. Option B would have reused `/exercises/<slug>` for every entry.
2. **Shape of a Routine. Decided: Option A, decided by the user on 2026-11-13.** Two lists, `steps` (Kind `exercise`) and `coolDown` (Kind `stretch`), and an explicit target on every Routine_Step whose kind (reps or seconds) matches the entry's. "Ends with a Cool-down" holds by structure; the rule only needs the Cool-down to be non-empty. The Workout engine (ticket 06) reads targets from the step alone. Requirements 3 and 4 are written for this option. Option B would have used one flat list with targets inherited from the entry.
3. **Previous and Next links on the detail screen. Decided: Option A, decided by the user on 2026-11-13.** A navigation landmark at the end of the Exercise_Detail_Screen with a Previous and a Next link to the neighbouring entry of the same section ("Next: Skeleton Jacks"). Requirements 8.6 and 9.1 are written for this option.
4. **How the "about 10 minutes" length is held. Decided: Option A, decided by the user on 2026-11-13.** Computed from the content with a tunable `secondsPerRep` of 3, so the length cannot drift from the Sets and rests. Requirement 5 is written for this option.
5. **Spooky_Names of the two Stretches. Decided, confirmed by the user on 2026-11-13:** **Gravestone Lean** (side reach, slug `gravestone-lean`) and **Bat Hang** (forward fold, slug `bat-hang`). Changing a name later changes only Strings_Module text; slugs follow the name.
6. **Glossary gaps. Decided: the gap stays and becomes a User task.** `CONTEXT.md` has no entry for *Rest*, *Routine step*, *Difficulty*, *Muscle group*, *Instruction step*, *Cue*, *Safety note* or *Safety message*. This spec defines them in its own glossary without inventing synonyms. **User task (remaining):** add these terms to `CONTEXT.md`. No app task edits `CONTEXT.md`. "Stretch" is defined there as an Exercise, so this spec keeps one record type (`Exercise_Entry`) with a Kind.
7. **Requirement 8.5 (the target as a labelled fact). Decided: kept by the user on 2026-11-13.**

### Interpretations made

- "Stretches ... appear only in the Stretches section" is read as: listed only on the Stretch_List_Screen, and (Option A of decision 1) served only under `/stretches/`.
- "Viewing Exercises or Stretches earns no Candy" cannot be tested behaviourally before the Progress store exists. This ticket guarantees it by a static rule (no import of Progress code, no browser-storage API in the screens, the Catalog or the Viewer), by an E2E check that viewing writes nothing to browser storage or cookies, and by a Strings_Module check. Ticket 08 must add the behavioural test (balance unchanged after viewing).
- "Switching between Exercises" means going from one Exercise_Detail_Screen to another, whatever the kinds, by a Previous or Next link, a list link or the browser Back button. The Stretches count as Exercises here.
- The Exercise_Detail_Screen shows the entry's target (reps or seconds) as one more fact. The ticket requires the target in the data only; the display is added so the reps-versus-seconds difference is visible. The user kept Requirement 8.5.
- `restSeconds` is the Rest after every Set of a Routine_Step. Whether the Workout skips the Rest after the very last Set of the Routine is ticket 06's decision; the estimate counts every Rest.
- "About 10 minutes" is read as an estimate from 540 to 660 seconds (9 to 11 minutes).

## Glossary

- **Site**, **Strings_Module**, **Placeholder_Screen**, **Home_Screen**, **Phone_Viewport**, **Laptop_Viewport**, **Build**, **Type_Check**, **Unit_Suite**, **E2E_Suite**, **Builder**: As defined in the `spooky-site-skeleton` spec.
- **Catalog**, **Exercise_Entry**, **Spooky_Name**, **Real_Name**, **Difficulty**, **Muscle_Group**, **Instruction_Step**, **Cue**, **Safety_Note**, **Safety_Message**, **Written_Content**, **Exercise_List_Screen**, **Exercise_List_Entry**, **Viewer**, **Viewer_Area**, **Coach_Asset**, **Demo_Clip**, **Still_Image**, **Still_Fallback**, **Camera_Preset**, **Playback_Speed**, **Reduced_Motion_Preference**, **Asset_Pipeline**: As defined in the `exercise-page-3d-coach` spec.
- **Exercise**: One movement the Coach can demonstrate, with its target in reps or seconds (CONTEXT.md). A Stretch is an Exercise.
- **Stretch**: An Exercise held for seconds, shown in its own section (CONTEXT.md).
- **Routine**, **Cool-down**, **Workout**, **Set**, **Candy**: As defined in CONTEXT.md.
- **Kind**: The field of an Exercise_Entry that says whether it is an `exercise` or a `stretch`.
- **Section**: One of the five Site Sections (Exercises, Stretches, Routines, Crypt, History).
- **Exercise_Detail_Screen**: The screen that shows one Exercise_Entry's Viewer and Written_Content, at `/exercises/<slug>` for Kind `exercise` and at `/stretches/<slug>` for Kind `stretch`. Extends the definition in `exercise-page-3d-coach`.
- **Stretch_List_Screen**: The screen at `/stretches` that lists every Exercise_Entry of Kind `stretch`. Replaces the Stretches Placeholder_Screen.
- **Routine_Entry**: The Catalog record of one Routine: identifier, URL slug, Strings_Module identifier of its name, a `steps` list of Routine_Steps for Exercises and a `coolDown` list of Routine_Steps for Stretches.
- **Routine_Step**: One Exercise_Entry inside a Routine_Entry, with its number of Sets, its target and its Rest.
- **Rest**: The pause after a Set, in whole seconds.
- **Seconds_Per_Rep**: The tunable constant, 3 seconds, that the length estimate uses for each rep of a reps target.
- **Estimated_Length**: The Routine_Entry's duration in seconds computed from its Routine_Steps, and the same value rounded to whole minutes.
- **Catalog_Content**: The value passed to the validation function: all Exercise_Entries and all Routine_Entries.
- **Violation**: One broken rule found by the validation function, with the identifier of the entry, Routine_Entry or Routine_Step that breaks it and the rule name.
- **Progress_Code**: Code that awards, spends or stores Candy or Workout data: the future `src/progress-store/` and `src/workout-engine/` modules.

## Requirements

### Requirement 1: Exercises and Stretches in one Catalog

**User Story:** As the Builder, I want a Stretch modelled as an Exercise held for seconds, so that Stretches reuse the Exercise screens and Routines and still appear only in the Stretches section.

#### Acceptance Criteria

1. THE Catalog SHALL give every Exercise_Entry a Kind that is either `exercise` or `stretch`.
2. THE Catalog SHALL give every Exercise_Entry of Kind `stretch` a seconds target.
3. THE Catalog SHALL expose the Exercise_Entries of Kind `exercise` as one list, the Exercises, and those of Kind `stretch` as another list, the Stretches, each in Catalog order, so that every Exercise_Entry is in exactly one of the two lists.
4. THE Catalog SHALL expose one list of all Exercise_Entries in Catalog order, so that asset checks and Routine references reach every entry.
5. THE Catalog SHALL contain the five Exercise_Entries of the "Proposed Catalog content" table, with the three Exercises in the order Grave Rise, Skeleton Jacks, Coffin Push and the two Stretches in the order Gravestone Lean, Bat Hang.
6. THE Catalog SHALL keep the Grave Rise Exercise_Entry as it is today, apart from its Kind.
7. THE Catalog SHALL keep every field and list of an Exercise_Entry read-only, so that an assignment fails the Type_Check.
8. THE Catalog SHALL reject at compile time an Exercise_Entry of Kind `stretch` that has a reps target.

### Requirement 2: Content of the five entries

**User Story:** As a beginner, I want each Exercise and Stretch to have a spooky name, a real name, clear steps, cues and safety notes, so that I know what to do and what to watch for.

#### Acceptance Criteria

1. THE Catalog SHALL give every Exercise_Entry a Spooky_Name, a Real_Name, a Difficulty, one or more Muscle_Groups, 3 to 5 Instruction_Steps, one or more Cues, one or more Safety_Notes and a target of reps or seconds with a value greater than 0.
2. THE Catalog SHALL give each of the five Exercise_Entries the slug, Kind, Spooky_Name, Real_Name, Difficulty, Muscle_Groups and target listed in the "Proposed Catalog content" table.
3. THE Catalog SHALL give each Exercise_Entry the Coach_Asset path, the Demo_Clip name `demo_loop` and the front, side and back Still_Image paths of its own clip, taken from the file names that exist under `public/assets/coach/`.
4. THE Catalog SHALL reference every text of every Exercise_Entry, including each new Muscle_Group label, by a Strings_Module identifier, so that an undefined identifier fails the Type_Check.
5. THE Strings_Module SHALL contain no text for the new Exercise_Entries that uses a glossary Avoid word or claims or implies that the user's form is correct.
6. THE Strings_Module SHALL give every Exercise_Entry of Kind `stretch` a Safety_Note that tells the user to stretch only to a gentle pull and to stop at pain.

### Requirement 3: Routine "Graveyard Shift" in the Catalog (Open decision 2, Option A)

**User Story:** As the Builder, I want the Routine stored as typed Catalog content with Sets, targets, Rest and a Cool-down, so that the Workout (ticket 06) reads the same data the validation test checks.

#### Acceptance Criteria

1. THE Catalog SHALL contain exactly one Routine_Entry in this ticket, "Graveyard Shift", with the slug `graveyard-shift` and its name held under a Strings_Module identifier.
2. THE Catalog SHALL give every Routine_Entry an identifier, a slug, a `steps` list of Routine_Steps and a `coolDown` list of Routine_Steps.
3. THE Catalog SHALL give every Routine_Step the identifier of one Exercise_Entry, a number of Sets, a target of reps or seconds, and a Rest in whole seconds after every Set of that step.
4. THE Catalog SHALL give the Graveyard Shift Routine_Entry the Routine_Steps of the "Graveyard Shift" table, in the order shown, with the first three in `steps` and the last two in `coolDown`.
5. THE Catalog SHALL reference only Exercise_Entries of Kind `exercise` in `steps` and only Exercise_Entries of Kind `stretch` in `coolDown`.
6. THE Catalog SHALL keep every field and list of a Routine_Entry read-only, so that an assignment fails the Type_Check.
7. THE Catalog SHALL import nothing from React, Three.js, the Viewer or browser storage, as for the rest of the Catalog.
8. THE Routines Section SHALL stay a Placeholder_Screen, and the Site SHALL show no Routine_Entry content in this ticket.

### Requirement 4: Catalog validation

**User Story:** As the Builder, I want one validation function and one test over all shipped content, so that a bad edit to an Exercise, a Stretch or a Routine fails the Unit_Suite before reaching the Site.

#### Acceptance Criteria

1. THE Catalog SHALL expose a validation function that takes Catalog_Content and returns a list of Violations in Catalog order, each naming the entry, Routine_Entry or Routine_Step and the rule it breaks, and returns an empty list for valid content.
2. THE validation function SHALL keep reporting every rule of Requirement 2 of the `exercise-page-3d-coach` spec for every Exercise_Entry of both Kinds.
3. IF an Exercise_Entry has a Kind that is missing or is neither `exercise` nor `stretch`, THEN THE validation function SHALL report a Violation for that Exercise_Entry.
4. IF an Exercise_Entry of Kind `stretch` has a reps target, THEN THE validation function SHALL report a Violation for that Exercise_Entry.
5. IF a Routine_Entry has a missing identifier, an identifier shared with another Routine_Entry, a slug shared with another Routine_Entry, or a slug with a character other than lowercase letters, digits and hyphens, THEN THE validation function SHALL report a Violation for that Routine_Entry.
6. IF a Routine_Entry has an empty `steps` list or an empty `coolDown` list, THEN THE validation function SHALL report a Violation for that Routine_Entry.
7. IF a Routine_Step names an identifier that no Exercise_Entry has, THEN THE validation function SHALL report a Violation for that Routine_Step.
8. IF a Routine_Step in `steps` names an Exercise_Entry of Kind `stretch`, or a Routine_Step in `coolDown` names an Exercise_Entry of Kind `exercise`, THEN THE validation function SHALL report a Violation for that Routine_Step.
9. IF a Routine_Step has a number of Sets that is not an integer from 1 to 10, THEN THE validation function SHALL report a Violation for that Routine_Step.
10. IF a Routine_Step has both a reps target and a seconds target, or neither, THEN THE validation function SHALL report a Violation for that Routine_Step.
11. IF a Routine_Step has a target value that is not an integer greater than 0, THEN THE validation function SHALL report a Violation for that Routine_Step.
12. IF a Routine_Step has a reps target for an Exercise_Entry with a seconds target, or a seconds target for an Exercise_Entry with a reps target, THEN THE validation function SHALL report a Violation for that Routine_Step.
13. IF a Routine_Step has a Rest that is not an integer from 0 to 600, THEN THE validation function SHALL report a Violation for that Routine_Step.
14. THE Unit_Suite SHALL include one test, named after the rule it protects in glossary terms, that runs the validation function over all shipped Catalog_Content and passes only when the function returns no Violations.
15. THE Unit_Suite SHALL pass the shipped Catalog_Content to the validation function as one value that holds every Exercise_Entry of both Kinds and every Routine_Entry, so that no shipped entry is left out of the check.

### Requirement 5: Routine length estimate (Open decision 4, Option A)

**User Story:** As the Builder, I want the Routine length computed from its content, so that the "about 10 minutes" shown by ticket 06 cannot drift from the Sets and Rest.

#### Acceptance Criteria

1. THE Catalog SHALL expose a function that returns the Estimated_Length of a Routine_Entry in seconds as the sum, over all Routine_Steps in `steps` and `coolDown`, of Sets multiplied by the sum of the work time and the Rest.
2. THE Catalog SHALL count the work time of a Routine_Step with a reps target as its reps multiplied by Seconds_Per_Rep, and the work time of a Routine_Step with a seconds target as its seconds.
3. THE Catalog SHALL expose a function that returns the Estimated_Length of a Routine_Entry rounded to the nearest whole minute.
4. THE Unit_Suite SHALL include a test that fails unless the Estimated_Length of Graveyard Shift is from 540 to 660 seconds and its rounded value is 10 minutes.

### Requirement 6: Exercises section lists the three Exercises

**User Story:** As a user, I want the Exercises section to list the three Exercises and no Stretch, so that I can choose an Exercise and find Stretches in their own place.

#### Acceptance Criteria

1. THE Exercise_List_Screen SHALL display one Exercise_List_Entry for each Exercise_Entry of Kind `exercise`, in Catalog order, which in this ticket are Grave Rise, Skeleton Jacks and Coffin Push.
2. THE Exercise_List_Screen SHALL display no Exercise_Entry of Kind `stretch`.
3. WHEN a visitor activates an Exercise_List_Entry, THE Site SHALL show that Exercise's Exercise_Detail_Screen at `/exercises/<slug>`.
4. THE Exercise_List_Screen SHALL keep every behaviour that Requirement 3 of the `exercise-page-3d-coach` spec gives it, including one link per entry whose accessible name begins with the Spooky_Name and no request for a Coach_Asset, Still_Image or 3D code.

### Requirement 7: Stretches section and Stretch_List_Screen

**User Story:** As a user, I want a Stretches section that lists the Stretches and opens each on the same 3D page, so that I can learn the Cool-down on its own.

#### Acceptance Criteria

1. WHEN a visitor activates the Stretches Navigation_Entry on the Home_Screen, or requests `/stretches` directly or by reload, THE Site SHALL show the Stretch_List_Screen at `/stretches` in place of the Stretches Placeholder_Screen.
2. THE Stretch_List_Screen SHALL display one level-1 page heading with the Section name "Stretches" from the Strings_Module, and SHALL set a document title from the Strings_Module that contains "Stretches".
3. THE Stretch_List_Screen SHALL display one list entry for each Exercise_Entry of Kind `stretch`, in Catalog order, each showing the Spooky_Name, Real_Name, Difficulty and every Muscle_Group, and SHALL display no Exercise_Entry of Kind `exercise`.
4. WHEN a visitor activates a Stretch_List_Screen entry, THE Site SHALL show that Stretch's Exercise_Detail_Screen at `/stretches/<slug>`.
5. THE Stretch_List_Screen SHALL make each list entry a single link whose accessible name begins with the Spooky_Name.
6. THE Stretch_List_Screen SHALL provide a link to the Home_Screen at `/` whose accessible name comes from the Strings_Module.
7. THE Stretch_List_Screen SHALL render without loading a Coach_Asset, a Still_Image or the 3D rendering library.
8. THE Site SHALL show a Placeholder_Screen only for the Routines, Crypt and History Sections, and THE Strings_Module SHALL hold no Placeholder_Screen message for the Stretches Section.

### Requirement 8: Detail screens for Exercises and Stretches (Open decisions 1 and 3, Option A)

**User Story:** As a user, I want a Stretch to open on the same 3D detail page as an Exercise, with its own back link and neighbours, so that I can learn it the same way.

#### Acceptance Criteria

1. WHEN a visitor requests `/exercises/<slug>` for the slug of an Exercise_Entry of Kind `exercise`, or `/stretches/<slug>` for the slug of an Exercise_Entry of Kind `stretch`, directly, by reload or from a list screen, THE Site SHALL show that entry's Exercise_Detail_Screen with the Viewer, Written_Content and Safety_Message that Requirement 4 of the `exercise-page-3d-coach` spec describes.
2. IF a visitor requests `/exercises/<slug>` for the slug of a Stretch, or `/stretches/<slug>` for the slug of an Exercise, or either path for a slug that no Exercise_Entry has, THEN THE Site SHALL show the not-found screen with HTTP status 404.
3. THE Build SHALL prerender one page per Exercise_Entry of Kind `exercise` under `/exercises/` and one per Exercise_Entry of Kind `stretch` under `/stretches/`, and THE Site SHALL have no route rendered on demand.
4. THE Exercise_Detail_Screen SHALL provide a back link to `/exercises` named "Back to Exercises" for Kind `exercise`, and to `/stretches` named "Back to Stretches" for Kind `stretch`, with both names from the Strings_Module.
5. THE Exercise_Detail_Screen SHALL display the entry's target as a labelled fact: the number of reps for a reps target and the number of seconds for a seconds target, with the label and the Strings_Module identifier of the label chosen by the target's unit.
6. THE Exercise_Detail_Screen SHALL end with one navigation landmark, named from the Strings_Module, that contains a link to the previous Exercise_Entry and a link to the next Exercise_Entry of the same Section in Catalog order, each with an accessible name that contains that entry's Spooky_Name, and SHALL omit the previous link on the first entry and the next link on the last entry.
7. THE Exercise_Detail_Screen SHALL set a document title from the Strings_Module that contains the entry's Spooky_Name, for both Kinds.

### Requirement 9: Switching resets the Viewer

**User Story:** As a learner, I want each Exercise or Stretch to open with the camera in front and the clip at its start, so that I never inherit the last Exercise's angle or frame.

#### Acceptance Criteria

1. WHEN a visitor goes from one Exercise_Detail_Screen to another by a Previous or Next link, a list link or the browser Back button, THE Viewer SHALL show the new entry's Coach_Asset with the camera at the Front Camera_Preset, the Playback_Speed at 1× and the Demo_Clip at its first frame.
2. WHERE the Reduced_Motion_Preference is not set, WHEN the Viewer shows the new entry's Coach, THE Viewer SHALL play the Demo_Clip; WHERE the Reduced_Motion_Preference is set, THE Viewer SHALL leave the Coach paused at the first frame.
3. THE Viewer SHALL carry no camera angle, zoom, clip time, Playback_Speed or play state from one Exercise_Entry to the next.
4. THE Exercise_Detail_Screen SHALL give the Viewer a React key made from the Exercise_Entry identifier, so that the reset does not depend on the framework reusing or replacing the component.
5. WHEN a visitor leaves an Exercise_Detail_Screen for another, THE Viewer SHALL release the first screen's WebGL context, as Requirement 5.8 of the `exercise-page-3d-coach` spec requires.

### Requirement 10: Viewing earns no Candy

**User Story:** As a product owner, I want viewing Exercises and Stretches to earn no Candy, so that Candy comes only from Workouts.

#### Acceptance Criteria

1. THE source files of the Catalog, the Viewer, the Exercise and Stretch screens and their routes SHALL import no Progress_Code.
2. THE source files of the Catalog, the Viewer, the Exercise and Stretch screens and their routes SHALL reference no browser-storage API (`localStorage`, `sessionStorage`, `indexedDB`, `document.cookie`).
3. WHEN a visitor opens the Exercise_List_Screen, the Stretch_List_Screen and every Exercise_Detail_Screen, and plays, pauses and changes the Playback_Speed, THE Site SHALL leave `localStorage`, `sessionStorage`, IndexedDB and cookies empty.
4. THE Strings_Module SHALL contain no text on the Exercise, Stretch, Viewer or Safety_Message identifiers that mentions Candy or any reward.

### Requirement 11: Asset checks cover every entry

**User Story:** As the Builder, I want the asset and boundary checks to cover every Catalog entry automatically, so that adding an entry never needs a test edit.

#### Acceptance Criteria

1. WHEN an Exercise_Entry is added to the Catalog, THE Unit_Suite SHALL check its Coach_Asset and Still_Images with the existing asset checks without any edit to the test files.
2. THE Unit_Suite SHALL check, for all five Exercise_Entries, that each Coach_Asset and Still_Image exists under `public/`, is tracked by git, and meets the budget of Requirement 13 of the `exercise-page-3d-coach` spec: at most 6 MB, 35,000 triangles and 4 materials, textures of at most 1024 × 1024, a clip named by the Demo_Clip, no decoder extension, and Still_Images of at most 300 KB.
3. THE Unit_Suite SHALL check that the Viewer source holds no asset file name or Demo_Clip name of any of the five Exercise_Entries.
4. WHEN the E2E_Suite opens the Exercise_Detail_Screen of each of the five Exercise_Entries, THE Viewer SHALL reach the 3D scene with the Coach image named after that entry's Spooky_Name.

### Requirement 12: Tests and rules that this ticket changes

**User Story:** As the Builder, I want the tests of tickets 01 and 03 updated for the new content, so that the suites describe the Site as it is and stay green.

#### Acceptance Criteria

1. THE Unit_Suite SHALL list only Routines, Crypt and History as Sections that have a Placeholder_Screen message.
2. THE E2E_Suite SHALL expect the Stretch_List_Screen, not a Placeholder_Screen message, when it opens the Stretches Section from the Home_Screen, by direct request and by reload.
3. THE E2E_Suite SHALL expect the static Build to prerender every Exercise_Detail_Screen from the route that serves its Kind: `/exercises/[slug]` for Kind `exercise` and `/stretches/[slug]` for Kind `stretch`.
4. THE E2E_Suite SHALL run its shared checks (theme, layout, Decorations, no backend, 3D code only on detail screens) on the Stretch_List_Screen and on every Exercise_Detail_Screen of both Kinds.
5. THE E2E_Suite SHALL expect the not-found screen with HTTP 404 for `/exercises/<stretch-slug>`, `/stretches/<exercise-slug>` and unknown slugs under both paths.
6. THE Unit_Suite and the E2E_Suite SHALL pass with `npx tsc --noEmit`, `npx vitest --run`, `npm run build` and `npx playwright test` all exiting 0, with no test skipped.
7. THE structure steering SHALL list the new route folder `src/app/stretches/[slug]/` and no path that is absent from the Repository.
