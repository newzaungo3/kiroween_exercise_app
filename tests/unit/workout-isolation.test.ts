/**
 * Isolation scan for the Workout_Engine (Requirements 1.2, 1.3, 1.7, 7.2).
 *
 * The engine is pure logic. Its files import only each other (`./…`) and
 * types from the Catalog (`import type … from '@/catalog'`), and never name
 * the page clock, timers, the frame loop, the DOM or browser storage. Time
 * is an argument. The Viewer does not import the engine and the engine does
 * not import the Viewer, so Viewer speed cannot reach Workout time.
 *
 * The scanner parses source text with the TypeScript compiler API, so
 * comments and string literals are ignored. It is built from a folder
 * description (`FolderRules`) so that a later task can point the same
 * functions at other folders. Inline fixtures show what it must flag and
 * what it must pass, so no rule can pass vacuously.
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

// ---------------------------------------------------------------------------
// Files
// ---------------------------------------------------------------------------

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));

const engineDir = 'src/workout-engine';
const viewerDir = 'src/viewer';
const codeExtensions = ['.ts', '.tsx'] as const;

interface SourceFile {
  /** Repository-relative path with forward slashes. */
  readonly file: string;
  readonly text: string;
}

function listFiles(directory: string, extensions: readonly string[]): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      found.push(...listFiles(full, extensions));
    } else if (extensions.some((extension) => entry.name.endsWith(extension))) {
      found.push(full);
    }
  }
  return found;
}

function readSources(directory: string): SourceFile[] {
  return listFiles(path.join(repoRoot, directory), codeExtensions)
    .map((full) => ({
      file: path.relative(repoRoot, full).split(path.sep).join('/'),
      text: readFileSync(full, 'utf8'),
    }))
    .sort((a, b) => a.file.localeCompare(b.file));
}

function isUnder(file: string, directory: string): boolean {
  return file === directory || file.startsWith(`${directory}/`);
}

// ---------------------------------------------------------------------------
// Findings
// ---------------------------------------------------------------------------

interface Finding {
  readonly file: string;
  readonly line: number;
  readonly snippet: string;
}

function describeFindings(findings: readonly Finding[]): string[] {
  return findings.map(({ file, line, snippet }) => `${file}:${line} ${snippet}`);
}

function parseTypeScript(file: string, text: string): ts.SourceFile {
  const kind = file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  return ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, kind);
}

function lineOf(source: ts.SourceFile, node: ts.Node): number {
  return source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
}

// ---------------------------------------------------------------------------
// Module references
// ---------------------------------------------------------------------------

interface ModuleReference {
  readonly file: string;
  readonly line: number;
  /** The module specifier; null for a computed `import(…)` or `require(…)`. */
  readonly specifier: string | null;
  /** The Repository path a relative or `@/` specifier points at, without a script extension; null for a package. */
  readonly resolved: string | null;
  /** True for `import type`, `export type` and `typeof import(…)`. */
  readonly typeOnly: boolean;
}

const scriptExtension = /\.[cm]?[jt]sx?$/;

/** Resolves a relative or `@/` specifier (tsconfig `paths`: `@/*` → `src/*`) to a Repository path. */
function resolveSpecifier(file: string, specifier: string): string | null {
  let target: string;
  if (specifier === '.' || specifier === '..' || specifier.startsWith('./') || specifier.startsWith('../')) {
    target = path.posix.join(path.posix.dirname(file), specifier);
  } else if (specifier.startsWith('@/')) {
    target = path.posix.join('src', specifier.slice(2));
  } else {
    return null;
  }
  return path.posix.normalize(target).replace(scriptExtension, '');
}

function literalSpecifier(node: ts.Node | undefined): string | null {
  return node !== undefined && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))
    ? node.text
    : null;
}

function isTypeOnlyClause(clause: ts.ImportClause): boolean {
  if (clause.phaseModifier === ts.SyntaxKind.TypeKeyword) return true;
  const bindings = clause.namedBindings;
  if (clause.name !== undefined || bindings === undefined || !ts.isNamedImports(bindings)) return false;
  return bindings.elements.length > 0 && bindings.elements.every((element) => element.isTypeOnly);
}

