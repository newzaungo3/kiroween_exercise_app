# Implementation Plan: Exercise Page with the 3D Coach

## Overview

This plan builds ticket `03-exercise-page-3d-coach` as described in `design.md`, in TypeScript strict mode. Work goes bottom-up. First the pinned 3D dependencies and the Playwright WebGL setting, then the Strings_Module and token additions, then the pure modules (Catalog, Viewer logic, load state, the GLB reader). The Three.js and React Three Fiber layer, the Viewer island, the screens and the routes come after that. The plan then updates the ticket 01 tests and rules this ticket invalidates, adds the new E2E specs, updates the steering, and ends with a final checkpoint that waits for the Asset_Pipeline delivery.

Ground rules for every task:

- The shell is PowerShell on Windows. The agent may run `npx tsc --noEmit`, `npx vitest --run`, `npx playwright test` and `npm run build`. The agent never runs `npm run dev` or `npm run start`.
- Every user-facing string comes from `src/ui/strings.ts`. Every colour comes from `src/ui/theme/tokens.ts`. Use glossary terms in identifiers, test names and comments.
- ADR 0004: no task authors, exports, renders or edits a GLB, a Still_Image or any other 3D binary. App code only references the Catalog paths `/assets/coach/coach_grave_rise.glb` and `/assets/coach/stills/grave_rise_{front,side,back}.png`. The GLB reader's tests build synthetic glTF data in memory and never write it to disk. Leave `assets/`, `[render_dir]/` and `.kiro/settings/mcp.json` untouched.
- Asset delivery into `public/assets/coach/` (Open decision 1, Option A) is a User task. Until it happens, the tests that need the delivered files fail with a message naming the missing file and Open decision 1. They are never skipped. The checkpoints list these expected failures; the agent reports them and does not treat them as task failures. Any other failure must be fixed.
- Open decisions 1–5 are unanswered. Every task follows Option A, as the design does. The Notes say what an Option B would change.
- Each wave of the dependency graph leaves `npx tsc --noEmit` passing. Tasks 10.2, 12.1 and 12.2 share a wave because deleting `section.exercises.message` breaks the types of the two old tests until they are updated.
- Ask the user before every commit. Stage files by name, never with `git add -A` or `git add .`. Never push.

## Tasks

- [x] 1. Install the 3D dependencies and prepare the test harness
  - [x] 1.1 Install the pinned 3D dependencies
    - Run `npm install --save-exact three@0.187.0 @react-three/fiber@9.8.2` and `npm install --save-exact --save-dev @types/three@0.187.0`. Do not install `@react-three/drei` or any other package
    - Confirm that `package.json` lists the three exact versions with no range prefix, that `package-lock.json` records them, and that `npm ls react three` shows one copy of each
    - If a pin cannot be installed, or npm reports a peer conflict with React 19.3.1, stop and ask the user. Do not substitute another version and do not use `--force` or `--legacy-peer-deps`
    - _Requirements: 13.8, 14.10_

  - [x] 1.2 Give both Playwright projects software WebGL
    - In `playwright.config.ts`, add `launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] }` to the `use` block of the `phone` and the `laptop` project. Keep every other setting, including port 3100, `retries: 0` and `forbidOnly: true`
    - _Requirements: 14.5, 14.10_

- [x] 2. Extend the Strings_Module and the Halloween_Theme tokens
  - [x] 2.1 Add `format()` and the new English Locale entries to `src/ui/strings.ts`
    - Add every identifier and text from the design's "New English Locale entries" table. Keep `section.exercises.message` for now; task 10.2 deletes it
    - Add the `Placeholders<S>` helper type, the exported `TemplateId` type and `format(id, values)`. `format` replaces `{name}` placeholders with one regular expression (`/\{([a-z][a-zA-Z]*)\}/g`) and leaves unknown placeholders untouched. A missing or extra value fails the Type_Check. `t()` stays unchanged
    - Check every new text against the glossary Avoid words before saving (no "pose", "move", "model", "status", "result", "training", "session")
    - _Requirements: 4.4, 4.7, 4.8, 4.9, 5.7, 9.1, 9.3, 9.9, 12.2, 12.7_

  - [x] 2.2 Write property test for `format()`
    - **Property 12: format() fills every placeholder**
    - File `tests/unit/strings-format.test.ts`. Templates from `fc.array(fc.oneof(literal without braces, placeholder name))`, values from `fc.string()` without `{`. Add the example "format leaves text without placeholders unchanged". `numRuns: 200` and the tag comment `// Feature: exercise-page-3d-coach, Property 12: format() fills every placeholder`
    - **Validates: Requirements 5.7, 9.9, 4.9, 12.7**

  - [x] 2.3 Add the `format()` fixtures to `tests/unit/strings.type-check.ts`
    - Three `@ts-expect-error` lines from the design: a missing placeholder value, an extra value, and a non-template identifier passed to `format`
    - _Requirements: 12.7_

  - [x] 2.4 Add the new Strings_Module tests to `tests/unit/strings.test.ts`
    - "no string claims or implies that the user's form is correct": no English entry matches `/\b(perfect|flawless|correct form|good form|right form|proper form)\b/i`
    - "the Safety_Message says the Coach demonstrates but cannot see the user or check their form": `safety.coachMessage` contains "I demonstrate", "can't see you" and "check your form"
    - "every registered Locale keeps the English placeholders"
    - Do not touch the Placeholder_Screen message test here; task 12.1 changes it
    - _Requirements: 4.4, 4.7, 4.8, 12.7_

  - [x] 2.5 Add the Graveyard_Scene and `onAccent` tokens to `src/ui/theme/tokens.ts`
    - Add `sceneSky`, `sceneGround`, `sceneGravestone`, `sceneMoon`, `sceneMoonGlow`, `sceneAmbientSky`, `sceneAmbientGround`, `sceneMoonlight` and `onAccent` with the design's starting values. `themeCss()` emits them as CSS variables like the existing tokens
    - _Requirements: 5.5, 8.7, 12.1_

  - [x] 2.6 Write unit tests for the new tokens in `tests/unit/theme.test.ts`
    - "the scene sky is dark" (luminance ≤ 0.05), "the moon stands out against the sky" (≥ 3:1), "the selected Playback_Speed label is readable on its fill" (`onAccent` on `orange` ≥ 4.5:1). If a starting value fails, change the token, not the test
    - _Requirements: 5.2, 5.5, 8.7, 12.1_

