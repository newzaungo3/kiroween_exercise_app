# Implementation Plan: Catalog, Stretches and the Graveyard Shift Routine

## Overview

This plan builds ticket `05-catalog-and-stretches` as described in `design.md`, in TypeScript strict mode. Work goes bottom-up. First the Strings_Module additions, then the Catalog (types, pure helpers, validation, content, public interface) with its unit tests, then a checkpoint. After that come the screens and routes, the static guard, the E2E support and specs, the steering update, a final checkpoint and a commit that waits for the user.

Ground rules for every task:

- The shell is PowerShell on Windows. The agent may run `npx tsc --noEmit`, `npx vitest --run`, `npm run build` and `npx playwright test`. The agent never runs `npm run dev` or `npm run start`. Use the terminal only for npm, npx, node, uvx and git.
- Every user-facing string comes from `src/ui/strings.ts`. Every colour comes from `src/ui/theme/tokens.ts`. Use glossary terms in identifiers, test names and comments. New text uses no glossary Avoid word and never claims or implies correct form.
- ADR 0004: no task creates, exports or edits a GLB or a Still_Image. All five Coach_Assets and fifteen Still_Images are already delivered, so every suite must pass with no skipped test. Leave `assets/` and `.kiro/settings/mcp.json` untouched.
- All open decisions are decided (Option A). No task edits `CONTEXT.md`; adding the glossary terms is a User task.
- Inside the Catalog block (tasks 1 to 3), `npx tsc --noEmit` may fail between waves because the Kind field and the new validation signature change shared types. It must pass at checkpoint 4. From wave 7 on, every wave leaves `npx tsc --noEmit` passing. Tasks 5.2 and 5.3 share a wave because deleting `section.stretches.message` breaks the types of the old Stretches test code until both are updated.
- Run `npx playwright test` with a long timeout (up to 1,800,000 ms): it builds the Site first.
- Ask the user before every commit. Stage files by name, never with `git add -A` or `git add .`. Never push.

## Tasks

- [x] 1. Extend the Strings_Module
  - [x] 1.1 Add the new English Locale entries to `src/ui/strings.ts`
    - Add every identifier from the design's "Strings_Module additions": `exercise.backToStretches`, `exercise.facts.targetReps`, `exercise.facts.targetSeconds`, `pager.label`, `pager.previous`, `pager.next` (templates with `{exercise}`), the seven new `muscleGroup.*.name` labels, `routine.graveyardShift.name`, and name, realName, step1–4, cue1–3 and safety1–2 for Skeleton Jacks, Coffin Push, Gravestone Lean and Bat Hang under `exercise.skeletonJacks.*`, `exercise.coffinPush.*`, `exercise.gravestoneLean.*` and `exercise.batHang.*`
    - Keep `section.stretches.message` for now; task 5.2 deletes it
    - Both Stretches get the Safety_Note "Stretch only to a gentle pull and stop if you feel pain."
    - _Requirements: 2.4, 2.5, 2.6, 8.4, 8.5, 8.6, 3.1_

  - [x] 1.2 Add the new templates to `tests/unit/strings-format.test.ts`
    - Add `pager.previous` and `pager.next` to `templateIds`; each holds exactly one `{exercise}`
    - _Requirements: 8.6_

  - [x] 1.3 Add the no-reward string test to `tests/unit/strings.test.ts`
    - Test "no Exercise, Stretch, Viewer or Safety_Message string mentions Candy or a reward": for every English identifier starting with `exercise.`, `viewer.`, `safety.`, `pager.` or `routine.`, the text does not match `/\b(candy|reward|rewards|earn|earns|earned)\b/i`
    - Leave the Placeholder_Screen list in this file alone; task 5.3 changes it
    - _Requirements: 10.4_

