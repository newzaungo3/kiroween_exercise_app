# Project Structure

## Current state

Planning only; the app is not scaffolded yet (ticket `01-spooky-site-skeleton`).

```
/
├── .kiro/steering/               # These steering files (committed, never gitignored)
├── .scratch/spooky-coach-mvp/    # Local issue tracker (markdown, not shipped)
│   ├── spec.md                   # Feature spec: user stories, decisions, scope
│   └── issues/01–16-*.md         # One ticket per file
├── docs/
│   ├── adr/0001–0004-*.md        # Architecture Decision Records
│   └── agents/                   # domain.md, issue-tracker.md, triage-labels.md
├── CONTEXT.md                    # Domain glossary: primary vocabulary reference
└── CLAUDE.md                     # Agent skill index (used by Claude Code)
```

## Proposed app layout

Not fixed by any source doc. Derived from the spec's modules. Once scaffolded, update this section to match reality.

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
