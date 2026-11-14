# Implementation Plan: The Crypt

## Overview

This plan builds ticket `11-the-crypt` as described in `design.md`, in TypeScript strict mode. Work goes bottom-up. First the strings and the Crypt_Content, then the Progress_Store at Schema_Version 3 with its migration, operations and property tests, and a checkpoint. Then the pure Crypt rules, the Viewer's tint and Accessories, and a second checkpoint. After that come the Read_Only_Bridge, the Exercise, Stretch and Workout wiring, the Crypt_Screen with the Placeholder removal, the scan changes, the E2E support and specs, the steering update, a final checkpoint and a commit that waits for the user.

Ground rules for every task:

- The shell is PowerShell on Windows. The agent may run `npx tsc --noEmit`, `npx vitest --run`, `npm run build` and `npx playwright test`. The agent never runs `npm run dev` or `npm run start`. Use the terminal only for npm, npx, node, uvx and git. Read and write files with the file tools; delete files with the delete tool.
- Every user-facing string comes from `src/ui/strings.ts`. Every colour comes from `src/ui/theme/tokens.ts`, including the Coach color values. Use glossary terms in identifiers, test names and comments (Coach, Coach name, Coach color, Accessory, Unlock, Candy, Crypt, Workout, Set); never avatar, trainer, model, character, item, cosmetic, skin, buy, purchase, points, coins, score, XP or session. New text never claims or implies correct form and never shames the user for having too little Candy. The Coach name is rendered only as a text node.
- ADR 0002: the new data joins the one `localStorage` key `spooky-coach:progress`; nothing is written to `sessionStorage`, IndexedDB or cookies. Only `src/progress-store/local-storage.ts` names `localStorage`. Only `src/ui/progress/` and `src/progress-store/` import `@/progress-store`. The Progress_Store imports nothing from the Catalog, the UI, React or Three.js, and only types from the Workout_Engine. `src/ui/workout/` and `src/workout-engine/` import no Progress code. The Catalog imports only its own files and the type `StringId`. Only `src/viewer/scene/` imports Three.js. The Viewer holds no asset path or Accessory_Node name. ADR 0003: tint only the `CoachBone` material. ADR 0004: no task creates or edits a GLB or a Still_Image; leave `assets/` and `public/assets/` untouched.
- The Browsing_Screens may import from `src/ui/progress/` only `WornCoachViewer` and `CoachSafetyMessage`. The Read_Only_Bridge files (`useCoachLook.ts`, `WornCoachViewer.tsx`, `CoachSafetyMessage.tsx`) never call a write operation and never import `useProgress`.
- Raising `schemaVersion` to 3 makes every test that writes or expects version 2, or seeds version 3 as newer, fail until its task updates it (tasks 2.3 to 2.7 and 9.2). Do not weaken a test: change the version or the text, keep the rule. The checkpoints before task 11 therefore run only the test files named in them.
- Property tests use `fast-check` with `numRuns: 200` and the tag comment `// Feature: the-crypt, Property N: …`. Store tests use the in-memory adapter and never real time. Viewer logic tests pass every clock as an argument.
- Light Playwright: the E2E specs use the production build and software WebGL. While developing, run one spec file and one project at a time with `--workers=1`, for example `npx playwright test tests/e2e/the-crypt.spec.ts --project=phone --workers=1`. Run the whole suite only at the final checkpoint (task 11), with a long timeout (up to 1,800,000 ms): it builds the Site first.
- Ask the user before every commit. Stage files by name, never with `git add -A` or `git add .`. Never push.

## Tasks