- [x] 2. Build the Catalog
  - [x] 2.1 Extend the Catalog types in `src/catalog/types.ts`
    - Add `kinds` and `Kind`, extend `muscleGroups` to the ten values of the design, split `ExerciseEntry` into the union discriminated by `kind` with `StretchTarget`, add `EntryOfKind`, `RoutineStep`, `RoutineEntry`, `CatalogContent`, the drafts (`ExerciseDraft` gains `kind`, plus `RoutineStepDraft`, `RoutineDraft`) and `CatalogDraft` as `{ entries; routines }`
    - Replace `CatalogViolation.exerciseId` with `subjectId`, and add the new rules to `CatalogRule` as listed in the design's "Catalog rules"
    - Every field and list is `readonly`. Import only the type `StringId` from `@/ui/strings`
    - _Requirements: 1.1, 1.2, 1.7, 1.8, 3.2, 3.3, 3.6, 3.7, 4.1_

  - [x] 2.2 Implement the pure list helpers in `src/catalog/lists.ts`
    - `partitionByKind(list)` returns `{ exercises, stretches }`, each in input order. `neighbours(list, entry)` returns `{ previous?, next? }` by position (an entry not in the list gives neither)
    - _Requirements: 1.3, 1.4, 8.6_

  - [x] 2.3 Implement the length estimate in `src/catalog/length.ts`
    - `secondsPerRep = 3`, `routineSeconds(routine)` as the sum over `steps` and `coolDown` of `sets × (work + restSeconds)`, and `routineMinutes(routine) = Math.round(routineSeconds(routine) / 60)`
    - _Requirements: 5.1, 5.2, 5.3_

  - [x] 2.4 Implement the new `validateCatalog` in `src/catalog/validate.ts`
    - Signature `validateCatalog(content: CatalogDraft)`. Keep the 16 entry rules for both Kinds; add `kind-unknown` and `stretch-reps`; add every Routine and Routine_Step rule of the design's table with the `subjectId` forms `#<index>`, `routine#<index>` and `<routine>/steps#<i>` or `<routine>/coolDown#<i>`
    - Look entries up by non-blank `entryId`, first match. Report violations in Catalog order, each rule at most once per subject. Valid content gives an empty list
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9, 4.10, 4.11, 4.12, 4.13_

  - [x] 2.5 Add the content: five entries and Graveyard Shift
    - `src/catalog/exercises.ts`: add `kind` to Grave Rise; add Skeleton Jacks, Coffin Push, Gravestone Lean and Bat Hang with the slug, Kind, difficulty, Muscle_Groups, target, string identifiers, `coach.asset` and `stills` of the design's tables. Order: Grave Rise, Skeleton Jacks, Coffin Push, Gravestone Lean, Bat Hang. Keep `as const satisfies readonly ExerciseEntry[]`
    - `src/catalog/routines.ts`: `routineContent` with Graveyard Shift as in the design's table, `as const satisfies readonly RoutineEntry[]`
    - The Catalog imports nothing from React, Three.js, the Viewer or browser storage, and never calls `t()`
    - _Requirements: 1.5, 1.6, 2.1, 2.2, 2.3, 3.1, 3.4, 3.5, 3.7_

  - [x] 2.6 Rebuild the public interface in `src/catalog/index.ts`
    - Export the types and constant arrays, `catalogContent`, `entries`, `exercises`, `stretches`, `routines`, `entriesOfKind`, `findEntry`, `findExercise`, `findStretch`, `exerciseSlugs`, `stretchSlugs`, `findRoutine`, `partitionByKind`, `neighbours`, `secondsPerRep`, `routineSeconds`, `routineMinutes` and `validateCatalog`
    - `exercises` and `stretches` come from `partitionByKind(entries)`, so every entry is in exactly one list. `findEntry(kind, slug)` finds only entries of that Kind
    - _Requirements: 1.3, 1.4, 4.15, 8.2_

