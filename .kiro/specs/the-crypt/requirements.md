# Requirements Document

## Introduction

This spec covers ticket `11-the-crypt` of the Spooky Coach MVP (`.scratch/spooky-coach-mvp/issues/11-the-crypt.md`). It builds on the committed `candy-and-history` and `resume-after-refresh` specs and on the assets of ticket `10-accessories-and-colors` (contract: `assets/coach/README.md`). Until now Candy can only be earned. This ticket adds the **Crypt**: the screen where the user names the Coach for free, picks a free Coach color, Unlocks extra Coach colors and Accessories with Candy, previews any of them on the 3D Coach before Unlocking, and equips and unequips them for free. The equipped look then appears on every Coach in the app: Exercise pages, Stretch pages, Workouts and the Crypt itself. The Coach name appears where the Coach speaks: the Safety_Message.

Constraints from the ADRs and steering:

- ADR 0001: a website, phone-first, also good on a laptop.
- ADR 0002: no backend. Unlocks, the equipped look and the Coach name join the one existing `localStorage` key. **No ADR conflict.** Losing them on cleared storage or a new device is accepted.
- ADR 0003: one Coach rig; Accessories are separate meshes attached to bones; Coach colors are material tints applied at runtime; budget ≤ 35k triangles and ≤ 4 materials per Exercise; no shadows, no post-processing. This ticket follows it exactly: only the `CoachBone` material is tinted, and Accessory nodes are cloned onto the `head` joint. **No ADR conflict.**
- ADR 0004: app code consumes the delivered GLBs (`public/assets/coach/coach_accessories.glb` and the clip GLBs) and never creates or edits them. **No ADR conflict.**
- Product steering: Candy is spent only on Unlocks; an Unlock with too little Candy fails and changes nothing; the Unlock button is disabled and shows how much more Candy is needed; Unlocks are permanent; equipping and unequipping are free; prices are tunable content (glowing eyes 10, witch hat 15, pumpkin head 40, extra Coach colors 5 each); two or three Coach colors are free; no real money.
- Tech steering: the Progress_Store owns Unlocks, the equipped Coach color and Accessories and the Coach name, behind an injected Storage_Adapter, with a Schema_Version for migrations. The Catalog is static, typed and read-only. All user-facing strings come from the Strings_Module. The agent never runs the dev server. Shell is PowerShell on Windows.
- The glossary terms Coach, Coach name, Coach color, Accessory, Unlock, Candy and Crypt are used exactly. The Avoid words (avatar, trainer, model, character, item, cosmetic, skin, buy, purchase, points, coins, score, XP, session, status, result) never appear in UI text, identifiers, tests or comments.

### Scope

In scope: the Crypt_Content (Coach colors, Accessories, prices, Accessory nodes) and its validation; Progress_Data Schema_Version 3 with its migration from versions 1 and 2; the Unlock, equip, unequip and Coach name operations of the Progress_Store; the new Candy invariant; the pure Equipped_Look and Preview rules; the Viewer's Coach tint and Accessory attachment; the Crypt_Screen at `/crypt`; the equipped look and the Coach name on the Exercise, Stretch and Workout screens; the read-only access of the browsing screens; the removal of the last Placeholder_Screen; the strings, tests, scans and steering this ticket changes.

Out of scope, with the ticket that owns it (checked against `.scratch/spooky-coach-mvp/issues/`):

- The Candy burst, the "+1" and sound effects, including a sound on Unlock (ticket 12).
- The full accessibility pass (ticket 13). This ticket meets the accessibility rules for its own screen.
- The golden-path smoke test (ticket 14). This ticket makes its last step ("Unlock witch hat") testable and ships the helper it will use.
- Nice-to-have content (ticket 15) and the submission package (ticket 16).
- Re-locking, refunding or resetting Unlocks; a confirmation dialog before an Unlock; Unlocks bought with real money; syncing between tabs or devices (ADR 0002). Two tabs that change the Crypt at once each re-read storage before a change, so no Candy is spent twice, but a tab shows another tab's change only after its own next change or a reload.
- Customisation in the Still_Fallback: the Still_Images are pre-rendered with the default look, so a user who sees the Still_Fallback sees the default Coach. The Site says so (Requirement 10.5).
- Capes, cloth simulation and any new 3D asset.

### Repository state at spec time

Read from the working tree when this spec was written:

- `src/progress-store/`: `schemaVersion` is 2. `ProgressData` is `{ schemaVersion: 2, candy, welcomeGiftGranted, history, checkpoint }`. `codec.ts` holds a version table (`< 1` none, `1` migrates to 2, `2` read, `> 2` newer) and says "The next schema version adds one row here". The store re-reads storage before every change, writes once per change with one `setItem`, writes nothing on load, and works in memory only for a throwing adapter or a newer version. `ProgressStore` offers `snapshot`, `grantWelcomeGift`, `recordWorkout`, `saveCheckpoint`, `clearCheckpoint`, `finishWorkout` and `subscribe`. The tested invariant is Candy_Balance = 15 (when the Welcome gift was granted) + Total_Candy_Earned.
- `src/ui/progress/useProgress.ts` holds the one lazy store per page and grants the Welcome gift on mount. Only `src/ui/progress/` and `src/progress-store/` import `@/progress-store` (`tests/unit/progress-boundaries.test.ts`).
- `src/viewer/ViewerIsland.tsx` takes `exercise` and `hold`. `scene/Scene3D.tsx` parses the Coach_Asset, mounts `CoachActor` (which says "no Coach color tint and no Accessory in this ticket"), hands the bounds to the controller and draws on demand. `logic/controller.ts` derives framing from standing and motion bounds, re-fits on `setAspect`, and calls the frame hook only while the Viewer is visible.
- `src/catalog/` holds Exercises, Stretches and Routines with `validateCatalog`. It imports only its own files and the type `StringId` (`tests/unit/module-boundaries.test.ts`). Only `src/ui/theme/tokens.ts` holds colour literals.
- `src/ui/sections.ts`: `ListSectionId` is `'exercises' | 'stretches' | 'routines' | 'history'`; `placeholderSectionIds` is `['crypt']`. `src/app/crypt/page.tsx` renders `PlaceholderScreen`. Tests and E2E support read `placeholderSectionIds` (`tests/unit/sections.test.ts`, `tests/unit/strings.test.ts`, `tests/e2e/support/screens.ts`, `tests/e2e/navigation.spec.ts`).
- The Safety_Message `safety.coachMessage` has no placeholder. It is shown by `ExerciseDetailScreen` (a server component), `PreparingPanel` and `SetPanel`. E2E specs compare it with the exact English text.
- `tests/unit/viewing-earns-nothing.test.ts` scans `src/catalog`, `src/viewer`, `src/ui/exercises`, `src/app/exercises` and `src/app/stretches` for imports of `progress-store` or `workout-engine` and for storage names. `tests/e2e/viewing-earns-nothing.spec.ts` checks that browsing leaves every browser storage empty.

