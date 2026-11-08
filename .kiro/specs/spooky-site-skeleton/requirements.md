# Requirements Document

## Introduction

This spec covers ticket `01-spooky-site-skeleton` of the Spooky Coach MVP (`.scratch/spooky-coach-mvp/issues/01-spooky-site-skeleton.md`). A visitor opening the public URL sees a dark, Halloween-styled home screen (orange and purple palette, spooky display font, bats and cobwebs), laid out for a portrait phone first and still good on a laptop. The home screen offers navigation placeholders for Exercises, Stretches, Routines, Crypt and History.

The ticket also prepares the repository for every later ticket: a Next.js app in TypeScript strict mode, a central user-facing strings module that is ready for Thai, Vitest with one passing placeholder test, Playwright with one test that opens the home screen, the MIT license, a committed `/.kiro` directory, and a clean production build that Vercel deploys from the Production_Branch.

Constraints from the ADRs and steering:

- ADR 0001: a website, not a native app. Phone-first responsive layout.
- ADR 0002: no backend. No API routes, server database, accounts, environment variables, secrets, analytics or telemetry.
- ADR 0004: the `/.kiro` directory (specs, hooks, steering) is committed and never gitignored.
- The agent never runs the dev server. Connecting the GitHub repo to a Vercel project is a human task in the user's own Vercel account.

Out of scope for this ticket: the Catalog, Workout engine, Progress store, Viewer, Candy balance, Welcome gift, the Settings screen, sound, and the README content and Kiro write-up (ticket 16).

### Repository state at spec time

Checked on `master` at commit `52d4cfa`:

- Commits: `init`, `add .kiro`, `Create LICENSE`. An MIT `LICENSE` (copyright 2026 Newturno) and the `/.kiro` directory (settings, skills, steering) are already committed. `.kiro/settings/mcp.json` holds no secrets.
- No `package.json`, `src/` or test setup exists. `readme.md` is empty.
- `.gitignore` ignores `CLAUDE.md`, `CONTEXT.md`, `.scratch/`, `skills-lock.json` and `docs/`. It no longer ignores `.kiro/`.
- The only branch is `master` (local and `origin`).

### Open decisions for the user

These are flagged rather than decided. The requirements below use the defined term Production_Branch so that either answer fits.

1. **Production branch name.** The ticket and the tech steering say Vercel deploys from `main`, but the repository's default branch is `master`. Option A (recommended): rename `master` to `main` on GitHub and locally, then connect Vercel to `main`. Option B: keep `master`, connect Vercel to `master`, and update the tech steering to say `master`. Either way, the user performs the branch rename and the Vercel connection. Requirement 9.10 applies only to Option B.
2. **Committing domain docs.** The steering files tell agents to read `CONTEXT.md` and `docs/adr/0001–0004`, but `.gitignore` excludes both, so the public repository and its judges would not see them. Option A (recommended): commit `CONTEXT.md` and `docs/` (ADRs and `docs/agents/`), keep `.scratch/`, `CLAUDE.md` and `skills-lock.json` ignored. Option B: keep them ignored and accept that the steering references files missing from the public repository. Requirement 9.5 applies only to Option A and must be adjusted if the user picks Option B.
3. **GitHub About license.** GitHub reported `license: null` before the `Create LICENSE` commit. GitHub's license detection runs on the default branch, so the user should confirm that the About section now shows "MIT" after the commit (and again after a branch rename, if any).

## Glossary

