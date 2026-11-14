// Repository rules: static guard tests over the filesystem, package.json,
// the lockfile and git. These rules have no runtime interface, so they are
// checked here instead of through the Site.
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../..', import.meta.url));
const thisFile = 'tests/unit/repository-rules.test.ts';

// git calls and the full-tree scans can be slow on Windows.
const slow = { timeout: 30_000 };

const skippedDirs = new Set(['node_modules', '.next', '.git']);
const scriptExtensions = ['.js', '.jsx', '.mjs', '.cjs'];
const codeExtensions = ['.ts', '.tsx', ...scriptExtensions];

/** Every file under `dir` (relative to the Repository root), as posix paths. */
function walk(dir: string): string[] {
  const absolute = path.join(root, dir);
  if (!existsSync(absolute)) return [];

  const files: string[] = [];
  for (const entry of readdirSync(absolute, { withFileTypes: true })) {
    if (skippedDirs.has(entry.name)) continue;
    const relative = dir === '' ? entry.name : `${dir}/${entry.name}`;
    if (entry.isDirectory()) files.push(...walk(relative));
    else if (entry.isFile()) files.push(relative);
  }
  return files;
}

function read(relative: string): string {
  return readFileSync(path.join(root, relative), 'utf8');
}

function hasExtension(file: string, extensions: readonly string[]): boolean {
  return extensions.includes(path.posix.extname(file));
}

/** Base name without extension, e.g. `src/app/page.tsx` → `page`. */
function stem(file: string): string {
  return path.posix.basename(file, path.posix.extname(file));
}

function git(args: readonly string[], input?: string): string {
  return execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    input,
    stdio: ['pipe', 'pipe', 'pipe'],
    maxBuffer: 64 * 1024 * 1024,
  });
}

function splitNul(output: string): string[] {
  return output.split('\0').filter((entry) => entry !== '');
}

function exitStatus(error: unknown): unknown {
  return typeof error === 'object' && error !== null && 'status' in error ? error.status : undefined;
}

/**
 * The given paths that git would ignore, consulting every .gitignore,
 * `.git/info/exclude` and the global excludes file. `--no-index` also
 * checks paths that are already tracked.
 */
function gitIgnored(paths: readonly string[]): string[] {
  try {
    return splitNul(git(['check-ignore', '--no-index', '--stdin', '-z'], paths.join('\0')));
  } catch (error) {
    // Exit code 1 means "none of the paths is ignored".
    if (exitStatus(error) === 1) return [];
    throw error;
  }
}

function trackedFiles(): string[] {
  return splitNul(git(['ls-files', '-z']));
}

/** Files that are not tracked yet but would be committed by `git add` (not ignored). */
function untrackedUnignoredFiles(): string[] {
  return splitNul(git(['ls-files', '-z', '--others', '--exclude-standard']));
}

type PackageJson = {
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
};

type PackageLock = {
  packages?: Record<string, PackageJson & { version?: string; license?: string }>;
};

function readJson<T>(relative: string): T {
  return JSON.parse(read(relative)) as T;
}

const sourceFiles = (): string[] => walk('src').filter((file) => hasExtension(file, ['.ts', '.tsx']));

// ---------------------------------------------------------------------------
// Scanners with their own fixtures, so a broken scanner cannot pass vacuously.
// ---------------------------------------------------------------------------

/** Package name of an import specifier: `@scope/name/sub` → `@scope/name`, `name/sub` → `name`. */
function packageName(specifier: string): string {
  const parts = specifier.split('/');
  return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : (parts[0] ?? specifier);
}

/** Every module specifier imported or required in `source`. */
function importedSpecifiers(source: string): string[] {
  const patterns = [
    /\bfrom\s*['"]([^'"]+)['"]/g,
    /\bimport\s*['"]([^'"]+)['"]/g,
    /\b(?:import|require)\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];
  return patterns.flatMap((pattern) => [...source.matchAll(pattern)].map((match) => match[1] ?? ''));
}

const analyticsPackages: readonly RegExp[] = [
  /^@vercel\/analytics$/,
  /^@vercel\/speed-insights$/,
  /^@next\/third-parties$/,
  /^@sentry\//,
  /^posthog/,
  /^mixpanel/,
  /^@segment\//,
  /^@amplitude\//,
  /^@datadog\//,
  /^react-ga/,
  /plausible/,
];