/**
 * Every module a file references: static imports (including side-effect
 * imports), `export … from`, `import x = require(…)`, dynamic `import(…)`,
 * `require(…)` and `typeof import(…)` types.
 */
function moduleReferences(file: string, text: string): ModuleReference[] {
  const source = parseTypeScript(file, text);
  const references: ModuleReference[] = [];

  const add = (node: ts.Node, specifier: string | null, typeOnly: boolean): void => {
    references.push({
      file,
      line: lineOf(source, node),
      specifier,
      resolved: specifier === null ? null : resolveSpecifier(file, specifier),
      typeOnly,
    });
  };

  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node)) {
      const clause = node.importClause;
      add(node, literalSpecifier(node.moduleSpecifier), clause !== undefined && isTypeOnlyClause(clause));
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier !== undefined) {
      add(node, literalSpecifier(node.moduleSpecifier), node.isTypeOnly);
    } else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
      add(node, literalSpecifier(node.moduleReference.expression), node.isTypeOnly);
    } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      add(node, literalSpecifier(node.arguments[0]), false);
    } else if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'require') {
      add(node, literalSpecifier(node.arguments[0]), false);
    } else if (ts.isImportTypeNode(node)) {
      add(node, ts.isLiteralTypeNode(node.argument) ? literalSpecifier(node.argument.literal) : null, true);
    }
    ts.forEachChild(node, visit);
  };

  visit(source);
  return references;
}

function referenceFinding(reference: ModuleReference): Finding {
  return { file: reference.file, line: reference.line, snippet: `import ${reference.specifier ?? '<computed>'}` };
}

function isInside(reference: ModuleReference, directory: string): boolean {
  return reference.resolved !== null && isUnder(reference.resolved, directory);
}

// ---------------------------------------------------------------------------
// Forbidden names
// ---------------------------------------------------------------------------

/**
 * False where an identifier names a member rather than referring to a
 * variable or type: `x.Date`, `A.B`, `{ Date: … }`, interface members and
 * JSX attribute names.
 */
function isReferencePosition(identifier: ts.Identifier): boolean {
  const parent = identifier.parent;
  if (ts.isPropertyAccessExpression(parent) || ts.isQualifiedName(parent)) {
    return (ts.isPropertyAccessExpression(parent) ? parent.name : parent.right) !== identifier;
  }
  if (
    ts.isPropertyAssignment(parent) ||
    ts.isPropertyDeclaration(parent) ||
    ts.isPropertySignature(parent) ||
    ts.isMethodDeclaration(parent) ||
    ts.isMethodSignature(parent) ||
    ts.isGetAccessorDeclaration(parent) ||
    ts.isSetAccessorDeclaration(parent) ||
    ts.isEnumMember(parent)
  ) {
    return parent.name !== identifier;
  }
  if (ts.isBindingElement(parent)) return parent.propertyName !== identifier;
  if (ts.isJsxAttribute(parent)) return parent.name !== identifier;
  return true;
}