- [x] 1. Strings and Crypt_Content
  - [x] 1.1 Add the strings and template the Safety_Message
    - `src/ui/strings.ts`: add every identifier of the design's "Strings_Module additions and changes" except the removal of `section.crypt.message` (task 7.4 removes it with the Placeholder); change `safety.coachMessage` to the `{coach}` template; add `coach.defaultName`, the six `coachColor.*.name`, the three `accessory.*.name`, every `crypt.*` string and `viewer.accessories.failed` and `viewer.fallback.look`
    - Create `src/ui/crypt/labels.ts` with `coachNameOrDefault(name)` and `safetyMessage(name)` (uses `format('safety.coachMessage', { coach })`)
    - Replace `t('safety.coachMessage')` with `safetyMessage(null)` in `src/ui/exercises/ExerciseDetailScreen.tsx`, `src/ui/workout/PreparingPanel.tsx` and `src/ui/workout/SetPanel.tsx` (tasks 7.2 and 7.3 wire the stored name)
    - _Requirements: 17.1, 17.2, 17.3, 20.1, 20.2, 20.3, 20.4_

  - [x] 1.2 Update the string tests
    - `tests/unit/strings-format.test.ts`: list every new template with its placeholders by hand, as listed in the design
    - `tests/unit/strings.test.ts`: the Safety_Message test formats with `t('coach.defaultName')` and keeps its three phrases; add `crypt.` to the shaming-word prefixes; extend the Avoid-word check to avatar, item, cosmetic, skin, buy, purchase and coins over the new identifiers; add "every new Crypt identifier is non-blank"; the existing Candy-free rule for `viewer.` and `safety.` and the "saved or kept" rule must pass over the new strings with no new exception
    - _Requirements: 17.2, 20.2, 20.3, 20.4, 20.5_

  - [x] 1.3 Create the Crypt_Content and the Coach color tokens
    - `src/catalog/types.ts`: `CoachColorEntry`, `AccessoryEntry`, `CryptOption`, `CryptContent`, `CryptDraft`, `CryptRule`, `CryptViolation`
    - `src/catalog/crypt.ts`: `coachColorIds`, `accessoryIds`, `cryptContent` exactly as the design's shipped-content table (Accessory_Asset `/assets/coach/coach_accessories.glb`, Crypt_Preview_Exercise `grave-rise`), `findCoachColor`, `findAccessory` and `validateCryptContent(draft, entries)` with every `CryptRule`; share the asset path pattern with `validate.ts`
    - `src/catalog/index.ts`: export the new values and types
    - `src/ui/theme/tokens.ts`: add `coachBone: '#f5f0e3'`, `coachAsh`, `coachMoonlight`, `coachEmber`, `coachSlime`, `coachWitch`
    - `src/ui/crypt/coach-colors.ts`: `coachColorToken`, `coachColorHex`, `coachColorVar`
    - The Catalog still imports only its own files and `StringId`; no colour literal outside `tokens.ts`
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6_

  - [x] 1.4 Write the Crypt_Content tests
    - File `tests/unit/crypt-content.test.ts`: the shipped Crypt_Content validates with no violation; one broken draft per `CryptRule` gives exactly that rule; the shipped ids, order and Prices; "the Welcome gift covers the witch hat"; every Coach color has a hex token and `coachBone` is `#f5f0e3`; every shipped Option_Id passes `isOptionId` and every shipped Price is within the store's range (from `@/progress-store`, task 2.1)
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.7_

