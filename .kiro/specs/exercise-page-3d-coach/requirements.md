# Requirements Document

## Introduction

This spec covers ticket `03-exercise-page-3d-coach` of the Spooky Coach MVP (`.scratch/spooky-coach-mvp/issues/03-exercise-page-3d-coach.md`). From the Home_Screen the user opens Exercises, taps Grave Rise, and sees the skeleton Coach squatting in a small graveyard with a moon and fog. The user can drag to rotate the Coach 360°, jump to Front, Side and Back views, zoom within limits, play and pause, and switch speed between 0.5×, 0.75× and 1×. The page also shows the spooky name, real name, difficulty, muscle groups, 3–5 instruction steps, cues, safety notes and the Safety_Message in the Coach's voice. This page is where the Nov 13 squat check (ADR 0003) is judged on a real phone.

The ticket replaces the `/exercises` Placeholder_Screen from ticket 01 with the Exercise_List_Screen, adds the Exercise_Detail_Screen, and creates the first two modules from the steering's proposed layout: the Catalog (`src/catalog/`) and the Viewer (`src/viewer/`).

Constraints from the ADRs and steering:

- ADR 0001: a website, not a native app. Phone-first layout that also looks good on a laptop.
- ADR 0002: no backend. Every request goes to the Site's own origin. This ticket stores nothing in browser storage.
- ADR 0003: the Coach is an original GLB under the repo's MIT license. Never Mixamo. CC0 assets are the only fallback. Gate: by Fri 2026-11-13 one squat animation on the Coach must load in the browser, rotate and look right; otherwise switch to CC0 assets.
- ADR 0004: app code (this spec) consumes GLB files and still images; it does not author or edit them. The Asset_Pipeline (Claude Code with Blender) produces them.
- Steering budget: ≤35k triangles, ≤4 materials, textures ≤1024², no real-time shadows, no post-processing.
- Steering: every user-facing string comes from the Strings_Module. The glossary "Avoid" words check from ticket 01 applies to every new string, which rules out words such as "pose", "move", "model", "status", "result" and "training" in UI text.
- The agent never runs the dev server. Shell is PowerShell on Windows.

### Scope

In scope: the Catalog with one Exercise (Grave Rise), the Exercise_List_Screen, the Exercise_Detail_Screen for Grave Rise, the Viewer with the Graveyard_Scene, camera controls, playback controls, Loading_State, Slow_Load_Notice and Still_Fallback, reduced-motion behaviour of the Viewer, the tests that guard these, updates to ticket 01 tests and repository rules that this ticket invalidates, and the human Real_Phone_Check.

Out of scope, with the ticket that covers it:

- Skeleton Jacks, Coffin Push, the Stretches, the Routine "Graveyard Shift", Routine-level Catalog rules and the Stretches section (ticket 05). The `/stretches` Placeholder_Screen stays.
- Camera reset when switching between Exercises (ticket 05; only one Exercise exists here).
- Equipped Coach color and Accessories in the Viewer (tickets 10 and 11). The Coach shows its default look.
- Workouts, Candy and the Progress store (tickets 06–09). Viewing an Exercise earns no Candy because no Candy logic exists yet.
- The full accessibility pass with VoiceOver or TalkBack on a real phone (ticket 13). This ticket builds the Viewer to the accessibility rules from the steering so ticket 13 only verifies.
- Producing or editing the Coach_Asset or the Still_Images (Asset_Pipeline, ADR 0004).

### Repository state at spec time

Checked on `main` at commit `409beca`:

- Ticket 01 is complete (48 of 48 tasks checked). `src/ui/strings.ts` (Strings_Module with `t()` and `defineLocale`), `src/ui/sections.ts`, `src/ui/metadata.ts`, `src/ui/theme/tokens.ts`, `SiteFrame`, `PlaceholderScreen` and the Decorations exist. `/exercises` renders `PlaceholderScreen`.
- Dependencies: Next.js 16.4.5, React 19.3.1, TypeScript 6.0.3, Vitest 5.1.0 (node environment), Playwright 1.65.0 (Chromium; `phone` 360 × 640 and `laptop` 1440 × 900 projects; production build on port 3100), fast-check 4.10.2. All versions are pinned exactly. No 3D library is installed.
- Ticket 01 tests that this ticket invalidates or extends:
  - `tests/e2e/navigation.spec.ts` expects `/exercises` to show a Placeholder_Screen with `section.exercises.message`.
  - `tests/unit/strings.test.ts` checks the Placeholder_Screen message length for all five Sections, including Exercises.
  - `tests/e2e/static-build.spec.ts` requires every App Router route to be prerendered and `prerender-manifest.json` to list no dynamic routes.
  - `tests/e2e/no-backend.spec.ts`, `layout.spec.ts`, `theme.spec.ts` and `decorations.spec.ts` iterate a fixed list of screens that does not yet contain the Exercise_Detail_Screen.
  - `tests/unit/repository-rules.test.ts` fails for any file under `src/` outside `src/app/`, `src/ui/` and `src/types/next.d.ts`, so `src/catalog/` and `src/viewer/` need the rule updated.
  - `tests/unit/source-rules.test.ts` fails on any colour literal outside `src/ui/theme/tokens.ts`, so Graveyard_Scene colours (moon, fog, ground) must come from the tokens.