- [x] 3. Update and add the Catalog tests
  - [x] 3.1 Update `tests/unit/catalog.test.ts` for Kinds and Routines
    - `validateCatalog(catalogContent)` replaces `{ exercises }`; `exerciseId` becomes `subjectId`; fixtures and `validEntry` gain `kind`; the drafts pass `{ entries, routines }`
    - Test "shipped Catalog content passes validation" uses `expect(validateCatalog(catalogContent)).toEqual([])`, one value holding every entry and Routine_Entry (required, Req 4.14, 4.15)
    - Replace the one-Exercise test with "the Catalog holds three Exercises and two Stretches in order" (names, Real_Names, Kind, Difficulty, Muscle_Groups, targets: reps for Exercises, seconds for Stretches); update "every Exercise_Entry has Instruction_Steps, Cues and Safety_Notes" to read `entries`; update the slug test to cover both Kinds; add "every Stretch has a Safety_Note about a gentle pull and stopping at pain" (Req 2.6)
    - Keep the 16 existing per-rule examples and the `everyRule` mapped type
    - _Requirements: 1.5, 2.1, 2.2, 2.6, 4.14, 4.15, 12.1_

  - [x] 3.2 Write property test for Catalog validation
    - **Property 1: Catalog validation reports exactly the broken rules**
    - Add to `tests/unit/catalog.test.ts`, extending the earlier `validDraft`, `breakage` and `applyBreakage` generators to both Kinds, Routine_Entries and Routine_Steps. Compare sets of `${subjectId}:${rule}`; at most one breakage per field of a subject; the expected set is computed from the applied breakages, not from the validator. Entry breakages that change `id`, `kind` or `target` apply only to entries that no step references; step-level `step-entry-kind` swaps the entry and the step target's unit together. `numRuns: 200` and the tag comment `// Feature: catalog-and-stretches, Property 1: Catalog validation reports exactly the broken rules`
    - **Validates: Requirements 1.2, 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9, 4.10, 4.11, 4.12, 4.13**

  - [x] 3.3 Add one failing example per new rule to `tests/unit/catalog.test.ts`
    - One broken Catalog and the one violation it must give for each rule of the design's new-rules table; extend `everyRule` so a rule without an example fails the Type_Check
    - _Requirements: 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9, 4.10, 4.11, 4.12, 4.13_

  - [x] 3.4 Add the Kind and Routine fixtures to `tests/unit/catalog.type-check.ts`
    - Keep the existing three; add `@ts-expect-error` lines for a `stretch` entry with `{ reps: 1 }` and for pushing to a Routine_Entry's `steps`. Add passing counterparts so each line fails for the reason it names
    - _Requirements: 1.7, 1.8, 3.6_

  - [x] 3.5 Write property test for Previous and Next
    - **Property 3: Previous and Next walk the list in order**
    - File `tests/unit/catalog-neighbours.test.ts`. Lists from `fc.uniqueArray(fc.integer())` with at least one element. `numRuns: 200` and the tag comment
    - **Validates: Requirements 8.6**

  - [x] 3.6 Write property test for the Kind partition
    - **Property 4: Kind partition keeps every entry once, in order**
    - File `tests/unit/catalog-partition.test.ts`, plus the examples "the Exercises are Grave Rise, Skeleton Jacks, Coffin Push in order", "the Stretches are Gravestone Lean, Bat Hang in order" and "a Stretch slug finds nothing as an Exercise and the reverse". `numRuns: 200` and the tag comment
    - **Validates: Requirements 1.3, 1.4, 6.1, 6.2, 7.3**

  - [x] 3.7 Write property test and examples for the length estimate
    - **Property 2: The Estimated_Length is the sum of Sets × (work + Rest), rounded to the nearest minute**
    - File `tests/unit/routine-length.test.ts`. The oracle is a plain loop in the test. Add "Graveyard Shift is between 540 and 660 seconds and rounds to 10 minutes" (578 s) and "Graveyard Shift ends with a Cool-down of Stretches" (every `coolDown` entry resolves to Kind `stretch`; every `steps` entry to Kind `exercise`). `numRuns: 200` and the tag comment
    - **Validates: Requirements 5.1, 5.2, 5.3, 5.4, 3.5**

  - [x] 3.8 Make the asset checks read every entry in `tests/unit/coach-assets.test.ts`
    - Import `entries` instead of `exercises` for `coachAssets` and `stillImages`, so all five Coach_Assets and fifteen Still_Images meet the existing existence, git, budget, clip-name and decoder checks. Add an assertion that `catalogAssets` holds 20 files
    - _Requirements: 11.1, 11.2_

  - [x] 3.9 Make the boundary scanners read every entry in `tests/unit/module-boundaries.test.ts`
    - `catalogAssetNames()` reads `entries`, so the Viewer source is checked against the names of all five entries. Add a case to the existing test that names an asset of a Stretch
    - _Requirements: 11.3, 11.1_

- [x] 4. Checkpoint - Catalog block
  - Run `npx tsc --noEmit` and `npx vitest --run`. Both must exit 0 with no test skipped. Ensure all tests pass, ask the user if questions arise.