- [x] 2. Progress_Store: Schema_Version 3
  - [x] 2.1 Update the types, the Coach_Name_Rule, the pure rules and the codec
    - `src/progress-store/types.ts`: `schemaVersion = 3`, `maxUnlockPrice`, `UnlockKind`, `UnlockRecord`, `CoachCustomisation`, `ProgressData` v3, the snapshot members `totalCandySpent`, `unlocks`, `coach`, `UnlockRequest`, `UnlockResult`, `EquipResult`, `CoachNameResult`, and the four new `ProgressStore` operations
    - `src/progress-store/coach-name.ts`: `coachNameMaxLength` and `normaliseCoachName` exactly as the design's seven steps
    - `src/progress-store/rules.ts`: `defaultCoach`, `isOptionId`, `isUnlockRecord`, `totalCandySpent`, `unlock`, `equipColor`, `setAccessoryEquipped`, `setCoachName`; `emptyProgress` at version 3; the existing rules carry `unlocks` and `coach` unchanged; `snapshotOf` adds the copies and `totalCandySpent`
    - `src/progress-store/codec.ts`: the design's version table (1 to 2 to 3, 2 to 3, 3 read with `unlocks` and `coach`, above 3 newer) and `parseCoach`; the header comment becomes the table; `parseProgress` never throws
    - `src/progress-store/index.ts`: export the new types, `normaliseCoachName`, `coachNameMaxLength`, `maxUnlockPrice` and `isOptionId`
    - No import of the Catalog, React, Three.js or the UI; no `Date`, `performance`, `window` or `document`
    - _Requirements: 2.1, 2.2, 2.3, 2.5, 2.6, 2.7, 2.8, 3.1, 3.5, 3.6, 4.1, 5.1, 5.2, 5.5, 6.1, 6.2, 6.3, 6.5_

  - [x] 2.2 Add the Crypt operations to the store
    - `src/progress-store/store.ts`: `unlock`, `equipColor`, `setAccessoryEquipped` and `setCoachName` on the existing read, apply, write, notify path with one `setItem` per change; every no-op outcome writes nothing and returns the same snapshot object unless another tab changed storage; `sameView` also compares the JSON text of `unlocks` and `coach`; no write on load; the `newer` and throwing-adapter rules apply
    - _Requirements: 2.4, 3.2, 3.3, 3.4, 3.7, 3.8, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 5.3, 5.4_

  - [x] 2.3 Extend the test support in `tests/unit/support/progress.ts`
    - Every built `ProgressData` and stored text becomes version 3 with `unlocks` and `coach`; add v2 data and text arbitraries (keep the v1 ones), an Unlock request arbitrary (shipped options with their Prices, random valid requests, malformed ones), a Coach_Customisation arbitrary with junk members, and the operations `unlock`, `equipColor`, `setAccessoryEquipped` and `setCoachName` in the operation arbitrary, the model (with a spent term) and `runOperations`; the spy adapter keeps counting `setItem` calls; the existing helpers keep working for the ticket 08 and 09 tests
    - _Requirements: 23.1, 23.2_

  - [x] 2.4 Update and extend the codec tests
    - **Property 1: Migration keeps Candy, history, gift and checkpoint**, **Property 2: Version 3 serialisation round trip** and **Property 3: A damaged Coach_Customisation never costs Candy or Unlocks**
    - File `tests/unit/progress-codec.test.ts`: change the version 2 data and assertions to version 3 (keep each rule); the "newer" examples use version 4; add the examples "version 2 text parses as version 3 with no Unlocks and the default Coach", "version 1 text chains to version 3", "a version 3 text without unlocks or coach is no data", "a repeated Unlock id is no data", "an equipped Accessory without an Unlock is dropped", "the stored text carries the schema version 3". `numRuns: 200` and the tag comments
    - **Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 2.10**

  - [x] 2.5 Write the Unlock and equip tests
    - **Property 4: An Unlock spends exactly its Price or nothing** and **Property 5: An Unlock with too little Candy changes nothing**
    - File `tests/unit/progress-crypt.test.ts`, one `fc.assert` per property, with the examples "an Unlock with too little Candy is rejected and the Candy balance is unchanged", "Unlocks persist across a new store over the same storage", "equip and unequip persist across a reload", "an Unlock also equips", "an Unlock twice spends once", "a locked Accessory cannot be equipped", "two stores over one storage never spend the same Candy twice", "a Coach name is stored as plain text". `numRuns: 200` and the tag comments
    - **Validates: Requirements 3.2, 3.3, 3.4, 3.5, 3.7, 4.5, 4.8, 5.5, 6.7, 23.1**

  - [x] 2.6 Write the Coach_Name_Rule tests
    - **Property 8: The Coach_Name_Rule is idempotent and safe**
    - File `tests/unit/coach-name.test.ts`, with the design's examples (Count Rattle, collapsed spaces, a Thai name with marks, 21 code points, markup, an emoji, white space only, a curly apostrophe). `numRuns: 200` and the tag comment
    - **Validates: Requirements 5.1, 5.2, 5.6, 5.7**

  - [x] 2.7 Update the store, rules and memory-only tests
    - **Property 6: Store operations keep the Candy invariant and persist** and **Property 7: Memory-only modes keep the Crypt working**
    - Files `tests/unit/progress-store.test.ts`, `tests/unit/progress-rules.test.ts`, `tests/unit/progress-modes.test.ts`: the existing properties run over the extended sequences with the spent term in the balance equation; the newer scenario uses versions from 4 up; Property 6 in `progress-store.test.ts`, Property 7 in `progress-modes.test.ts`; add the examples "a version 2 store writes nothing on load and writes version 3 on the first change", "recording a Workout leaves the Unlocks and the Coach alone", "an equip makes one write and a repeated equip none". `numRuns: 200` and the tag comments
    - **Validates: Requirements 2.4, 2.5, 3.6, 3.8, 4.2, 4.3, 4.4, 4.6, 4.7, 5.3, 5.4, 6.1, 6.2, 6.3, 6.4, 6.5, 6.6**

