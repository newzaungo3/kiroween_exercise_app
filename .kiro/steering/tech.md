# Tech Stack

## Stack

| Layer | Choice |
|---|---|
| Framework | Next.js, TypeScript **strict** |
| 3D | React Three Fiber on Three.js |
| Storage | Browser `localStorage` only |
| Unit/integration tests | Vitest |
| E2E tests | Playwright |
| Hosting | Vercel, deployed from `main`; public GitHub repo, MIT license |

- TypeScript strict everywhere. No `any` unless unavoidable, and then commented.
- **Website, not native (ADR 0001).** No React Native or Expo. Phone-first responsive layout.
- **No backend (ADR 0002).** No server, database, accounts, auth, API routes for user data, analytics or telemetry. No secrets or env vars. All user data (Candy, Unlocks, customisation, history, checkpoint, settings) lives in browser storage. Losing data on cleared storage or a new device is accepted.

## Who builds what (ADR 0004)

- **Kiro** implements all app code through Kiro specs. The `/.kiro` directory (specs, hooks, steering) is committed and never gitignored.
- **Claude Code + Blender MCP** produces the 3D assets. App-code tasks consume GLB files; they don't author or edit them.

## 3D assets (ADR 0003)

- One original skeleton Coach rig, exported as **GLB** under the repo's MIT license.
- Accessories are separate meshes attached to bones. Coach colors are material tints applied at runtime.
- Each Exercise animation is an in-place looping clip on the same rig.
- Budget per Exercise: ≤35k triangles, ≤4 materials, ≤1024² textures. No real-time shadows, no post-processing.
- **Never Mixamo** (its terms forbid redistribution). CC0 assets are the only fallback.
- Gate: by Fri 2026-11-13 one squat animation on the Coach must load in the browser, rotate and look right; otherwise switch to CC0 assets.

## Modules

| Module | Responsibility and rules |
|---|---|
| **Catalog** | Static, typed content for Exercises, Stretches and Routines. Read-only at runtime. Exposes a validation function enforcing: each Exercise targets reps **or** seconds (not both) with a value >0; Sets 1–10; rest 0–600 s; every Routine ends with a Cool-down of Stretches. |
| **Workout engine** | Pure logic. Must not import React, Three.js or storage. Commands: start (from a Routine), confirm Set (with actual reps for rep targets), skip Set, skip rest, pause, resume, quit, advance time (injected clock or tick). Exposes: current Exercise, Set index, phase (exercising / resting / paused / summary), remaining timer, Candy earned so far, final Workout outcome. Serialises to a checkpoint and restores from one. Flow: preparing → active ↔ paused → resting → active … → completed or abandoned. |
| **Progress store** | Owns Candy balance, Welcome gift flag, Unlocks, equipped Coach color and Accessories, Coach name, Workout history, resume checkpoint, settings (sound on/off). Storage adapter is injected: in-memory in tests, `localStorage` in the app. Stored data carries a schema version for migrations. An Unlock with insufficient Candy fails with no change. |
| **Viewer** | R3F scene: small graveyard, moon, fog, Coach with equipped customisation. Orbit controls with zoom and pitch limits (camera never passes through the Coach), Front/Side/Back presets, play/pause, speeds 0.5×/0.75×/1×. Camera resets when the Exercise changes. Spooky loading state; still images plus written instructions if 3D fails. Follows `prefers-reduced-motion`. |
| **UI shell** | Screens: home, Exercises, Stretches, Routines, Exercise detail, Routine detail, Workout, summary, Crypt, History, Settings. |

## Cross-cutting rules

- Viewer speed changes never affect Workout time.
- The render loop stops when the Viewer is paused or hidden.
- The Workout auto-pauses when the page is hidden. Time while the page was closed never counts.
- Save the Workout engine checkpoint to the Progress store on every state change and at least every 5 s while active.
- All user-facing strings come from one central module; never hardcode text in components.

## Commands

Not scaffolded yet; these are the expected scripts. Shell is PowerShell on Windows. Run the dev server manually in a terminal, never from the agent.

```bash
npm run dev            # dev server (manual)
npm run build          # production build
npx vitest --run       # unit/integration tests, single run
npx playwright test    # E2E smoke test
npx tsc --noEmit       # type check
```

## Testing

- Test external behavior through a module's public interface. Never assert on internal state shape, private helpers or rendering details.
- Name tests after the rule they protect, in glossary terms, e.g. `"a skipped Set earns no Candy"`.
- **Workout engine** (primary seam, injected clock, never real time): Set confirm/skip; per-Set Candy and completion bonus including the Cool-down requirement; Workout outcome; pause stops the timer; rest timing and skip rest; checkpoint round-trip; Viewer speed does not affect time.
- **Progress store** (in-memory adapter): Welcome gift granted exactly once; Unlock rejected on insufficient Candy with balance unchanged; Unlocks persist across reload (new store over the same storage); history append and order; checkpoint save and clear; schema version present.
- **Catalog:** one test validates all shipped content against the invariants so bad content fails CI.
- **Playwright smoke test (golden path):** open site → receive Welcome gift → start "Graveyard Shift" → confirm every Set → summary shows completed with bonus → Candy balance increases → Unlock witch hat.
- Viewer and 3D assets are checked by eye on real devices, not automated tests.