- Ticket 02 asset: `assets/coach/coach_grave_rise.glb` (2,864 triangles, 2 materials, no textures, 0.29 MB, 22 joints, one clip `demo_loop` at 30 fps lasting 2.27 s, Coach faces the glTF forward axis +Z). Built by `assets/coach/build_coach.py`, checked by `assets/coach/verify_coach.py`. Ticket 02 status is `ready-for-human`: the glTF-viewer check by eye is still open.
- `assets/` is **untracked** in git, although ticket 02 requires the Blender source to be kept in the repo. `assets/coach/coach_grave_rise.blend1` is a Blender backup file that should not be committed.
- A stray untracked folder named literally `[render_dir]/` holds 16 preview PNGs (360 × 480, about 190 KB each, front/side/back/three-quarter at four frames). It was created by running `verify_coach.py` with the usage placeholder as the output path. The tech and structure steering say runtime GLBs load from `public/assets/`, which does not exist yet.

### Open decisions for the user

These are flagged rather than decided. Each lists the option the requirements are written for; the affected criteria are named so they can be adjusted.

1. **How the Coach_Asset and the Still_Images reach `public/assets/`.** App-code tasks consume GLBs but must not author or edit them (ADR 0004).
   - **Option A (recommended, assumed below):** the Asset_Pipeline delivers the files. Claude Code exports or copies `coach_grave_rise.glb` to `public/assets/coach/coach_grave_rise.glb` and renders the front, side and back Still_Images into `public/assets/coach/stills/`, and both are committed. `assets/coach/` keeps the sources (`.blend`, scripts). App tasks only reference the paths. Requirement 13 is written for this option.
   - **Option B:** an app-side build step copies the files from `assets/coach/` into `public/` before `next build`. No asset is duplicated in git, but the Build gains a copy script that Vercel must run.
   - **Option C (not recommended):** move `assets/coach/` into `public/`. Everything under `public/` is served, so the `.blend` file and Python scripts would become public downloads.
   - Related housekeeping for the user: commit `assets/coach/` (ticket 02 requires it), gitignore `*.blend1`, and delete the stray `[render_dir]/` folder once the Still_Images are delivered.
2. **How much Catalog validation this ticket builds.** The tech steering says the Catalog exposes a validation function; ticket 05 holds the "Catalog validation test checks all shipped content" box.
   - **Option A (recommended, assumed below):** this ticket creates the validation function with the Exercise-level rules (target is reps or seconds, not both, value > 0; 3–5 instruction steps; required fields present; asset references present) and the one test over shipped content. Ticket 05 adds the Routine rules (Sets 1–10, rest 0–600 s, Cool-down). Requirement 2 is written for this option.
   - **Option B:** Grave Rise data only, with no validation until ticket 05. Requirement 2 would be dropped.
3. **Buttons for tilting the camera.** The steering says every Viewer gesture has a button. A vertical drag tilts the camera (pitch).
   - **Option A (recommended, assumed below):** a compact control pad with Rotate left, Rotate right, Tilt up, Tilt down, Zoom in and Zoom out buttons, next to the Front, Side and Back presets. Full button parity. Requirements 7.5 and 7.9 are written for this option.
   - **Option B:** Rotate and Zoom buttons only; the Camera_Presets reset the tilt. Fewer buttons on a small screen, but a button-only user cannot reach a raised view.
4. **Where the graveyard scenery comes from.**
   - **Option A (recommended, assumed below):** the Graveyard_Scene (ground, a few gravestones, moon, fog) is built in app code from simple shapes, so no new asset is needed before the Nov 13 check.
   - **Option B:** the Asset_Pipeline makes a scenery GLB in Blender. It may look better, but it is a new asset task under ADR 0004 and must land before the Nov 13 check.
5. **Glossary gaps.** `spec.md` and the tickets use *difficulty*, *muscle group*, *instruction step*, *cue*, *safety note* and *safety message*, but `CONTEXT.md` does not define them. This spec defines them in its own glossary (below) without inventing synonyms. The user may want to add them to `CONTEXT.md`. The difficulty scale is also undefined; this spec assumes three levels, Beginner, Intermediate and Advanced, with Grave Rise at Beginner (tunable content).

### Interpretations made

- "Hidden" in "the render loop stops while paused or when the page is hidden" is read as: the page is hidden (another tab, minimised window, locked phone) **or** the Viewer is scrolled fully out of view. Both stop rendering (Requirement 10). The second part can be dropped if the user prefers the narrower reading.
- Reduced-motion behaviour of the Viewer (Coach starts paused, no automatic camera motion) is built here because the steering places it in the Viewer module. Ticket 13 verifies it on a real phone.
- Safety notes are shown on the Exercise_Detail_Screen because the glossary defines an Exercise as a movement "with instructions and safety notes", and user story 10 lists them next to the Coach.

## Glossary