- [x] 3. Checkpoint - Content and Progress_Store block
  - Run `npx tsc --noEmit` and `npx vitest --run tests/unit/crypt-content.test.ts tests/unit/progress-codec.test.ts tests/unit/progress-crypt.test.ts tests/unit/coach-name.test.ts tests/unit/progress-store.test.ts tests/unit/progress-rules.test.ts tests/unit/progress-modes.test.ts tests/unit/progress-record.test.ts tests/unit/strings.test.ts tests/unit/strings-format.test.ts tests/unit/catalog.test.ts tests/unit/module-boundaries.test.ts tests/unit/progress-boundaries.test.ts tests/unit/source-rules.test.ts tests/unit/theme.test.ts`. All must exit 0 with no test skipped. Ensure all tests pass, ask the user if questions arise.

- [x] 4. Crypt rules (pure)
  - [x] 4.1 Create the look, node and appearance rules
    - `src/viewer/logic/appearance.ts`: `CoachAppearance`, `defaultAppearance`, `AccessoryState`, `wantsAccessoryAsset`, `isDefaultAppearance`, `showsAccessoryNote`, `appearanceKey` (pure; imports only the `SameOriginAssetPath` type)
    - `src/ui/crypt/look.ts`: `EquippedLook`, `StoredChoices`, `defaultLook`, `isOwned`, `resolveLook`, `nodesFor` as in the design
    - `src/viewer/ViewerIsland.tsx`: add only `export type { CoachAppearance } from './logic/appearance';` (the UI reaches the Viewer only through the island; task 5.4 adds the prop)
    - `src/ui/crypt/appearance.ts`: `appearanceOf(look, { fetchAccessories })`, importing the `CoachAppearance` type from `@/viewer/ViewerIsland`
    - `src/ui/crypt/labels.ts`: add `optionName(option)`
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 8.11_

  - [x] 4.2 Create the Preview and option-state rules
    - `src/ui/crypt/preview.ts`: `Preview`, `emptyPreview`, `PreviewAction`, `previewReducer`, `prunePreview`, `shownLook`
    - `src/ui/crypt/offers.ts`: `UnlockButton`, `OptionState`, `optionStates(stored, balance, preview)`
    - _Requirements: 11.5, 11.6, 12.2, 12.3, 12.4, 13.2, 13.3_

  - [x] 4.3 Write the look and node tests
    - **Property 9: The Look_Rule shows only known, owned options** and **Property 10: The Node_Rule follows the asset contract**
    - File `tests/unit/crypt-look.test.ts`, with the design's examples (default look, all three Accessories, unknown stored color, `safetyMessage` with the default name and with a name holding `{coach} $&`). `numRuns: 200` and the tag comments
    - **Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 17.5**

  - [x] 4.4 Write the Preview and Unlock-button tests
    - **Property 12: A Preview never changes the Equipped_Look** and **Property 13: The Unlock button tells the truth about Candy**
    - File `tests/unit/crypt-preview.test.ts`, with the design's examples (15 Candy: hat enabled, pumpkin head 25 more; 0 Candy: colors 5 more; Owned toggle ignored; second color Preview replaces the first). `numRuns: 200` and the tag comments
    - **Validates: Requirements 11.5, 12.2, 12.3, 12.4, 12.8, 13.2, 13.3, 13.7**