- [x] 5. Screens, routes and steering
  - [x] 5.1 Make the list screen work by Kind
    - `src/ui/exercises/labels.ts`: `exercisePath` returns `/exercises/<slug>` or `/stretches/<slug>` by Kind; add `listPath`, `listSection`, `backToListLabel` and `targetFact`
    - `src/ui/exercises/ExerciseListScreen.tsx`: take `{ kind: Kind }`, read `entriesOfKind(kind)`, take the `h1` from `sectionName(listSection(kind))`, link with `exercisePath`. Keep the CSS module and the "no Viewer import" rule
    - `src/app/exercises/page.tsx`: pass `kind="exercise"`
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7_

  - [x] 5.2 Replace the Stretches Placeholder_Screen
    - `src/ui/sections.ts`: add `ListSectionId = 'exercises' | 'stretches'`; `PlaceholderSectionId = Exclude<SectionId, ListSectionId>`; `placeholderSectionIds` excludes both
    - `src/ui/strings.ts`: delete `section.stretches.message`
    - `src/app/stretches/page.tsx`: render `<ExerciseListScreen kind="stretch" />` with `sectionMetadata('stretches')`
    - _Requirements: 7.1, 7.2, 7.8_

  - [x] 5.3 Update the Placeholder_Section tests for the deletion
    - `tests/unit/strings.test.ts`: `placeholderSectionIds` is `['routines', 'crypt', 'history']`
    - `tests/e2e/navigation.spec.ts`: Stretches becomes a list screen (heading, title, one link per Stretch with `href` `/stretches/<slug>`, link home), checked from the Home_Screen, by direct request and by reload; Exercises keeps its checks; only Routines, Crypt and History expect a Placeholder_Screen message. Use `entriesOfKind` for the expected links
    - _Requirements: 12.1, 12.2, 7.1_

  - [x] 5.4 Update the Exercise_Detail_Screen
    - `src/ui/exercises/ExerciseDetailScreen.tsx` and its CSS module: back link `href={listPath(kind)}` with `backToListLabel(kind)`; `<ViewerIsland key={exercise.id} … />`; the target fact after Muscle groups; the final `nav` with Previous and Next links from `neighbours(entriesOfKind(kind), entry)` and `format('pager.previous' | 'pager.next', …)`, omitting the missing ends and the `nav` when both are absent. Tokens only, large touch targets, DOM order equals visual order
    - _Requirements: 8.4, 8.5, 8.6, 8.7, 9.1, 9.3, 9.4_

  - [x] 5.5 Add the Stretch detail route and restrict the Exercise route
    - `src/app/stretches/[slug]/page.tsx`: `dynamicParams = false`, `generateStaticParams` from `stretchSlugs()`, `generateMetadata` and the page through `findStretch`, `notFound()` for any other slug, rendering `ExerciseDetailScreen`
    - `src/app/exercises/[slug]/page.tsx`: confirm it uses `findExercise` and `exerciseSlugs()` so a Stretch slug returns 404
    - _Requirements: 8.1, 8.2, 8.3, 8.7_

  - [x] 5.6 Update the structure steering
    - `.kiro/steering/structure.md`: add `stretches/[slug]/` under `src/app/` in the tree, mention ticket `05-catalog-and-stretches` in "Current state", and add no path that is absent from the Repository
    - _Requirements: 12.7_

- [x] 6. Guard that viewing earns nothing
  - [x] 6.1 Add `tests/unit/viewing-earns-nothing.test.ts`
    - Read the files of `src/catalog/`, `src/viewer/`, `src/ui/exercises/`, `src/app/exercises/` and `src/app/stretches/`; fail on an import path containing `progress-store` or `workout-engine` and on `localStorage`, `sessionStorage`, `indexedDB` or `document.cookie` outside comments. Fail if any of the five folders yields no file (coverage guard). Reuse the comment-stripping helpers of `module-boundaries.test.ts` and add fixture self-tests for the scanner
    - _Requirements: 10.1, 10.2_

- [x] 7. Update the E2E support
  - [x] 7.1 Update `tests/e2e/support/screens.ts`
    - Build `exerciseDetailScreens` from `entries` with `exercisePath`; add `stretchListScreen`; `sectionScreens` now holds `/exercises` and `/stretches` through the existing filter; `placeholderScreens` shrinks to three
    - _Requirements: 12.4_

  - [x] 7.2 Update `tests/e2e/support/webgl.ts`
    - `exerciseOnPage` accepts `/exercises/<slug>` and `/stretches/<slug>` and resolves the entry with `findEntry` by the Kind of the path; the error message names both folders
    - _Requirements: 11.4, 12.4_

