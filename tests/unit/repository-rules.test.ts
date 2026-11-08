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
  packages?: Record<string, PackageJson & { version?: string }>;
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

  it('components and the Strings_Module live under src/ui', () => {
    const srcFiles = walk('src');

    // src/app holds only route files, globals.css and icon.svg.
    const routeFileNames = ['layout.tsx', 'page.tsx', 'not-found.tsx'];
    const strayAppFiles = srcFiles
      .filter((file) => file.startsWith('src/app/'))
      .filter((file) => !routeFileNames.includes(path.posix.basename(file)))
      .filter((file) => file !== 'src/app/globals.css' && file !== 'src/app/icon.svg');
    expect(strayAppFiles).toEqual([]);

    // Everything else under src/ sits in src/ui, apart from the tracked Next.js type references.
    const knownExceptions = ['src/types/next.d.ts'];
    const strayFiles = srcFiles
      .filter((file) => !file.startsWith('src/app/') && !file.startsWith('src/ui/'))
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
});