- **Site**: The Spooky Coach Next.js website built in this repository, as served by the Next.js production server or by Vercel.
- **Home_Screen**: The screen the Site serves at the root path `/`.
- **Home_Navigation**: The navigation region on the Home_Screen that holds the Navigation_Entries.
- **Navigation_Entry**: One labelled link in the Home_Navigation. Each leads to one Section: Exercises, Stretches, Routines, Crypt or History.
- **Section**: One of the five app areas named by a Navigation_Entry: Exercises, Stretches, Routines, Crypt (the UI name of the Coach customisation screen) and History.
- **Placeholder_Screen**: A screen served at a Section's route that shows the Section name, a short themed "not built yet" message and a link back to the Home_Screen. Later tickets replace each Placeholder_Screen with the real Section.
- **Halloween_Theme**: The shared visual style of the Site: dark background, orange and purple accent palette, a spooky display font for headings, and decorative bats and cobwebs.
- **Decoration**: A purely visual Halloween_Theme element, such as a bat or a cobweb, that carries no information.
- **Strings_Module**: The single central module that holds every user-facing string of the Site, keyed by string identifier and grouped by locale.
- **Locale**: A language variant of the Strings_Module. This ticket ships only the English Locale (`en`); a Thai Locale (`th`) is added later.
- **Repository**: The public GitHub repository `newzaungo3/kiroween_exercise_app`.
- **Production_Branch**: The Repository branch that Vercel deploys to production. `main` per the tech steering; see Open decision 1.
- **Build**: The command `npm run build`, which produces the Next.js production build.
- **Type_Check**: The command `npx tsc --noEmit`.
- **Unit_Suite**: The Vitest test suite under `tests/unit/`, run once with `npx vitest --run`.
- **E2E_Suite**: The Playwright test suite under `tests/e2e/`, run with `npx playwright test`.
- **Phone_Viewport**: A portrait browser viewport of 360 × 640 CSS pixels.
- **Laptop_Viewport**: A landscape browser viewport of 1440 × 900 CSS pixels.
- **Live_URL**: The public production URL that Vercel assigns to the Site.
- **Vercel_Project**: The Vercel project, created by the user in the user's own Vercel account, that is connected to the Repository.

## Requirements

### Requirement 1: Project scaffold

**User Story:** As the builder, I want a Next.js app in TypeScript strict mode with the agreed folder layout, so that every later ticket starts from the same foundation.

#### Acceptance Criteria

1. THE Site SHALL be a Next.js application that uses only the App Router, with every route file (`page`, `layout`, `not-found`) under `src/app/` and no `pages/` or `src/pages/` directory in the Repository.
2. THE Site SHALL be written in TypeScript with the `strict` compiler option set to `true` in the root `tsconfig.json`, with no strict-family option (such as `noImplicitAny` or `strictNullChecks`) set to `false`, and with no script file with a `.js`, `.jsx`, `.mjs` or `.cjs` extension under `src/` or `tests/`. Non-script files such as CSS, font, SVG and licence files are allowed under `src/` and `tests/`.
3. WHEN the Type_Check is run on a clean checkout after `npm ci`, THE Type_Check SHALL check every `.ts` and `.tsx` file under `src/` and `tests/` and exit with code 0 and zero reported errors.
4. THE Repository SHALL define the npm scripts `dev`, `build` and `start` in `package.json`, running `next dev`, `next build` and `next start` respectively, using only syntax that runs unchanged in PowerShell on Windows and in Vercel's Linux build environment.
5. THE Repository SHALL hold every React component other than the Next.js route files, and the Strings_Module as a single module, under `src/ui/`.
6. THE Repository SHALL contain exactly one lockfile, `package-lock.json`, consistent with `package.json`, so that `npm ci` on a clean checkout exits with code 0 and no `yarn.lock` or `pnpm-lock.yaml` is present for Vercel to detect.
7. IF a `.ts` or `.tsx` file under `src/` or `tests/` contains a type error, THEN THE Type_Check SHALL exit with a non-zero code and report the file and line of the error.
8. THE Site's source files under `src/` and `tests/` SHALL use the `any` type only where a comment on the same or preceding line states why `any` is unavoidable.

### Requirement 2: Home screen

**User Story:** As a first-time visitor, I want to land straight on a spooky home screen without signing up, so that I can try the app in seconds.

#### Acceptance Criteria