- **Site**: The Spooky Coach Next.js website in this repository, as defined in the `spooky-site-skeleton` spec.
- **Home_Screen**, **Placeholder_Screen**, **Halloween_Theme**, **Decoration**, **Strings_Module**, **Locale**, **Repository**, **Production_Branch**, **Build**, **Type_Check**, **Unit_Suite**, **E2E_Suite**, **Phone_Viewport**, **Laptop_Viewport**, **Live_URL**: As defined in the `spooky-site-skeleton` spec. The Phone_Viewport is 360 × 640 CSS px portrait; the Laptop_Viewport is 1440 × 900 CSS px.
- **Coach**: The single 3D skeleton character that demonstrates every Exercise (CONTEXT.md).
- **Exercise**: One movement with instructions and safety notes; its target is reps or seconds, never both (CONTEXT.md).
- **Catalog**: The module under `src/catalog/` that holds static, typed, read-only content for Exercises (and, from ticket 05, Stretches and Routines) and exposes a validation function.
- **Exercise_Entry**: The Catalog record of one Exercise: identifier, URL slug, Strings_Module identifiers for its texts, Difficulty, Muscle_Groups, target, Coach_Asset reference, Demo_Clip name and Still_Image references.
- **Spooky_Name**: The themed name of an Exercise shown to the user, for example "Grave Rise".
- **Real_Name**: The everyday name of an Exercise, for example "Air squat".
- **Difficulty**: One of three levels, Beginner, Intermediate or Advanced, assigned to each Exercise.
- **Muscle_Group**: A body area an Exercise mainly works, for example quads or glutes. Each Exercise lists one or more.
- **Instruction_Step**: One numbered step of how to perform an Exercise. Each Exercise has 3 to 5.
- **Cue**: A short reminder of what to focus on while performing an Exercise, for example "Knees track over your toes".
- **Safety_Note**: An Exercise-specific caution, for example "Stop if your knees hurt".
- **Safety_Message**: The short, Exercise-independent message in the Coach's voice (first person) that says the Coach demonstrates but cannot see the user or check their form.
- **Exercise_List_Screen**: The screen at `/exercises` that lists every Exercise in the Catalog. Replaces the Exercises Placeholder_Screen.
- **Exercise_List_Entry**: One link on the Exercise_List_Screen that leads to one Exercise_Detail_Screen.
- **Exercise_Detail_Screen**: The screen at `/exercises/<slug>` that shows one Exercise's Viewer and written content. In this ticket only `/exercises/grave-rise` exists.
- **Written_Content**: The Spooky_Name, Real_Name, Difficulty, Muscle_Groups, Instruction_Steps, Cues and Safety_Notes of an Exercise as shown on its Exercise_Detail_Screen.
- **Viewer**: The module under `src/viewer/` and the area of the Exercise_Detail_Screen that shows the Coach in the Graveyard_Scene with its camera and playback controls.
- **Viewer_Area**: The rectangle of the Exercise_Detail_Screen in which the Viewer draws the 3D scene, the Loading_State or the Still_Fallback.
- **Graveyard_Scene**: The 3D scene the Viewer draws around the Coach: a ground, gravestones, a moon and fog.
- **Coach_Asset**: A GLB file produced by the Asset_Pipeline that contains the Coach rig, its mesh and one Demo_Clip. For Grave Rise: `coach_grave_rise.glb`.
- **Demo_Clip**: The in-place looping animation clip in a Coach_Asset that the Viewer plays, named by the Exercise_Entry (`demo_loop` for Grave Rise).
- **Still_Image**: A still picture of the Coach performing an Exercise, rendered by the Asset_Pipeline from one Camera_Preset direction (front, side or back).
- **Still_Fallback**: The Viewer state that shows the Still_Images of the Exercise instead of the 3D scene, with a short message that the 3D Coach could not load.
- **Loading_State**: The themed Viewer state shown while the Coach_Asset is loading.
- **Slow_Load_Notice**: The "still loading" message and Retry button that the Viewer adds to the Loading_State after 10 seconds.
- **Orbit_Target**: The fixed point the camera always looks at: a point on the Coach's vertical axis at about half of the Coach's standing height.
- **Azimuth**: The camera's horizontal angle around the vertical axis through the Orbit_Target. 0° is the Front view.
- **Elevation**: The camera's angle above the horizontal plane through the Orbit_Target.
- **Camera_Distance**: The distance from the camera to the Orbit_Target.
- **Camera_Preset**: One of three fixed camera views: Front (looking at the Coach's front), Side (looking at the Coach's left side, matching the side Still_Image) and Back (looking at the Coach's back).
- **Camera_Controls**: The Viewer buttons that change the camera: the Camera_Preset buttons and the rotate, tilt and zoom buttons.
- **Playback_Controls**: The Viewer's Play/Pause button and the three Playback_Speed buttons.
- **Playback_Speed**: The rate at which the Demo_Clip plays: 0.5×, 0.75× or 1× of its authored speed.
- **Render_Loop**: The Viewer's repeated drawing of frames of the 3D scene.
- **Page_Hidden**: The state in which the browser reports the document's visibility as hidden, for example another tab is active, the window is minimised or the phone is locked.
- **Reduced_Motion_Preference**: The operating system setting that the browser exposes as `prefers-reduced-motion: reduce`.
- **Builder**: The person who owns the Repository and performs the human steps in this spec. Not the same as a visitor of the Site.
- **Asset_Pipeline**: Claude Code with Blender (ADR 0004), which produces the Coach_Asset and the Still_Images outside app-code tasks.
- **Real_Phone_Check**: The human check, due by Fri 2026-11-13, that the Grave Rise Demo_Clip on the Coach loads on the Exercise_Detail_Screen on a real phone, rotates and looks right (ADR 0003 gate).
- **CC0_Fallback**: The switch, required by ADR 0003 if the Real_Phone_Check fails, from hand-made Coach_Assets to CC0-licensed assets. Never Mixamo.

## Requirements

### Requirement 1: Grave Rise in the Catalog

**User Story:** As the Builder, I want Grave Rise stored as typed Catalog content, so that the Exercise screens and later Routines read the same data and a CC0_Fallback needs only a content change.

#### Acceptance Criteria

1. THE Catalog SHALL contain exactly one Exercise_Entry in this ticket, for Grave Rise, with the slug `grave-rise`, the Spooky_Name "Grave Rise", the Real_Name "Air squat" and the Difficulty Beginner.
2. THE Catalog SHALL give every Exercise_Entry a Difficulty, one or more Muscle_Groups, 3 to 5 Instruction_Steps, one or more Cues, one or more Safety_Notes, and a target that is either a number of reps or a number of seconds, with a value greater than 0.
3. THE Catalog SHALL give the Grave Rise Exercise_Entry a target in reps and the Muscle_Groups quads, glutes and core. (The rep count and the Muscle_Group list are tunable content.)
4. THE Catalog SHALL reference every user-facing text of an Exercise_Entry, including the Spooky_Name, Real_Name, Difficulty label, Muscle_Group labels, Instruction_Steps, Cues and Safety_Notes, by a Strings_Module identifier, so that an undefined identifier fails the Type_Check.
5. THE Catalog SHALL give every Exercise_Entry the same-origin path of its Coach_Asset under `/assets/`, the name of its Demo_Clip, and the same-origin paths of its front, side and back Still_Images under `/assets/`.
6. THE Catalog SHALL expose its content as read-only data, so that an assignment to any Exercise_Entry field fails the Type_Check.
7. THE Catalog SHALL import nothing from React, Three.js, the Viewer or browser storage.

### Requirement 2: Catalog validation (Open decision 2, Option A)

**User Story:** As the Builder, I want a validation function and a test over all shipped content, so that a bad content edit fails the Unit_Suite before it reaches the Site.

#### Acceptance Criteria

1. THE Catalog SHALL expose a validation function that takes Catalog content and returns a list of violations, each naming the Exercise_Entry identifier and the rule it breaks, and returns an empty list for valid content.
2. IF an Exercise_Entry has both a reps target and a seconds target, or neither, THEN THE Catalog validation function SHALL report a violation for that Exercise_Entry.
3. IF an Exercise_Entry's target value is not an integer greater than 0, THEN THE Catalog validation function SHALL report a violation for that Exercise_Entry.
4. IF an Exercise_Entry has fewer than 3 or more than 5 Instruction_Steps, no Muscle_Group, no Cue or no Safety_Note, THEN THE Catalog validation function SHALL report a violation for that Exercise_Entry.
5. IF two Exercise_Entries share an identifier or a slug, or a slug contains a character other than lowercase letters, digits and hyphens, THEN THE Catalog validation function SHALL report a violation.
6. IF an Exercise_Entry has an empty Coach_Asset path, an empty Demo_Clip name or a missing front, side or back Still_Image path, THEN THE Catalog validation function SHALL report a violation for that Exercise_Entry.
7. THE Unit_Suite SHALL include one test, named after the rule it protects in glossary terms, that runs the Catalog validation function over all shipped Catalog content and passes only when the function returns no violations.
8. IF an Exercise_Entry has a non-empty Coach_Asset path or Still_Image path that does not start with `/assets/`, contains `..` or `//`, or contains a character other than letters, digits, `.`, `_`, `-` and `/`, THEN THE Catalog validation function SHALL report a violation for that Exercise_Entry.

### Requirement 3: Exercise_List_Screen

**User Story:** As a user, I want an Exercises section listing every Exercise with its spooky name, real name, difficulty and muscle groups, so that I can choose what to learn.

#### Acceptance Criteria

1. WHEN a visitor activates the Exercises Navigation_Entry on the Home_Screen, or requests `/exercises` directly or by reload, THE Site SHALL show the Exercise_List_Screen at `/exercises` in place of the Exercises Placeholder_Screen.
2. THE Exercise_List_Screen SHALL display one level-1 page heading with the Section name "Exercises" from the Strings_Module, and SHALL set a document title from the Strings_Module that contains "Exercises".
3. THE Exercise_List_Screen SHALL display one Exercise_List_Entry for every Exercise_Entry in the Catalog, in Catalog order.
4. THE Exercise_List_Entry SHALL display the Exercise's Spooky_Name, Real_Name, Difficulty and every Muscle_Group, each taken from the Strings_Module through the Catalog.
5. WHEN a visitor activates an Exercise_List_Entry, THE Site SHALL show that Exercise's Exercise_Detail_Screen at `/exercises/<slug>`.
6. THE Exercise_List_Entry SHALL be a single link whose accessible name begins with the Exercise's Spooky_Name.
7. THE Exercise_List_Screen SHALL provide a link to the Home_Screen at `/` whose accessible name comes from the Strings_Module.
8. THE Exercise_List_Screen SHALL render without loading the Coach_Asset, any Still_Image or the 3D rendering library.

### Requirement 4: Exercise_Detail_Screen written content and Safety_Message

**User Story:** As a user, I want 3–5 short instruction steps, key cues, safety notes and the Coach's safety message next to the Coach, so that I know what to focus on and that the Coach cannot check my form.

#### Acceptance Criteria

1. WHEN a visitor requests `/exercises/grave-rise` directly, by reload or from the Exercise_List_Screen, THE Site SHALL show the Grave Rise Exercise_Detail_Screen.
2. THE Exercise_Detail_Screen SHALL display one level-1 page heading containing the Exercise's Spooky_Name, and SHALL display the Real_Name, the Difficulty and every Muscle_Group.
3. THE Exercise_Detail_Screen SHALL display the Exercise's Instruction_Steps as one ordered list in Catalog order, and its Cues and Safety_Notes each as a list under its own heading from the Strings_Module.
4. THE Exercise_Detail_Screen SHALL display the Safety_Message, written in the first person in the Coach's voice, stating that the Coach demonstrates the Exercise, cannot see the user and cannot check the user's form.
5. THE Exercise_Detail_Screen SHALL display the Safety_Message and the Written_Content in every Viewer state: Loading_State, Slow_Load_Notice, 3D scene and Still_Fallback.
6. THE Site SHALL include the Written_Content and the Safety_Message in the prerendered HTML of the Exercise_Detail_Screen, so that they appear before any script runs.
7. THE Strings_Module SHALL hold the Safety_Message under one identifier that does not depend on the Exercise, so that later Workout screens can show the same text.
8. THE Strings_Module SHALL contain no text on the Exercise_Detail_Screen that claims or implies that the user's form is correct or perfect.
9. THE Exercise_Detail_Screen SHALL set a document title from the Strings_Module that contains the Exercise's Spooky_Name.
10. THE Exercise_Detail_Screen SHALL provide a link to the Exercise_List_Screen at `/exercises` whose accessible name comes from the Strings_Module.
11. IF a visitor requests a path under `/exercises/` that matches no Exercise_Entry slug, THEN THE Site SHALL show the not-found screen from ticket 01.

### Requirement 5: Coach in the Graveyard_Scene

**User Story:** As a learner, I want the Coach to stand in a small Halloween graveyard with a moon and fog, so that the app feels themed while I learn the movement.

#### Acceptance Criteria

1. WHEN the Coach_Asset has loaded, THE Viewer SHALL show the Coach from the Exercise_Entry's Coach_Asset playing the Exercise_Entry's Demo_Clip as a seamless loop, inside the Viewer_Area.
2. THE Graveyard_Scene SHALL contain a ground the Coach stands on, at least two gravestones, a moon visible from the Front Camera_Preset, and distance fog.
3. THE Viewer SHALL render the Graveyard_Scene with no real-time shadows and no post-processing pass.
4. THE Viewer SHALL keep the whole rendered scene, including the Coach, at or below 35,000 triangles and SHALL use no texture larger than 1024 × 1024 pixels.
5. THE Viewer SHALL take every Graveyard_Scene colour, including ground, gravestone, moon, fog, sky and light colours, from the Halloween_Theme design tokens.
6. THE Viewer SHALL show the Coach in its default look, with no Coach color tint or Accessory applied, in this ticket.
7. WHILE the 3D scene is shown, THE Viewer SHALL expose the Viewer_Area to assistive technology as one image whose accessible name, from the Strings_Module, says that the Coach is demonstrating the Exercise named by its Spooky_Name.
8. WHEN the visitor leaves the Exercise_Detail_Screen, THE Viewer SHALL release its WebGL context and the GPU resources of the Coach_Asset and the Graveyard_Scene.

### Requirement 6: Camera rotation, tilt and zoom limits

**User Story:** As a learner, I want to drag to rotate the Coach 360° and zoom within limits, so that I can see the movement from any angle without the camera passing through the Coach or losing it.

#### Acceptance Criteria

1. WHEN the visitor drags horizontally on the Viewer_Area with a mouse, pen or one finger, THE Viewer SHALL change the Azimuth in the drag direction, with no limit on the Azimuth, so that continued dragging turns the camera a full 360° and more around the Coach.
2. WHEN the visitor drags vertically on the Viewer_Area, THE Viewer SHALL change the Elevation in the drag direction, within 0° to 75°.
3. WHEN the visitor pinches on the Viewer_Area with two fingers, or turns the mouse wheel or scrolls a trackpad over the Viewer_Area, THE Viewer SHALL change the Camera_Distance in the gesture's direction within the zoom limits of Requirements 6.5 and 6.6.
4. THE Viewer SHALL keep the camera looking at the Orbit_Target at every Azimuth, Elevation and Camera_Distance, with panning disabled, so that the Orbit_Target always projects inside the Viewer_Area.
5. THE Viewer SHALL keep the camera outside the Coach's bounding box over the whole Demo_Clip, enlarged by 0.1 m on every side, at the smallest allowed Camera_Distance and every allowed Azimuth and Elevation.
6. THE Viewer SHALL limit the largest Camera_Distance so that, seen at an Elevation of 0°, the Coach's standing height spans at least 35% of the Viewer_Area's height.
7. WHILE the visitor drags or pinches on the Viewer_Area, THE Viewer SHALL keep the page from scrolling or zooming.
8. WHILE the visitor drags outside the Viewer_Area, THE Site SHALL scroll the page in the drag direction.
9. WHILE the 3D scene is shown in the Phone_Viewport, THE Viewer SHALL make the Viewer_Area at most 60% of the viewport height, so that the visitor can always scroll the page by dragging outside the Viewer_Area.

### Requirement 7: Camera_Presets and button-only camera control

**User Story:** As a learner who uses only buttons, I want Front, Side and Back buttons and a button for every gesture, so that I can get a clear view without dragging or pinching.

#### Acceptance Criteria

1. WHEN the visitor activates the Front, Side or Back Camera_Preset button, THE Viewer SHALL move the camera to that Camera_Preset's Azimuth (Front 0°, Side 90° towards the Coach's left side, Back 180°), an Elevation of 10° or less, and the Camera_Preset's Camera_Distance.
2. WHILE the camera is at a Camera_Preset, THE Viewer SHALL show the Coach's full body, from the lowest point of the feet to the top of the head and both hands, inside the Viewer_Area with a margin of at least 5% of the Viewer_Area's height at the top and bottom, during every frame of the Demo_Clip, in both the Phone_Viewport and the Laptop_Viewport.
3. WHEN the Exercise_Detail_Screen first shows the 3D scene, THE Viewer SHALL place the camera at the Front Camera_Preset.
4. WHERE the Reduced_Motion_Preference is not set, THE Viewer SHALL move the camera to a Camera_Preset within 600 ms of the button activation.
5. WHERE Open decision 3 Option A applies, THE Camera_Controls SHALL include Rotate left and Rotate right buttons that change the Azimuth by 45° per activation, Tilt up and Tilt down buttons that change the Elevation by 15° per activation within the limits of Requirement 6.2, and Zoom in and Zoom out buttons, where one Zoom in activation multiplies the Camera_Distance by 0.8 and one Zoom out activation divides the Camera_Distance by 0.8, within the limits of Requirements 6.5 and 6.6.
6. IF a Tilt or Zoom button activation would take the camera past a limit of Requirement 6, THEN THE Viewer SHALL stop the camera at that limit.
7. THE Viewer SHALL show the Camera_Controls while the 3D scene is shown and SHALL hide or disable the Camera_Controls while the Loading_State or the Still_Fallback is shown.
8. THE Viewer SHALL increase the Azimuth for Rotate left and decrease the Azimuth for Rotate right, so that from the Front Camera_Preset a Rotate left activation moves the camera towards the Side Camera_Preset and turns the Coach's front towards the left edge of the Viewer_Area, and a Rotate right activation changes the Azimuth in the same direction as a horizontal drag to the right.
9. WHERE Open decision 3 Option A applies, THE Viewer SHALL increase the Elevation (raise the camera) for Tilt up and decrease the Elevation for Tilt down, so that a Tilt up activation changes the Elevation in the same direction as a vertical drag downwards.