/** References to the given names in a TypeScript file. Comments and strings are ignored. */
function findNameReferences(file: string, text: string, names: ReadonlySet<string>): Finding[] {
  const source = parseTypeScript(file, text);
  const findings: Finding[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isIdentifier(node) && names.has(node.text) && isReferencePosition(node)) {
      findings.push({ file, line: lineOf(source, node), snippet: node.text });
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return findings;
}

/** The page clock, timers, the frame loop, the DOM and browser storage: the engine takes time as an argument. */
const engineForbiddenNames: ReadonlySet<string> = new Set([
  'Date',
  'performance',
  'setTimeout',
  'setInterval',
  'requestAnimationFrame',
  'window',
  'document',
  'localStorage',
  'sessionStorage',
  'indexedDB',
]);

// ---------------------------------------------------------------------------
// Folder rules
// ---------------------------------------------------------------------------

interface FolderRules {
  /** True for a module reference the folder may make. */
  readonly allowsReference: (reference: ModuleReference) => boolean;
  readonly forbiddenNames: ReadonlySet<string>;
}

/** Own files by a `./` specifier, and types from the Catalog by `import type` (or `export type`). */
function isAllowedEngineReference(reference: ModuleReference): boolean {
  if (reference.specifier === null) return false;
  if (reference.specifier.startsWith('./')) return isInside(reference, engineDir);
  return reference.specifier === '@/catalog' && reference.typeOnly;
}

const engineRules: FolderRules = {
  allowsReference: isAllowedEngineReference,
  forbiddenNames: engineForbiddenNames,
};

/** Module references the rules do not allow, and references to forbidden names, in line order. */
function findViolations(file: string, text: string, rules: FolderRules): Finding[] {
  const references = moduleReferences(file, text)
    .filter((reference) => !rules.allowsReference(reference))
    .map(referenceFinding);
  return [...references, ...findNameReferences(file, text, rules.forbiddenNames)].sort((a, b) => a.line - b.line);
}

/** Violations in every file of a folder; fails if the folder yields no file, so the scan cannot pass vacuously. */
function scanFolder(directory: string, rules: FolderRules): string[] {
  const sources = readSources(directory);
  expect(sources.length).toBeGreaterThan(0);
  return describeFindings(sources.flatMap(({ file, text }) => findViolations(file, text, rules)));
}

/** References from files in `from` to modules in `target`. */
function findReferencesInto(from: string, target: string): string[] {
  const sources = readSources(from);
  expect(sources.length).toBeGreaterThan(0);
  return describeFindings(
    sources.flatMap(({ file, text }) =>
      moduleReferences(file, text).filter((reference) => isInside(reference, target)).map(referenceFinding),
    ),
  );
}

// ---------------------------------------------------------------------------
// Storage and Progress_Code rules (Requirements 14.1, 14.3)
// ---------------------------------------------------------------------------

const progressStoreDir = 'src/progress-store';
const routineUiDir = 'src/ui/routines';
const workoutUiDir = 'src/ui/workout';
const routineRouteDir = 'src/app/routines';

/** Browser-storage APIs that a name reference reveals; `document.cookie` is a member access, found apart. */
const storageNames: ReadonlySet<string> = new Set(['localStorage', 'sessionStorage', 'indexedDB']);

/** True for the `document` in `document.cookie`, `window.document.cookie` and `globalThis.document.cookie`. */
function isDocumentExpression(node: ts.Expression): boolean {
  if (ts.isIdentifier(node)) return node.text === 'document';
  return ts.isPropertyAccessExpression(node) && node.name.text === 'document';
}

/** Reads of `document.cookie`, written with a dot or with `document['cookie']`. */
function findCookieAccess(file: string, text: string): Finding[] {
  const source = parseTypeScript(file, text);
  const findings: Finding[] = [];
  const visit = (node: ts.Node): void => {
    const dotted =
      ts.isPropertyAccessExpression(node) && node.name.text === 'cookie' && isDocumentExpression(node.expression);
    const indexed =
      ts.isElementAccessExpression(node) &&
      literalSpecifier(node.argumentExpression) === 'cookie' &&
      isDocumentExpression(node.expression);
    if (dotted || indexed) findings.push({ file, line: lineOf(source, node), snippet: 'document.cookie' });
    ts.forEachChild(node, visit);
  };
  visit(source);
  return findings;
}

const globalObjects: ReadonlySet<string> = new Set(['window', 'globalThis', 'self']);

/** Storage reached through the global object: `window.localStorage`, `globalThis.indexedDB`. */
function findGlobalStorageAccess(file: string, text: string): Finding[] {
  const source = parseTypeScript(file, text);
  const findings: Finding[] = [];
  const visit = (node: ts.Node): void => {
    if (
      ts.isPropertyAccessExpression(node) &&
      storageNames.has(node.name.text) &&
      ts.isIdentifier(node.expression) &&
      globalObjects.has(node.expression.text)
    ) {
      findings.push({ file, line: lineOf(source, node), snippet: node.name.text });
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return findings;
}

/** A reference to browser storage, or an import of the Progress_Store. */
function findStorageViolations(file: string, text: string): Finding[] {
  const imports = moduleReferences(file, text)
    .filter((reference) => isInside(reference, progressStoreDir))
    .map(referenceFinding);
  return [
    ...imports,
    ...findNameReferences(file, text, storageNames),
    ...findGlobalStorageAccess(file, text),
    ...findCookieAccess(file, text),
  ].sort((a, b) => a.line - b.line);
}

/** Imports of Progress_Code: the Progress_Store folder. */
function findProgressCodeImports(file: string, text: string): Finding[] {
  return moduleReferences(file, text)
    .filter((reference) => isInside(reference, progressStoreDir))
    .map(referenceFinding);
}

/** Findings of `scan` in every file of a folder; fails if the folder yields no file. */
function scanFiles(directory: string, scan: (file: string, text: string) => Finding[]): string[] {
  const sources = readSources(directory);
  expect(sources.length).toBeGreaterThan(0);
  return describeFindings(sources.flatMap(({ file, text }) => scan(file, text)));
}

// ---------------------------------------------------------------------------
// The rules, checked on the real files
// ---------------------------------------------------------------------------

describe('Workout isolation from storage and Progress_Code', () => {
  it.each([routineUiDir, workoutUiDir, routineRouteDir, engineDir])(
    '%s references no browser storage and imports no Progress_Store',
    (directory) => {
      expect(scanFiles(directory, findStorageViolations)).toEqual([]);
    },
  );

  it.each([workoutUiDir, routineUiDir])('%s imports no Progress_Code', (directory) => {
    expect(scanFiles(directory, findProgressCodeImports)).toEqual([]);
  });
});

describe('Workout engine isolation', () => {
  it('the Workout engine imports only its own files and Catalog types, and reads no clock, timer, DOM or storage', () => {
    expect(scanFolder(engineDir, engineRules)).toEqual([]);
  });

  it('the Workout engine imports nothing from the Viewer', () => {
    expect(findReferencesInto(engineDir, viewerDir)).toEqual([]);
  });

  it('no Viewer file imports the Workout engine', () => {
    expect(findReferencesInto(viewerDir, engineDir)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// The scanner, checked on inline fixtures
// ---------------------------------------------------------------------------

const lines = (...rows: string[]) => rows.join('\n');
const snippets = (findings: readonly Finding[]) => findings.map(({ snippet }) => snippet);

describe('Workout engine isolation scanner', () => {
  it('flags outside imports, value imports from the Catalog and other folders', () => {
    const fixture = lines(
      "import { useState } from 'react';",
      "import { Object3D } from 'three';",
      "import { entries } from '@/catalog';",
      "import type { ViewerSpeed } from '../viewer/logic/playback';",
      "import { Viewer } from '@/viewer/ViewerIsland';",
      "import { load } from '@/progress-store';",
      "import './side-effect-in-own-folder';",
      "export { x } from '../ui/strings';",
      "const lazy = await import('../viewer/ViewerIsland');",
      "import type { Elsewhere } from '@/ui/strings';",
    );
    expect(snippets(findViolations('src/workout-engine/fixture.ts', fixture, engineRules))).toEqual([
      'import react',
      'import three',
      'import @/catalog',
      'import ../viewer/logic/playback',
      'import @/viewer/ViewerIsland',
      'import @/progress-store',
      'import ../ui/strings',
      'import ../viewer/ViewerIsland',
      'import @/ui/strings',
    ]);
  });

  it('flags every forbidden clock, timer, DOM and storage name', () => {
    const fixture = lines(
      'export const a = new Date();',
      'export const b = performance.now();',
      'export const c = setTimeout(() => 0, 1);',
      'export const d = setInterval(() => 0, 1);',
      'export const e = requestAnimationFrame(() => 0);',
      'export const f = window.innerWidth;',
      'export const g = document.hidden;',
      "export const h = localStorage.getItem('k');",
      "export const i = sessionStorage.getItem('k');",
      'export const j = indexedDB.databases();',
      'export function k(when: Date): number { return when.getTime(); }',
    );
    expect(snippets(findViolations('src/workout-engine/fixture.ts', fixture, engineRules))).toEqual([
      'Date',
      'performance',
      'setTimeout',
      'setInterval',
      'requestAnimationFrame',
      'window',
      'document',
      'localStorage',
      'sessionStorage',
      'indexedDB',
      'Date',
    ]);
  });

  it('passes own-file imports, Catalog types, comments, strings and member names', () => {
    const fixture = lines(
      '/** Never reads Date, window.localStorage or setTimeout; it only mentions them. */',
      "import type { RoutineEntry } from '@/catalog';",
      "import { type ExerciseTarget } from '@/catalog';",
      "import { candyFor } from './candy';",
      "import type { SetSlot } from './types.ts';",
      "export { buildSetSlots } from './slots';",
      "export type { Phase } from './types';",
      "export type { RoutineEntry as Entry } from '@/catalog';",
      "type Later = typeof import('./types');",
      "const note = 'uses Date and document and performance.now()';",
      'const template = `window ${note} indexedDB`;',
      'const clock = { Date: 1, window: 2, performance: 3 };',
      'export const at = clock.Date + clock.window + clock.performance;',
      'export interface Names { readonly document: string; readonly localStorage: number }',
    );
    expect(findViolations('src/workout-engine/fixture.ts', fixture, engineRules)).toEqual([]);
  });

  it('reports the line of each finding', () => {
    const fixture = lines('export const a = 1;', '', 'export const b = Date.now();');
    expect(findViolations('src/workout-engine/fixture.ts', fixture, engineRules)).toEqual([
      { file: 'src/workout-engine/fixture.ts', line: 3, snippet: 'Date' },
    ]);
  });

  it('flags browser storage, cookies and Progress_Store imports', () => {
    const fixture = lines(
      "import { save } from '@/progress-store';",
      "import type { Checkpoint } from '../../progress-store/types';",
      "export const a = localStorage.getItem('k');",
      "export const b = window.sessionStorage;",
      'export const c = indexedDB.databases();',
      'export const d = document.cookie;',
      "export const e = document['cookie'];",
      'export const f = window.document.cookie;',
    );
    expect(snippets(findStorageViolations('src/ui/workout/fixture.ts', fixture))).toEqual([
      'import @/progress-store',
      'import ../../progress-store/types',
      'localStorage',
      'sessionStorage',
      'indexedDB',
      'document.cookie',
      'document.cookie',
      'document.cookie',
    ]);
    expect(snippets(findProgressCodeImports('src/ui/workout/fixture.ts', fixture))).toEqual([
      'import @/progress-store',
      'import ../../progress-store/types',
    ]);
  });

  it('passes the DOM, comments, strings and member names that only resemble storage', () => {
    const fixture = lines(
      '// never touches localStorage or document.cookie',
      "import { useState } from 'react';",
      "import { t } from '@/ui/strings';",
      "import { advance } from '@/workout-engine';",
      "const note = 'localStorage and document.cookie';",
      'export const hidden = document.hidden;',
      'export const jar = { cookie: 1, localStorage: 2 };',
      'export const crumb = jar.cookie + jar.localStorage;',
    );
    expect(findStorageViolations('src/ui/workout/fixture.ts', fixture)).toEqual([]);
    expect(findProgressCodeImports('src/ui/workout/fixture.ts', fixture)).toEqual([]);
  });

  it('finds a reference into another folder, however it is written', () => {
    const fixture = lines(
      "import { a } from '@/workout-engine';",
      "import type { B } from '../../workout-engine/types';",
      "export { c } from '../../workout-engine/engine.ts';",
      "import { d } from './local';",
    );
    const inside = moduleReferences('src/viewer/logic/fixture.ts', fixture).filter((reference) =>
      isInside(reference, engineDir),
    );
    expect(inside.map((reference) => reference.specifier)).toEqual([
      '@/workout-engine',
      '../../workout-engine/types',
      '../../workout-engine/engine.ts',
    ]);
  });
});