1. WHEN a visitor requests the root path `/`, THE Site SHALL serve the Home_Screen as the first screen shown, with no redirect to another path and with no sign-up, login or consent form, dialog or overlay shown before or on top of the Home_Screen.
2. THE Home_Screen SHALL display the app name "Spooky Coach", taken from the Strings_Module, as its only level-1 page heading.
3. THE Home_Navigation SHALL contain exactly five Navigation_Entries, each a link whose visible label and accessible name equal its Section name as given in the Strings_Module, in this order in both the document and the visual layout: Exercises, Stretches, Routines, Crypt, History.
4. THE Home_Screen SHALL contain exactly one navigation landmark, the Home_Navigation, with a non-empty accessible name taken from the Strings_Module.
5. THE Site SHALL set the language of the root document element to English (`lang="en"`) on the Home_Screen, every Placeholder_Screen and the not-found screen.
6. THE Home_Screen SHALL set a non-empty document title, taken from the Strings_Module, that contains the app name "Spooky Coach".
7. THE Home_Screen SHALL display a themed tagline of one sentence and at most 80 characters, taken from the Strings_Module, directly after the level-1 page heading in reading order.
8. WHEN a visitor moves keyboard focus through the Home_Screen with the Tab key, THE Home_Screen SHALL focus the Navigation_Entries in the order Exercises, Stretches, Routines, Crypt, History, showing a focus indicator on each with a contrast ratio of at least 3:1 against the adjacent background.
9. WHEN a visitor presses Enter while a Navigation_Entry has keyboard focus, THE Site SHALL show the Placeholder_Screen for that Navigation_Entry's Section.

### Requirement 3: Navigation placeholders

**User Story:** As a judge exploring the demo, I want every home navigation entry to lead somewhere themed, so that the site never shows a broken link while later Sections are built.

#### Acceptance Criteria

1. WHEN a visitor activates a Navigation_Entry on the Home_Screen, THE Site SHALL show the Placeholder_Screen of that Navigation_Entry's Section at the Section's route, using this mapping: Exercises → `/exercises`, Stretches → `/stretches`, Routines → `/routines`, Crypt → `/crypt`, History → `/history`.
2. WHEN a visitor requests `/exercises`, `/stretches`, `/routines`, `/crypt` or `/history` directly, including by typing the URL, opening a shared link or reloading the page, THE Site SHALL serve that Section's Placeholder_Screen without first showing the Home_Screen or any other screen.
3. THE Placeholder_Screen SHALL display exactly one top-level page heading whose text equals the label of the Section's Navigation_Entry, followed by a themed message of at most 160 characters stating that the Section is not built yet.
4. THE Placeholder_Screen SHALL provide a link whose destination is the Home_Screen at `/` and whose accessible name, taken from the Strings_Module, states that the link leads to the Home_Screen.
5. THE Placeholder_Screen SHALL use the same Halloween_Theme as the Home_Screen: the same dark background design token, the spooky display font for its page heading, and at least one of the orange or purple accent design tokens.
6. IF a visitor requests a path that matches none of `/`, `/exercises`, `/stretches`, `/routines`, `/crypt` and `/history`, including a path nested under a Section route such as `/exercises/unknown`, THEN THE Site SHALL show a not-found screen that uses the Halloween_Theme, displays a page heading and a themed message stating that the page does not exist, and provides a link to the Home_Screen at `/`.
7. THE Placeholder_Screen SHALL set a document title, taken from the Strings_Module, that contains the Section name.
8. THE Site SHALL make every link on the Home_Screen, on each Placeholder_Screen and on the not-found screen lead to a route that the Site serves with a screen other than the not-found screen.

### Requirement 4: Halloween visual style

**User Story:** As a visitor, I want the site to look unmistakably Halloween, so that the app feels themed from the first second.

#### Acceptance Criteria

