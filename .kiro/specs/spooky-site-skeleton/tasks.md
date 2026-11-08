# Implementation Plan: Spooky Site Skeleton

## Overview

This plan builds the statically prerendered Next.js site described in `design.md`, in TypeScript strict mode. Work goes bottom-up. First come the config files and test harnesses, then the Strings_Module and theme tokens, then the screen components and route files. Guard tests and E2E specs follow, and the plan ends with repository readiness. Each step leaves the Repository in a state where `npx tsc --noEmit` passes.

Ground rules for every task:

- The shell is PowerShell on Windows. The agent may run `npx tsc --noEmit`, `npx vitest --run`, `npx playwright test` and `npm run build`. The agent never runs `npm run dev`.
- Every user-facing string comes from `src/ui/strings.ts`. Every colour comes from `src/ui/theme/tokens.ts`.
- Use glossary terms in identifiers, test names and comments.
- Human-only steps (Vercel, GitHub, branch rename, real-device checks) are listed under "User tasks" at the end. They are not agent tasks.
- Task 10 holds the work for the two open decisions. Do it only after the user answers. No other task depends on it.

## Tasks

- [x] 1. Scaffold the project and test harnesses
  - [x] 1.1 Create the Next.js scaffold and dependency lockfile
    - Hand-write `package.json` with the shape from the design: `"private": true`, `"license": "MIT"`, `"engines": { "node": "24.x" }`, scripts `dev`/`build`/`start` = `next dev`/`next build`/`next start`, plus `typecheck`, `test` (`vitest --run`) and `test:e2e`. Use no shell operators or env-var syntax in any script
    - Install exact versions with `npm install --save-exact`: `next@16.4.5`, `react@19.3.1`, `react-dom@19.3.1`. Dev dependencies: `typescript@6.0.3` (not 7.x), `@types/node@24.19.2`, `@types/react@19.3.0`, `@types/react-dom@19.3.0`, `vitest@5.1.0`, `vite@8.3.6`, `@playwright/test@1.65.0`, `fast-check@4.10.2`. This produces `package-lock.json` as the only lockfile
    - Write `tsconfig.json` exactly as in the design (strict, `noUncheckedIndexedAccess`, `allowJs: false`, `types: ["node"]`, `paths` `@/*` → `./src/*` with no `baseUrl`, the include list covering `src/`, `tests/` and the config files)
    - Write `next.config.ts` as an empty typed `NextConfig`. Create no `vercel.json`
    - Add `src/types/next.d.ts` with the two Next.js reference lines, so CSS module types resolve on a clean checkout without `next-env.d.ts`
    - Replace `.gitignore` with the final content from the design: build output, `.env*`, Playwright output, local planning files, and the `CONTEXT.md` and `docs/` lines kept with the Open decision 2 comment. Confirm that no pattern matches a path inside `.kiro/`
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.6, 8.6, 8.9, 9.3, 9.4, 9.6, 10.2, 11.2_

  - [x] 1.2 Configure Vitest
    - Write `vitest.config.mts` from the design: `resolve.tsconfigPaths: true`, `include: ['tests/unit/**/*.test.{ts,tsx}']`, `environment: 'node'`, `watch: false`
    - Create `tests/unit/` and `tests/unit/support/`
    - _Requirements: 7.1, 7.2, 7.3, 7.5, 7.6_

  - [x] 1.3 Configure Playwright
    - Write `playwright.config.ts` from the design: `testDir: './tests/e2e'`, `testMatch: '**/*.spec.ts'`, `retries: 0`, `forbidOnly: true`, `list` reporter. Add the `phone` project (Chromium, 360 × 640, `isMobile`, `hasTouch`, `deviceScaleFactor: 2`) and the `laptop` project (Chromium, 1440 × 900). Set `webServer` to the command `npm run build && npm run start -- --port 3100`, `reuseExistingServer: false` and `timeout: 300_000`
    - Create `tests/e2e/`
    - Run `npx playwright install chromium` once
    - _Requirements: 8.1, 8.2, 8.4, 8.7, 8.8_

