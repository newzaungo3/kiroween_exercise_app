# Project Structure

## Current state

Scaffolded by ticket `01-spooky-site-skeleton`: a statically prerendered Next.js site with a Home screen, five placeholder Section screens, a not-found screen, and Vitest and Playwright harnesses. Tracked files in the Repository:

```
/
├── .kiro/                  # Kiro settings, skills, specs, steering (committed, never gitignored)
├── docs/
│   ├── adr/                # Architecture decision records 0001–0004
│   └── agents/             # Agent guides: domain docs, issue tracker, triage labels
├── src/
│   ├── app/                # Next.js App Router route files, globals.css, icon.svg
│   ├── types/              # Tracked Next.js type references (next.d.ts)
│   └── ui/                 # Screens, Decorations, fonts, theme tokens, central strings module
├── tests/
│   ├── e2e/                # Playwright specs (phone and laptop projects)
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

Target for later tickets, derived from the spec's modules. `src/app/`, `src/ui/`, `tests/unit/`, `tests/e2e/` and `LICENSE` exist now; `catalog/`, `workout-engine/`, `progress-store/`, `viewer/` and `public/assets/` arrive with the tickets that need them. Update "Current state" whenever one is added.

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