- [x] 3. Build the Catalog
  - [x] 3.1 Define the Catalog types in `src/catalog/types.ts`
    - `difficulties`, `muscleGroups`, `stillViews` as `as const` arrays with their union types; `SameOriginAssetPath`; `ExerciseTarget` (reps or seconds, never both); `ExerciseEntry` with every field and array `readonly`; the loose `ExerciseDraft` and `CatalogDraft`; `CatalogRule`; `CatalogViolation`
    - Import only the type `StringId` from `@/ui/strings`
    - _Requirements: 1.2, 1.4, 1.5, 1.6, 1.7_

  - [x] 3.2 Implement `validateCatalog` in `src/catalog/validate.ts`
    - Apply every rule of the design's "Catalog rules" table to a `CatalogDraft`. Return violations in Catalog order, each rule at most once per Exercise_Entry, with `#<index>` as the identifier when `id` is missing. Return an empty list for valid content
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.8, 1.2, 1.5_

  - [x] 3.3 Add the Grave Rise content and the Catalog's public interface
    - `src/catalog/exercises.ts`: the Grave Rise Exercise_Entry from the design's "Grave Rise content" table, declared `as const satisfies readonly ExerciseEntry[]`
    - `src/catalog/index.ts`: export the types and constant arrays, `exercises`, `findExercise(slug)`, `exerciseSlugs()` and `validateCatalog`
    - The Catalog imports nothing from React, Three.js, the Viewer or browser storage, and never calls `t()`
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 13.7_

  - [x] 3.4 Write the shipped-content validation test in `tests/unit/catalog.test.ts`
    - Test "shipped Catalog content passes validation": `expect(validateCatalog({ exercises })).toEqual([])`, so a failure prints the violations. Import only from `@/catalog`
    - This test is required, not optional: Requirement 2.7 asks for it
    - _Requirements: 2.7, 1.2_

  - [x] 3.5 Write property test for Catalog validation
    - **Property 1: Catalog validation reports exactly the broken rules**
    - Add to `tests/unit/catalog.test.ts`. Use the `validDraft(index)` and `breakage` generators from the design and compare sets of `${id}:${rule}` strings. `numRuns: 200` and the tag comment
    - **Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.8, 1.2, 1.5**

  - [x] 3.6 Write unit tests for the Catalog content and rules
    - Add to `tests/unit/catalog.test.ts`: "the Catalog holds one Exercise, Grave Rise, for Beginners", "every Exercise_Entry has Instruction_Steps, Cues and Safety_Notes from the Strings_Module" (every id resolves to non-blank text), "an Exercise_Entry is found by its slug and an unknown slug finds nothing", and one failing example per Catalog rule
    - _Requirements: 1.1, 1.3, 1.4, 2.2, 2.3, 2.4, 2.5, 2.6, 2.8, 3.5, 4.11_

  - [x] 3.7 Add the read-only fixtures in `tests/unit/catalog.type-check.ts`
    - The three `@ts-expect-error` lines from the design: assigning a field, pushing to a list, and a target with both reps and seconds
    - _Requirements: 1.6, 1.2_