### Interpretations made

- **Prices and options are Catalog content.** The Coach colors and Accessories, their prices, the free colors, the default color, the Accessory_Asset path and the Accessory node names live in a new Catalog file and pass a validation function, like the Exercises. The colour values themselves live in the theme tokens, because only `tokens.ts` may hold colour literals.
- **Three free Coach colors, three locked ones.** Bone White (the default, the asset's own `#F5F0E3`), Grave Ash and Moonlight Blue are free. Ember Orange, Slime Green and Witch Purple cost 5 Candy each. The ticket allows two or three free colors; three gives a choice with no Candy.
- **The new Candy invariant.** Candy_Balance = 15 (when the Welcome gift was granted) + Total_Candy_Earned − Total_Candy_Spent. Total_Candy_Spent is the sum of the Candy recorded in each Unlock_Record at the moment of the Unlock, so a later price change never rewrites the past. Total_Candy_Earned keeps its ticket 08 meaning (Workout Candy only), and the History_Screen still shows it unchanged.
- **The store enforces Candy; the Crypt rules decide the look.** The Progress_Store never imports the Catalog. It enforces every Candy rule (no Unlock without enough Candy, no Unlock twice, the invariant, Unlocks are permanent) and that only an Unlocked Accessory can be equipped, because every Accessory costs Candy. Which Coach colors are free is content, so the pure Equipped_Look rule (in the UI, over the Catalog) turns the stored choice into the look; an unknown or locked stored choice falls back to the default.
- **Unlock also equips.** The user previews an option, then Unlocks it; the option stays on, in the same write. The user can unequip it for free.
- **Pumpkin head with the other Accessories.** All three Accessories can be equipped together. While the pumpkin head is shown, the witch hat uses its `accessory_witch_hat_on_pumpkin` node (asset contract), and the glowing eyes are not attached because the pumpkin covers the skull (the pumpkin's carved face already glows). The Crypt says that the glowing eyes are hidden under the pumpkin head.
- **Preview lives in page memory.** A preview changes only the Coach on the Crypt_Screen. It is never written to storage, it never changes the equipped look of any other screen, and it ends when the user leaves or reloads the Crypt, stops it, or Unlocks the previewed option.
- **Default Coach name and its rule.** The default Coach name is "Bones" (from the Strings_Module, so Thai can change it). A Coach name is plain text: the store keeps it as text and the UI renders it only as a text node. It is normalised (Unicode NFC, trimmed, runs of white space turned into one space), then holds 1 to 20 characters (Unicode code points), only letters, combining marks, digits, spaces, hyphens, apostrophes and full stops, and at least one letter or digit. An empty name after normalisation means the default name.
- **Browsing screens now read, and only read.** Showing the equipped look and the Coach name on Exercise and Stretch pages needs the stored data there. This **changes the rule of tickets 03, 05 and 08** that browsing never touches the Progress_Store. The new rule: the browsing screens reach the Progress_Store only through a Read_Only_Bridge that reads the Progress_Snapshot and calls no operation that changes data, and they never grant the Welcome gift. Browsing therefore still earns nothing and **stores nothing**: a visitor with empty storage who only browses still leaves every browser storage empty (the existing E2E spec passes unchanged), and a visitor with stored data leaves the stored text byte-identical. The unit scan changes its rule to match, and says so.
- **Accessories load beside the Coach, never in its way.** The Accessory_Asset is fetched in parallel with the Coach_Asset only when an Accessory is shown or on the Crypt_Screen. The Coach is ready as soon as its own asset is ready. When the Accessory_Asset arrives, the Viewer widens the camera framing to include every Accessory once, so equipping or previewing never moves the camera again and the camera never enters an Accessory. A failed Accessory_Asset leaves the Coach working without Accessories and shows a short note.
- **The last Placeholder_Screen goes.** The Crypt was the last Placeholder Section. The Placeholder_Screen component, its message string and the placeholder types are removed rather than kept empty, and the tests that iterated over the placeholder list are changed to check that every Section serves a real screen (no test passes vacuously over an empty list).
- **The golden path is testable now.** The Crypt option controls have stable accessible names from the Strings_Module, the E2E support gains a `unlockOption` helper, and this ticket's E2E spec Unlocks the witch hat with the Welcome gift.

## Glossary

- **Site**, **Strings_Module**, **Home_Screen**, **Section**, **Placeholder_Screen**, **Phone_Viewport**, **Laptop_Viewport**, **Build**, **Type_Check**, **Unit_Suite**, **E2E_Suite**, **Builder**: As defined in the `spooky-site-skeleton` spec. **Placeholder_Screen** is retired by this ticket.
- **Catalog**, **Exercise_Entry**, **Exercise_Detail_Screen**, **Viewer**, **Viewer_Area**, **Coach_Asset**, **Demo_Clip**, **Still_Image**, **Still_Fallback**, **Render_Loop**, **Camera_Preset**, **Camera_Distance**, **Safety_Message**, **Reduced_Motion_Preference**: As defined in the `exercise-page-3d-coach` and `catalog-and-stretches` specs.
- **Workout_Screen**, **Preparing_Panel**, **Set_Panel**, **Coach_Hold**: As defined in the `happy-path-workout` and `skip-pause-quit` specs.
- **Progress_Store**, **Storage_Adapter**, **Storage_Key**, **Progress_Data**, **Schema_Version**, **Candy_Balance**, **Workout_Record**, **History_Entry**, **Total_Candy_Earned**, **Progress_Snapshot**, **Persistent_Flag**, **Recording_Bridge**, **History_Screen**: As defined in the `candy-and-history` spec. **Progress_Data**, **Schema_Version** and **Progress_Snapshot** are extended below.
- **Stored_Checkpoint**: As defined in the `resume-after-refresh` spec.
- **Coach**, **Coach name**, **Coach color**, **Accessory**, **Candy**, **Welcome gift**, **Unlock**, **Exercise**, **Stretch**, **Routine**, **Workout**, **Set**: As defined in CONTEXT.md and the product steering.
- **Crypt**: The customisation screen's name in the UI (product steering).
- **Crypt_Screen**: The screen served at `/crypt`.
- **Crypt_Content**: The Catalog's static list of Coach_Color_Entries and Accessory_Entries, with the Accessory_Asset path and the Crypt_Preview_Exercise.
- **Coach_Color_Entry**: One Coach color in the Crypt_Content: an id, a name string id and a Price.
- **Accessory_Entry**: One Accessory in the Crypt_Content: an id, a name string id, a Price, its Accessory_Node and its optional combination rules.
- **Crypt_Option**: A Coach_Color_Entry or an Accessory_Entry.
- **Option_Id**: The id of a Crypt_Option: lowercase letters, digits and hyphens, starting with a letter, at most 40 characters, unique across all Crypt_Options.
- **Price**: The Candy a Crypt_Option costs to Unlock. 0 for a Free_Coach_Color; a whole number from 1 to 999 otherwise.
- **Free_Coach_Color**: A Coach_Color_Entry whose Price is 0. It is usable from the start and is never Unlocked.
- **Default_Coach_Color**: The one Free_Coach_Color shown when no other Coach color is equipped: Bone White.
- **Locked_Option**: A Crypt_Option with a Price above 0 that has no Unlock_Record.
- **Owned_Option**: A Free_Coach_Color, or a Crypt_Option that has an Unlock_Record.
- **Unlock_Record**: What the Progress_Store keeps for one Unlock: the Option_Id, the kind (`color` or `accessory`) and the Candy spent.
- **Total_Candy_Spent**: The sum of the Candy spent over all Unlock_Records.
- **Shortfall**: For a Locked_Option, its Price minus the Candy_Balance, when that is above 0.
- **Coach_Customisation**: The stored part of the Progress_Data that holds the Coach name (or null for the Default_Coach_Name), the equipped Coach color (or null for the Default_Coach_Color) and the list of equipped Accessories.
- **Equipped_Look**: The Coach color and the Accessories that the Site shows, resolved from the Coach_Customisation, the Unlock_Records and the Crypt_Content by the Look_Rule.
- **Look_Rule**: The pure function that turns stored choices into the Equipped_Look and drops anything unknown, locked or repeated.
- **Preview**: The Crypt_Screen's page-memory choice of Locked_Options to show on the Coach before Unlocking.
- **Shown_Look**: The look the Crypt_Screen's Coach shows: the Equipped_Look with the Preview applied.
- **Accessory_Asset**: The delivered GLB `public/assets/coach/coach_accessories.glb`, served at `/assets/coach/coach_accessories.glb`.
- **Accessory_Node**: A mesh node of the Accessory_Asset that is a direct child of the `head` joint: `accessory_glowing_eyes`, `accessory_witch_hat`, `accessory_witch_hat_on_pumpkin` or `accessory_pumpkin_head`.
- **Head_Joint**: The joint named `head` in every Coach_Asset.
- **Bone_Material**: The material named `CoachBone` in a Coach_Asset. It is the only material the Site tints.
- **Coach_Appearance**: The plain data the Viewer receives: the Bone_Material colour, the Accessory_Asset path, the Accessory_Nodes to show, every Accessory_Node used for framing, and whether to fetch the Accessory_Asset.
- **Node_Rule**: The pure function that turns a list of equipped Accessories into the Accessory_Nodes to show (the pumpkin head swaps the witch hat node and hides the glowing eyes).
- **Accessory_Envelope**: The bounds of the Coach with every Accessory_Node attached, over the Demo_Clip, used once for the camera framing.
- **Accessory_Note**: The short text the Viewer shows when the Accessory_Asset failed while an Accessory should show.
- **Still_Look_Note**: The short text shown beside the Still_Fallback when the Equipped_Look is not the default look.
- **Default_Coach_Name**: The Coach name used when none is stored: "Bones", from the Strings_Module.
- **Coach_Name_Rule**: The normalisation and the limits of a Coach name described under Interpretations made.
- **Browsing_Screens**: The Exercise list, Stretch list, Exercise_Detail_Screen and Stretch detail screens.
- **Read_Only_Bridge**: The files of `src/ui/progress/` that the Browsing_Screens may import: they read the Progress_Snapshot and call no operation that changes Progress_Data.
- **Crypt_Preview_Exercise**: The Exercise_Entry whose Demo_Clip the Crypt_Screen's Coach performs: Grave Rise.
- **Unlock_Helper**: The E2E support function `unlockOption(page, optionName)` that the golden-path test of ticket 14 will use.

## Requirements

### Requirement 1: Crypt_Content

**User Story:** As the Builder, I want the Coach colors, Accessories and prices as typed, validated content, so that prices stay tunable and bad content fails CI.

#### Acceptance Criteria

1. THE Catalog SHALL provide the Crypt_Content with six Coach_Color_Entries (Bone White, Grave Ash and Moonlight Blue with Price 0; Ember Orange, Slime Green and Witch Purple with Price 5) and three Accessory_Entries (glowing eyes with Price 10, witch hat with Price 15, pumpkin head with Price 40), in that order.
2. THE Catalog SHALL provide a `validateCryptContent` function that returns every broken rule of a Crypt_Content draft and an empty list for valid content.
3. THE `validateCryptContent` function SHALL report content that has fewer than 2 or more than 3 Free_Coach_Colors, not exactly one Default_Coach_Color, a Default_Coach_Color whose Price is not 0, an Option_Id that breaks the Option_Id format or repeats across all Crypt_Options, a Coach_Color_Entry Price that is not 0 and not a whole number from 1 to 999, or an Accessory_Entry Price that is not a whole number from 1 to 999.
4. THE `validateCryptContent` function SHALL report an Accessory_Entry whose Accessory_Node is empty, does not start with `accessory_` or repeats, a combination rule that names an unknown Accessory_Entry or itself, an Accessory_Asset path that is not a safe same-origin path under `/assets/`, and a Crypt_Preview_Exercise id that names no Exercise_Entry of Kind `exercise`.
5. THE Catalog SHALL hold no colour literal; each Coach_Color_Entry SHALL have a colour token in `src/ui/theme/tokens.ts`, and the Default_Coach_Color's token SHALL equal `#f5f0e3`, the Coach_Asset's own bone colour.
6. THE Crypt_Content SHALL name every Crypt_Option through a Strings_Module identifier, so that a missing name fails the Type_Check.
7. THE Unit_Suite SHALL validate the shipped Crypt_Content with `validateCryptContent` and SHALL check that the Welcome gift covers the witch hat's Price.

### Requirement 2: Progress_Data Schema_Version 3 and its migration

**User Story:** As a returning user, I want my Candy, history, Welcome gift and unfinished Workout to survive the update that adds the Crypt, so that the update costs me nothing.

#### Acceptance Criteria

1. THE Progress_Store SHALL write Progress_Data with the Schema_Version 3, an `unlocks` list of Unlock_Records and a `coach` member holding the Coach_Customisation, under the same Storage_Key and in one JSON text, with every Schema_Version 2 member kept.
2. WHEN the stored text is valid Progress_Data of Schema_Version 2, THE Progress_Store SHALL report the same Candy_Balance, Welcome gift flag, History_Entries and Stored_Checkpoint, no Unlock_Records and the default Coach_Customisation (no Coach name, no Coach color, no Accessories).
3. WHEN the stored text is valid Progress_Data of Schema_Version 1, THE Progress_Store SHALL migrate it through version 2 and report the same Candy_Balance, Welcome gift flag and History_Entries, a Stored_Checkpoint of null, no Unlock_Records and the default Coach_Customisation.
4. WHEN the stored text is of Schema_Version 1 or 2 and the Progress_Store is created, THE Progress_Store SHALL write nothing until a change is made, and THE first change SHALL write the whole Progress_Data with the Schema_Version 3.
5. IF the stored Schema_Version is greater than 3, THEN THE Progress_Store SHALL work in memory only, write nothing to the Storage_Adapter and set the Persistent_Flag to false.
6. IF stored Schema_Version 3 data lacks the `unlocks` member or the `coach` member, or its `unlocks` member is not a list of valid Unlock_Records with unique Option_Ids, THEN THE Progress_Store SHALL treat the text as no data, as it does for a damaged history.
7. IF a member of the stored Coach_Customisation is not valid (a Coach name that breaks the Coach_Name_Rule or is not already normalised, a Coach color that is not null and not an Option_Id, an Accessory list that is not a list of Option_Ids), THEN THE Progress_Store SHALL reset that member to its default and SHALL keep every other member of the Progress_Data.
8. WHEN the stored equipped Accessories hold an Option_Id more than once or an Option_Id without an Unlock_Record of kind `accessory`, THE Progress_Store SHALL report each such Accessory once or not at all, keeping only Unlocked Accessories in their stored order.
9. FOR ALL valid Schema_Version 1 and 2 data, parsing it SHALL give Schema_Version 3 data with the same `candy`, `welcomeGiftGranted`, `history` and `checkpoint` (null for version 1), `unlocks` of `[]` and the default Coach_Customisation (migration property).
10. FOR ALL valid Schema_Version 3 data, parsing the text that serialising produced SHALL give data equal to the original (round-trip property).

### Requirement 3: Unlock

**User Story:** As a user with enough Candy, I want to Unlock a Coach color or an Accessory, so that it is mine for good.

#### Acceptance Criteria

1. THE Progress_Store SHALL provide `unlock({ id, kind, price })`, where `kind` is `color` or `accessory`.
2. WHEN `unlock` receives a valid request whose Option_Id has no Unlock_Record and whose Price is at most the Candy_Balance, THE Progress_Store SHALL subtract the Price from the Candy_Balance, add an Unlock_Record with the Price as the Candy spent, equip the option (as the Coach color for kind `color`, appended to the equipped Accessories for kind `accessory`), write all of it with a single `setItem` call and report that it was Unlocked with the new Candy_Balance.
3. IF `unlock` receives a valid request whose Price is greater than the Candy_Balance, THEN THE Progress_Store SHALL change nothing, write nothing and report that it was not Unlocked because of insufficient Candy, with the Shortfall.
4. IF `unlock` receives a request whose Option_Id already has an Unlock_Record, THEN THE Progress_Store SHALL change nothing, write nothing, spend no Candy and report that it was already Unlocked.
5. IF `unlock` receives a request whose Option_Id breaks the Option_Id format, whose kind is not `color` or `accessory`, or whose Price is not a whole number from 1 to 999, THEN THE Progress_Store SHALL change nothing, write nothing and report that the request is invalid.
6. THE Progress_Store SHALL offer no operation that removes an Unlock_Record or returns spent Candy, so that every Unlock is permanent.
7. WHEN `unlock` is called, THE Progress_Store SHALL read the stored text again before deciding, so that two tabs never spend the same Candy twice.
8. WHILE the Progress_Store works in memory only, THE Progress_Store SHALL apply `unlock` in memory and keep the Persistent_Flag false, and WHILE the stored Schema_Version is greater than 3 it SHALL write nothing.

### Requirement 4: Equip and unequip

**User Story:** As a user, I want to equip and unequip what I own for free, so that I can change the Coach's look as often as I like.

#### Acceptance Criteria

1. THE Progress_Store SHALL provide `equipColor(id)` that takes an Option_Id or null (the Default_Coach_Color) and `setAccessoryEquipped(id, equipped)`.
2. WHEN `equipColor` receives null or an Option_Id that has no Unlock_Record of kind `accessory`, THE Progress_Store SHALL store it as the equipped Coach color, leave the Candy_Balance and the Unlock_Records unchanged and write with a single `setItem` call when the value changed.
3. IF `equipColor` receives a value that is not null and not an Option_Id, or an Option_Id whose Unlock_Record has kind `accessory`, THEN THE Progress_Store SHALL change nothing, write nothing and report that the request is invalid.
4. WHEN `setAccessoryEquipped(id, true)` receives an Option_Id with an Unlock_Record of kind `accessory` that is not equipped, THE Progress_Store SHALL append it to the equipped Accessories and write with a single `setItem` call, leaving the Candy_Balance unchanged.
5. IF `setAccessoryEquipped(id, true)` receives an Option_Id without an Unlock_Record of kind `accessory`, THEN THE Progress_Store SHALL change nothing, write nothing and report that the Accessory is locked.
6. WHEN `setAccessoryEquipped(id, false)` receives an equipped Accessory, THE Progress_Store SHALL remove it from the equipped Accessories and write with a single `setItem` call, leaving the Candy_Balance and the Unlock_Records unchanged.
7. WHEN an equip or unequip call would leave the Coach_Customisation unchanged, THE Progress_Store SHALL write nothing, call no listener and return the same Progress_Snapshot object as before.
8. WHEN a new Progress_Store is created over the same Storage_Adapter, THE Progress_Store SHALL report the same equipped Coach color and equipped Accessories as before the reload.

### Requirement 5: Coach name in the Progress_Store

**User Story:** As a user, I want to give my Coach a name for free and keep it, so that my Coach feels like mine.

#### Acceptance Criteria

1. THE Progress_Store SHALL provide a pure `normaliseCoachName(text)` that applies the Coach_Name_Rule and returns the normalised name, null for a text that is empty after normalisation, or `invalid`.
2. THE Coach_Name_Rule SHALL normalise a text to Unicode NFC, trim it, and turn every run of white space into one space, and SHALL accept the result only if it has 1 to 20 Unicode code points, holds only letters, combining marks, digits, spaces, hyphens, apostrophes (`'` and `’`) and full stops, and holds at least one letter or digit.
3. WHEN `setCoachName(text)` receives a text that normalises to a name or to null, THE Progress_Store SHALL store that value in the Coach_Customisation with a single `setItem` call when it changed, leave the Candy_Balance unchanged and report the stored value.
4. IF `setCoachName(text)` receives a text that the Coach_Name_Rule rejects, THEN THE Progress_Store SHALL change nothing, write nothing and report that the name is invalid.
5. THE Progress_Store SHALL store the Coach name as plain text and SHALL apply no HTML escaping, markup or encoding to it.
6. FOR ALL texts, `normaliseCoachName` SHALL be idempotent: applying it to its own non-null result SHALL return the same name (idempotence property).
7. FOR ALL texts that `normaliseCoachName` accepts, the result SHALL have 1 to 20 code points and SHALL contain no `<`, `>`, `&`, `"`, control character or line break (invariant property).

### Requirement 6: Candy invariant with Unlocks

**User Story:** As a user, I want my Candy_Balance to always add up, so that spending Candy is trustworthy.

#### Acceptance Criteria

1. THE Progress_Snapshot SHALL report the Candy_Balance, the Total_Candy_Earned, the Total_Candy_Spent, a copy of the Unlock_Records, and a copy of the Coach_Customisation as stored after the Progress_Store's own checks.
2. THE Progress_Snapshot SHALL report a Candy_Balance equal to 15 when the Welcome gift was granted and 0 otherwise, plus the Total_Candy_Earned, minus the Total_Candy_Spent.
3. THE Progress_Snapshot SHALL report the Total_Candy_Earned as the sum of `candyEarned` over the History_Entries only, so that spending Candy never lowers it and the History_Screen total keeps its meaning.
4. THE Progress_Store SHALL never report a Candy_Balance below 0.
5. WHEN `grantWelcomeGift`, `recordWorkout`, `finishWorkout`, `saveCheckpoint` or `clearCheckpoint` is called, THE Progress_Store SHALL keep the Unlock_Records and the Coach_Customisation unchanged.
6. FOR ALL sequences of grant, record, finish, save checkpoint, clear checkpoint, unlock, equip color, equip or unequip Accessory, set Coach name and reload operations, the invariant of Acceptance Criterion 2 SHALL hold after every step, every Option_Id SHALL have at most one Unlock_Record, the Unlock_Records SHALL only grow, every equipped Accessory SHALL have an Unlock_Record of kind `accessory`, and a new Progress_Store over the same Storage_Adapter SHALL report the same Progress_Snapshot (invariant property).
7. FOR ALL Progress_Data and FOR ALL Unlock requests whose Price is greater than the Candy_Balance, `unlock` SHALL leave the Progress_Snapshot equal to the one before and SHALL make no `setItem` call (error-condition property).

### Requirement 7: Equipped_Look and the Node_Rule

**User Story:** As the Builder, I want one pure rule that turns stored choices into the look, so that every Coach in the app looks the same and stale data never shows.

#### Acceptance Criteria

1. THE Look_Rule SHALL return the stored Coach color when it names a Coach_Color_Entry that is an Owned_Option, and the Default_Coach_Color otherwise.
2. THE Look_Rule SHALL return the stored equipped Accessories that name an Accessory_Entry with an Unlock_Record, each once, in Crypt_Content order.
3. THE Node_Rule SHALL return, for a list of Accessory_Entries, the Accessory_Node of each, except that WHILE the pumpkin head is in the list the witch hat SHALL use `accessory_witch_hat_on_pumpkin` and the glowing eyes SHALL have no node.
4. THE Coach_Appearance builder SHALL turn an Equipped_Look into the Bone_Material colour from the Coach color's token, the Accessory_Asset path from the Crypt_Content, the Accessory_Nodes from the Node_Rule and the list of every Accessory_Node of the Crypt_Content for framing.
5. FOR ALL stored Coach_Customisations and Unlock_Records, the Look_Rule SHALL return a known Owned_Option as the Coach color and a duplicate-free list of Unlocked Accessories (invariant property).
6. FOR ALL lists of Accessory_Entries, the Node_Rule SHALL return no Accessory_Node twice, never both witch hat nodes, `accessory_glowing_eyes` only when the glowing eyes are in the list and the pumpkin head is not, and `accessory_pumpkin_head` exactly when the pumpkin head is in the list (invariant property).

### Requirement 8: Viewer tint and Accessories

**User Story:** As a user, I want the 3D Coach to wear my Coach color and Accessories, so that the Coach I customised is the one that demonstrates.

#### Acceptance Criteria

1. THE Viewer SHALL accept an optional Coach_Appearance; without one it SHALL show the Coach as before this ticket and SHALL not fetch the Accessory_Asset.
2. WHEN the Coach is mounted, THE Viewer SHALL set the colour of every Bone_Material of the Coach to the Coach_Appearance's colour and SHALL change no other material, so that `CoachSocket`, `CoachGlow` and `CoachAccessory` keep their own colours.
3. WHEN the Coach_Appearance asks for Accessories or for the Accessory_Asset, THE Viewer SHALL fetch the Accessory_Asset from its same-origin path with GET in parallel with the Coach_Asset, at most once per load attempt, and SHALL request no decoder.
4. WHEN both the Coach and the Accessory_Asset are parsed, THE Viewer SHALL add a clone of each Accessory_Node that exists in the Accessory_Asset to the Head_Joint of the Coach with the node's own local transform, so that each Accessory follows every Demo_Clip.
5. THE Viewer SHALL show exactly the Accessory_Nodes the Coach_Appearance names and hide the other attached Accessory_Nodes.
6. WHEN the Accessory_Nodes are first attached, THE Viewer SHALL widen the camera framing once to the Accessory_Envelope, re-clamp the camera so that the camera stays outside the Accessory_Envelope plus the existing clearance, and re-fit the camera when it is at a Camera_Preset, as it does after a resize.
7. WHEN the Coach_Appearance changes after the Coach is shown, THE Viewer SHALL apply the new colour and Accessory_Nodes without reloading the Coach_Asset, without moving the camera and without restarting the Demo_Clip.
8. WHEN the Coach_Appearance changes while the Viewer is visible, THE Viewer SHALL draw one frame to show the change, even while the Demo_Clip is paused or held; WHILE the Viewer is hidden or scrolled away, THE Viewer SHALL draw no frame and SHALL show the change when it becomes visible.
9. THE Viewer SHALL expose on the Viewer_Area the colour it applied, the Accessory_Nodes it shows and the state of the Accessory_Asset (`none`, `loading`, `ready` or `failed`) as data attributes.
10. THE Viewer SHALL dispose the Accessory clones and the parsed Accessory_Asset when its load attempt ends, as it does for the Coach.
11. THE Viewer SHALL take the Accessory_Asset path and every Accessory_Node name from the Coach_Appearance and SHALL hold no asset path or node name of its own.
12. FOR ALL motion bounds and FOR ALL Accessory_Envelopes, the framing with the Accessory_Envelope SHALL have a minimum Camera_Distance at least the minimum Camera_Distance without it, and every camera position the controller allows afterwards SHALL be outside the Accessory_Envelope enlarged by the clearance (metamorphic property).

### Requirement 9: Budget and render loop with Accessories

**User Story:** As a user on a phone, I want the Accessories to cost no battery while nothing moves, so that the Crypt stays light.

#### Acceptance Criteria

1. THE Unit_Suite SHALL check that the Accessory_Asset is a glTF 2.0 binary that needs no decoder and that each of the four Accessory_Nodes is a mesh node and a direct child of a node named `head`.
2. THE Unit_Suite SHALL check that every Coach_Asset with all Accessory_Nodes plus the Graveyard_Scene stays within 35,000 triangles, and that the Coach_Asset's materials plus the Accessory_Nodes' materials number at most 4.
3. WHILE the Viewer is paused, held, hidden or scrolled away, THE Render_Loop SHALL stay stopped after a Coach_Appearance change, apart from the one frame of Requirement 8.8.
4. THE Viewer SHALL turn on no shadows and no post-processing for the Accessories.

### Requirement 10: Accessory failure and fallbacks

**User Story:** As a user on a bad connection, I want the Coach to work even if the Accessories do not load, so that a missing hat never costs me the demonstration.

#### Acceptance Criteria

1. IF the Accessory_Asset fails to download or to parse, THEN THE Viewer SHALL keep the Coach and its controls working, with the Bone_Material colour applied and no Accessory, and SHALL set the Accessory_Asset state to `failed`.
2. IF the Accessory_Asset lacks an Accessory_Node or the Coach lacks a Head_Joint, THEN THE Viewer SHALL show every other Accessory_Node it can attach and SHALL set the Accessory_Asset state to `failed`.
3. WHILE the Accessory_Asset state is `failed` and the Coach_Appearance names at least one Accessory_Node, THE Viewer SHALL show the Accessory_Note.
4. THE Viewer SHALL show the Coach as ready when the Coach_Asset is ready, whatever the state of the Accessory_Asset.
5. WHILE the Viewer shows the Still_Fallback and the Coach_Appearance is not the default look, THE Viewer SHALL show the Still_Look_Note, which says the pictures show the Coach without its Coach color and Accessories.
6. WHEN the user presses Retry, THE Viewer SHALL fetch the Coach_Asset and, when wanted, the Accessory_Asset again.

### Requirement 11: The Crypt_Screen

**User Story:** As a user, I want one screen that shows my Coach, my Candy and every Coach color and Accessory with its price, so that I know what I have and what I can Unlock.

#### Acceptance Criteria

1. THE Site SHALL serve the Crypt_Screen at `/crypt` as a prerendered page with one `h1` showing the Crypt Section name and SHALL stop showing a Placeholder_Screen there.
2. WHILE the Crypt_Screen has not read the Progress_Snapshot, THE Crypt_Screen SHALL show a loading text and no Candy_Balance, Viewer or option control.
3. WHEN the Crypt_Screen mounts, THE Crypt_Screen SHALL grant the Welcome gift if it was not granted yet, as the Home_Screen does.
4. WHEN the Crypt_Screen has read the Progress_Snapshot, THE Crypt_Screen SHALL show the Candy_Balance, a Viewer with the Crypt_Preview_Exercise and the Shown_Look, the Coach name section, the Coach colors list and the Accessories list, and a link back to the Home_Screen.
5. THE Crypt_Screen SHALL show each Crypt_Option with its name and one state: `Free` for a Free_Coach_Color, `Unlocked` for an Owned_Option with an Unlock_Record, or its Price in Candy for a Locked_Option, and SHALL mark the equipped Coach color and the equipped Accessories as equipped.
6. WHILE the pumpkin head and the glowing eyes are both equipped or shown, THE Crypt_Screen SHALL show next to the glowing eyes a text that says they are hidden under the pumpkin head.
7. WHILE the Persistent_Flag is false, THE Crypt_Screen SHALL show the existing text that this browser cannot keep the Candy.
8. THE Crypt_Screen SHALL show the Candy_Balance in a polite live region, so that a change after an Unlock is announced.

### Requirement 12: Preview before Unlocking

**User Story:** As a user, I want to try a Locked Coach color or Accessory on the 3D Coach before I spend Candy, so that I only Unlock what I like.

#### Acceptance Criteria

1. THE Crypt_Screen SHALL give every Locked_Option a Preview toggle button whose pressed state shows whether the option is in the Preview.
2. WHEN the user turns on the Preview of a Locked Coach color, THE Crypt_Screen SHALL show that Coach color on its Coach in place of the equipped Coach color and SHALL turn off the Preview of any other Coach color.
3. WHEN the user turns on the Preview of a Locked Accessory, THE Crypt_Screen SHALL show that Accessory on its Coach together with the equipped Accessories, following the Node_Rule.
4. WHEN the user turns off a Preview, or presses the control that ends every Preview, THE Crypt_Screen SHALL show the Equipped_Look for that option again.
5. WHILE a Preview is on, THE Crypt_Screen SHALL show a text that says the Coach is previewing and nothing is kept until it is Unlocked, and a control that ends every Preview.
6. THE Crypt_Screen SHALL keep the Preview in page memory only; a Preview SHALL make no Progress_Store call and no browser-storage write, and SHALL change the Coach of no other screen.
7. WHEN the Crypt_Screen is reloaded or opened again, THE Crypt_Screen SHALL show the Equipped_Look with no Preview.
8. FOR ALL Equipped_Looks and FOR ALL sequences of Preview actions, the Shown_Look SHALL equal the Equipped_Look when the Preview is empty, SHALL hold at most one Coach color, and SHALL differ from the Equipped_Look only by Locked_Options in the Preview (invariant property).

### Requirement 13: Unlock on the Crypt_Screen

**User Story:** As a user, I want an Unlock button that tells me the price, or exactly how much more Candy I need, so that I am never surprised.

#### Acceptance Criteria

1. THE Crypt_Screen SHALL give every Locked_Option an Unlock button labelled with the option name and its Price.
2. WHILE the Candy_Balance is at least the Price of a Locked_Option, THE Crypt_Screen SHALL enable its Unlock button.
3. WHILE the Candy_Balance is below the Price of a Locked_Option, THE Crypt_Screen SHALL disable its Unlock button and show next to it the Shortfall as a text that says how many more Candy are needed, linked to the button as its description.
4. WHEN the user presses an enabled Unlock button, THE Crypt_Screen SHALL call `unlock` once with the option's Option_Id, kind and Price from the Crypt_Content, end the Preview of that option, and announce the Unlock and the new Candy_Balance.
5. IF `unlock` reports insufficient Candy, THEN THE Crypt_Screen SHALL announce the Shortfall and show the unchanged Candy_Balance.
6. WHEN an Unlock succeeds, THE Crypt_Screen SHALL show the option as `Unlocked` and equipped, and every Unlock button whose Price is now above the Candy_Balance SHALL become disabled with its Shortfall.
7. FOR ALL Candy_Balances and Prices, the Unlock button SHALL be enabled exactly when the option is a Locked_Option and the Price is at most the Candy_Balance, and the Shortfall shown SHALL equal the Price minus the Candy_Balance (invariant property).

### Requirement 14: Equip and unequip on the Crypt_Screen

**User Story:** As a user, I want to switch between what I own with one tap and have it stay, so that my Coach looks the way I left it.

#### Acceptance Criteria

1. THE Crypt_Screen SHALL give every Owned_Option an Equip toggle button whose pressed state shows whether the option is equipped.
2. WHEN the user presses the Equip button of an Owned Coach color that is not equipped, THE Crypt_Screen SHALL call `equipColor` with its Option_Id, or with null for the Default_Coach_Color, and SHALL show it as the only equipped Coach color.
3. WHEN the user presses the Equip button of the equipped Coach color, THE Crypt_Screen SHALL keep it equipped, because the Coach always has one Coach color.
4. WHEN the user presses the Equip button of an Unlocked Accessory, THE Crypt_Screen SHALL call `setAccessoryEquipped` with the opposite of its equipped state.
5. THE Crypt_Screen SHALL change the Candy_Balance on no equip or unequip, and SHALL show the Free_Coach_Colors as equippable from the first visit, with no Candy.
6. WHEN the page is reloaded after an equip or unequip, THE Crypt_Screen SHALL show the same Equipped_Look.

### Requirement 15: Coach name on the Crypt_Screen

**User Story:** As a user, I want to type my Coach's name and save it for free, so that the Coach greets me by the name I chose.

#### Acceptance Criteria

1. THE Crypt_Screen SHALL show a labelled text field with the current Coach name (empty for the Default_Coach_Name), a hint that states the Coach_Name_Rule and that naming is free, and a save button.
2. WHEN the user presses the save button or Enter in the field, THE Crypt_Screen SHALL call `setCoachName` once with the field's text.
3. WHEN `setCoachName` reports the stored value, THE Crypt_Screen SHALL show the normalised name in the field and announce the Coach's new name, or the Default_Coach_Name for null.
4. IF the field's text breaks the Coach_Name_Rule, THEN THE Crypt_Screen SHALL show a message that states the rule, mark the field invalid with that message as its description, keep the stored Coach name and change no Candy.
5. THE Crypt_Screen SHALL render the Coach name only as text, never as markup.

### Requirement 16: The Equipped_Look on every Coach

**User Story:** As a user, I want the Coach on every screen to wear what I equipped, so that the Coach is always mine.

#### Acceptance Criteria

1. WHEN an Exercise_Detail_Screen or a Stretch detail screen has read the Progress_Snapshot, THE screen SHALL show its Coach with the Coach_Appearance of the Equipped_Look.
2. WHEN the Workout_Screen shows the Coach, THE Recording_Bridge SHALL pass the Coach_Appearance of the Equipped_Look to the Workout_Screen, and THE Workout_Screen SHALL pass it to its Viewer.
3. WHILE a screen has not read the Progress_Snapshot, THE screen SHALL give its Viewer the default Coach_Appearance, so that the server HTML and the first client render match.
4. THE Exercise_Detail_Screen, the Stretch detail screens and the Workout_Screen SHALL fetch the Accessory_Asset only when the Equipped_Look has at least one Accessory.
5. THE Workout_Screen SHALL keep the Coach_Hold, the Viewer speeds and the Workout timing exactly as before; a Coach_Appearance SHALL not affect Workout time.

### Requirement 17: Coach name in the Safety_Message

**User Story:** As a user, I want the Coach to speak with the name I gave it, without ever claiming it can check my form, so that the warning stays honest and personal.

#### Acceptance Criteria

1. THE Strings_Module SHALL hold the Safety_Message as a template with one `{coach}` placeholder, and the Default_Coach_Name as its own string.
2. THE Safety_Message SHALL still say that the Coach demonstrates every Exercise, cannot see the user and cannot check the user's form, and SHALL claim nothing about correct form.
3. WHEN the Exercise_Detail_Screen, a Stretch detail screen, the Preparing_Panel or the Set_Panel shows the Safety_Message, THE screen SHALL fill `{coach}` with the stored Coach name, or with the Default_Coach_Name when none is stored or the Progress_Snapshot is not read yet.
4. THE server-rendered HTML of the Exercise_Detail_Screen and the Stretch detail screens SHALL contain the Safety_Message with the Default_Coach_Name, so that the message is present without JavaScript.
5. THE Site SHALL insert the Coach name into the Safety_Message as plain text, so that a Coach name can never add markup.

### Requirement 18: Browsing reads the look and stores nothing

**User Story:** As the Builder, I want the browsing screens to read the look without ever writing, so that "viewing earns nothing and stores nothing" stays provable after this change.

#### Acceptance Criteria

1. THE Browsing_Screens SHALL reach the Progress_Store only through the Read_Only_Bridge and SHALL import nothing else from `src/ui/progress/` or `src/progress-store/`.
2. THE Read_Only_Bridge SHALL read the Progress_Snapshot and subscribe to it, and SHALL call no `grantWelcomeGift`, `recordWorkout`, `finishWorkout`, `saveCheckpoint`, `clearCheckpoint`, `unlock`, `equipColor`, `setAccessoryEquipped` or `setCoachName`, and SHALL not import `useProgress`.
3. WHEN a visitor with empty browser storage opens only the Browsing_Screens and uses their Viewers, THE Site SHALL leave `localStorage`, `sessionStorage`, IndexedDB and cookies empty, and `tests/e2e/viewing-earns-nothing.spec.ts` SHALL pass without a change.
4. WHEN a visitor with stored Progress_Data opens only the Browsing_Screens, THE Site SHALL leave the stored text byte-identical and grant no Welcome gift.
5. THE `tests/unit/viewing-earns-nothing.test.ts` scan SHALL state the new rule in its header, SHALL still forbid imports of the Progress_Store folder and the Workout_Engine from the scanned folders, and SHALL forbid every import into `src/ui/progress/` except the Read_Only_Bridge entry files, with a fixture that must be flagged and one that must pass.
6. THE Unit_Suite SHALL scan the Read_Only_Bridge files for the forbidden calls and imports of Acceptance Criterion 2, with a fixture that must be flagged and one that must pass.

### Requirement 19: The last Placeholder_Screen goes

**User Story:** As the Builder, I want the Placeholder machinery removed once no Section uses it, so that no dead code or vacuous test remains.

#### Acceptance Criteria

1. THE Site SHALL serve a real screen for every Section, and THE `src/ui/sections.ts` module SHALL no longer export `placeholderSectionIds`, `PlaceholderSectionId`, `ListSectionId` or `sectionMessage`.
2. THE Repository SHALL no longer hold `src/ui/placeholder/` or the string `section.crypt.message`.
3. WHEN a test or E2E support file iterated over the Placeholder Sections, THE file SHALL be changed to check that every Section has a name and a title and serves its own screen, and SHALL not keep a check that passes over an empty list.
4. THE Home_Screen SHALL keep its Navigation_Entry to the Crypt in the same position.

### Requirement 20: Strings and wording

**User Story:** As the Builder, I want every new text in the Strings_Module and in the glossary's terms, so that Thai can be added later and the wording stays honest.

#### Acceptance Criteria

1. THE Strings_Module SHALL hold every text of this ticket: the Crypt_Screen texts, the Coach color and Accessory names, the Default_Coach_Name, the Coach name rule hint and messages, the Preview, Unlock, Shortfall and equip labels and announcements, the Accessory_Note, the Still_Look_Note and the new Safety_Message template.
2. THE new strings SHALL use the terms Coach, Coach name, Coach color, Accessory, Unlock, Candy and Crypt, and SHALL NOT use avatar, trainer, model, character, item, cosmetic, skin, buy, purchase, points, coins, score, XP or session.
3. THE new strings SHALL NOT imply that the app checked or approved the user's form, and SHALL NOT shame the user for having too little Candy.
4. THE new `viewer.` and `safety.` strings SHALL NOT mention Candy or a reward, and THE `safety.` strings SHALL NOT say the Candy was saved, kept, stored or added to a balance.
5. THE new template strings SHALL be listed with their placeholders in `tests/unit/strings-format.test.ts`.

### Requirement 21: Accessibility and layout

**User Story:** As a user on a phone with large text or a screen reader, I want every Crypt control to be labelled, reachable and large, so that I can customise my Coach without sight of the screen.

#### Acceptance Criteria

1. THE Crypt_Screen SHALL use one labelled `section` per group (Coach name, Coach colors, Accessories), each labelled by its heading, and SHALL list the options of a group in a list.
2. THE Crypt_Screen SHALL label every button with text that names the option and the action, and SHALL convey equipped, previewed, locked and Price states in text, never by colour alone.
3. THE Crypt_Screen's buttons and text field SHALL be at least `3rem` tall.
4. THE Crypt_Screen SHALL reflow with no horizontal scroll and no clipped text at 320 CSS pixels wide and at 200% text size.
5. THE Crypt_Screen SHALL use design tokens for every colour, including the Coach color swatches, and SHALL add no animation or transition.
6. WHILE the Reduced_Motion_Preference is on, THE Crypt_Screen's Coach SHALL start paused, as every Viewer does.
7. THE Crypt_Screen SHALL announce the result of every Unlock, equip, unequip and Coach name save in one polite live region.

### Requirement 22: Static build, hydration and no backend

**User Story:** As the Builder, I want the Crypt to stay a static page that reads storage only in the browser, so that it deploys to Vercel unchanged.

#### Acceptance Criteria

1. THE Site SHALL keep every page statically prerendered, including `/crypt`.
2. THE Progress_Store SHALL be created and read only in the browser, after the first client render, on every screen this ticket touches.
3. THE server-rendered HTML of `/crypt` SHALL contain the `h1` and the loading text and no Candy_Balance or option state.
4. WHEN a page this ticket touches hydrates, THE page SHALL replace its first render without a hydration warning in the browser console.
5. WHEN any screen of the Site has run, THE Site SHALL hold at most one `localStorage` key, the Storage_Key, and nothing in `sessionStorage`, IndexedDB or cookies.
6. THE Site SHALL send no network request other than GET or HEAD to its own origin, SHALL set no cookie, and SHALL need no environment variable, server code or API route for this ticket.

### Requirement 23: Tests, earlier specs and repository rules

**User Story:** As the Builder, I want tests that protect each rule of this ticket and earlier tests that stay honest, so that a regression fails the build.

#### Acceptance Criteria

1. THE Unit_Suite SHALL contain Vitest tests, with an in-memory Storage_Adapter and no real time, for: an Unlock rejected on insufficient Candy with the Candy_Balance and the stored text unchanged; Unlocks persisting across a new Progress_Store over the same storage; equip and unequip persisting; the migration from versions 1 and 2; the Candy invariant; the Coach_Name_Rule; the Look_Rule and the Node_Rule; the Preview and Unlock-button rules; the framing with the Accessory_Envelope; and the Crypt_Content validation.
2. THE property tests SHALL use `fast-check` with `numRuns` of 200 and a tag comment `// Feature: the-crypt, Property N: …`.
3. THE E2E_Suite SHALL contain a spec for the ticket's acceptance path: a first visit to the Crypt grants the Welcome gift; Free_Coach_Colors equip with no Candy; Locked_Options show their Price; a Preview changes the Crypt's Coach but not the stored text, and a reload drops it; Unlocking the witch hat with the Welcome gift spends 15 Candy and equips it, and it stays after a reload; a disabled Unlock button shows its Shortfall; equip and unequip persist across a reload; an Exercise page, a Stretch page and a Workout show the Equipped_Look and the Coach name in the Safety_Message; a blocked Accessory_Asset leaves the Coach working with the Accessory_Note.
4. THE E2E support SHALL provide the Unlock_Helper, which finds an option by its Strings_Module name and presses its Unlock button.
5. WHEN a test of an earlier spec asserts Schema_Version 2 in stored text, seeds version 3 as the newer case, writes version 2 or 3 text without the members of this ticket, compares the Safety_Message with the text without a Coach name, or expects a Placeholder_Screen at `/crypt`, THE test SHALL be changed to the new rule (Schema_Version 3, version 4 is the newer case, full version 3 text, the Safety_Message with the Default_Coach_Name, the Crypt_Screen) and SHALL NOT be weakened in any other way.
6. THE `.kiro/steering/structure.md` file SHALL mention this ticket in "Current state", and `tests/unit/repository-rules.test.ts` SHALL pass.
7. THE Type_Check (`npx tsc --noEmit`), THE Unit_Suite, THE Build and THE E2E_Suite SHALL pass with no test skipped.