1. THE Halloween_Theme SHALL give every screen of the Site, including the Home_Screen, every Placeholder_Screen and the not-found screen, a background colour with a relative luminance of at most 0.05 that fills the full viewport, and SHALL apply this background on first paint and with JavaScript disabled.
2. THE Halloween_Theme SHALL define an orange accent colour (HSL hue 15° to 45°) and a purple accent colour (HSL hue 260° to 300°) as named design tokens, and THE Home_Screen SHALL show at least one visible element in each accent colour.
3. THE Site's components SHALL take every colour, including text, background, border, focus-indicator and Decoration fill and stroke colours, from the Halloween_Theme design tokens.
4. THE Halloween_Theme SHALL render every page heading in a decorative display font and all other text in a separate body font that is not the display font, with body text at a computed font size of at least 16 CSS px. (The user judges by eye whether the display font looks spooky.)
5. THE Site SHALL serve every font file from the Site's own origin.
6. THE Home_Screen SHALL display at least one bat Decoration and at least one cobweb Decoration in both the Phone_Viewport and the Laptop_Viewport.
7. THE Site SHALL exclude every Decoration from the accessibility tree and from the keyboard focus order.
8. THE Halloween_Theme SHALL give all text below the large-text size, including Navigation_Entry labels, Placeholder_Screen messages and links, a contrast ratio of at least 4.5:1 against the background colour directly behind it.
9. THE Halloween_Theme SHALL give large text (24 CSS px and above, or 18.66 CSS px bold and above), including page headings, a contrast ratio of at least 3:1 against the background colour directly behind it.
10. WHILE the operating system's reduced-motion preference is set, THE Site SHALL show every Decoration in a fixed position with no animation or transition.
11. IF a font file fails to load, THEN THE Site SHALL render the affected text in a fallback system font, keeping all text visible and readable.
12. THE Site SHALL render every Decoration so that it covers no part of the page heading or any Navigation_Entry and does not receive taps or clicks, in both the Phone_Viewport and the Laptop_Viewport.
13. THE Site SHALL animate no Decoration in a way that flashes more than 3 times in any 1-second period.

### Requirement 5: Phone-first responsive layout

**User Story:** As a phone user, I want a layout made for a portrait phone with large touch targets, and as a judge on a laptop I want it to look good on a wide screen too, so that the demo works on any device.

#### Acceptance Criteria

1. WHILE the Site is shown in the Phone_Viewport at the browser's default text size, THE Home_Screen SHALL show the page heading and all five Navigation_Entries fully inside the 360 × 640 CSS px viewport without horizontal or vertical scrolling.
2. WHILE the Site is shown in the Laptop_Viewport, THE Site SHALL limit the main content of the Home_Screen, every Placeholder_Screen and the not-found screen to a width of at most 768 CSS px. The left and right margins SHALL differ by no more than 1 CSS px, and the Halloween_Theme background SHALL cover the full 1440 × 900 CSS px viewport with no uncovered area.
3. THE Site SHALL give every Navigation_Entry, every link on a Placeholder_Screen and the link on the not-found screen a clickable area of at least 44 × 44 CSS px, measured as the rendered size of that element, in both the Phone_Viewport and the Laptop_Viewport.
4. WHILE the root (`html`) element's font size is set to 200% (32 CSS px instead of the browser default of 16 CSS px) in the Phone_Viewport, THE Home_Screen SHALL show the full text of the page heading and of every Navigation_Entry label with no ellipsis or clipped characters. No two Navigation_Entries SHALL overlap, and the page SHALL not scroll horizontally. Vertical scrolling is allowed.
5. THE Site SHALL declare a responsive viewport (`width=device-width, initial-scale=1`) on the Home_Screen, every Placeholder_Screen and the not-found screen.
6. THE Site SHALL allow the visitor to pinch-zoom every screen: the viewport declaration SHALL contain no `user-scalable=no` and no `maximum-scale` value below 5.
7. WHILE the Site is shown in any viewport from 320 to 1920 CSS px wide, THE Site SHALL lay out the Home_Screen, every Placeholder_Screen and the not-found screen with a document width no greater than the viewport width, so the page never scrolls horizontally.
8. THE Site SHALL leave at least 8 CSS px between the clickable areas of any two adjacent Navigation_Entries, in both the Phone_Viewport and the Laptop_Viewport.
9. THE Site's CSS SHALL leave the root (`html`) element's font size unset or set it only in a relative unit (`%`, `em` or `rem`), with no absolute unit such as `px`, `pt` or `cm`, so that the browser's text-size setting scales the layout of every screen.

### Requirement 6: Central strings module

**User Story:** As the builder, I want all user-facing text in one module, so that a Thai translation can be added later without touching components.

#### Acceptance Criteria