### Requirement 8: Playback controls

**User Story:** As a learner, I want Play and Pause and speeds of 0.5×, 0.75× and 1×, so that I can freeze the key moment and follow the movement slowly.

#### Acceptance Criteria

1. WHERE the Reduced_Motion_Preference is not set, WHEN the 3D scene is first shown, THE Viewer SHALL play the Demo_Clip from its first frame at a Playback_Speed of 1×.
2. WHEN the visitor activates the Play/Pause button while the Demo_Clip plays, THE Viewer SHALL stop the Demo_Clip and keep the Coach in the frame it showed at the moment of activation.
3. WHEN the visitor activates the Play/Pause button while the Demo_Clip is paused, THE Viewer SHALL continue the Demo_Clip from the frame it was paused on.
4. THE Play/Pause button SHALL have an accessible name from the Strings_Module that names the action the button performs next (play or pause), and SHALL update that name when the playback state changes.
5. WHEN the visitor activates the 0.5×, 0.75× or 1× Playback_Speed button, THE Viewer SHALL play the Demo_Clip at that fraction of its authored speed, continuing from the current frame with no jump.
6. WHEN the visitor activates a Playback_Speed button while the Demo_Clip is paused, THE Viewer SHALL keep the Demo_Clip paused and apply the new Playback_Speed when playback resumes.
7. THE Playback_Controls SHALL expose which Playback_Speed is selected to assistive technology and SHALL show the selection visually by a means other than colour alone.
8. THE Viewer SHALL keep the Playback_Speed and play/pause state only in memory for the current visit to the Exercise_Detail_Screen.
9. THE Viewer SHALL show the Playback_Controls while the 3D scene is shown and SHALL hide or disable the Playback_Controls while the Loading_State or the Still_Fallback is shown.