- [x] 5. Viewer: tint and Accessories
  - [x] 5.1 Extend the Viewer controller
    - `src/viewer/logic/controller.ts`: `setAccessoryBounds(box)` (ignored before `setScene`; unions the box into the motion bounds, recomputes framing, re-clamps the orbit, re-fits at a Camera_Preset, requests a frame) and `redraw()` (frame hook once if visible, else once when visible again); `keepDrawing` unchanged; update the header comment
    - _Requirements: 8.6, 8.7, 8.8, 9.3_

  - [x] 5.2 Write the Viewer logic tests
    - **Property 11: The Accessory_Envelope only pushes the camera out**
    - File `tests/unit/viewer-accessories.test.ts`: Property 11 over `computeFraming` and a controller driven by generated commands with an injected clock; examples: `redraw` once while visible and paused, none while hidden, once on becoming visible; `keepDrawing` false after `redraw` while paused; `setAccessoryBounds` before `setScene` ignored; a re-fit at a Camera_Preset; the `wantsAccessoryAsset`, `isDefaultAppearance` and `showsAccessoryNote` tables. `numRuns: 200` and the tag comment
    - **Validates: Requirements 8.1, 8.6, 8.8, 8.12, 9.3, 10.3**

  - [x] 5.3 Add the scene helpers and wire them into the Coach
    - `src/viewer/scene/coach-asset.ts`: export `measureMotionBounds`
    - `src/viewer/scene/accessory-asset.ts`: `ParsedAccessories` and `parseAccessoryAsset(buffer, resourcePath, names)` (GLTFLoader, no decoder)
    - `src/viewer/scene/coach-look.ts`: `boneMaterials`, `tintBones`, `attachAccessories`, `showNodes`, `detachAccessories`
    - `src/viewer/scene/CoachActor.tsx`: the steps 1 to 4 of the design (tint on mount and on change; attach, make all visible, measure the Accessory_Envelope, report it, then show the named nodes; report missing nodes or head; detach before dispose); replace the "no Coach color tint and no Accessory" comment
    - `src/viewer/scene/Scene3D.tsx`: props `accessoryBuffer`, `appearance`, `onAccessories`; parse the Accessory buffer with `framingNodes`; wire `onEnvelope` to `controller.setAccessoryBounds` and look changes to `controller.redraw()`; dispose the parsed Accessory scene at the end of the attempt; report `onApplied` to the island
    - No shadows and no post-processing; no asset path or node name literal in `src/viewer/`
    - _Requirements: 8.2, 8.4, 8.5, 8.6, 8.7, 8.8, 8.10, 8.11, 9.4, 10.1, 10.2, 10.4_

  - [x] 5.4 Add the appearance to the Viewer island
    - `src/viewer/ViewerIsland.tsx`: prop `appearance?: CoachAppearance` (default `defaultAppearance`) and the re-export of the type; the Accessory fetch effect (once per attempt, only when `wantsAccessoryAsset`, through `fetchCoachAsset`, never dispatching into the load reducer); pass `accessoryBuffer` and `appearance` to Scene3D; the data attributes `data-coach-color`, `data-coach-accessories` and `data-accessories`; the Accessory_Note and the Still_Look_Note (not live regions); Retry starts a new attempt and therefore refetches; update the header comment
    - _Requirements: 8.1, 8.3, 8.9, 8.11, 10.1, 10.3, 10.4, 10.5, 10.6, 16.3_

  - [x] 5.5 Extend the asset tests
    - `tests/unit/coach-assets.test.ts`: the Accessory_Asset (path from `cryptContent`) exists, is tracked or committable, is glTF 2.0 and needs no decoder; each of the four Accessory_Nodes is a mesh node and a direct child of a node named `head`; each Coach_Asset plus every Accessory node plus the Graveyard_Scene is at most 35,000 triangles; the Coach_Asset's materials plus the Accessory nodes' materials number at most 4. Add a node-tree helper to `tests/unit/support/glb.ts` built on `readGlb` and `parseJsonChunk`
    - _Requirements: 9.1, 9.2_

- [x] 6. Checkpoint - Crypt rules and Viewer block
  - Run `npx tsc --noEmit` and `npx vitest --run tests/unit/crypt-look.test.ts tests/unit/crypt-preview.test.ts tests/unit/viewer-accessories.test.ts tests/unit/coach-assets.test.ts tests/unit/viewer-controller.test.ts tests/unit/viewer-framing.test.ts tests/unit/viewer-load-state.test.ts tests/unit/viewer-playback.test.ts tests/unit/module-boundaries.test.ts tests/unit/workout-isolation.test.ts tests/unit/viewing-earns-nothing.test.ts tests/unit/source-rules.test.ts`. All must exit 0 with no test skipped. Ensure all tests pass, ask the user if questions arise.