- [x] 2. Build the Strings_Module and Section model
  - [x] 2.1 Implement `src/ui/strings.ts`
    - Define the English Locale `en` with every identifier and text from the design's "English Locale entries" table, typed `as const satisfies Record<string, string>`
    - Export `StringId`, `LocaleStrings`, `defineLocale` (rejects missing identifiers and extra identifiers through the mapped `never` type), `locales`, `Locale`, `activeLocale = 'en'` and `t(id)`
    - The file imports nothing from the project
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.6, 6.7, 6.8, 6.9, 2.2, 2.6, 2.7, 3.3, 3.7_

  - [x] 2.2 Implement `src/ui/sections.ts`
    - Export `sectionIds` in Home_Navigation order (exercises, stretches, routines, crypt, history), `SectionId`, `sectionPath`, `sectionName`, `sectionMessage` and `sectionTitle`. Build the template-literal string identifiers so that a missing section string fails the Type_Check
    - _Requirements: 2.3, 3.1, 3.3, 3.7, 6.3_

  - [x] 2.3 Add the type-level fixtures `tests/unit/strings.type-check.ts`
    - Add three `@ts-expect-error` lines: an unknown identifier passed to `t()`, a Locale missing an English identifier, and a Locale with an extra identifier. Vitest does not collect this file (the name does not end in `.test.ts`). `tsc` checks it
    - _Requirements: 6.3, 6.4, 1.7, 7.8_

  - [x] 2.4 Implement the string-check helpers in `tests/unit/support/strings-checks.ts`
    - `findBlankEntries(strings)` returns the identifiers whose value has no non-whitespace character (including Unicode whitespace), in key order
    - `findAvoidWords(text)` returns the glossary Avoid words found as whole words, in any letter case, singular or plural. Export the Avoid word list from the requirements (6.7)
    - _Requirements: 6.2, 6.7, 7.4, 7.7_

  - [x] 2.5 Write property test for `findBlankEntries`
    - **Property 1: Blank-entry finder names exactly the blank identifiers**
    - File `tests/unit/support/strings-checks.blank.test.ts`. Use `fc.dictionary` with blank values from `['', ' ', '\t', '\n', '\u00a0', '\u2003', '\u3000']` and non-blank values. Set `numRuns: 200` and add the feature/property tag comment
    - **Validates: Requirements 6.2, 7.4, 7.7**

  - [x] 2.6 Write property test for `findAvoidWords`
    - **Property 2: Avoid-word matcher finds whole words only**
    - File `tests/unit/support/strings-checks.avoid.test.ts`. Use random letter case, an optional plural suffix, non-letter boundaries for the "found" direction and letter boundaries for the "not found" direction. Set `numRuns: 200` and add the tag comment
    - **Validates: Requirements 6.7**

  - [x] 2.7 Write `tests/unit/strings.test.ts` (the Unit_Suite's required passing test)
    - Read the Strings_Module only through `locales`, `activeLocale` and `t`
    - Tests: "every English Locale entry has visible text" (`expect(findBlankEntries(locales.en)).toEqual([])`, so the failure names the offending identifiers), "no English Locale entry uses a glossary Avoid word", "the five Section names are Exercises, Stretches, Routines, Crypt and History", "the tagline is one sentence of at most 80 characters", "every Placeholder_Screen message is at most 160 characters", "every registered Locale has exactly the English identifiers", "the Site shows the English Locale"
    - This test is required, not optional: Requirement 7.4 asks for it, and it is the passing test behind Requirement 7.1
    - _Requirements: 2.7, 3.3, 6.2, 6.4, 6.6, 6.7, 6.8, 7.1, 7.4, 7.7_

- [x] 3. Build the Halloween_Theme tokens and fonts
  - [x] 3.1 Implement `src/ui/theme/tokens.ts`
    - Export `colors` with the starting palette from the design, `ColorToken`, and `themeCss(tokens = colors)`. `themeCss` emits `:root{--color-<kebab-case>:<value>;…}` plus `html{background:var(--color-bg);color:var(--color-text);}` and never sets a root font size
    - This is the only file in `src/` that may contain colour literals
    - _Requirements: 4.1, 4.2, 4.3, 4.8, 4.9, 2.8, 5.9_

  - [x] 3.2 Implement the colour helpers in `tests/unit/support/color.ts`
    - `relativeLuminance(hex)`, `contrastRatio(a, b)` (WCAG 2.x, `#rrggbb` input) and `hue(hex)` (HSL hue in degrees)
    - _Requirements: 2.8, 4.1, 4.2, 4.8, 4.9_

  - [x] 3.3 Write property test for `contrastRatio`
    - **Property 3: Contrast ratio is symmetric and bounded**
    - File `tests/unit/support/color.test.ts`. Draw two `#rrggbb` colours from integer triples and check symmetry, the 1 to 21 bounds, and a ratio of 1 for equal colours. Set `numRuns: 200` and add the tag comment
    - **Validates: Requirements 4.8, 4.9, 2.8**

  - [x] 3.4 Add the self-hosted fonts and `src/ui/fonts.ts`
    - Get the font files from the Fontsource packages without adding them as dependencies. Run `npm pack @fontsource/creepster@5.3.0 @fontsource/atkinson-hyperlegible@5.3.0 --pack-destination <temp dir>` and extract each tarball with `tar -xzf`
    - Copy `creepster-latin-400-normal.woff2`, `atkinson-hyperlegible-latin-400-normal.woff2` and `atkinson-hyperlegible-latin-700-normal.woff2` into `src/ui/fonts/`. Copy each package's licence as `src/ui/fonts/OFL-Creepster.txt` and `src/ui/fonts/OFL-AtkinsonHyperlegible.txt`. If a package's licence file is not the SIL OFL 1.1 text, stop and ask the user. Delete the temp dir afterwards. `package.json` must not change
    - Write `src/ui/fonts.ts` with the `next/font/local` declarations from the design (`display: 'swap'`, fallback stacks, `--font-display` and `--font-body` variables) and export `fontVariables`
    - _Requirements: 4.4, 4.5, 4.11, 1.2_

  - [x] 3.5 Write property test for `themeCss`
    - **Property 4: Theme CSS round trip**
    - File `tests/unit/theme.test.ts`. Map random lower-camel-case names to `#rrggbb` values, parse the `--color-[a-z-]+:#[0-9a-f]{6}` declarations back out, and expect exactly one declaration per token and no other. Set `numRuns: 200` and add the tag comment
    - **Validates: Requirements 4.1, 4.3**

  - [x] 3.6 Write unit tests for the theme tokens
    - Add to `tests/unit/theme.test.ts`: "the Halloween_Theme background is dark" (luminance ≤ 0.05), "the orange and purple accents fall in their hue ranges", "body text has at least 4.5:1 contrast on every background it sits on", "headings have at least 3:1 contrast", "the focus indicator has at least 3:1 contrast"
    - If a starting palette value fails, change the value in `tokens.ts`, not the test
    - _Requirements: 2.8, 4.1, 4.2, 4.8, 4.9_

- [x] 4. Build the screens and route files
  - [x] 4.1 Implement `src/ui/metadata.ts`
    - Export `siteViewport` (`width: 'device-width'`, `initialScale: 1`, `themeColor: colors.bg`, no `maximumScale`, no `userScalable`), plus `homeMetadata()`, `sectionMetadata(id)` and `notFoundMetadata()`. All titles and descriptions come from the Strings_Module
    - _Requirements: 2.6, 3.7, 5.5, 5.6, 6.1_

  - [x] 4.2 Implement the Decorations in `src/ui/decorations/`
    - `Bat.tsx` and `Cobweb.tsx` are inline SVGs using `currentColor`, with `focusable="false"` and `data-decoration="bat"` or `data-decoration="cobweb"`
    - `DecorationLayer.tsx` is an `aria-hidden="true"` in-flow band of fixed height above `<main>`, with `pointer-events: none`. It holds two cobwebs and two bats
    - `decorations.module.css` sets colours only through `var(--color-bat)` and `var(--color-web)`. The bat drift is a `transform` keyframe of at least 4 s per cycle with no opacity change. Under `prefers-reduced-motion: reduce` the animation is `none`. No transitions
    - _Requirements: 4.3, 4.6, 4.7, 4.10, 4.12, 4.13_

  - [x] 4.3 Implement `src/ui/site-frame/SiteFrame.tsx` and its CSS module
    - Render `DecorationLayer` followed by `<main>`. `.main` has `max-width: 48rem`, `margin-inline: auto` and equal inline padding. There is no `<nav>` in SiteFrame and no `overflow-x: hidden` anywhere
    - _Requirements: 2.4, 4.12, 5.2, 5.7_

  - [x] 4.4 Implement the root layout, global CSS and favicon
    - `src/app/layout.tsx` exports `metadata = homeMetadata()` and `viewport = siteViewport`. It renders `<html lang={activeLocale} className={fontVariables}>`, a `<head>` with `<style>{themeCss()}</style>`, and `<body><SiteFrame>{children}</SiteFrame></body>`
    - `src/app/globals.css` holds the reset and base styles. Headings use `var(--font-display)`, everything else uses `var(--font-body)`, and body text is at least `1rem`. Colours come from token variables only. Sizes are in `rem`, and no rule sets the `html` font size
    - Add `src/app/icon.svg` as the pumpkin favicon
    - _Requirements: 1.1, 2.5, 4.1, 4.4, 4.5, 4.11, 5.5, 5.7, 5.9, 6.8_

  - [x] 4.5 Implement the Home_Screen
    - `src/ui/home/HomeScreen.tsx` and its CSS module: an `h1` with `t('app.name')`, the tagline paragraph, and `<nav aria-label={t('home.nav.label')}>` with a `<ul>` of `next/link` Navigation_Entries built from `sectionIds`
    - `.navList` is a single column with `gap: 0.75rem`. `.navEntry` has `min-block-size: 3rem`, full width and wrapping labels (no `nowrap`, no ellipsis). The focus style is a `:focus-visible` outline in `var(--color-focus)`. Each accent token is visibly used at least once
    - `src/app/page.tsx` exports `metadata = homeMetadata()` and renders `<HomeScreen />`
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.7, 2.8, 2.9, 4.2, 5.1, 5.3, 5.4, 5.8_

  - [x] 4.6 Implement the Placeholder_Screen and the five Section routes
    - `src/ui/placeholder/PlaceholderScreen.tsx` and its CSS module: an `h1` with `sectionName(sectionId)`, the `sectionMessage` paragraph, and a `Link href="/"` with `t('common.backHome')`. The link has a target size of at least 44 × 44 px
    - Add `src/app/{exercises,stretches,routines,crypt,history}/page.tsx`. Each exports `metadata = sectionMetadata('<id>')` and renders the PlaceholderScreen. Use no dynamic APIs
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.7, 3.8, 5.3, 10.5_

  - [x] 4.7 Implement the not-found screen
    - `src/ui/not-found/NotFoundScreen.tsx` and its CSS module show the not-found heading, the message, and the back-home link with a 44 × 44 px target
    - `src/app/not-found.tsx` exports `metadata = notFoundMetadata()` and renders the NotFoundScreen
    - _Requirements: 3.6, 3.8, 5.3, 10.5_

- [x] 5. Checkpoint: type check, unit tests and first Build
  - Run `npx tsc --noEmit`, `npx vitest --run` and `npm run build`. All must exit 0. The Build output must mark `/`, the five Section routes and `/_not-found` as static (○), with no dynamic route
  - Run `git status --short`. If `next build` rewrote `tsconfig.json`, keep the change, run `npm run build` again, and confirm the file stays unchanged. If CSS module types fail to resolve without `next-env.d.ts`, apply the design's fallback (`typecheck` = `next typegen && tsc --noEmit`) and tell the user that Requirement 1.3 needs rewording
  - Ensure all tests pass, ask the user if questions arise.
  - _Requirements: 1.3, 7.1, 10.2, 10.5, 11.1_

- [x] 6. Add the static guard tests
  - [x] 6.1 Write `tests/unit/source-rules.test.ts`
    - Use the TypeScript compiler API to parse `src/**/*.ts(x)`. Tests: "components show no user-facing text outside the Strings_Module", "components take every colour from the Halloween_Theme tokens" (covers `.css` and `.tsx`, with `tokens.ts` exempt), "`any` appears only with a comment explaining why" (covers `src/` and `tests/`), "the root font size is never set in an absolute unit" (covers CSS and `themeCss()` output)
    - Give each scanner one inline fixture that must be flagged and one that must pass
    - _Requirements: 1.8, 4.3, 5.9, 6.1, 6.5_

  - [x] 6.2 Write `tests/unit/repository-rules.test.ts`
    - Cover the filesystem, `package.json` and `git` checks listed in the design: App Router only; strict mode and no script files with `.js`/`.jsx`/`.mjs`/`.cjs`; components under `src/ui`; npm scripts and no `vercel.json`; a single lockfile; Playwright pinned; no backend (no `route.*`, `middleware.*`, `proxy.*` or `"use server"`); no analytics packages or imports; no env var except `NODE_ENV`; LICENSE is MIT, 2026, Newturno; nothing in `.kiro/` gitignored (`git check-ignore --no-index`); required ignore patterns; local planning files ignored and untracked; no secret patterns in tracked files
    - Add the "domain docs are committed" test (9.5) as `it.skip`, with a comment that task 10.1 enables it
    - _Requirements: 1.1, 1.2, 1.4, 1.5, 1.6, 8.6, 8.9, 9.1, 9.3, 9.4, 9.6, 9.9, 10.1, 10.3, 10.6, 11.2_

- [x] 7. Add the end-to-end tests
  - [x] 7.1 Write `tests/e2e/home-screen.spec.ts` (the E2E_Suite's required test)
    - Import expected text from `locales.en` through `@/ui/strings`. Find elements by role and accessible name
    - Tests: "the Home_Screen shows the app name and the five Navigation_Entries in order" (level-1 heading visible; the navigation landmark visible with exactly five links named in order), "the Home_Screen has one navigation landmark, an English lang and the app name in its title", "the tagline follows the heading", "the visitor lands on the Home_Screen with no sign-up" (status 200, final URL `/`, no `dialog` role)
    - This test is required, not optional: Requirement 8.3 asks for it, and it gives the two passing results behind Requirement 8.5
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 8.3, 8.5_

  - [x] 7.2 Write `tests/e2e/navigation.spec.ts`
    - Each Navigation_Entry opens its Placeholder_Screen at its route. Tab moves through the entries in order and Enter opens one. Direct requests and reloads of each Section route serve its Placeholder_Screen. Every Placeholder_Screen links back home and has a title containing the Section name. Every link on every screen leads to a served screen
    - _Requirements: 2.8, 2.9, 3.1, 3.2, 3.3, 3.4, 3.7, 3.8_

  - [x] 7.3 Write `tests/e2e/not-found.spec.ts`
    - `/no-such-page` and `/exercises/unknown` return HTTP 404 and show the themed heading, the message and the home link
    - _Requirements: 3.6_

  - [x] 7.4 Write `tests/e2e/theme.spec.ts`
    - Every screen shares the background and the display font. The background is dark with JavaScript disabled. Headings use the display font and body text is at least 16 px. An orange and a purple element are visible on the Home_Screen. Text stays visible when `**/*.woff2` requests are aborted. Decorations stay still with `reducedMotion: 'reduce'`
    - _Requirements: 3.5, 4.1, 4.2, 4.4, 4.10, 4.11_

  - [x] 7.5 Write `tests/e2e/decorations.spec.ts`
    - The Home_Screen shows a bat and a cobweb (found by `data-decoration`). Decorations are hidden from assistive technology, outside the focus order, and take no taps. On all 7 screens, no Decoration bounding box intersects a heading or a Navigation_Entry
    - _Requirements: 4.6, 4.7, 4.12_

  - [x] 7.6 Write `tests/e2e/layout.spec.ts`
    - Phone only: the heading and every entry fit in 360 × 640 with no scrolling. Phone only: 200 % root text (via `page.addStyleTag`) causes no clipping, no overlap and no horizontal scroll. Laptop only: the content is at most 768 px wide and centred within 1 px, and the background covers the viewport
    - Both projects: every link is at least 44 × 44 px; Navigation_Entries are at least 8 px apart; no screen scrolls sideways at widths 320, 360, 414, 768, 1024, 1440 and 1920; every screen has a responsive, zoomable viewport meta tag
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8_

  - [x] 7.7 Write `tests/e2e/no-backend.spec.ts`
    - Against the production server, record every request from navigation start until 5 s after `load`, and while clicking between screens. Every request is same-origin and uses GET or HEAD. Font files come from the Site's origin. No cookies are set
    - _Requirements: 4.5, 10.4, 10.7, 10.8_

  - [x] 7.8 Write `tests/e2e/static-build.spec.ts` (laptop project only)
    - Read `.next/prerender-manifest.json` and `.next/app-path-routes-manifest.json`. Expect `/`, the five Section routes and `/_not-found` to be prerendered, with no on-demand route
    - _Requirements: 10.5_

- [x] 8. Checkpoint: all suites green
  - Run `npx tsc --noEmit`, `npx vitest --run` and `npx playwright test`. All must exit 0, and Playwright must report results for both the `phone` and `laptop` projects
  - Run `git status --short` after the Playwright run. It must show no new untracked or modified files from the run
  - Port-in-use check: in one PowerShell command, start a `System.Net.Sockets.TcpListener` on 127.0.0.1:3100, run `npx playwright test`, then stop the listener. Playwright must exit non-zero with no passing tests
  - Ensure all tests pass, ask the user if questions arise.
  - _Requirements: 7.1, 7.6, 8.1, 8.2, 8.4, 8.5, 8.6, 8.7, 8.8_

- [x] 9. Prepare the Repository for the hackathon
  - [x] 9.1 Update `.kiro/steering/structure.md`
    - Rewrite "Current state" to list every tracked top-level file and directory and every tracked directory directly under `src/` and `tests/`. Remove the "not scaffolded yet" wording. List `CONTEXT.md` and `docs/` only if they are tracked (Open decision 2). Keep "Proposed app layout", marked as the target for later tickets
    - _Requirements: 9.7_

  - [x] 9.2 Commit the scaffold locally
    - Ask the user before committing. Stage files by name, not with `git add -A`: the config files, `package-lock.json`, `.gitignore`, `src/`, `tests/` and every file under `.kiro/`, including this spec and the steering update
    - After the commit, `git status --ignored --short .kiro` must print nothing. `git ls-files` must list nothing under `.scratch/` and neither `CLAUDE.md` nor `skills-lock.json`. Do not push: pushing and the branch rename are user tasks
    - _Requirements: 9.1, 9.2, 9.3, 9.6, 9.9_

- [x] 10. Open-decision work (do only after the user's answer)
  - [x] 10.1 Commit the domain docs (only if the user picks Option A of Open decision 2)
    - Do not start this task until the user has chosen Option A. If the user picks Option B, mark this task as not applicable and leave `.gitignore` unchanged
    - Remove the `CONTEXT.md` and `docs/` lines and their comment from `.gitignore`. Change the "domain docs are committed" test in `tests/unit/repository-rules.test.ts` from `it.skip` to `it`. Add `CONTEXT.md` and `docs/` to the "Current state" tree in `.kiro/steering/structure.md`
    - Run `npx vitest --run`. Then, after asking the user, commit `CONTEXT.md`, `docs/adr/0001`–`0004`, `docs/agents/*` and the edited files by name. A commit to a public repository cannot be fully undone, so ask before committing
    - _Requirements: 9.5, 9.7_

  - [x] 10.2 Name `master` in the tech steering (only if the user picks Option B of Open decision 1)
    - Do not start this task until the user has chosen Option B (keep `master`). If the user picks Option A (rename to `main`), mark this task as not applicable, because the rename and the Vercel setting are user tasks
    - Edit `.kiro/steering/tech.md` so that the Hosting row and any other mention of the deploy branch name `master` instead of `main`. Commit the file after asking the user
    - _Requirements: 9.10_

- [x] 11. Final checkpoint: fresh-clone verification and handover
  - Clone the local Repository into a temp directory with `git clone`. In the clone, with no `node_modules/`, `.next/`, `next-env.d.ts` or `.env*`, run `npm ci`, `npx tsc --noEmit` and `npm run build`. All must exit 0, and `git status --short` in the clone must be empty afterwards. Delete the temp clone
  - Run `npx tsc --noEmit`, `npx vitest --run` and `npx playwright test` once more in the workspace
  - Report the "User tasks" list below to the user, with the requirement each one closes
  - Ensure all tests pass, ask the user if questions arise.
  - _Requirements: 1.3, 1.6, 9.2, 10.2, 11.1_

## Notes

- Sub-tasks marked `*` are optional tests and can be skipped for a faster first pass. Tasks 2.7 and 7.1 are tests too, but they are not optional, because Requirements 7.4 and 8.3 ask for them.
- Skipping the optional tests leaves the criteria they cover verified only by eye. These are the static guard rules (6.1, 6.2), the palette contrast and hue checks (3.6), and most layout, theme, decoration and no-backend criteria (7.2–7.8). Of these, 3.6 and 6.2 are the cheapest and catch the most, so they are worth keeping.
- Property tests (2.5, 2.6, 3.3, 3.5) cover only the four pure helpers from the design's Correctness Properties. Each uses fast-check with `numRuns: 200` and carries the tag comment `// Feature: spooky-site-skeleton, Property N: <title>`.
- `tests/unit/theme.test.ts` is written by two sub-tasks (3.5 and 3.6), which sit in separate waves of the dependency graph.
- If a pinned version cannot be installed, stop and ask the user. Do not substitute TypeScript 7, because it breaks the `next build` type check.

## User tasks (human only, not for the agent)

These steps need the user's own GitHub and Vercel accounts or real devices. The agent lists them in task 11 and does not perform them.

- **Open decision 1:** choose `main` (Option A: rename `master` to `main` on GitHub and locally) or `master` (Option B: then the agent runs task 10.2). Requirement 9.8, 9.10.
- **Open decision 2:** choose whether to commit `CONTEXT.md` and `docs/` (Option A: then the agent runs task 10.1) or keep them ignored (Option B). Requirement 9.5.
- Push the commits to GitHub. Make sure the Repository is public and the Production_Branch is the default branch. Check that the About section shows "MIT". Requirement 9.8.
- Create the Vercel_Project in your own Vercel account, connect the Repository, set the Production_Branch, and keep the Next.js preset with the build, output and install overrides off. After a push, confirm that a Ready production deployment of that commit SHA appears within 10 minutes. Requirement 11.3.
- In Vercel, keep the Vercel Toolbar disabled for production deployments. Requirement 10.9 (and 10.4 on the Live_URL).
- Confirm that Deployment Protection does not apply to production, then open the Live_URL in a private window with no Vercel login. Requirement 11.5.
- Run `curl -I http://<Live_URL>` and confirm a redirect to HTTPS. Requirement 11.6.
- Open `/exercises`, `/stretches`, `/routines`, `/crypt` and `/history` directly on the Live_URL and reload each one. Requirement 11.7.
- On one real phone in portrait and one real laptop, check that the heading and all five Navigation_Entries are visible with no sideways scrolling. Judge whether the palette, Creepster headings, bats and cobwebs look spooky, and whether the bat animation looks calm with no flashing. Requirements 4.4, 4.13, 11.4.
- Compare the "Current state" section of `.kiro/steering/structure.md` with `git ls-files`. Requirement 9.7.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "1.3", "2.1", "2.4", "3.1", "3.2", "3.4"] },
    { "id": 2, "tasks": ["2.2", "2.3", "2.5", "2.6", "2.7", "3.3", "3.5"] },
    { "id": 3, "tasks": ["3.6", "4.1", "4.2"] },
    { "id": 4, "tasks": ["4.3", "4.5", "4.6", "4.7"] },
    { "id": 5, "tasks": ["4.4"] },
    { "id": 6, "tasks": ["6.1", "6.2", "7.1", "7.2", "7.3", "7.4", "7.5", "7.6", "7.7", "7.8"] },
    { "id": 7, "tasks": ["9.1"] },
    { "id": 8, "tasks": ["9.2"] },
    { "id": 9, "tasks": ["10.1", "10.2"] }
  ]
}
```