1. THE Strings_Module SHALL be the only source of user-facing strings in the Site and SHALL hold every string the Site shows or exposes to assistive technology, including page headings, the Home_Screen app name and tagline, Navigation_Entry labels, Home_Navigation's accessible name, Placeholder_Screen headings and messages, the "back to home" link text, the not-found heading and message, and the document title of every screen.
2. THE Strings_Module SHALL group strings by Locale and SHALL provide an English Locale (`en`) that assigns every string identifier a value containing at least one non-whitespace character.
3. IF source code references a string identifier that the Strings_Module does not define, THEN THE Type_Check SHALL report at least one error and exit with a non-zero code.
4. IF a Locale other than English omits an identifier defined by the English Locale, or defines an identifier the English Locale does not define, THEN THE Type_Check SHALL report at least one error and exit with a non-zero code.
5. THE Site's components SHALL contain no hardcoded user-facing string literal containing a letter or digit in a rendered text node, `aria-label`, `alt`, `title` or document title; every such value SHALL come from a Strings_Module identifier.
6. THE English Locale SHALL use exactly the Section names "Exercises", "Stretches", "Routines", "Crypt" and "History", with this capitalization, in every Navigation_Entry label and Placeholder_Screen heading.
7. THE English Locale SHALL contain no glossary "Avoid" word, matched as a whole word in any letter case and including its plural form: avatar, trainer, model, character, item, cosmetic, skin, move, pose, activity, program, plan, playlist, session, training, status, result, points, coins, score, XP, buy, purchase.
8. WHILE the English Locale is the only Locale shipped, THE Site SHALL show every user-facing string from the English Locale on every screen.
9. WHEN a new Locale is added to the Strings_Module, THE Site SHALL need changes only inside the Strings_Module for that Locale's strings to exist and pass the Type_Check, with zero changes to component files.

### Requirement 7: Unit test tooling

**User Story:** As the builder, I want Vitest set up with a passing test, so that later tickets can add Workout engine, Progress store and Catalog tests without setup work.

#### Acceptance Criteria

1. WHEN `npx vitest --run` is executed from the Repository root in PowerShell on Windows after `npm ci`, with no dev server running, THE Unit_Suite SHALL run every collected test exactly once, exit without entering watch mode or waiting for input, exit with code 0, and report at least one passing test and zero failing tests.
2. THE Unit_Suite SHALL collect test files from `tests/unit/` and its subdirectories whose names end in `.test.ts` or `.test.tsx`, so that a new test file added under `tests/unit/` is collected without any configuration change.
3. THE Unit_Suite SHALL collect no file under `tests/e2e/`, `node_modules/` or `.next/`, so that a run of `npx vitest --run` reports no E2E_Suite test and no error from loading Playwright.
4. THE Unit_Suite SHALL include a test, named after the rule it protects in glossary terms, that reads the English Locale only through the Strings_Module's public exports and checks that every entry is a string containing at least one non-whitespace character.
5. THE Unit_Suite SHALL resolve imports of TypeScript sources under `src/`, including any import path alias defined in the Site's TypeScript configuration, without a separate compile step.
6. IF any Unit_Suite test fails, THEN `npx vitest --run` SHALL exit with a non-zero code and report the name of each failing test.
7. IF any English Locale entry in the Strings_Module is empty or contains only whitespace, THEN THE Unit_Suite SHALL report the Strings_Module test as failed and name the offending string identifier in the failure output.
8. THE Type_Check SHALL include the test files under `tests/unit/` and check them with the `strict` compiler option enabled, so that a type error in a Unit_Suite test file makes the Type_Check finish with at least one error.

### Requirement 8: End-to-end test tooling

**User Story:** As the builder, I want Playwright set up with one test that opens the home screen, so that the golden-path smoke test (ticket 14) has a working harness.

#### Acceptance Criteria