- [x] 7. Screens and wiring
  - [x] 7.1 Create the page store and the Read_Only_Bridge
    - `src/ui/progress/page-store.ts`: move the lazy page store, `subscribePageStore`, `readPageSnapshot` and `readServerSnapshot` out of `useProgress.ts`
    - `src/ui/progress/useProgress.ts`: use the page store; add `unlock`, `equipColor`, `setAccessoryEquipped` and `setCoachName`; re-export the result types the Crypt_Screen needs; keep every existing member and the Welcome gift on mount
    - `src/ui/progress/useCoachLook.ts`, `WornCoachViewer.tsx`, `CoachSafetyMessage.tsx` as in the design; they import from `src/ui/progress/` only `page-store.ts` and each other, never `useProgress`, and call no write operation
    - _Requirements: 16.1, 16.3, 17.3, 18.1, 18.2, 22.2_

  - [x] 7.2 Show the Equipped_Look and the Coach name on the Exercise and Stretch pages
    - `src/ui/exercises/ExerciseDetailScreen.tsx`: render `<WornCoachViewer exercise={exercise} />` (keyed by the Exercise id) and `<CoachSafetyMessage className={styles.safetyMessage} />`; the screen stays a server component; the safety `section` and heading stay server HTML; update the header comment
    - _Requirements: 16.1, 16.3, 16.4, 17.3, 17.4, 18.1_

  - [x] 7.3 Pass the Equipped_Look and the Coach name into the Workout
    - `src/ui/workout/WorkoutScreen.tsx`: props `appearance?: CoachAppearance` and `coachName?: string | null`; `src/ui/workout/CoachViewer.tsx` passes `appearance` to `ViewerIsland`; `PreparingPanel.tsx` and `SetPanel.tsx` take `coachName` and render `safetyMessage(coachName)`
    - `src/ui/progress/RecordedWorkoutScreen.tsx`: compute `appearance` and `coachName` from the snapshot as in the design and pass them to every `WorkoutScreen` it renders
    - Nothing in `src/ui/workout/` imports Progress code; the Coach_Hold and Workout timing are unchanged
    - _Requirements: 16.2, 16.3, 16.4, 16.5, 17.3_

  - [x] 7.4 Build the Crypt_Screen and retire the Placeholder
    - `src/ui/crypt/CryptScreen.tsx`, `CoachNameForm.tsx`, `OptionRow.tsx` and `CryptScreen.module.css` as in the design (loading state; Welcome gift through `useProgress`; balance in `role="status"`; `progress.unavailable` when not persistent; the Viewer with the Crypt_Preview_Exercise and the Shown_Look with `fetchAccessories: true`; the Preview note and stop button; the name form; the two option sections; one polite live region; the back-home link; tokens only, `3rem` controls, wrapping rows, no animation or transition)
    - `src/app/crypt/page.tsx`: keep `sectionMetadata('crypt')` and render `<CryptScreen />`
    - `src/ui/sections.ts`: delete `ListSectionId`, `PlaceholderSectionId`, `placeholderSectionIds` and `sectionMessage`, and update the header comment
    - Delete `src/ui/placeholder/PlaceholderScreen.tsx` and its CSS module; remove `section.crypt.message` from `src/ui/strings.ts`
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11.7, 11.8, 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.7, 13.1, 13.2, 13.3, 13.4, 13.5, 13.6, 14.1, 14.2, 14.3, 14.4, 14.5, 14.6, 15.1, 15.2, 15.3, 15.4, 15.5, 19.1, 19.2, 19.4, 21.1, 21.2, 21.3, 21.4, 21.5, 21.6, 21.7, 22.1, 22.3_

  - [x] 7.5 Update the Section and Placeholder unit tests
    - `tests/unit/sections.test.ts`: replace "only Crypt is still a Placeholder section" with "every Section has a name and a title, and no Section has a Placeholder message string"
    - `tests/unit/strings.test.ts`: remove the local `placeholderSectionIds` and the Placeholder message length test (no Placeholder message exists); keep every other rule
    - _Requirements: 19.1, 19.2, 19.3_