### Requirement 9: Loading, slow loading and 3D failure

**User Story:** As a learner on a slow connection or a device where 3D fails, I want a spooky loading state, a retry and still images with the written instructions, so that I can still learn the Exercise.

#### Acceptance Criteria

1. WHILE the Coach_Asset is loading, THE Viewer SHALL show the Loading_State in the Viewer_Area, with a themed message from the Strings_Module.
2. THE Viewer SHALL announce the Loading_State message, the Slow_Load_Notice and the Still_Fallback message to assistive technology through a polite live region, once per change.
3. WHEN the Loading_State has been shown for 10 seconds of wall-clock time, including any time while the page is Page_Hidden, without the Coach_Asset finishing loading, THE Viewer SHALL add the Slow_Load_Notice, with a "still loading" message and a Retry button from the Strings_Module, and SHALL keep loading the Coach_Asset.
4. WHEN the visitor activates the Retry button, THE Viewer SHALL restart loading the Coach_Asset, show the Loading_State without the Slow_Load_Notice, and restart the 10-second count.
5. WHEN the Coach_Asset finishes loading while the Slow_Load_Notice is shown, THE Viewer SHALL replace the Loading_State and the Slow_Load_Notice with the 3D scene.
6. IF the browser cannot create a WebGL context, THEN THE Viewer SHALL show the Still_Fallback without requesting the Coach_Asset.
7. IF the Coach_Asset request fails with a network error or a non-success HTTP status, or the Coach_Asset cannot be parsed, or the Coach_Asset contains no clip with the Exercise_Entry's Demo_Clip name, THEN THE Viewer SHALL show the Still_Fallback with a Retry button.
8. IF the WebGL context is lost while the 3D scene is shown, THEN THE Viewer SHALL show the Still_Fallback with a Retry button.
9. THE Still_Fallback SHALL show the front, side and back Still_Images of the Exercise, each labelled Front, Side or Back and each with alternative text from the Strings_Module, together with a message from the Strings_Module saying that the 3D Coach could not load.
10. THE Viewer SHALL request the Still_Images only when the Still_Fallback is shown.
11. IF a Still_Image fails to load, THEN THE Still_Fallback SHALL show that image's alternative text in its place and keep the other Still_Images and the Written_Content visible.
12. WHERE JavaScript is disabled in the browser, THE Viewer SHALL show the Still_Fallback in the Viewer_Area in place of the Loading_State.