1. WHEN `npx playwright test` is executed, THE E2E_Suite SHALL run the Build, start the Site with the Next.js production server (`npm run start`), run its tests against that server, and stop that server when the run ends, without a separately started dev server and without reusing a server that was already running.
2. THE E2E_Suite SHALL collect every test file under `tests/e2e/`, including files in its subfolders and files added by later tickets, without a configuration change, and SHALL collect no files from `tests/unit/`.
3. THE E2E_Suite SHALL include a test that opens the Home_Screen at `/` and checks that (a) the level-1 heading is visible, and (b) the Home_Navigation landmark is visible and contains exactly five visible Navigation_Entry links named Exercises, Stretches, Routines, Crypt and History, in that order. The test SHALL find each element by its accessible role and name, and SHALL take the expected names from the English Locale of the Strings_Module.
4. THE E2E_Suite SHALL run every test in two browser projects: one with the Phone_Viewport and one with the Laptop_Viewport, so that each run reports a result for each test in each project.
5. WHEN `npx playwright test` is executed and every test passes in both browser projects, THE E2E_Suite SHALL exit with code 0 and report at least 2 passing results (the Home_Screen test once per browser project).
6. THE Repository SHALL gitignore Playwright output (`test-results/`, `playwright-report/`, `blob-report/`, `playwright/.cache/`), so that `git status` shows no new untracked or modified files after a run of the E2E_Suite.
7. IF the Build fails, the server port is already in use, or the Site does not respond at `/` within 300 seconds of the start of the E2E_Suite's server command (the Build followed by the Next.js production server start), THEN THE E2E_Suite SHALL exit with a non-zero code, report that the Site failed to start, and report no passing tests.
8. IF any E2E_Suite test fails in either browser project, THEN THE E2E_Suite SHALL exit with a non-zero code, report the name and browser project of each failing test, and not retry the failing test.
9. THE Repository SHALL declare Playwright as a development dependency in `package.json`, with its exact version recorded in `package-lock.json`.

### Requirement 9: Repository readiness for the hackathon

**User Story:** As a judge, I want a public repository with an MIT license and a committed `/.kiro` folder, so that the entry meets the Kiroween rules.

#### Acceptance Criteria

1. THE Repository SHALL contain, at its root on the Production_Branch, a file named exactly `LICENSE` that holds the standard MIT License text with a copyright line naming the year 2026 and the holder Newturno.
2. THE Repository SHALL track on the Production_Branch every file under `/.kiro` that exists in the working tree, including `.kiro/settings/mcp.json`, every file under `.kiro/steering/` and every file under `.kiro/specs/spooky-site-skeleton/`, so that `git status --ignored` reports no untracked or ignored path inside `/.kiro`.
3. THE Repository SHALL contain no `.gitignore` file, at the root or in any subdirectory, with a pattern that matches `/.kiro` or any path inside `/.kiro`, so that `git check-ignore` reports no match for any path inside `/.kiro`.
4. THE Repository's root `.gitignore` SHALL ignore `node_modules/`, `.next/`, `out/`, `.vercel/`, `coverage/`, `*.tsbuildinfo`, `next-env.d.ts` and every file whose name starts with `.env` (for example `.env` and `.env.local`), so that `git check-ignore` reports a match for each of these paths.
5. WHERE the user chooses Option A of Open decision 2, THE Repository SHALL track `CONTEXT.md`, `docs/adr/0001` to `docs/adr/0004` and every file under `docs/agents/` on the Production_Branch, and no `.gitignore` pattern SHALL match any of these paths.
6. THE Repository's root `.gitignore` SHALL keep `.scratch/`, `CLAUDE.md` and `skills-lock.json` ignored, and the Production_Branch SHALL track no file under `.scratch/` and neither `CLAUDE.md` nor `skills-lock.json`.
7. WHEN the scaffold from Requirement 1 is committed to the Production_Branch, THE Repository SHALL hold on the Production_Branch a `.kiro/steering/structure.md` whose "Current state" section lists every tracked top-level file and directory and every tracked directory directly under `src/` and `tests/`, lists no path that is absent from the working tree, and no longer states that the app is not scaffolded.
8. THE Repository SHALL be publicly visible on GitHub and SHALL have the Production_Branch set as its GitHub default branch, so that GitHub's About section shows the MIT license. (The user verifies this on GitHub.)
9. THE Repository SHALL contain no secret, such as an API key, access token, password or private key, in any tracked file on the Production_Branch, including `.kiro/settings/mcp.json`.
10. WHERE the user chooses Option B of Open decision 1 (keep `master`), THE Repository SHALL hold on the Production_Branch a `.kiro/steering/tech.md` that names `master`, not `main`, as the branch Vercel deploys from.