- [x] 8. Update and add the E2E specs
  - [x] 8.1 Update `tests/e2e/static-build.spec.ts`
    - `exerciseDetailRoutes` built from `entries` with `exercisePath`; `srcRoute` is `/exercises/[slug]` for Kind `exercise` and `/stretches/[slug]` for Kind `stretch`; every page from a dynamic route is in the list
    - _Requirements: 8.3, 12.3_

  - [x] 8.2 Update `tests/e2e/not-found.spec.ts`
    - Add `/exercises/<stretch-slug>`, `/stretches/<exercise-slug>`, `/stretches/unknown` and `/stretches/no-such-stretch` to the unknown paths, all HTTP 404 with the not-found screen
    - _Requirements: 8.2, 12.5_

  - [x] 8.3 Update `tests/e2e/exercise-detail.spec.ts`
    - Loop over `entries` and use `exercisePath` from `@/ui/exercises/labels`; the back-link test checks the name and `href` by Kind; add tests for the target fact (reps for Exercises, seconds for Stretches, label by unit) and for the Pager (names contain the neighbour's Spooky_Name, previous omitted on the first entry, next on the last, links lead to the neighbour); the document title contains the Spooky_Name for both Kinds
    - _Requirements: 8.1, 8.4, 8.5, 8.6, 8.7, 12.4_

  - [x] 8.4 Update `tests/e2e/exercise-list.spec.ts`
    - Run the list checks for both Kinds with `entriesOfKind`; assert a Stretch never appears on the Exercises list and an Exercise never on the Stretches list; the Stretches list keeps "no Coach_Asset, Still_Image or 3D request"
    - _Requirements: 6.1, 6.2, 6.4, 7.2, 7.3, 7.5, 7.6, 7.7_

  - [x] 8.5 Cover every entry in `tests/e2e/viewer.spec.ts` and share the picture helper
    - Add "the Coach loads for every Exercise_Entry": for each entry in `entries`, open `exercisePath(entry)` and `waitForCoach`, then expect the image named `viewer.coachLabel` with that Spooky_Name
    - Move `settledPicture` into the new `tests/e2e/support/pictures.ts` and import it back, unchanged
    - _Requirements: 11.4_

  - [x] 8.6 Add `tests/e2e/switching.spec.ts`
    - `test.use({ reducedMotion: 'reduce' })`. For the pairs Grave Rise → Skeleton Jacks and Skeleton Jacks → (Stretches list) → Gravestone Lean: load B fresh and keep `settledPicture`; load A, press Side preset, Zoom in, set 0.5×, Play then Pause; assert A's picture differs from A fresh (non-vacuous); switch to B by the Next link, by a list link and by the browser Back button (one test each); assert B's picture equals the fresh one byte for byte, the 1× button has `aria-pressed="true"` and the Play button is shown
    - Add a test that the first screen's WebGL context is lost after leaving, using the context-capture technique of the existing context-release test in `viewer.spec.ts`
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5_

  - [x] 8.7 Add the playing case to `tests/e2e/switching.spec.ts`
    - Without reduced motion: after switching, the Play/Pause button reads Pause and the camera preset selection is the Front view
    - _Requirements: 9.2_

  - [x] 8.8 Add `tests/e2e/viewing-earns-nothing.spec.ts`
    - Open both list screens and every detail screen; play, pause and change the speed on one; then assert `localStorage.length === 0`, `sessionStorage.length === 0`, `(await indexedDB.databases()).length === 0`, `document.cookie === ''` and `await context.cookies()` is empty
    - _Requirements: 10.3_

- [x] 9. Checkpoint - Final verification
  - Run `npx tsc --noEmit`, `npx vitest --run`, `npm run build` and `npx playwright test`. All four must exit 0 with no test skipped, because every asset is delivered. Fix every failure; none is expected. Ensure all tests pass, ask the user if questions arise.

- [ ] 10. Commit locally
  - [-] 10.1 Ask the user, then commit
    - Ask the user for permission before committing. Run `git status --short` and show the list. Stage each changed file of this ticket by its exact path, never with `git add -A` or `git add .`; flag any file that looks like a secret. Commit locally with a short message such as `Add Stretches, Graveyard Shift and the full Catalog (ticket 05)`. Never push and never amend
    - Leave the User tasks to the user: adding the glossary terms to `CONTEXT.md`, and the real-phone eye checks listed at the end of `design.md`
    - _Requirements: 12.6_

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP; the required tests cover every requirement, including the shipped-content test (3.1) and all four properties.
- Each task references specific requirements for traceability. Checkpoints ensure incremental validation.
- Property tests validate the universal properties of the design; unit and E2E tests validate examples and edge cases.
- Human eye checks (push-up and Stretch clip framing on a real phone) are listed at the end of `design.md` and are not coding tasks.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "1.3", "2.1"] },
    { "id": 2, "tasks": ["2.2", "2.3", "2.4", "2.5"] },
    { "id": 3, "tasks": ["2.6"] },
    { "id": 4, "tasks": ["3.1", "3.4", "3.5", "3.6", "3.7", "3.8", "3.9"] },
    { "id": 5, "tasks": ["3.2"] },
    { "id": 6, "tasks": ["3.3"] },
    { "id": 7, "tasks": ["5.1"] },
    { "id": 8, "tasks": ["5.2", "5.3", "5.4"] },
    { "id": 9, "tasks": ["5.5", "7.1", "7.2"] },
    { "id": 10, "tasks": ["5.6", "6.1", "8.1", "8.2", "8.3", "8.4", "8.5", "8.8"] },
    { "id": 11, "tasks": ["8.6"] },
    { "id": 12, "tasks": ["8.7"] },
    { "id": 13, "tasks": ["10.1"] }
  ]
}
```