### Requirement 10: Render_Loop stops while paused or hidden

**User Story:** As a phone user, I want the 3D scene to stop drawing when nothing changes or when I cannot see it, so that the page does not drain my battery.

#### Acceptance Criteria

1. WHILE the Demo_Clip is paused and the camera is not moving, THE Viewer SHALL draw no frames of the 3D scene, except one frame after each change of the Viewer_Area's size.
2. WHEN the camera changes through a gesture or a Camera_Control while the Demo_Clip is paused, THE Viewer SHALL draw frames until the camera stops moving and then stop drawing again.
3. WHILE the page is Page_Hidden, THE Viewer SHALL draw no frames and SHALL keep the Demo_Clip at the frame shown when the page became hidden.
4. WHILE the Viewer_Area is fully outside the visible part of the page, THE Viewer SHALL draw no frames and SHALL keep the Demo_Clip at the frame shown when the Viewer_Area left the visible part of the page.
5. WHEN the page stops being Page_Hidden, or the Viewer_Area becomes at least partly visible again, THE Viewer SHALL continue in the play or pause state the visitor last chose, from the frame it stopped on.
6. THE Viewer SHALL advance the Demo_Clip only by time during which frames are drawn, so that time spent paused, Page_Hidden or scrolled out of view does not move the Coach forward.