- [x] 8. Scans
  - [x] 8.1 Change the viewing-earns-nothing scan to the read-only rule
    - `tests/unit/viewing-earns-nothing.test.ts`: rewrite the header to state the new rule (browsing reads the look through the Read_Only_Bridge and stores nothing; this supersedes "never touches the Progress store" of tickets 03, 05 and 08); keep the folders, the `progress-store` and `workout-engine` rule and the storage-name rule; add a rule that flags any import resolving into `src/ui/progress/` other than `src/ui/progress/WornCoachViewer` and `src/ui/progress/CoachSafetyMessage`; add a fixture line that must be flagged (`import { useProgress } from '@/ui/progress/useProgress'`) and one that must pass (`import { WornCoachViewer } from '@/ui/progress/WornCoachViewer'`)
    - _Requirements: 18.1, 18.5_

  - [x] 8.2 Add the Read_Only_Bridge scan
    - `tests/unit/progress-boundaries.test.ts`: a new rule over `useCoachLook.ts`, `WornCoachViewer.tsx` and `CoachSafetyMessage.tsx` (each must exist) that flags any identifier or member name `grantWelcomeGift`, `ensureWelcomeGift`, `recordWorkout`, `finishWorkout`, `saveCheckpoint`, `clearCheckpoint`, `unlock`, `equipColor`, `setAccessoryEquipped` or `setCoachName`, and any import of `src/ui/progress/useProgress`; a fixture that must be flagged and one that must pass; every existing rule unchanged
    - _Requirements: 18.2, 18.6_

- [ ] 9. E2E support and specs
  - [x] 9.1 Extend the E2E support
    - `tests/e2e/support/progress.ts`: version 3 seeds with `unlocks` and `coach` (helpers default to the exported `schemaVersion`); `seedVersion2(page, …)`; `readProgressText(page)` for byte comparisons
    - `tests/e2e/support/screens.ts`: remove `placeholderScreens`; `sectionScreens` lists every Section; `screens` keeps covering every route
    - `tests/e2e/support/crypt.ts` (new): the Unlock_Helper `unlockOption(page, optionName)`, locators for the option rows, the Equip and Preview toggles, the Unlock buttons, the Shortfall text, the name field and the live region, and readers for the Viewer's `data-coach-color`, `data-coach-accessories` and `data-accessories`; names come from the Strings_Module and the Crypt_Content
    - _Requirements: 23.3, 23.4_

  - [x] 9.2 Update the earlier E2E specs this ticket changes
    - `tests/e2e/candy-and-history.spec.ts`: stored `schemaVersion` 3; `progressText` writes full version 3 text; the newer seed stays `schemaVersion + 1` (now 4); every other assertion stays
    - `tests/e2e/resume-after-refresh.spec.ts`: the version after the first change is 3; seeded version 2 text still migrates
    - `tests/e2e/exercise-detail.spec.ts`, `viewer-fallback.spec.ts`, `workout.spec.ts`: the Safety_Message text is `safetyMessage(null)`
    - `tests/e2e/navigation.spec.ts`: Crypt serves the Crypt_Screen (`h1`, title, back-home link, checked from Home, by direct request and by reload); the Placeholder test becomes "the Crypt_Screen links back to the Home_Screen"
    - `tests/e2e/static-build.spec.ts`, `theme.spec.ts`, `layout.spec.ts`: fix comments and lists that named the Placeholder_Screens; no assertion weakened
    - `tests/e2e/viewing-earns-nothing.spec.ts` stays unchanged and must pass
    - _Requirements: 18.3, 19.3, 23.5_

  - [-] 9.3 Add `tests/e2e/the-crypt.spec.ts`
    - Both projects, `test.use({ reducedMotion: 'reduce' })`. Cover every item of the design's Playwright list: first visit and Welcome gift; free colors with no Candy; Prices and the Shortfall; Preview not stored and gone after reload; Unlock of the witch hat with the Unlock_Helper, persistence across reload, unequip persistence; pumpkin head with the hat-on-pumpkin node and the hidden eyes; Coach name on the Exercise page, a Stretch page and the Preparing_Panel, the invalid and empty cases, an apostrophe rendered as text; the Equipped_Look on an Exercise page, a Stretch page and a Workout Set panel; no Accessory_Asset request without an Accessory; a blocked Accessory_Asset with the Accessory_Note; read-only browsing with seeded data leaves the stored text byte-identical; version 2 migration; the storage footprint; the server HTML of `/crypt`; no hydration warning on `/crypt` and an Exercise page; labelled regions, text button names, `3rem` controls, 320 px and 200% text reflow, no animation or transition, announcements; on the laptop project, an equip while the Coach is paused draws a bounded number of frames and then none
    - _Requirements: 3.2, 3.3, 8.3, 8.9, 10.1, 10.3, 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11.8, 12.5, 12.6, 12.7, 13.3, 13.4, 13.6, 14.2, 14.5, 14.6, 15.3, 15.4, 15.5, 16.1, 16.2, 16.4, 17.3, 17.4, 18.4, 21.1, 21.2, 21.3, 21.4, 21.5, 21.7, 22.3, 22.4, 22.5, 22.6, 23.3_