- [x] 4. Build the Viewer camera logic
  - [x] 4.1 Implement `src/viewer/logic/geometry-types.ts` and `src/viewer/logic/orbit.ts`
    - `Vec3`, `Box3Value`; `CameraPreset`, `Orbit`, `OrbitLimits`, `presetAzimuthDeg` (front 0, side 90, back 180), `presetElevationDeg = 5`, `normalizeAzimuth`, `clampOrbit`, `rotateBy`, `tiltBy`, `zoomBy`, `cameraPosition`, `startTween`, `sampleTween` exactly as in the design (Azimuth 90 puts the camera on +X, the Coach's left; tweens take the shorter way round; duration 0 lands at once)
    - No imports outside `src/viewer/logic/`
    - _Requirements: 6.1, 6.2, 6.4, 7.1, 7.4, 7.5, 7.6, 7.8, 7.9, 11.2_

  - [x] 4.2 Implement `src/viewer/logic/gestures.ts`
    - `PointerSample`, `GestureState`, `degreesPerPixel`, `gestureDown`, `gestureMove` (Δaz = −dx·0.4, Δel = +dy·0.3; pinch scales the start distance by the gap ratio), `gestureUp` (two to one pointer re-anchors an orbit) and `wheelZoom` (line and page modes normalised, `exp(Δ·0.002)`), all clamped through `orbit.ts`
    - _Requirements: 6.1, 6.2, 6.3, 7.8, 7.9, 11.3_

  - [x] 4.3 Implement `src/viewer/logic/framing.ts`
    - `FramingInput`, `Framing`, `clearanceM`, `presetMarginShare`, `minHeightShare`, `sceneMaxDistanceM`, `computeFraming` and `projectToNdc`, following the design's rules for the Orbit_Target, the minimum distance (farthest enlarged-box corner plus the near plane), the maximum distance (measured at Elevation 0°, never below the minimum) and the bisected preset distances
    - _Requirements: 6.4, 6.5, 6.6, 7.1, 7.2, 15.5_

  - [x] 4.4 Write property test for the orbit limits
    - **Property 2: Every camera input keeps the orbit within limits**
    - File `tests/unit/viewer-orbit.test.ts`. Orbits, limits and input sequences (rotate, tilt, zoom, drag, pinch, wheel, preset) from the design's generators. `numRuns: 200` and the tag comment
    - **Validates: Requirements 6.1, 6.2, 6.3, 7.6, 7.8, 7.9**

  - [x] 4.5 Write property test for the button steps
    - **Property 3: Button steps are exact and reversible inside the limits**
    - Add to `tests/unit/viewer-orbit.test.ts`, with the orbit examples from the design: the Side preset looks at the Coach's left side, Rotate left from the Front view moves towards the Side view, Tilt up raises the camera, Zoom out undoes Zoom in, Azimuth 360° is the Front view again, a tween from 350° to 10° takes the shorter way. `numRuns: 200` and the tag comment
    - **Validates: Requirements 7.5, 7.6, 7.8, 7.9**

  - [x] 4.6 Write unit tests for the gestures
    - File `tests/unit/viewer-gestures.test.ts`: "dragging right turns the camera the same way as Rotate right", "dragging down raises the camera like Tilt up", "pinching apart zooms in", "lifting one of two fingers continues as a drag", "wheel lines and pages are normalised"
    - _Requirements: 6.1, 6.2, 6.3, 7.8, 7.9_

  - [x] 4.7 Write property test for the bounding-box clearance
    - **Property 4: The camera never enters the Coach's enlarged bounding box**
    - File `tests/unit/viewer-framing.test.ts`. Bounds, aspect and orbits from the design's generators. `numRuns: 200` and the tag comment
    - **Validates: Requirements 6.5**

  - [x] 4.8 Write property test for the preset framing
    - **Property 5: Camera_Presets frame the full body with margins**
    - Add to `tests/unit/viewer-framing.test.ts`. Use a Three.js `PerspectiveCamera` and `Vector3.project` as the oracle, not `projectToNdc`. `numRuns: 200` and the tag comment
    - **Validates: Requirements 7.1, 7.2**

  - [x] 4.9 Write property test for the framing limits
    - **Property 6: Framing limits are ordered, centred and keep the Coach large enough**
    - Add to `tests/unit/viewer-framing.test.ts`, with the examples "a 1.78 m Coach gets a Front distance between 2 and 4 m" and "a Coach wider than its height-based limit gets maxDistance = minDistance". `numRuns: 200` and the tag comment
    - **Validates: Requirements 6.4, 6.6**

- [x] 5. Build the playback clock and the Viewer controller
  - [x] 5.1 Implement `src/viewer/logic/playback.ts`
    - `PlaybackSpeed`, `playbackSpeeds`, `maxFrameGapMs = 100`, `PlaybackState`, `createPlayback` (playing unless reduced motion, speed 1, clip time 0), `tick`, `togglePlay`, `setSpeed` and `suspend` as in the design. Clip time advances only by the clamped gap between two ticks
    - _Requirements: 8.1, 8.2, 8.3, 8.5, 8.6, 10.3, 10.4, 10.5, 10.6, 11.1_

  - [x] 5.2 Write property test for the playback clock
    - **Property 7: Demo_Clip time follows drawn-frame time only**
    - File `tests/unit/viewer-playback.test.ts`, with the 15-line reference model and the examples "the Demo_Clip starts at its first frame at 1×", "with reduced motion the Demo_Clip starts paused" and "a long gap between two frames advances the clip by at most 100 ms". `numRuns: 200` and the tag comment
    - **Validates: Requirements 8.2, 8.3, 8.5, 8.6, 10.3, 10.4, 10.5, 10.6**

  - [x] 5.3 Implement `src/viewer/logic/controller.ts`
    - `SceneInfo`, `ViewerSnapshot`, `FrameOutput`, `ViewerController`, `createViewerController`, `presetTweenMs = 450`, `buttonTweenMs = 250`, following the design's behaviour list: Front preset on `setScene`, tween duration 0 under reduced motion, no inertia or auto-rotate, a button during a tween targets from the tween's end pose, a gesture cancels a tween, `activePreset` handling in `setAspect`, `keepDrawing = visible && (playing || tween || gesture)`, playback suspended while hidden or out of view, and one `requestFrame` call when the Viewer becomes visible again
    - The controller owns no shared clock and exports nothing time-related beyond its own methods
    - _Requirements: 6.1, 6.2, 6.3, 7.1, 7.3, 7.4, 7.5, 8.1, 8.2, 8.3, 8.5, 8.6, 8.8, 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 11.1, 11.2, 11.3, 11.4_

  - [x] 5.4 Write property test for the Render_Loop rule
    - **Property 8: The Render_Loop runs only while something visible changes**
    - File `tests/unit/viewer-controller.test.ts`. Command sequences with increasing timestamps and a counting `requestFrame` spy, as in the design. `numRuns: 200` and the tag comment
    - **Validates: Requirements 10.1, 10.2, 10.3, 10.4, 10.5, 11.3, 11.4**

  - [x] 5.5 Write property test for preset and button timing
    - **Property 9: Presets and buttons land on time, instantly under reduced motion**
    - Add to `tests/unit/viewer-controller.test.ts`, with the examples "the first 3D view is the Front Camera_Preset", "pausing stops the Render_Loop after one frame", "a Camera_Control while paused draws until the camera stops", "returning to the page continues from the frame it stopped on" and "two quick Rotate left presses end 90° away". `numRuns: 200` and the tag comment
    - **Validates: Requirements 7.1, 7.4, 11.2**

- [x] 6. Build the load state machine and the GLB reader
  - [x] 6.1 Implement `src/viewer/logic/load-state.ts`
    - `slowLoadMs = 10_000`, `FallbackReason`, `LoadPhase`, `LoadEvent`, `initialLoadState`, `loadReducer`, `msUntilSlow`, `announcementId`, `showsRetry` and `wantsCoachAsset`, following the design's state diagram (events from an older attempt are ignored; `retry` is ignored where no Retry button is shown)
    - Also export two small pure helpers that the scene and the browser adapters share without importing each other: `CoachAssetError` (reason `network`, `http` with status, `parse` or `missing-clip`) and `findDemoClip(clips, name)`, which returns the clip whose `name` equals the Demo_Clip name or `undefined`
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8_

  - [x] 6.2 Write property test for the load state machine
    - **Property 10: Loading follows the attempt and the 10-second rule**
    - File `tests/unit/viewer-load-state.test.ts`, with the design's examples: the Slow_Load_Notice appears at 10 seconds and not at 9.999, time while the page is hidden counts towards the 10 seconds, Retry clears the Slow_Load_Notice, no WebGL2 shows the Still_Fallback without a Retry, each failure reason and context loss show it with a Retry, the live region text for each phase, and "an asset without the Demo_Clip is reported as missing-clip" through `findDemoClip`. `numRuns: 200` and the tag comment
    - **Validates: Requirements 9.3, 9.4, 9.5, 9.6, 9.7, 9.8**

  - [x] 6.3 Implement the GLB reader in `tests/unit/support/glb.ts`
    - `readGlb(bytes)` checks the magic, version 2 and declared length, and returns the JSON chunk and binary chunk. A budget summary reports triangles (by primitive mode, indexed or not), material count, the largest texture size read from PNG or JPEG headers, animation names, and which of `KHR_draco_mesh_compression`, `EXT_meshopt_compression` and `KHR_texture_basisu` appear in `extensionsUsed` or `extensionsRequired`
    - No new dependency
    - _Requirements: 13.3, 5.4_

  - [x] 6.4 Write property test for the GLB reader
    - **Property 11: GLB reader round trip**
    - File `tests/unit/support/glb.test.ts`, with an in-memory test writer (about 30 lines, never writes to disk) and the examples "a file with the wrong magic is not a GLB", "a version-1 container is rejected" and "a declared length that disagrees with the file is rejected". `numRuns: 200` and the tag comment
    - **Validates: Requirements 13.3, 5.4**

- [x] 7. Checkpoint: Catalog and Viewer logic
  - Run `npx tsc --noEmit` and `npx vitest --run`. Both must exit 0. No asset-dependent test exists yet, so there are no expected failures at this point
  - Ensure all tests pass, ask the user if questions arise.
  - _Requirements: 2.7, 12.7, 14.10_

- [x] 8. Build the 3D layer (`src/viewer/scene/`, dynamic chunk only)
  - [x] 8.1 Implement `src/viewer/scene/graveyard-geometry.ts`
    - `GraveyardPiece` and `buildGraveyard()` from the design: ground disc, six gravestones on a ring outside `sceneMaxDistanceM` (three on the −Z half), unlit unfogged moon and glow disc, every colour a token value from `colors`. Three.js only, no React, importable in the `node` environment. About 584 triangles, no textures
    - _Requirements: 5.2, 5.3, 5.4, 5.5_

  - [x] 8.2 Implement `src/viewer/scene/coach-asset.ts` and `src/viewer/scene/dispose.ts`
    - `parseCoachAsset(buffer, demoClip, resourcePath)` uses `GLTFLoader.parseAsync` from `three/addons/loaders/GLTFLoader.js` with no Draco, meshopt or KTX2 loader. It throws `CoachAssetError('parse')` on a loader error and `CoachAssetError('missing-clip')` when `findDemoClip` finds nothing. It measures `standingBounds` in the bind pose and `motionBounds` over 30 evenly spaced clip times with precise (skinned) bounds
    - `disposeObject3D(root)` disposes geometries, materials and textures
    - The Coach_Asset path and Demo_Clip name arrive as arguments; no `/assets/` literal or clip name appears in Viewer code
    - _Requirements: 5.8, 9.7, 13.3, 13.5, 13.7, 15.5_

  - [x] 8.3 Implement `CoachActor.tsx`, `Graveyard.tsx`, `CameraRig.tsx` and `Scene3D.tsx`
    - `Scene3D` renders the design's `<Canvas>` (`frameloop="demand"`, `flat`, `shadows={false}`, `dpr={[1, 2]}`, fov 40, near 0.05, `aria-hidden`), sky colour, fog, hemisphere and directional light from tokens, `<Graveyard />`, `<CoachActor />` once parsed, and `<CameraRig />`. It parses the buffer, reports `onReady`, `onFailed` or `onContextLost` with its attempt, and removes the context-loss listener on cleanup
    - `CameraRig` attaches pointer listeners with pointer capture and a `{ passive: false }` wheel listener that calls `preventDefault()` to the stage element, runs one `useFrame` that applies `controller.frame(performance.now())`, calls `invalidate()` only when `keepDrawing` is true, wires `setRequestFrame(invalidate)`, and reports aspect changes. It ignores R3F's `delta`
    - `CoachActor` mounts the parsed root as a primitive, poses the clip with `action.time = clipTime; mixer.update(0)`, applies no Coach color or Accessory, and on unmount stops the mixer, uncaches and calls `disposeObject3D`
    - No `castShadow`, `receiveShadow`, shadow map or post-processing anywhere
    - _Requirements: 5.1, 5.3, 5.6, 5.8, 6.4, 6.7, 7.3, 9.7, 9.8, 10.1, 10.2, 10.3, 10.4, 10.5, 10.6_

- [x] 9. Build the Viewer island, its controls and the Still_Fallback
  - [x] 9.1 Implement the browser adapters in `src/viewer/browser/`
    - `detect-webgl.ts`: `detectWebGL2()` asks a detached canvas for `webgl2`, releases it with `WEBGL_lose_context`, and returns false on `null` or an exception
    - `fetch-coach-asset.ts`: `fetchCoachAsset(path, signal)` with `credentials: 'same-origin'`; throws `CoachAssetError('network')` on rejection and `CoachAssetError('http', status)` when not ok; rethrows aborts
    - `useViewerEnvironment.ts`: `pageHidden` from `visibilitychange`, `inView` from an `IntersectionObserver` with threshold 0, `reducedMotion` from `matchMedia('(prefers-reduced-motion: reduce)')`, each updated on change. No decisions in these files
    - _Requirements: 9.3, 9.6, 9.7, 10.3, 10.4, 10.5, 11.1, 13.5_

  - [x] 9.2 Implement the Playback_Controls and Camera_Controls in `src/viewer/controls/`
    - `PlaybackControls.tsx`: one Play/Pause `<button>` whose text is `viewer.play` or `viewer.pause`; three speed buttons with `aria-pressed` in a `role="group"` labelled `viewer.speed.label`; the selected speed shows a filled background in `var(--color-orange)` with `var(--color-on-accent)` text, a check-mark SVG and bold text
    - `CameraControls.tsx`: Front, Side and Back text buttons in a group labelled `viewer.views.label`; a pad labelled `viewer.camera.label` with Rotate left (+45°), Rotate right (−45°), Tilt up (+15°), Tilt down (−15°), Zoom in and Zoom out icon buttons with `aria-label`s from the Strings_Module (Open decision 3, Option A)
    - `icons.tsx` (inline SVG, `aria-hidden="true"`, `fill="currentColor"`) and `controls.module.css`: every button at least `2.75rem` × `2.75rem`, rows with `flex-wrap: wrap; gap: 0.5rem`, wrapping labels. Both groups accept `disabled`
    - Add `button:focus-visible` with the link outline to `src/app/globals.css`
    - _Requirements: 7.1, 7.5, 7.7, 7.8, 7.9, 8.4, 8.5, 8.7, 8.9, 12.2, 12.3, 12.4, 12.5, 12.7_

  - [x] 9.3 Implement the Loading art and the Still_Fallback in `src/viewer/fallback/`
    - `LoadingArt.tsx`: themed, `aria-hidden`, animated only outside `prefers-reduced-motion: reduce`
    - `StillFallback.tsx`: the figure list from the design, one `<img decoding="async">` per Still_Image (not `next/image`) with alternative text from `format('viewer.still.<view>.alt', …)` and a `viewer.view.<view>` caption. On `error` a `StillImage` replaces itself with a bordered paragraph showing its alternative text
    - `fallback.module.css` uses token variables only
    - _Requirements: 9.1, 9.9, 9.10, 9.11, 11.5, 12.7_

  - [x] 9.4 Implement `src/viewer/ViewerIsland.tsx` and `ViewerIsland.module.css`
    - `'use client'`. Follow the design's six responsibilities: `useReducer(loadReducer)` starting in `checking`; the WebGL2 probe and attempt start with an `AbortController`, `fetchCoachAsset` from the Exercise_Entry and a `setTimeout` for `msUntilSlow`; a `tick(now)` dispatch when the page becomes visible again; `<Scene3D key={attempt}>` through `next/dynamic(() => import('./scene/Scene3D'), { ssr: false })` as soon as loading starts; one controller per attempt; `useSyncExternalStore` for the control snapshot; `SceneErrorBoundary` dispatching `failed('code')`
    - Render the Viewer_Area DOM from the design: `role="img"` with `format('viewer.coachLabel', …)` only in `ready`; the always-present `<p role="status">` with `t(announcementId(phase))`; the Retry button when `showsRetry`; the Still_Fallback only in `fallback`; the `<noscript>` message and stills; both control groups disabled while checking or loading and absent in `fallback`
    - CSS: `touch-action: none` on the stage only in `ready`; `block-size: min(50svh, 30rem)` (after a `50vh` fallback) in `ready` and `min-block-size` otherwise; `@media (scripting: none)` hides the Loading art and the control groups
    - Read the asset path, Demo_Clip name and Still_Image paths only from the `exercise` prop. Store nothing in browser storage, cookies or the URL
    - _Requirements: 4.5, 5.1, 5.7, 6.7, 6.8, 6.9, 7.3, 7.7, 8.1, 8.8, 8.9, 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8, 9.10, 9.12, 11.1, 12.5, 12.6, 13.6, 13.7_

- [x] 10. Build the Exercise screens and routes
  - [x] 10.1 Implement `src/ui/exercises/labels.ts` and `exerciseMetadata`
    - `difficultyLabel`, `muscleGroupLabel`, `exerciseName`, `exerciseTitle` (through `format('exercise.title', …)`) and `exercisePath`, with template-literal string ids so a missing label fails the Type_Check
    - Add `exerciseMetadata(e)` → `{ title: exerciseTitle(e) }` to `src/ui/metadata.ts`
    - _Requirements: 1.4, 3.4, 4.2, 4.9_

  - [x] 10.2 Replace the Exercises Placeholder_Screen with the Exercise_List_Screen
    - Add `src/ui/exercises/ExerciseListScreen.tsx` and its CSS module as in the design: `h1` with the Section name, one `next/link` per Exercise_List_Entry in Catalog order whose name starts with the Spooky_Name, followed by Real_Name, Difficulty and Muscle_Groups, and the back-home link. Reuse the Navigation_Entry look (`min-block-size: 3rem`, full width, `0.75rem` gaps, wrapping text). No Viewer import
    - Change `src/app/exercises/page.tsx` to render `<ExerciseListScreen />` with `metadata = sectionMetadata('exercises')`
    - In `src/ui/sections.ts`, add `PlaceholderSectionId = Exclude<SectionId, 'exercises'>` and `placeholderSectionIds`, narrow `sectionMessage` to it, and make `PlaceholderScreen` take that type. Delete `section.exercises.message` from `src/ui/strings.ts`
    - Run this task in the same wave as 12.1 and 12.2, which fix the two tests whose types this change breaks
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 12.1, 12.2, 14.2_

  - [x] 10.3 Add the Exercise_Detail_Screen and the `[slug]` route
    - `src/ui/exercises/ExerciseDetailScreen.tsx` and its CSS module as in the design: back link to `/exercises`, `h1` Spooky_Name, `<ViewerIsland exercise={…} />`, the Safety_Message section, the facts list, the ordered Instruction_Steps and the Cue and Safety_Note lists under their headings. DOM order equals visual order
    - `src/app/exercises/[slug]/page.tsx`: `dynamicParams = false`, `generateStaticParams()` from `exerciseSlugs()`, `generateMetadata` that awaits `params` and returns `exerciseMetadata`, and a page that awaits `params` and calls `notFound()` for an unknown slug
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.9, 4.10, 4.11, 12.1, 12.4, 14.1_

- [x] 11. Add the asset and module-boundary guards
  - [x] 11.1 Write `tests/unit/coach-assets.test.ts`
    - Tests from the design: "every Coach_Asset and Still_Image in the Catalog is a file under public/", "the delivered assets are tracked in git" (listed by `git ls-files`, or untracked and not ignored), "every Coach_Asset is a glTF 2.0 binary within the Viewer budget" (≤ 6 MB, ≤ 35 000 triangles, ≤ 4 materials, textures ≤ 1024 × 1024, an animation named as the Demo_Clip, none of the three decoder-requiring extensions), "every Still_Image is at most 300 KB", "the whole Graveyard_Scene with the Coach stays within 35,000 triangles", "the Graveyard_Scene has a ground, at least two gravestones and a moon visible from the Front view", "every Graveyard_Scene colour is a Halloween_Theme token"
    - Read every path from the Catalog. When a file is missing, fail with a message that names the path and says the Asset_Pipeline has not delivered it yet (Open decision 1). Never skip
    - This test is required, not optional: Requirements 13.2, 13.3 and 13.4 ask the Unit_Suite for these checks. Before delivery, the tests that read a delivered file are expected to fail
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 5.2, 5.4, 5.5_

  - [x] 11.2 Write `tests/unit/module-boundaries.test.ts`
    - Use the TypeScript compiler API, in the scanner style of the repository rules. Tests: "the Catalog imports nothing from React, Three.js, the Viewer or browser storage", "Viewer logic imports nothing from React, Three.js or the DOM", "only the Viewer scene imports Three.js", "the Viewer scene is reached only through one dynamic import", "the Viewer reads asset paths and clip names only from the Catalog", "the Viewer turns on no shadows and no post-processing"
    - Give each scanner one inline fixture that must be flagged and one that must pass
    - This test is required, not optional: the design makes it the enforcement of the module dependency rules
    - _Requirements: 1.7, 5.3, 13.6, 13.7, 15.5_

- [x] 12. Update the ticket 01 tests and rules this ticket invalidates
  - [x] 12.1 Update the Placeholder_Screen message test in `tests/unit/strings.test.ts`
    - "every Placeholder_Screen message is at most 160 characters" iterates the four Placeholder Sections (Stretches, Routines, Crypt, History). Keep the Section-name test on all five Sections
    - Same wave as task 10.2
    - _Requirements: 14.2, 12.7_

  - [x] 12.2 Update `tests/e2e/navigation.spec.ts`
    - The `sections` table drops Exercises from the Placeholder_Screen checks. "each Navigation_Entry opens its screen" expects the Exercise_List_Screen (its heading and an Exercise_List_Entry) for Exercises. "every link leads to a served screen" adds `/exercises` and `/exercises/grave-rise` to its start list
    - Same wave as task 10.2
    - _Requirements: 14.2, 14.3, 3.1_

  - [x] 12.3 Share one screen list across the E2E specs
    - Add `tests/e2e/support/screens.ts` with every screen path (`/`, `/exercises`, `/exercises/grave-rise`, the four Placeholder_Screens, `/no-such-page`), built from `sectionIds`, `placeholderSectionIds` and `exerciseSlugs()`
    - Make `layout.spec.ts`, `theme.spec.ts`, `decorations.spec.ts` and `no-backend.spec.ts` take their screen list from it, so the Exercise_List_Screen and the Exercise_Detail_Screen get the background, font, 768 px column, 44 px link, horizontal-scroll, viewport-meta, Decoration-overlap, same-origin and cookie checks. Update comments that say "the five Placeholder_Screens" or "7 screens"
    - _Requirements: 14.3, 12.1, 12.3, 13.5_

  - [x] 12.4 Update `tests/e2e/static-build.spec.ts`
    - `screenRoutes` adds `/exercises/grave-rise` from `exerciseSlugs()`, which must be prerendered with `initialRevalidateSeconds: false`
    - Replace "`dynamicRoutes` is empty" with: every key of `dynamicRoutes` has `fallback: false`, and every prerendered route whose `srcRoute` is that key is a Catalog slug path. Read the exact field names from the first Build. If Next.js 16.4 records `dynamicParams = false` differently, match that shape and tell the user
    - _Requirements: 14.1_

  - [x] 12.5 Allow the Catalog and Viewer folders in `tests/unit/repository-rules.test.ts`
    - Rename "components and the Strings_Module live under src/ui" to "source files live under src/app, src/ui, src/catalog and src/viewer" and add `src/catalog/` and `src/viewer/` to the allowed prefixes. Keep the single-Strings_Module check
    - _Requirements: 14.8_

  - [x] 12.6 Extend the source-rule scanners for the new code in `tests/unit/source-rules.test.ts`
    - Add fixtures for the shapes this ticket introduces: R3F JSX such as `<color attach="background" args={[colors.sceneSky]} />` and a Three.js material colour from `colors` in a `.ts` file must pass the colour scanner, while a hex literal in either must be flagged; the `{' '}` separator and the `·` joiner must pass the text scanner
    - Run the scanners over `src/catalog/` and `src/viewer/`. If one flags real text or a colour, fix the source. Exempt only non-user-facing values (for example R3F prop values like `attach` or `frameloop`), each with a fixture, and never exempt text a visitor can see or hear
    - _Requirements: 12.8, 5.5, 12.7_

- [x] 13. Add the new end-to-end tests
  - [x] 13.1 Write the WebGL helpers in `tests/e2e/support/webgl.ts`
    - `countDrawCalls(page)`, `disableWebGL(page)`, `simulatePageHidden(page, hidden)` and `waitForCoach(page)` as in the design
    - `waitForCoach` first requests the Catalog's Coach_Asset path with HEAD. If the answer is not 200, it fails with a message naming the path and saying the Asset_Pipeline has not delivered it yet (Open decision 1). Never skip
    - _Requirements: 14.5, 10.1, 10.3, 9.6_

  - [x] 13.2 Write the golden-path detail test in `tests/e2e/exercise-detail.spec.ts`
    - "Home_Screen → Exercises → Grave Rise shows the Written_Content and the Safety_Message", run in both projects: check the Spooky_Name, Real_Name, Difficulty, every Muscle_Group, the Instruction_Steps, the Cues, the Safety_Notes and the Safety_Message, finding each by role, name or text from `locales.en`
    - This test is required, not optional: Requirement 14.4 asks for it. It does not need the delivered files
    - _Requirements: 14.4, 4.1, 4.2, 4.3, 4.4_

  - [x] 13.3 Write the remaining Exercise_Detail_Screen tests
    - Add to `tests/e2e/exercise-detail.spec.ts`: direct request and reload with the Spooky_Name in the title; Written_Content and Safety_Message in the prerendered HTML (`request.get` and `javaScriptEnabled: false`); one ordered list of Instruction_Steps with Cues and Safety_Notes under their headings; the back link; Written_Content and Safety_Message visible while loading, while slow, in 3D and in the Still_Fallback; speed and play state not stored
    - _Requirements: 4.1, 4.3, 4.5, 4.6, 4.9, 4.10, 8.8_

  - [x] 13.4 Write the Viewer control test in `tests/e2e/viewer.spec.ts`
    - "the test browser can create a WebGL2 context" comes first and fails with that message if the software WebGL flags stop working
    - "every Camera_Control and Playback_Control has its name from the Strings_Module": after `waitForCoach`, each of the Front, Side, Back, Rotate, Tilt and Zoom buttons, Play/Pause and the three speeds is found by role and its `locales.en` name
    - This test is required, not optional: Requirement 14.5 asks for it. Before delivery the second test is expected to fail with the missing-file message
    - _Requirements: 14.5, 7.5, 8.4, 12.2_

  - [x] 13.5 Write the remaining Viewer tests
    - Add to `tests/e2e/viewer.spec.ts` the rest of the design's `viewer.spec.ts` row: labelled Coach image, Play/Pause naming, pressed speed with check mark, speed change while paused, gestures inside and outside the Viewer_Area, camera buttons change the picture, controls disabled while loading and absent in the Still_Fallback, 60 % height and visible Play/Pause on the phone, 44 × 44 px targets with 8 px gaps, Tab order with focus indicator, 200 % text, WebGL context released on leaving, reduced-motion start paused and still Loading_State
    - _Requirements: 5.1, 5.7, 5.8, 6.7, 6.8, 6.9, 7.7, 8.1, 8.4, 8.6, 8.7, 8.9, 11.1, 11.5, 12.3, 12.4, 12.5, 12.6_

  - [x] 13.6 Write the failure and slow-load tests in `tests/e2e/viewer-fallback.spec.ts`
    - "a failed Coach_Asset request shows the Still_Fallback with the Written_Content and the Safety_Message": `route.abort()` on the Coach_Asset; check three `img` elements with the Catalog `src` values and their alternative texts, the Front, Side and Back captions, the Still_Fallback message, the Written_Content and the Safety_Message. Do not assert that pixels loaded
    - "a Coach_Asset slower than 10 seconds adds the Slow_Load_Notice with a Retry": delay the response by 11 s, `test.setTimeout(60_000)`, check the `viewer.slowLoad` text and the Retry button
    - This test is required, not optional: Requirements 14.6 and 14.7 ask for it. Neither test needs the delivered files
    - _Requirements: 14.6, 14.7, 9.3, 9.7, 9.9_

  - [x] 13.7 Write the remaining fallback tests
    - Add to `tests/e2e/viewer-fallback.spec.ts`: HTTP 500 and a `'not a glb'` body show the Still_Fallback with a Retry; without WebGL the Coach_Asset is never requested; Still_Images are requested only in the Still_Fallback; a failed Still_Image shows its alternative text; a lost context shows the Still_Fallback with a Retry; Retry restarts loading without the notice; a slow Coach_Asset that finally arrives shows the Coach; the live region announces each phase and is empty in the prerendered HTML; without JavaScript only the Still_Fallback shows
    - _Requirements: 9.2, 9.4, 9.5, 9.6, 9.7, 9.8, 9.10, 9.11, 9.12_

  - [x] 13.8 Write the Render_Loop tests in `tests/e2e/viewer-render-loop.spec.ts`
    - The design's six tests: a paused Coach draws no frames, a camera button while paused draws until the camera stops, a hidden page draws no frames and resumes, a Viewer_Area scrolled out of view draws no frames, resizing a paused Viewer redraws once, and a playing Coach keeps drawing (non-vacuous guard)
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5_

  - [x] 13.9 Write `tests/e2e/exercise-list.spec.ts`
    - The design's six tests for the Exercise_List_Screen, including "the Exercise_List_Screen requests no Coach_Asset, Still_Image or 3D code"
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8_

  - [x] 13.10 Add the 3D-code check to `tests/e2e/no-backend.spec.ts`
    - "3D code loads only on the Exercise_Detail_Screen": search every script response on each screen for `skinning_pars_vertex`; it must appear on the Exercise_Detail_Screen and nowhere else
    - _Requirements: 13.6, 13.5_

  - [x] 13.11 Extend `tests/e2e/not-found.spec.ts`
    - Add `/exercises/no-such-exercise` to the unknown paths (HTTP 404 and the themed not-found screen)
    - _Requirements: 4.11_

- [x] 14. Checkpoint: all suites before asset delivery
  - Run `npx tsc --noEmit`, `npx vitest --run`, `npm run build` and `npx playwright test`. The Type_Check and the Build must exit 0. Playwright must report results for both the `phone` and `laptop` projects
  - Read the `next build` route table: `/exercises` is `○ (Static)`, `/exercises/grave-rise` is `● (SSG)`, and only the detail route's first-load JS grows by the 3D chunk
  - If `public/assets/coach/` is not yet delivered, the expected failures are exactly: in `coach-assets.test.ts`, the tests that read a delivered file; and in the E2E_Suite, the tests that call `waitForCoach` (in `viewer.spec.ts`, `viewer-render-loop.spec.ts`, and the 3D-state cases of `exercise-detail.spec.ts` and `viewer-fallback.spec.ts`). Each must fail with the missing-file message. Report them to the user as expected and waiting for the Asset_Pipeline. Any other failure, or one of these failing with a different message, is a real failure to fix
  - If "the test browser can create a WebGL2 context" fails, report it and stop. Do not weaken the test
  - Run `git status --short` after the Playwright run. It must show no new untracked or modified files from the run (the untracked `assets/`, `[render_dir]/` and the modified `.kiro/settings/mcp.json` were there before)
  - Ensure all tests pass, ask the user if questions arise.
  - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5, 14.6, 14.7, 14.10_

- [ ] 15. Update the steering and commit
  - [x] 15.1 Update `.kiro/steering/structure.md`
    - In "Current state", list `src/catalog/`, `src/viewer/` and the new route `src/app/exercises/[slug]/`, and add `public/assets/` only if it exists in the working tree. Drop `catalog/` and `viewer/` from the sentence about modules that "arrive with the tickets that need them". List no path that is absent
    - _Requirements: 14.9_

  - [x] 15.2 Add the new repository rules to `tests/unit/repository-rules.test.ts`
    - "app code adds no 3D asset files" (`*.glb`, `*.gltf`, `*.blend`, `*.fbx`, `*.obj` only under `assets/` and `public/assets/`), "every dependency is pinned exactly under an allowed licence" (MIT, ISC, BSD-2-Clause, BSD-3-Clause or Apache-2.0, matching the lockfile), "the structure steering lists only paths that exist" (and lists `src/catalog/`, `src/viewer/` and `public/assets/` once they exist)
    - _Requirements: 13.8, 14.9_

  - [-] 15.3 Commit the ticket locally
    - Ask the user before committing. Stage by name: `package.json`, `package-lock.json`, `playwright.config.ts`, the new and changed files under `src/` and `tests/`, `.kiro/steering/structure.md`, and every file in `.kiro/specs/exercise-page-3d-coach/`
    - Do not stage `assets/`, `[render_dir]/`, `public/assets/` (User tasks) or `.kiro/settings/mcp.json`. Do not push
    - _Requirements: 13.8, 14.8, 14.9_

- [~] 16. Final checkpoint: after the Asset_Pipeline delivery
  - Do not start until the user confirms that the Asset_Pipeline delivered `public/assets/coach/coach_grave_rise.glb` and the three Still_Images (User tasks). Check that the four files exist and do not modify them. If they are not committed yet, ask the user whether they commit them or want the agent to stage those four files by name
  - If `structure.md` does not list `public/assets/` yet, add it, and commit the change after asking
  - Run `npx tsc --noEmit`, `npx vitest --run`, `npm run build` and `npx playwright test`. All must exit 0 with no failures; there are no expected failures any more
  - Clone the local Repository into a temp directory with `git clone`. In the clone run `npm ci`, `npx tsc --noEmit`, `npx vitest --run` and `npx playwright test`. All must exit 0 and `git status --short` in the clone must be empty. Delete the temp clone
  - Report the 3D chunk's first-load JS size from the `next build` output. With the user's OK, append it under `## Comments` in `.scratch/spooky-coach-mvp/issues/03-exercise-page-3d-coach.md`
  - Report the remaining User tasks below, with the requirement each one closes
  - Ensure all tests pass, ask the user if questions arise.
  - _Requirements: 13.1, 14.9, 14.10, 15.5_

## Notes

- Sub-tasks marked `*` are optional tests and can be skipped for a faster first pass. These tests are required and carry no `*`: 3.4 (Requirement 2.7), 11.1 (Requirements 13.2–13.4), 11.2 (the design's module-boundary guard), the ticket 01 updates 12.1–12.6 (Requirement 14), 13.2 (14.4), 13.4 (14.5, with the WebGL2 guard), and 13.6 (14.6, 14.7).
- Property tests cover only the design's twelve Correctness Properties. Each uses fast-check 4.10.2 with `numRuns: 200` and the tag comment `// Feature: exercise-page-3d-coach, Property N: <title>`. Examples that share a file with a property test sit in the same sub-task as that property.
- Skipping the optional tests leaves these criteria checked only by the required tests or by eye: the camera, framing, playback and Render_Loop rules (Properties 2–9, tasks 13.5 and 13.8), most of the fallback behaviour (13.7), and the 3D-code-only-on-the-detail-screen E2E check (13.10). Of these, 4.7 (camera clearance), 5.4 (Render_Loop) and 13.8 catch the most for their cost.
- Several test files are written by more than one sub-task (for example `catalog.test.ts`, `viewer-framing.test.ts`, `viewer.spec.ts`). Those sub-tasks sit in different waves of the dependency graph.
- Expected failures before the Asset_Pipeline delivery are limited to the tests that read a delivered file (task 11.1) or call `waitForCoach` (task 13.1). They name the missing file and Open decision 1. Requirement 14.10 applies only after delivery, which is why the final checkpoint waits for it.
- `@react-three/fiber` 9.8.2 accepts React `>=19 <19.4`. Upgrading React to 19.4 later needs an R3F release that widens that range.
- No task contradicts an ADR. The Graveyard_Scene is built in app code (Open decision 4, Option A), so no new asset is needed under ADR 0004.
- What an Option B of the open decisions would change:
  - **Open decision 1, Option B:** add one `prebuild` copy script that copies the files from `assets/coach/` into `public/assets/coach/`, point `coach-assets.test.ts` at the copied files after the copy step, and gitignore the copies. Catalog paths stay the same. Option C needs no code change but makes the `.blend` file and scripts public downloads.
  - **Open decision 2, Option B:** drop tasks 3.2, 3.4, 3.5 and the rule examples in 3.6, remove `validateCatalog` from `index.ts`, and drop Requirement 2 and Property 1.
  - **Open decision 3, Option B:** drop the Tilt up and Tilt down buttons from task 9.2, their strings from task 2.1 and their names from task 13.4. Requirement 7.9 and the Tilt part of 7.5 go away. No logic changes; `tiltBy` stays for the clamp tests.
  - **Open decision 4, Option B:** `Graveyard.tsx` loads a scenery GLB from `/assets/scene/…` through the same fetch and parse path, `coach-assets.test.ts` counts its triangles, and the Asset_Pipeline must deliver it before the Nov 13 check.
  - **Open decision 5:** if the glossary terms land in `CONTEXT.md` under other names, only identifiers and string ids are renamed.

## User tasks (human only, not for the agent)

The agent lists these in task 16 and does not perform them.

- **Answer Open decisions 1–5** in `requirements.md`. The tasks follow Option A of each; the Notes say what changes otherwise.
- **Deliver the assets (Open decision 1, Option A), before task 16.** Through the Asset_Pipeline (Claude Code with Blender), copy `assets/coach/coach_grave_rise.glb` to `public/assets/coach/coach_grave_rise.glb` and render `grave_rise_front.png`, `grave_rise_side.png` (the Coach's left side, camera on +X) and `grave_rise_back.png` into `public/assets/coach/stills/`, each at most 300 KB (the 360 × 480 preview size is about 190 KB). Commit them, or tell the agent it may stage those four files by name. Then tell the agent the delivery is done so task 16 can start. Requirements 13.1, 13.3, 13.4, 14.10.
- **Housekeeping:** commit `assets/coach/` (the `.blend`, `build_coach.py`, `verify_coach.py` and the source GLB, as ticket 02 requires), add `*.blend1` to `.gitignore` so `coach_grave_rise.blend1` stays out, and delete the stray `[render_dir]/` folder once the Still_Images are delivered.
- **Ticket 02 glTF-viewer look:** open `assets/coach/coach_grave_rise.glb` in a glTF viewer (for example gltf-viewer.donmccurdy.com), judge front, side and back for joint collapse and foot sliding, then tick the last box in `.scratch/spooky-coach-mvp/issues/02-skeleton-coach-and-squat.md` and update its `**Status:**`.
- **Real_Phone_Check, by Fri 2026-11-13 (Requirement 15).** Serve the Exercise_Detail_Screen from the Live_URL (push to `main` yourself), or from a production build on your local network: run `npm run build`, then `npx next start -H 0.0.0.0 -p 3000` in your own terminal, and open `http://<laptop-LAN-IP>:3000/exercises/grave-rise` on the phone. Hold one real phone in portrait and judge that the Coach loads, rotates 360°, looks right from Front, Side and Back with no joint collapse or foot sliding, and plays at 0.5×, 0.75× and 1×.
  - **Record it:** append a comment under `## Comments` in `.scratch/spooky-coach-mvp/issues/03-exercise-page-3d-coach.md` (add the heading if it is missing) with the date, phone model, browser, verdict (pass or fail) and one note per Camera_Preset. On a pass, tick the ticket 03 box for the Nov 13 check; ticket 04 stays `ready-for-agent`.
  - **CC0_Fallback trigger:** if the check fails, or no pass is recorded by the end of Fri 2026-11-13, record the CC0_Fallback in the ticket 03 comment, set ticket 04's `**Status:**` to `needs-triage` with a comment pointing to ADR 0003, and open a ticket to source CC0 Coach_Assets that meet Requirement 13.3. No Mixamo asset. The swap then needs only files under `public/assets/` and Catalog content (Requirements 13.7, 15.5).
- **Eye checks on real devices:** on a real phone and a laptop, check that the Coach looks right from Front, Side and Back, the squat loops with no visible jump, the graveyard, moon and fog read as spooky, the moon is visible in the Front view and no gravestone hides the Coach (Requirements 5.1, 5.2, 7.2). With reduced motion on, check that the Coach starts paused (11.1). With VoiceOver or TalkBack, listen that the Loading_State and Still_Fallback messages are announced once (9.2); the full pass is ticket 13.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "2.1", "2.5", "3.1", "4.1", "5.1", "6.1", "6.3"] },
    { "id": 1, "tasks": ["2.2", "2.3", "2.4", "2.6", "3.2", "4.2", "4.3", "5.2", "6.2", "6.4"] },
    { "id": 2, "tasks": ["3.3", "4.4", "4.6", "4.7", "5.3", "8.1", "9.1", "9.3"] },
    { "id": 3, "tasks": ["3.4", "3.7", "4.5", "4.8", "5.4", "8.2", "9.2", "10.1"] },
    { "id": 4, "tasks": ["3.5", "4.9", "5.5", "8.3"] },
    { "id": 5, "tasks": ["3.6", "9.4"] },
    { "id": 6, "tasks": ["10.2", "10.3", "12.1", "12.2"] },
    { "id": 7, "tasks": ["11.1", "11.2", "12.3", "12.4", "12.5", "12.6", "13.1"] },
    { "id": 8, "tasks": ["13.2", "13.4", "13.6", "13.8", "13.9", "13.10", "13.11"] },
    { "id": 9, "tasks": ["13.3", "13.5", "13.7"] },
    { "id": 10, "tasks": ["15.1"] },
    { "id": 11, "tasks": ["15.2"] },
    { "id": 12, "tasks": ["15.3"] }
  ]
}
```