### Requirement 11: Reduced motion

**User Story:** As a user with reduced motion turned on, I want the Coach to start paused and the camera never to move by itself, so that I do not feel sick.

#### Acceptance Criteria

1. WHERE the Reduced_Motion_Preference is set, WHEN the 3D scene is first shown, THE Viewer SHALL show the Demo_Clip paused on its first frame, with the Play/Pause button offering to play.
2. WHERE the Reduced_Motion_Preference is set, WHEN the visitor activates a Camera_Preset, Rotate, Tilt or Zoom button, THE Viewer SHALL move the camera to the new view in a single frame with no animated transition.
3. WHERE the Reduced_Motion_Preference is set, THE Viewer SHALL move the camera only while the visitor drags or pinches, with no continued motion after the gesture ends.
4. THE Viewer SHALL never rotate or move the camera without a visitor gesture or button activation.
5. WHERE the Reduced_Motion_Preference is set, THE Viewer SHALL show the Loading_State with no animation.

### Requirement 12: Accessibility and layout of the Exercise screens

**User Story:** As a phone user, a screen-reader user or a user with large text, I want the Exercise screens to work with buttons, labels and large text, so that I can use them however I browse.

#### Acceptance Criteria

1. THE Exercise_List_Screen and the Exercise_Detail_Screen SHALL use the Halloween_Theme, the SiteFrame with its Decorations, and the layout rules of the `spooky-site-skeleton` spec: dark full-viewport background, main content at most 768 CSS px wide and centred in the Laptop_Viewport, no horizontal scrolling at widths from 320 to 1920 CSS px, and the text contrast ratios of its Requirements 4.8 and 4.9.
2. THE Site SHALL make every Camera_Control, Playback_Control, Retry button, Exercise_List_Entry and link on the Exercise screens a native button or link with an accessible name from the Strings_Module.
3. THE Site SHALL give every Camera_Control, Playback_Control, Retry button and Exercise_List_Entry a clickable area of at least 44 × 44 CSS px and at least 8 CSS px between adjacent clickable areas, in both the Phone_Viewport and the Laptop_Viewport.
4. WHEN the visitor moves keyboard focus with the Tab key on the Exercise_Detail_Screen, THE Site SHALL focus every Camera_Control, Playback_Control and link in visual reading order, showing the focus indicator from the `spooky-site-skeleton` spec (contrast at least 3:1).
5. WHILE the root (`html`) element's font size is set to 200% in the Phone_Viewport, THE Exercise_List_Screen and the Exercise_Detail_Screen SHALL show the full text of every heading, Exercise_List_Entry, Written_Content item, Safety_Message and button label with no clipped characters or ellipsis, no overlapping controls and no horizontal scrolling.
6. WHILE the 3D scene is shown in the Phone_Viewport at the default text size, THE Exercise_Detail_Screen SHALL show the whole Viewer_Area and the Play/Pause button without scrolling.
7. THE Strings_Module SHALL hold every new user-facing string of this ticket, including accessible names, alternative texts, Loading_State, Slow_Load_Notice and Still_Fallback messages, and document titles, in the English Locale, and every new string SHALL pass the glossary "Avoid" word check and the non-blank check of the Unit_Suite.
8. THE Site's components SHALL contain no hardcoded user-facing string, so that the source-rule test from ticket 01 passes over every file under `src/`, including `src/catalog/` and `src/viewer/`.

### Requirement 13: Coach_Asset and Still_Image delivery (Open decision 1, Option A)

**User Story:** As the Builder, I want the app to load the Asset_Pipeline's files from the Site's own origin and check their budget, so that the Nov 13 check runs on the real asset and a CC0_Fallback asset can drop in with a content change.

#### Acceptance Criteria