### Requirement 10: No backend

**User Story:** As the builder, I want the site to stay a pure front end, so that it matches ADR 0002 and deploys with no secrets or server setup.

#### Acceptance Criteria

1. THE Site SHALL contain no API route handler files (`route.ts` or `route.js`) under `src/app/`, no module or function marked with the `"use server"` directive, and no Next.js middleware file.
2. WHEN the Build is run on a clean checkout with no `.env*` file present and no Site-specific environment variable set, THE Build SHALL finish with exit code 0.
3. THE Site SHALL include no analytics, telemetry, tracking or advertising script or package, including Vercel Web Analytics and Vercel Speed Insights.
4. WHEN the Home_Screen, a Placeholder_Screen or the not-found screen loads in a browser from a production build of the Site (the Next.js production server or a Vercel production deployment), THE Site SHALL send every network request made from navigation start until 5 seconds after the page's load event, and every request made while the visitor moves between these screens, only to the Site's own origin.
5. WHEN the Build finishes, THE Build output SHALL mark the Home_Screen route `/`, the five Placeholder_Screen routes and the not-found screen as static (prerendered) and SHALL list no route that is server-rendered on demand.
6. THE Site's source code under `src/` SHALL read no environment variable other than `NODE_ENV`.
7. WHEN the Home_Screen, a Placeholder_Screen or the not-found screen loads in a browser, THE Site SHALL set no cookies.
8. WHEN the Home_Screen, a Placeholder_Screen or the not-found screen loads in a browser, THE Site SHALL send every network request with the GET or HEAD method only.
9. THE Vercel_Project SHALL keep the Vercel Toolbar disabled for production deployments, so that the Toolbar, which loads from another origin, appears on preview deployments only. (Human step: the user checks this setting in the Vercel dashboard. The agent does not perform this step.)

### Requirement 11: Production build and deployment

**User Story:** As a judge, I want to open a public link with no install or login, so that I can try the app immediately on my phone or laptop.

#### Acceptance Criteria

1. WHEN the Build is run after `npm ci` on a fresh clone of the Production_Branch, with no `node_modules/` or `.next/` directory and no environment variables defined, THE Build SHALL finish with exit code 0.
2. THE Repository SHALL contain no `vercel.json` file and SHALL define the `build` npm script as `next build` with no custom output directory, so that the Vercel_Project builds the Site with Vercel's default Next.js settings.
3. WHEN a commit is pushed to the Production_Branch, THE Vercel_Project SHALL show a production deployment of that commit in the Ready state within 10 minutes of the push and SHALL serve that deployment at the Live_URL. (Human step: the user connects the Repository to the Vercel_Project in the user's own Vercel account, sets the Production_Branch, and leaves the Framework Preset as "Next.js" with the build command, output directory and install command overrides switched off. The agent does not perform this step. Verified by the user in the Vercel dashboard by matching the deployment's commit SHA to the pushed commit.)
4. WHEN a visitor opens the Live_URL in a mobile browser on a real phone held in portrait and in a desktop browser on a real laptop, THE Site SHALL serve the Home_Screen over HTTPS with the page heading and all five Navigation_Entries visible and no horizontal scrolling. (Human step: verified by the user by eye on one real phone and one real laptop.)
5. WHEN a visitor who is not signed in to Vercel opens the Live_URL in a private browsing window, THE Site SHALL serve the Home_Screen without showing a Vercel login page, password prompt or access-request page. (Human step: the user confirms that Vercel Deployment Protection does not apply to the production deployment and checks this by eye in a private window.)
6. WHEN a visitor requests the Live_URL with the `http://` scheme, THE Site SHALL redirect the request to the same path over HTTPS.
7. WHEN a visitor opens `/exercises`, `/stretches`, `/routines`, `/crypt` or `/history` directly on the Live_URL, or reloads one of those pages, THE Site SHALL serve the matching Placeholder_Screen instead of the not-found screen.