- [x] 10. Structure steering
  - [x] 10.1 Update `.kiro/steering/structure.md`
    - In "Current state", mention ticket `11-the-crypt`: the Crypt_Content in the Catalog, Schema_Version 3 of the Progress_Store with Unlocks, the Coach_Customisation and the migration, the Crypt rules and the Crypt_Screen in `src/ui/crypt/`, the Read_Only_Bridge in `src/ui/progress/`, the Viewer's tint and Accessories, and the removal of the Placeholder_Screen; add `src/ui/crypt/` to the tracked tree and update the `progress-store/` line; list no path that is absent from the Repository (`tests/unit/repository-rules.test.ts` checks it)
    - _Requirements: 23.6_

- [x] 11. Checkpoint - Final verification
  - Run `npx tsc --noEmit`, `npx vitest --run`, `npm run build` and `npx playwright test` (the whole suite, long timeout, `--workers=1` if the machine struggles). All four must exit 0 with no test skipped. Fix every failure. Ensure all tests pass, ask the user if questions arise.
  - _Requirements: 22.1, 23.7_

- [ ] 12. Commit locally
  - [-] 12.1 Ask the user, then commit
    - Ask the user for permission before committing. Run `git status --short` and show the list. Stage each changed, added or deleted file of this ticket by its exact path, never with `git add -A` or `git add .`; flag any file that looks like a secret. Commit locally with a short message such as `Customise the Coach in the Crypt (ticket 11)`. Never push and never amend
    - Leave the User tasks to the user: the real-phone eye checks at the end of `design.md`
    - _Requirements: 23.6, 23.7_

## Notes

- Tasks marked with `*` are optional; none is marked here, because every test sub-task protects a requirement of this ticket, and the ticket itself asks for the Unlock and persistence tests.
- Each task references specific requirements for traceability. Checkpoints ensure incremental validation.
- Property tests validate the thirteen universal properties of the design; unit and E2E tests validate examples and edge cases.
- Requirements 1.6, 3.1, 4.1, 8.11, 9.4, 18.1, 18.2 and 22.6 are static rules, checked by the Type_Check, the existing module-boundary scans and the scans of tasks 8.1 and 8.2.
- Requirements 8.2, 8.4, 8.10 and 21.6 are browser and GPU behaviour, checked by the E2E spec of task 9.3 and the eye checks at the end of `design.md`.
- This ticket changes the "viewing earns nothing" rule from "never touches the Progress_Store" to "reads through the Read_Only_Bridge and stores nothing". Task 8.1 states the change in the scan's header; the E2E spec with empty storage stays unchanged.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.3", "2.1", "5.1"] },
    { "id": 1, "tasks": ["1.2", "1.4", "2.2", "4.1"] },
    { "id": 2, "tasks": ["2.3", "4.2", "5.2", "5.3"] },
    { "id": 3, "tasks": ["2.4", "2.5", "2.6", "2.7", "4.3", "4.4", "5.4"] },
    { "id": 4, "tasks": ["5.5", "7.1"] },
    { "id": 5, "tasks": ["7.2", "7.3", "7.4"] },
    { "id": 6, "tasks": ["7.5", "8.1", "8.2", "9.1"] },
    { "id": 7, "tasks": ["9.2", "9.3"] },
    { "id": 8, "tasks": ["10.1"] },
    { "id": 9, "tasks": ["12.1"] }
  ]
}
```
