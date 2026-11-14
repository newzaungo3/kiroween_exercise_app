# Project Structure

## Current state

Scaffolded by ticket `01-spooky-site-skeleton`: a statically prerendered Next.js site with a Home screen, placeholder Section screens, a not-found screen, and Vitest and Playwright harnesses. Ticket `03-exercise-page-3d-coach` added the Catalog, the Viewer, the Exercise list screen and the Exercise detail screen, where the 3D Coach demonstrates each Exercise. Ticket `05-catalog-and-stretches` added the Stretches to the Catalog, the Stretch list screen and the Stretch detail screen. Ticket `06-happy-path-workout` added the Workout engine, the Routine list and Routine detail screens and the Workout screen. Ticket `07-skip-pause-quit` added the Workout engine's skip, pause, resume, Auto_Pause and quit commands and its `paused` phase, the Coach_Hold input of the Viewer, and the Confirm_Dialog and Paused_Panel of the Workout screen. Ticket `08-candy-and-history` added the Progress_Store with its Storage_Adapters, the recording of a Workout at the summary, the Candy_Balance on the Home_Screen, the balance on the Summary_Panel and the History_Screen. Ticket `09-resume-after-refresh` added the Workout engine's checkpoint and restore, Schema_Version 2 of the Progress_Store with its migration from version 1, the Stored_Checkpoint and its store operations, the checkpoint saving of the Workout screen, and the Resume_Prompt on the Home screen and the Workout route. Ticket `11-the-crypt` added the Crypt_Content to the Catalog, Schema_Version 3 of the Progress_Store with Unlocks, the Coach_Customisation and the migration from version 2, the Crypt rules and the Crypt_Screen in `src/ui/crypt/`, the Read_Only_Bridge in `src/ui/progress/`, the Viewer's tint and Accessories, and the removal of the Placeholder_Screen. Tracked files in the Repository:

```
/
├── .kiro/                  # Kiro settings, skills, specs, steering (committed, never gitignored)
├── docs/
│   ├── adr/                # Architecture decision records 0001–0004
│   └── agents/             # Agent guides: domain docs, issue tracker, triage labels
├── public/
│   └── assets/             # Delivered 3D assets: the Grave Rise Coach GLB and its Still_Images
├── src/
│   ├── app/                # Next.js App Router route files, globals.css, icon.svg
│   │   ├── crypt/          # Crypt route
│   │   ├── exercises/[slug]/  # Exercise detail route, one prerendered page per Catalog slug
│   │   ├── history/        # History route
│   │   ├── routines/       # Routine list route
│   │   │   └── [slug]/     # Routine detail route, one prerendered page per Catalog slug
│   │   │       └── workout/  # Workout route, one prerendered page per Catalog slug
│   │   └── stretches/[slug]/  # Stretch detail route, one prerendered page per Catalog slug
│   ├── catalog/            # Static Exercise content and validateCatalog
│   ├── progress-store/     # Candy balance, Welcome gift, Workout history, Stored_Checkpoint, Unlocks, Coach_Customisation; Schema_Version 3; injected Storage_Adapters, no React
│   ├── types/              # Tracked Next.js type references (next.d.ts)
│   ├── ui/                 # Screens, Decorations, fonts, theme tokens, central strings module
│   │   ├── crypt/          # Crypt screen and Crypt rules
│   │   ├── history/        # History screen and date formatting
│   │   ├── progress/       # Progress hook, Candy_Balance, Resume_Prompt, Workout recording bridge, Read_Only_Bridge
│   │   ├── routines/       # Routine list and Routine detail screens, labels
│   │   └── workout/        # Workout screen, panels, run reducer, checkpoint saving, clock text, rep field
│   ├── viewer/             # Viewer island, pure camera/playback logic, R3F scene, still fallback
│   └── workout-engine/     # Pure Workout logic: Set slots, Rest, Candy rule, checkpoint and restore, no React or storage
├── tests/
│   ├── e2e/                # Playwright specs (phone and laptop projects), support/ helpers
│   └── unit/               # Vitest tests, support/ helpers, type-check fixtures
├── .gitignore
├── CONTEXT.md              # Domain glossary
├── LICENSE                 # MIT
├── next.config.ts
├── package-lock.json       # The only lockfile
├── package.json
├── playwright.config.ts
├── readme.md
├── tsconfig.json
└── vitest.config.mts
```

`.scratch/` (local issue tracker), `CLAUDE.md` and `skills-lock.json` exist locally but are gitignored.

## Proposed app layout

Target for later tickets, derived from the spec's modules. `src/app/`, `src/catalog/`, `src/ui/`, `src/viewer/`, `public/assets/`, `tests/unit/`, `tests/e2e/` and `LICENSE` exist now, and so do `src/workout-engine/` and `src/progress-store/`. Update "Current state" whenever one is added.

```
src/
├── app/              # Next.js App Router routes and layouts
├── catalog/          # Exercise, Stretch, Routine content + validation
├── workout-engine/   # Pure logic: no React, Three.js or storage imports
├── progress-store/   # Candy, Unlocks, history, checkpoint, settings; injected storage adapter
├── viewer/           # React Three Fiber scene
└── ui/               # Screens, components, central strings module (Thai-ready)
public/assets/        # GLB Coach and Accessories, CC0 sound effects
tests/unit/           # Vitest: workout-engine, progress-store, catalog
tests/e2e/            # Playwright golden-path smoke test
LICENSE               # MIT
```

## Conventions

- **Read domain docs first.** Before working in an area, read `CONTEXT.md` and the ADRs that touch it. Use glossary terms in all output.
- **Flag ADR conflicts.** If a change contradicts an ADR, say so explicitly (e.g. "Contradicts ADR 0002 (no backend), because…") instead of silently overriding it. Record new architectural decisions as a new numbered ADR: a short title and one paragraph giving the context and the decision.
- **Issues** live at `.scratch/<feature>/issues/NN-slug.md`, numbered from `01`, one file per ticket. Each has a `**Blocked by:**` line, a `**Status:**` line near the top, a "What to build" description and checkbox acceptance criteria. Append discussion under `## Comments`.
- **Triage labels** (values for `Status:`): `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`.
- **3D assets** are produced outside this codebase (Blender MCP) and loaded at runtime from `public/assets/`.
- **User-facing text** comes only from the central strings module.