1. THE Repository SHALL track the Grave Rise Coach_Asset at `public/assets/coach/coach_grave_rise.glb` and its front, side and back Still_Images under `public/assets/coach/stills/`, delivered by the Asset_Pipeline. (Asset_Pipeline step: Claude Code places the files. App-code tasks do not create or edit them, per ADR 0004.)
2. THE Unit_Suite SHALL check that every Coach_Asset and Still_Image path in the Catalog names an existing file under `public/`.
3. THE Unit_Suite SHALL check that every Coach_Asset referenced by the Catalog is a valid binary glTF 2.0 file of at most 6 MB with at most 35,000 triangles, at most 4 materials, no texture larger than 1024 × 1024 pixels, an animation whose name equals the Exercise_Entry's Demo_Clip name, and none of the glTF extensions `KHR_draco_mesh_compression`, `EXT_meshopt_compression` or `KHR_texture_basisu` in its `extensionsUsed` or `extensionsRequired` lists.
4. THE Unit_Suite SHALL check that every Still_Image referenced by the Catalog is at most 300 KB.
5. WHEN the Exercise_Detail_Screen loads in a browser from a production build, THE Site SHALL send every network request, including those for the Coach_Asset, Still_Images, 3D library code and any decoder, only to the Site's own origin, with the GET or HEAD method only, and SHALL set no cookies.
6. THE Site SHALL load the 3D rendering library code only on the Exercise_Detail_Screen, so that the Home_Screen, the Exercise_List_Screen, the Placeholder_Screens and the not-found screen request no 3D library code.
7. THE Viewer SHALL read the Coach_Asset path, the Demo_Clip name and the Still_Image paths only from the Exercise_Entry, so that replacing a Coach_Asset with a CC0_Fallback asset needs changes only to files under `public/assets/` and to Catalog content.
8. THE Repository SHALL declare every new runtime and development dependency in `package.json` with an exact version recorded in `package-lock.json`, under a license that allows redistribution in an MIT repository (MIT, ISC, BSD or Apache-2.0).

### Requirement 14: Static build and existing tests

**User Story:** As the Builder, I want the new screens to stay static and the ticket 01 checks to keep passing, so that the Site still deploys with no backend and no broken guarantees.

#### Acceptance Criteria

1. WHEN the Build finishes, THE Build output SHALL mark `/exercises` and `/exercises/grave-rise` as static (prerendered), and SHALL list no route that is server-rendered on demand, where a dynamic route whose known parameters are all prerendered and whose unknown parameters return 404 counts as static.
2. THE E2E_Suite SHALL check the Exercise_List_Screen at `/exercises` in place of the Exercises Placeholder_Screen, and SHALL keep checking the Placeholder_Screens of Stretches, Routines, Crypt and History as specified in the `spooky-site-skeleton` spec.
3. THE E2E_Suite SHALL apply its theme, layout, Decoration, no-backend and link checks from the `spooky-site-skeleton` spec to the Exercise_List_Screen and the Exercise_Detail_Screen.
4. THE E2E_Suite SHALL include a test, run in both the phone and the laptop project, that goes from the Home_Screen to Exercises to Grave Rise and checks that the Exercise_Detail_Screen shows the Spooky_Name, Real_Name, Difficulty, every Muscle_Group, the Instruction_Steps, the Cues, the Safety_Notes and the Safety_Message, finding each element by role, name or text from the Strings_Module.
5. THE E2E_Suite SHALL include a test that checks that every Camera_Control and Playback_Control is present with its accessible name from the Strings_Module once the 3D scene is shown.
6. THE E2E_Suite SHALL include a test that makes the Coach_Asset request fail and checks that the Still_Fallback shows the three Still_Images, the Written_Content and the Safety_Message.
7. THE E2E_Suite SHALL include a test that delays the Coach_Asset response by more than 10 seconds and checks that the Slow_Load_Notice and its Retry button appear.
8. THE Repository SHALL hold Catalog code only under `src/catalog/` and Viewer code only under `src/viewer/`, and THE Unit_Suite repository rule SHALL allow these two directories in addition to `src/app/`, `src/ui/` and `src/types/next.d.ts`.
9. THE Repository SHALL hold a `.kiro/steering/structure.md` whose "Current state" section lists `src/catalog/`, `src/viewer/` and `public/assets/` once they exist, and lists no path that is absent from the working tree.
10. WHEN `npx tsc --noEmit`, `npx vitest --run` and `npx playwright test` are run after `npm ci` on a clean checkout, after the Asset_Pipeline has delivered the files of Requirement 13.1, THE Type_Check, the Unit_Suite and the E2E_Suite SHALL each exit with code 0.

### Requirement 15: Nov 13 Real_Phone_Check (human step)

**User Story:** As the Builder, I want the ADR 0003 squat gate judged and recorded on a real phone, so that I know by Fri 2026-11-13 whether to keep hand-made animation or switch to CC0 assets.

#### Acceptance Criteria

1. WHEN the Grave Rise Exercise_Detail_Screen is served from the Live_URL or from a production build reachable on the local network, THE Builder SHALL open it on one real phone held in portrait and judge by eye that the Coach loads, rotates 360°, looks right from the Front, Side and Back Camera_Presets with no joint collapse or foot sliding, and plays at 0.5×, 0.75× and 1×. (Human step. The agent does not perform it.)
2. WHEN the Real_Phone_Check is done, THE Builder SHALL append a comment under `## Comments` in `.scratch/spooky-coach-mvp/issues/03-exercise-page-3d-coach.md` that records the date, the phone model, the browser, the verdict (pass or fail) and a note per Camera_Preset. (Human step.)
3. WHEN the Real_Phone_Check records a pass, THE Builder SHALL tick the ticket 03 acceptance box for the Nov 13 check, and ticket 04 SHALL stay `ready-for-agent`. (Human step.)
4. IF the Real_Phone_Check records a fail, or no pass is recorded by the end of Fri 2026-11-13, THEN THE Builder SHALL trigger the CC0_Fallback by recording it in the ticket 03 comment, setting ticket 04's `**Status:**` to `needs-triage` with a comment pointing to ADR 0003, and opening a ticket to source CC0 Coach_Assets that meet Requirement 13.3. No Mixamo asset is allowed. (Human step.)
5. IF the CC0_Fallback is triggered, THEN THE Viewer and the Exercise screens SHALL need no code change to show a CC0 Coach_Asset that meets Requirement 13.3, only changes to files under `public/assets/` and to Catalog content (Requirement 13.7).