function isAnalyticsPackage(name: string): boolean {
  return analyticsPackages.some((pattern) => pattern.test(name));
}

/** Environment variables read in `source`, other than NODE_ENV. */
function forbiddenEnvReads(source: string): string[] {
  const found: string[] = [];
  const processEnv = /process\.env\b(?:\s*\.\s*([A-Za-z_$][\w$]*)|\s*\[\s*['"`]([^'"`]+)['"`]\s*\])?/g;
  for (const match of source.matchAll(processEnv)) {
    const name = match[1] ?? match[2];
    // A bare `process.env` (destructuring, spreading, dynamic keys) can read anything.
    if (name !== 'NODE_ENV') found.push(name === undefined ? 'process.env' : `process.env.${name}`);
  }
  if (/import\.meta\.env\b/.test(source)) found.push('import.meta.env');
  return found;
}

// Built from split strings so this file never matches its own patterns.
const secretPatterns: readonly { name: string; pattern: RegExp }[] = [
  { name: 'AWS access key', pattern: new RegExp('AK' + 'IA[0-9A-Z]{16}') },
  { name: 'GitHub token', pattern: new RegExp('\\bgh' + '[pousr]_[A-Za-z0-9]{36,}') },
  { name: 'GitHub fine-grained token', pattern: new RegExp('github' + '_pat_[A-Za-z0-9_]{22,}') },
  { name: 'secret key (sk-)', pattern: new RegExp('\\bs' + 'k-[A-Za-z0-9_-]{20,}') },
  { name: 'private key', pattern: new RegExp('-----BEGIN ' + '(?:[A-Z]+ )*PRIVATE ' + 'KEY-----') },
  { name: 'Slack token', pattern: new RegExp('\\bxo' + 'x[abprs]-[A-Za-z0-9-]{10,}') },
  {
    name: 'hardcoded password',
    pattern: new RegExp('pass' + 'word\\s*[:=]\\s*[\'"][^\'"\\s]{4,}[\'"]', 'i'),
  },
];

function findSecrets(text: string): string[] {
  return secretPatterns.filter(({ pattern }) => pattern.test(text)).map(({ name }) => name);
}

function isBinary(buffer: Buffer): boolean {
  return buffer.includes(0);
}

// ADR 0004: 3D assets come from the Asset_Pipeline and live only under assets/
// (sources) and public/assets/ (files the Site serves).
const assetExtensions = ['.glb', '.gltf', '.blend', '.fbx', '.obj'];
const assetFolders = ['assets/', 'public/assets/'];

/** The 3D asset files in `files` that sit outside the asset folders. */
function misplaced3dAssets(files: readonly string[]): string[] {
  return files
    .filter((file) => assetExtensions.includes(path.posix.extname(file).toLowerCase()))
    .filter((file) => !assetFolders.some((folder) => file.startsWith(folder)));
}

// Requirement 13.8: licences that allow redistribution in an MIT Repository.
const allowedLicences = new Set(['MIT', 'ISC', 'BSD-2-Clause', 'BSD-3-Clause', 'Apache-2.0']);

/**
 * Whether an SPDX licence expression allows redistribution here. `A OR B`
 * passes when one option is allowed (the Builder may pick it); `A AND B`
 * passes only when every part is allowed. An expression that mixes AND and
 * OR, or nests parentheses, is rejected so a person reads it.
 */
function licenceAllowed(expression: string | undefined): boolean {
  if (expression === undefined) return false;
  const trimmed = expression.trim();
  const inner = /^\(([^()]*)\)$/.exec(trimmed)?.[1] ?? trimmed;
  if (/[()]/.test(inner)) return false;

  const hasOr = / OR /.test(inner);
  const hasAnd = / AND /.test(inner);
  if (hasOr && hasAnd) return false;
  if (hasOr) return inner.split(' OR ').some((part) => allowedLicences.has(part.trim()));
  if (hasAnd) return inner.split(' AND ').every((part) => allowedLicences.has(part.trim()));
  return allowedLicences.has(inner);
}

/** The `license` field of an installed package.json, including the legacy `{ type }` shape. */
function installedLicence(manifest: unknown): string | undefined {
  if (typeof manifest !== 'object' || manifest === null || !('license' in manifest)) return undefined;
  const { license } = manifest;
  if (typeof license === 'string') return license;
  if (typeof license === 'object' && license !== null && 'type' in license && typeof license.type === 'string') {
    return license.type;
  }
  return undefined;
}

type SteeringTree = { readonly paths: readonly string[]; readonly malformed: readonly string[] };

const treeLine = /^((?:│ {3}| {4})*)(?:├──|└──) (\S+)(?:\s+#.*)?$/u;

/**
 * Repository paths listed in the first code block under "## Current state".
 * Each `├──`/`└──` line is one entry; its depth is the number of four-character
 * `│   ` or blank columns before it, and its parent is the nearest folder
 * (a name ending in `/`) one level up. The `/` line is the Repository root.
 * Lines that fit no tree shape are returned as malformed.
 */
function steeringTreePaths(markdown: string): SteeringTree {
  const lines = markdown.split(/\r?\n/);
  const heading = lines.findIndex((line) => line.trim() === '## Current state');
  if (heading === -1) return { paths: [], malformed: ['no "## Current state" heading'] };

  const open = lines.findIndex((line, index) => index > heading && line.trim().startsWith('```'));
  const nextHeading = lines.findIndex((line, index) => index > heading && line.startsWith('## '));
  if (open === -1 || (nextHeading !== -1 && open > nextHeading)) {
    return { paths: [], malformed: ['no tree code block under "## Current state"'] };
  }
  const close = lines.findIndex((line, index) => index > open && line.trim().startsWith('```'));
  if (close === -1) return { paths: [], malformed: ['unclosed tree code block'] };

  const paths: string[] = [];
  const malformed: string[] = [];
  const parents: string[] = []; // parents[d] is the full path of the open folder at depth d
  for (const line of lines.slice(open + 1, close)) {
    if (line.trim() === '' || line.trim() === '/') continue;
    const match = treeLine.exec(line);
    const indent = match?.[1];
    const name = match?.[2];
    if (indent === undefined || name === undefined) {
      malformed.push(line);
      continue;
    }

    const depth = [...indent].length / 4;
    if (depth > parents.length) {
      malformed.push(line); // deeper than any open folder
      continue;
    }
    parents.length = depth;
    const full = `${parents.at(-1) ?? ''}${name}`;
    paths.push(full);
    if (name.endsWith('/')) parents.push(full);
  }
  return { paths, malformed };
}

/** Listed paths that are absent, or whose kind (folder `/` or file) does not match the working tree. */
function absentPaths(paths: readonly string[]): string[] {
  return paths.filter((listed) => {
    const absolute = path.join(root, listed);
    if (!existsSync(absolute)) return true;
    return listed.endsWith('/') !== statSync(absolute).isDirectory();
  });
}

describe('repository rule scanners', () => {
  it('the import scanner finds static, side-effect and dynamic imports', () => {
    const source = [
      "import { track } from '@vercel/analytics/react';",
      "import 'posthog-js';",
      "const x = await import('react-ga4');",
      "const y = require('@sentry/nextjs');",
    ].join('\n');

    const names = importedSpecifiers(source).map(packageName);
    expect(names).toEqual(['@vercel/analytics', 'posthog-js', 'react-ga4', '@sentry/nextjs']);
    expect(names.every(isAnalyticsPackage)).toBe(true);
    expect(['next', 'react', '@/ui/strings'].some(isAnalyticsPackage)).toBe(false);
  });

  it('the environment-variable scanner allows only NODE_ENV', () => {
    expect(forbiddenEnvReads("if (process.env.NODE_ENV === 'production') {}")).toEqual([]);
    expect(forbiddenEnvReads("process.env['NODE_ENV']")).toEqual([]);
    expect(forbiddenEnvReads('const key = process.env.API_KEY;')).toEqual(['process.env.API_KEY']);
    expect(forbiddenEnvReads("process.env['SECRET']")).toEqual(['process.env.SECRET']);
    expect(forbiddenEnvReads('const { TOKEN } = process.env;')).toEqual(['process.env']);
  });

  it('the secret scanner flags common token shapes and passes ordinary text', () => {
    const fakeAwsKey = 'AK' + 'IA' + 'ABCDEFGHIJKLMNOP';
    const fakeKeyHeader = '-----BEGIN ' + 'RSA PRIVATE ' + 'KEY-----';
    const fakePassword = 'pass' + 'word = "hunter22"';

    expect(findSecrets(`aws = ${fakeAwsKey}`)).toEqual(['AWS access key']);
    expect(findSecrets(fakeKeyHeader)).toEqual(['private key']);
    expect(findSecrets(fakePassword)).toEqual(['hardcoded password']);
    expect(findSecrets('The Coach cannot see you. Rattle your bones!')).toEqual([]);
  });

  it('the 3D asset scanner flags asset files outside the asset folders', () => {
    const files = [
      'assets/coach/coach_grave_rise.glb',
      'assets/coach/coach_grave_rise.blend',
      'public/assets/coach/coach_grave_rise.glb',
      'public/assets/coach/stills/grave_rise_front.png',
      'src/viewer/scene/coach.glb',
      'tests/unit/fixture.GLTF',
      'public/coach.fbx',
      'docs/model.obj',
      'src/viewer/scene/coach-asset.ts',
    ];
    expect(misplaced3dAssets(files)).toEqual([
      'src/viewer/scene/coach.glb',
      'tests/unit/fixture.GLTF',
      'public/coach.fbx',
      'docs/model.obj',
    ]);
  });

  it('the licence check accepts allowed SPDX expressions only', () => {
    expect(['MIT', 'ISC', 'BSD-2-Clause', 'BSD-3-Clause', 'Apache-2.0'].every(licenceAllowed)).toBe(true);
    expect(licenceAllowed('(MIT OR CC0-1.0)')).toBe(true);
    expect(licenceAllowed('MIT AND ISC')).toBe(true);

    expect(licenceAllowed(undefined)).toBe(false);
    expect(licenceAllowed('MPL-2.0')).toBe(false);
    expect(licenceAllowed('0BSD')).toBe(false);
    expect(licenceAllowed('CC-BY-4.0')).toBe(false);
    expect(licenceAllowed('Apache-2.0 AND LGPL-3.0-or-later')).toBe(false);
    expect(licenceAllowed('(MIT OR GPL-2.0) AND MPL-2.0')).toBe(false);

    expect(installedLicence({ license: 'MIT' })).toBe('MIT');
    expect(installedLicence({ license: { type: 'ISC' } })).toBe('ISC');
    expect(installedLicence({ name: 'no-licence' })).toBeUndefined();
  });

  it('the steering tree parser resolves nested entries and flags absent paths', () => {
    const fixture = [
      '# Project Structure',
      '',
      '## Current state',
      '',
      'Tracked files:',
      '',
      '```',
      '/',
      '├── docs/',
      '│   ├── adr/                # Architecture decision records',
      '│   └── agents/',
      '├── src/',
      '│   ├── app/                # Route files',
      '│   │   └── exercises/[slug]/  # Exercise detail route',
      '│   └── no-such-folder/     # absent on purpose',
      '├── no-such-file.md',
      '└── package.json',
      '```',
      '',
      '## Proposed app layout',
      '',
      '```',
      'src/',
      '└── later/',
      '```',
    ].join('\n');

    const tree = steeringTreePaths(fixture);
    expect(tree.malformed).toEqual([]);
    expect(tree.paths).toEqual([
      'docs/',
      'docs/adr/',
      'docs/agents/',
      'src/',
      'src/app/',
      'src/app/exercises/[slug]/',
      'src/no-such-folder/',
      'no-such-file.md',
      'package.json',
    ]);
    expect(absentPaths(tree.paths)).toEqual(['src/no-such-folder/', 'no-such-file.md']);

    // A file listed as a folder is flagged too.
    expect(absentPaths(['package.json/', 'src'])).toEqual(['package.json/', 'src']);

    const broken = ['## Current state', '```', '├── src/', '│   │   └── too-deep/', 'stray text', '```'].join('\n');
    expect(steeringTreePaths(broken).malformed).toEqual(['│   │   └── too-deep/', 'stray text']);
    expect(steeringTreePaths('# No state here').malformed).toEqual(['no "## Current state" heading']);
  });
});

describe('repository rules', () => {
  it('the Site uses only the App Router', slow, () => {
    expect(existsSync(path.join(root, 'pages'))).toBe(false);
    expect(existsSync(path.join(root, 'src/pages'))).toBe(false);
    expect(existsSync(path.join(root, 'src/app/layout.tsx'))).toBe(true);
    expect(existsSync(path.join(root, 'src/app/page.tsx'))).toBe(true);

    const routeFilesOutsideApp = walk('')
      .filter((file) => hasExtension(file, codeExtensions))
      .filter((file) => ['page', 'layout', 'not-found'].includes(stem(file)))
      .filter((file) => !file.startsWith('src/app/'));

    expect(routeFilesOutsideApp).toEqual([]);
  });

  it('TypeScript runs in strict mode', () => {
    const { config, error } = ts.parseConfigFileTextToJson('tsconfig.json', read('tsconfig.json'));
    expect(error).toBeUndefined();

    const options = (config as { compilerOptions?: Record<string, unknown> }).compilerOptions ?? {};
    expect(options['strict']).toBe(true);
    expect(options['allowJs']).not.toBe(true);

    const strictFamily = [
      'noImplicitAny',
      'noImplicitThis',
      'strictNullChecks',
      'strictFunctionTypes',
      'strictBindCallApply',
      'strictPropertyInitialization',
      'strictBuiltinIteratorReturn',
      'alwaysStrict',
      'useUnknownInCatchVariables',
    ];
    expect(strictFamily.filter((option) => options[option] === false)).toEqual([]);

    const scriptFiles = [...walk('src'), ...walk('tests')].filter((file) =>
      hasExtension(file, scriptExtensions),
    );
    expect(scriptFiles).toEqual([]);
  });

  it('source files live under src/app, src/ui, src/catalog, src/viewer and src/workout-engine', () => {
    const srcFiles = walk('src');

    // src/app holds only route files, globals.css and icon.svg.
    const routeFileNames = ['layout.tsx', 'page.tsx', 'not-found.tsx'];
    const strayAppFiles = srcFiles
      .filter((file) => file.startsWith('src/app/'))
      .filter((file) => !routeFileNames.includes(path.posix.basename(file)))
      .filter((file) => file !== 'src/app/globals.css' && file !== 'src/app/icon.svg');
    expect(strayAppFiles).toEqual([]);

    // Everything else under src/ sits in src/ui (components), src/catalog (the Catalog),
    // src/viewer (the Viewer) or src/workout-engine (the Workout engine), apart from
    // the tracked Next.js type references.
    const allowedPrefixes = ['src/app/', 'src/ui/', 'src/catalog/', 'src/viewer/', 'src/workout-engine/', 'src/progress-store/'];
    const knownExceptions = ['src/types/next.d.ts'];
    const strayFiles = srcFiles
      .filter((file) => !allowedPrefixes.some((prefix) => file.startsWith(prefix)))
      .filter((file) => !knownExceptions.includes(file));
    expect(strayFiles).toEqual([]);

    // The Strings_Module is one module under src/ui.
    expect(existsSync(path.join(root, 'src/ui/strings.ts'))).toBe(true);
    const otherStringsModules = srcFiles.filter(
      (file) => stem(file) === 'strings' && file !== 'src/ui/strings.ts',
    );
    expect(otherStringsModules).toEqual([]);
  });

  it('npm scripts build and serve the Site with Next.js defaults', () => {
    const { scripts = {} } = readJson<PackageJson>('package.json');

    expect({ dev: scripts['dev'], build: scripts['build'], start: scripts['start'] }).toEqual({
      dev: 'next dev',
      build: 'next build',
      start: 'next start',
    });
    expect(existsSync(path.join(root, 'vercel.json'))).toBe(false);
  });

  it('the Repository has exactly one lockfile, package-lock.json', () => {
    expect(existsSync(path.join(root, 'package-lock.json'))).toBe(true);

    const otherLockfiles = ['yarn.lock', 'pnpm-lock.yaml', 'bun.lock', 'bun.lockb', 'npm-shrinkwrap.json'];
    expect(otherLockfiles.filter((file) => existsSync(path.join(root, file)))).toEqual([]);

    // The lockfile's root entry records the same dependencies as package.json.
    const pkg = readJson<PackageJson>('package.json');
    const lockRoot = readJson<PackageLock>('package-lock.json').packages?.[''];
    expect(lockRoot?.dependencies ?? {}).toEqual(pkg.dependencies ?? {});
    expect(lockRoot?.devDependencies ?? {}).toEqual(pkg.devDependencies ?? {});
  });

  it('Playwright is a pinned development dependency', () => {
    const pkg = readJson<PackageJson>('package.json');
    const declared = pkg.devDependencies?.['@playwright/test'];

    expect(declared).toMatch(/^\d+\.\d+\.\d+$/);
    expect(pkg.dependencies?.['@playwright/test']).toBeUndefined();

    const locked = readJson<PackageLock>('package-lock.json').packages?.['node_modules/@playwright/test'];
    expect(locked?.version).toBe(declared);
  });

  it('the Site has no backend', () => {
    const routeHandlers = walk('src/app').filter((file) => stem(file) === 'route');
    expect(routeHandlers).toEqual([]);

    const middlewareOrProxy = [...walk('src'), ...readdirSync(root).filter((name) => statSync(path.join(root, name)).isFile())]
      .filter((file) => hasExtension(file, codeExtensions))
      .filter((file) => ['middleware', 'proxy'].includes(stem(file)));
    expect(middlewareOrProxy).toEqual([]);

    const serverActions = sourceFiles().filter((file) => /['"]use server['"]/.test(read(file)));
    expect(serverActions).toEqual([]);
  });

  it('the Site has no analytics or telemetry', () => {
    const pkg = readJson<PackageJson>('package.json');
    const declaredPackages = [
      pkg.dependencies,
      pkg.devDependencies,
      pkg.optionalDependencies,
      pkg.peerDependencies,
    ].flatMap((deps) => Object.keys(deps ?? {}));
    expect(declaredPackages.filter(isAnalyticsPackage)).toEqual([]);

    const analyticsImports = sourceFiles().flatMap((file) =>
      importedSpecifiers(read(file))
        .map(packageName)
        .filter(isAnalyticsPackage)
        .map((name) => `${file}: ${name}`),
    );
    expect(analyticsImports).toEqual([]);
  });

  it('the Site reads no environment variable except NODE_ENV', () => {
    const reads = sourceFiles().flatMap((file) =>
      forbiddenEnvReads(read(file)).map((name) => `${file}: ${name}`),
    );
    expect(reads).toEqual([]);
  });

  it('the LICENSE is MIT, 2026, Newturno', () => {
    const license = read('LICENSE');

    expect(license.trimStart().startsWith('MIT License')).toBe(true);
    expect(license).toMatch(/^Copyright \(c\) 2026 Newturno\s*$/m);
    expect(license).toContain('Permission is hereby granted, free of charge, to any person obtaining a copy');
    expect(license).toContain('THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND');
  });

  it('nothing in /.kiro is gitignored', slow, () => {
    const kiroFiles = walk('.kiro');
    expect(kiroFiles.length).toBeGreaterThan(0);

    // Paths are passed without a trailing slash: git 2.45 on Windows reports
    // any `dir/` query as matched by a blank CRLF line in .gitignore.
    expect(gitIgnored(['.kiro', ...kiroFiles])).toEqual([]);

    // `git status --ignored` marks ignored paths with `!!`.
    const ignoredByStatus = git(['status', '--ignored', '--porcelain', '--', '.kiro'])
      .split('\n')
      .filter((line) => line.startsWith('!!'));
    expect(ignoredByStatus).toEqual([]);
  });

  it('build output, environment files and Playwright output are gitignored', slow, () => {
    const samples = [
      'node_modules/next/package.json',
      '.next/build-manifest.json',
      'out/index.html',
      '.vercel/project.json',
      'coverage/index.html',
      'tsconfig.tsbuildinfo',
      'next-env.d.ts',
      '.env',
      '.env.local',
      '.env.production.local',
      'test-results/.last-run.json',
      'playwright-report/index.html',
      'blob-report/report.zip',
      'playwright/.cache/state.json',
    ];

    const ignored = new Set(gitIgnored(samples));
    expect(samples.filter((sample) => !ignored.has(sample))).toEqual([]);
  });

  it('local planning files stay out of the Repository', slow, () => {
    const localFiles = ['.scratch/spooky-coach-mvp/spec.md', 'CLAUDE.md', 'skills-lock.json'];

    const ignored = new Set(gitIgnored(localFiles));
    expect(localFiles.filter((file) => !ignored.has(file))).toEqual([]);

    const trackedLocalFiles = trackedFiles().filter(
      (file) => file.startsWith('.scratch/') || file === 'CLAUDE.md' || file === 'skills-lock.json',
    );
    expect(trackedLocalFiles).toEqual([]);
  });

  it('tracked files contain no secrets', slow, () => {
    // Untracked but not ignored files are scanned too, so the scaffold is
    // checked before it is first committed.
    const candidates = [...new Set([...trackedFiles(), ...untrackedUnignoredFiles()])]
      .filter((file) => file !== thisFile)
      .filter((file) => existsSync(path.join(root, file)));
    expect(candidates).toContain('LICENSE');

    const findings = candidates.flatMap((file) => {
      const buffer = readFileSync(path.join(root, file));
      if (isBinary(buffer)) return [];
      return findSecrets(buffer.toString('utf8')).map((name) => `${file}: ${name}`);
    });
    expect(findings).toEqual([]);
  });

  // The glossary (CONTEXT.md), ADRs 0001-0004 and docs/agents/ are tracked and
  // never gitignored, so the public Repository holds the docs the steering cites.
  it('domain docs are committed', slow, () => {
    const tracked = trackedFiles();
    const adrs = tracked.filter((file) => /^docs\/adr\/000[1-4]-.+\.md$/.test(file));
    const agentDocs = walk('docs/agents');

    expect(tracked).toContain('CONTEXT.md');
    expect(adrs).toHaveLength(4);
    expect(agentDocs.length).toBeGreaterThan(0);
    expect(agentDocs.filter((file) => !tracked.includes(file))).toEqual([]);
    expect(gitIgnored(['CONTEXT.md', ...adrs, ...agentDocs])).toEqual([]);
  });

  // ADR 0004: app code consumes 3D assets but never adds them. Untracked but
  // not ignored files count too, so a stray export is caught before a commit.
  it('app code adds no 3D asset files', slow, () => {
    const candidates = [...new Set([...trackedFiles(), ...untrackedUnignoredFiles()])];
    expect(candidates).toContain('package.json');
    expect(misplaced3dAssets(candidates)).toEqual([]);
  });

  // Requirement 13.8 covers the dependencies declared in package.json, so only
  // direct dependencies and devDependencies are checked. Transitive packages
  // are chosen by those dependencies and are not held to this list.
  it('every dependency is pinned exactly under an allowed licence', () => {
    const pkg = readJson<PackageJson>('package.json');
    const lockPackages = readJson<PackageLock>('package-lock.json').packages ?? {};
    const declared = Object.entries({ ...pkg.dependencies, ...pkg.devDependencies });
    expect(declared.length).toBeGreaterThan(0);

    const problems = declared.flatMap(([name, version]) => {
      const found: string[] = [];
      if (!/^\d+\.\d+\.\d+$/.test(version)) found.push(`${name}: version "${version}" is not exact`);

      const locked = lockPackages[`node_modules/${name}`];
      if (locked?.version !== version) {
        found.push(`${name}: lockfile has ${locked?.version ?? 'no entry'}, package.json has ${version}`);
      }
      if (!licenceAllowed(locked?.license)) {
        found.push(`${name}: lockfile licence ${locked?.license ?? 'missing'} is not allowed`);
      }

      const manifestPath = path.join(root, 'node_modules', name, 'package.json');
      const installed = existsSync(manifestPath)
        ? installedLicence(JSON.parse(readFileSync(manifestPath, 'utf8')) as unknown)
        : undefined;
      if (!licenceAllowed(installed)) {
        found.push(`${name}: installed licence ${installed ?? 'missing'} is not allowed`);
      }
      return found;
    });
    expect(problems).toEqual([]);
  });

  it('the structure steering lists only paths that exist', () => {
    const tree = steeringTreePaths(read('.kiro/steering/structure.md'));
    expect(tree.malformed).toEqual([]);
    expect(tree.paths.length).toBeGreaterThan(0);
    expect(absentPaths(tree.paths)).toEqual([]);

    // Module folders are listed once they exist, and only then.
    for (const folder of ['src/catalog/', 'src/viewer/', 'public/assets/']) {
      const exists = existsSync(path.join(root, folder));
      expect({ folder, listed: tree.paths.includes(folder) }).toEqual({ folder, listed: exists });
    }
  });
});
