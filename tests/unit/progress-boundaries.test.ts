/**
 * Module-boundary scan for the Progress_Store (Requirements 1.3 to 1.6, 10.1, 13.5).
 *
 * The Progress_Store is pure logic over an injected storage. Its files import
 * no React, Three.js, Viewer, UI, app or Catalog module, and only types from
 * the Workout engine. They read no clock, `performance`, `window` or
 * `document`. Browser storage is named only in `local-storage.ts`, and there
 * only `localStorage`. Outside the folder, only `src/ui/progress/` may import
 * the Progress_Store.
 *
 * The scanner parses source text with the TypeScript compiler API, so
 * comments and string literals are ignored. Inline fixtures show what each
 * rule must flag and what it must pass.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));

const storeDir = 'src/progress-store';
const storageFile = 'src/progress-store/local-storage.ts';
const engineDir = 'src/workout-engine';
const uiProgressDir = 'src/ui/progress';
const allowedImporterDirs = ['src/progress-store', 'src/ui/progress'] as const;

interface SourceFile {
  readonly file: string;
  readonly text: string;
}

interface Finding {
  readonly file: string;
  readonly line: number;
  readonly snippet: string;
}

function listFiles(directory: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) found.push(...listFiles(full));
    else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) found.push(full);
  }
  return found;
}

function readSources(directory: string): SourceFile[] {
  const root = path.join(repoRoot, directory);
  if (!existsSync(root)) return [];
  return listFiles(root)
    .map((full) => ({
      file: path.relative(repoRoot, full).split(path.sep).join('/'),
      text: readFileSync(full, 'utf8'),
    }))
    .sort((a, b) => a.file.localeCompare(b.file));
}

function isUnder(file: string, directory: string): boolean {
  return file === directory || file.startsWith(`${directory}/`);
}

function describeFindings(findings: readonly Finding[]): string[] {
  return findings.map(({ file, line, snippet }) => `${file}:${line} ${snippet}`);
}

function parse(file: string, text: string): ts.SourceFile {
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
  readonly specifier: string | null;
  /** Repository path of a relative or `@/` specifier without script extension; null for a package. */
  readonly resolved: string | null;
  readonly typeOnly: boolean;
}

function resolveSpecifier(file: string, specifier: string): string | null {
  let target: string;
  if (specifier === '.' || specifier === '..' || specifier.startsWith('./') || specifier.startsWith('../')) {
    target = path.posix.join(path.posix.dirname(file), specifier);
  } else if (specifier.startsWith('@/')) {
    target = path.posix.join('src', specifier.slice(2));
  } else {
    return null;
  }
  return path.posix.normalize(target).replace(/\.[cm]?[jt]sx?$/, '');
}

function literalText(node: ts.Node | undefined): string | null {
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

function moduleReferences(file: string, text: string): ModuleReference[] {
  const source = parse(file, text);
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
      add(node, literalText(node.moduleSpecifier), clause !== undefined && isTypeOnlyClause(clause));
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier !== undefined) {
      add(node, literalText(node.moduleSpecifier), node.isTypeOnly);
    } else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
      add(node, literalText(node.moduleReference.expression), node.isTypeOnly);
    } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      add(node, literalText(node.arguments[0]), false);
    } else if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'require') {
      add(node, literalText(node.arguments[0]), false);
    } else if (ts.isImportTypeNode(node)) {
      add(node, ts.isLiteralTypeNode(node.argument) ? literalText(node.argument.literal) : null, true);
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
// Rule 1: imports of the Progress_Store folder
// ---------------------------------------------------------------------------

const forbiddenPackages = ['react', 'react-dom', 'three', '@react-three/fiber', '@react-three/drei'];
const forbiddenAliasDirs = ['src/viewer', 'src/ui', 'src/app', 'src/catalog'] as const;

function isForbiddenStoreImport(reference: ModuleReference): boolean {
  const { specifier } = reference;
  if (specifier === null) return true;
  if (
    forbiddenPackages.some((name) => specifier === name || specifier.startsWith(`${name}/`)) ||
    specifier === 'react/jsx-runtime'
  ) {
    return true;
  }
  if (forbiddenAliasDirs.some((directory) => isInside(reference, directory))) return true;
  if (isInside(reference, engineDir)) return !reference.typeOnly;
  return false;
}

function findStoreImportViolations(file: string, text: string): Finding[] {
  return moduleReferences(file, text).filter(isForbiddenStoreImport).map(referenceFinding);
}

// ---------------------------------------------------------------------------
// Rule 2 and 3: forbidden names and browser storage
// ---------------------------------------------------------------------------

/** False where an identifier names a member or key rather than referring to a variable or type. */
function isReferencePosition(identifier: ts.Identifier): boolean {
  const parent = identifier.parent;
  if (ts.isPropertyAccessExpression(parent)) return parent.name !== identifier;
  if (ts.isQualifiedName(parent)) return parent.right !== identifier;
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

const globalObjects: ReadonlySet<string> = new Set(['window', 'globalThis', 'self']);

/**
 * Identifiers with one of the names, as references (`Date`) or as members of
 * the global object (`globalThis.Date`). Other member names are ignored.
 */
function findNames(file: string, text: string, names: ReadonlySet<string>): Finding[] {
  const source = parse(file, text);
  const findings: Finding[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isIdentifier(node) && names.has(node.text)) {
      const parent = node.parent;
      const viaGlobal =
        ts.isPropertyAccessExpression(parent) &&
        parent.name === node &&
        ts.isIdentifier(parent.expression) &&
        globalObjects.has(parent.expression.text);
      if (viaGlobal || isReferencePosition(node)) {
        findings.push({ file, line: lineOf(source, node), snippet: node.text });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return findings;
}

const clockAndDomNames: ReadonlySet<string> = new Set(['Date', 'performance', 'window', 'document']);

function findClockAndDom(file: string, text: string): Finding[] {
  // `globalThis.localStorage` is not `window`; only `window` itself is forbidden.
  return findNames(file, text, clockAndDomNames);
}

const storageNames: ReadonlySet<string> = new Set(['localStorage', 'sessionStorage', 'indexedDB']);

/** Browser storage named in a file that is not the adapter file. */
function findAnyStorage(file: string, text: string): Finding[] {
  return findNames(file, text, storageNames);
}

/** In the adapter file: anything but `localStorage`. */
function findNonLocalStorage(file: string, text: string): Finding[] {
  return findNames(file, text, new Set(['sessionStorage', 'indexedDB']));
}

/** Storage rules for one file of the folder. */
function findStorageViolations(file: string, text: string): Finding[] {
  return file === storageFile ? findNonLocalStorage(file, text) : findAnyStorage(file, text);
}

/** The adapter file must really name `localStorage` through the global object, or the rule is vacuous. */
function namesLocalStorage(file: string, text: string): boolean {
  return findNames(file, text, new Set(['localStorage'])).length > 0;
}

// ---------------------------------------------------------------------------
// Rule 4: who may import the Progress_Store
// ---------------------------------------------------------------------------

function findProgressStoreImports(file: string, text: string): Finding[] {
  return moduleReferences(file, text)
    .filter((reference) => isInside(reference, storeDir))
    .map(referenceFinding);
}

function importerIsAllowed(file: string): boolean {
  return allowedImporterDirs.some((directory) => isUnder(file, directory));
}

function findDisallowedImporters(sources: readonly SourceFile[]): string[] {
  return describeFindings(
    sources
      .filter(({ file }) => !importerIsAllowed(file))
      .flatMap(({ file, text }) => findProgressStoreImports(file, text)),
  );
}

// ---------------------------------------------------------------------------
// The rules, checked on the real files
// ---------------------------------------------------------------------------

describe('Progress_Store module boundaries', () => {
  const storeSources = readSources(storeDir);

  it('the scan sees the Progress_Store files', () => {
    expect(storeSources.length).toBeGreaterThan(0);
    expect(storeSources.some(({ file }) => file === storageFile)).toBe(true);
  });

  it('the Progress_Store imports no React, Three.js, Viewer, UI, app or Catalog module, and only types from the Workout engine', () => {
    expect(describeFindings(storeSources.flatMap(({ file, text }) => findStoreImportViolations(file, text)))).toEqual(
      [],
    );
  });

  it('the Progress_Store reads no Date, performance, window or document', () => {
    expect(describeFindings(storeSources.flatMap(({ file, text }) => findClockAndDom(file, text)))).toEqual([]);
  });

  it('browser storage is named only in local-storage.ts, and only localStorage there', () => {
    expect(describeFindings(storeSources.flatMap(({ file, text }) => findStorageViolations(file, text)))).toEqual([]);
    const adapter = storeSources.find(({ file }) => file === storageFile);
    expect(adapter !== undefined && namesLocalStorage(adapter.file, adapter.text)).toBe(true);
  });

  it('no file of src/ui/progress names localStorage, sessionStorage or indexedDB', () => {
    const uiSources = readSources(uiProgressDir);
    expect(uiSources.length).toBeGreaterThan(0);
    expect(describeFindings(uiSources.flatMap(({ file, text }) => findAnyStorage(file, text)))).toEqual([]);
  });

  it('only src/progress-store and src/ui/progress import the Progress_Store', () => {
    const sources = readSources('src');
    expect(sources.length).toBeGreaterThan(storeSources.length);
    expect(findDisallowedImporters(sources)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// The scanner, checked on inline fixtures
// ---------------------------------------------------------------------------

const lines = (...rows: string[]) => rows.join('\n');
const snippets = (findings: readonly Finding[]) => findings.map(({ snippet }) => snippet);

describe('Progress_Store boundary scanner', () => {
  const storeFile = 'src/progress-store/fixture.ts';

  it('flags forbidden imports and value imports of the Workout engine', () => {
    const fixture = lines(
      "import { useState } from 'react';",
      "import { Object3D } from 'three';",
      "import { Canvas } from '@react-three/fiber';",
      "import { Viewer } from '@/viewer/ViewerIsland';",
      "import { t } from '../ui/strings';",
      "import { page } from '@/app/page';",
      "import { entries } from '@/catalog';",
      "import { advance } from '@/workout-engine';",
      "import { type WorkoutOutcome, advance as go } from '@/workout-engine';",
      "export { x } from '@/ui/strings';",
      "const lazy = await import('@/viewer/ViewerIsland');",
    );
    expect(snippets(findStoreImportViolations(storeFile, fixture))).toEqual([
      'import react',
      'import three',
      'import @react-three/fiber',
      'import @/viewer/ViewerIsland',
      'import ../ui/strings',
      'import @/app/page',
      'import @/catalog',
      'import @/workout-engine',
      'import @/workout-engine',
      'import @/ui/strings',
      'import @/viewer/ViewerIsland',
    ]);
  });

  it('passes own files, type-only Workout engine imports, comments and strings', () => {
    const fixture = lines(
      "// import { useState } from 'react';",
      "import type { WorkoutOutcome } from '@/workout-engine';",
      "import { type Phase } from '@/workout-engine';",
      "export type { Phase as P } from '@/workout-engine';",
      "import { validateRecord } from './rules';",
      "import { schemaVersion } from './types.ts';",
      "const note = \"import x from 'react'\";",
    );
    expect(findStoreImportViolations(storeFile, fixture)).toEqual([]);
  });

  it('flags Date, performance, window and document, also through the global object', () => {
    const fixture = lines(
      'export const a = new Date();',
      'export const b = performance.now();',
      'export const c = window.innerWidth;',
      'export const d = document.hidden;',
      'export const e = globalThis.window;',
      'export const f = globalThis.Date.now();',
      'export function g(when: Date): number { return when.getTime(); }',
    );
    expect(snippets(findClockAndDom(storeFile, fixture))).toEqual([
      'Date',
      'performance',
      'window',
      'document',
      'window',
      'Date',
      'Date',
    ]);
  });

  it('passes comments, strings and member names that only resemble the clock and the DOM', () => {
    const fixture = lines(
      '/** Never reads Date, window or document; it only mentions them. */',
      "const note = 'Date and window and performance.now()';",
      'const clock = { Date: 1, window: 2, document: 3, performance: 4 };',
      'export const at = clock.Date + clock.window + clock.document + clock.performance;',
      'export interface Names { readonly document: string }',
      'export const stored = globalThis.localStorage;',
    );
    expect(findClockAndDom(storeFile, fixture)).toEqual([]);
  });

  it('flags any browser storage name in a file other than the adapter', () => {
    const fixture = lines(
      "export const a = localStorage.getItem('k');",
      "export const b = globalThis.localStorage.getItem('k');",
      'export const c = window.sessionStorage;',
      'export const d = indexedDB.databases();',
    );
    expect(snippets(findStorageViolations('src/progress-store/store.ts', fixture))).toEqual([
      'localStorage',
      'localStorage',
      'sessionStorage',
      'indexedDB',
    ]);
  });

  it('flags sessionStorage and indexedDB in the adapter file but passes localStorage', () => {
    const fixture = lines(
      "export const a = globalThis.localStorage.getItem('k');",
      "export const b = globalThis.sessionStorage.getItem('k');",
      'export const c = indexedDB.databases();',
    );
    expect(snippets(findStorageViolations(storageFile, fixture))).toEqual(['sessionStorage', 'indexedDB']);
    expect(namesLocalStorage(storageFile, fixture)).toBe(true);
  });

  it('passes storage words in comments, strings and member keys', () => {
    const fixture = lines(
      '// Never names localStorage or indexedDB.',
      "const note = 'localStorage';",
      'export const jar = { localStorage: 1, sessionStorage: 2 };',
      'export const crumb = jar.localStorage + jar.sessionStorage;',
    );
    expect(findStorageViolations('src/progress-store/store.ts', fixture)).toEqual([]);
    expect(namesLocalStorage(storageFile, fixture)).toBe(false);
  });

  it('flags browser storage named in a file of src/ui/progress', () => {
    const fixture = lines(
      "export const a = localStorage.getItem('k');",
      "export const b = window.sessionStorage.getItem('k');",
      'export const c = globalThis.indexedDB;',
    );
    expect(snippets(findAnyStorage('src/ui/progress/Fixture.tsx', fixture))).toEqual([
      'localStorage',
      'sessionStorage',
      'indexedDB',
    ]);
  });

  it('passes a file of src/ui/progress that only uses the Progress_Store and mentions storage in text', () => {
    const fixture = lines(
      '// Never names localStorage.',
      "import { createProgressStore } from '@/progress-store';",
      "export const note = 'sessionStorage';",
      'export const jar = { indexedDB: 1 };',
    );
    expect(findAnyStorage('src/ui/progress/Fixture.tsx', fixture)).toEqual([]);
  });

  it('flags an import of the Progress_Store from a disallowed folder, however it is written', () => {
    const sources: SourceFile[] = [
      {
        file: 'src/ui/workout/WorkoutScreen.tsx',
        text: lines(
          "import { createProgressStore } from '@/progress-store';",
          "import type { WorkoutRecord } from '../../progress-store/types';",
          "export { createMemoryStorage } from '@/progress-store/memory-storage';",
        ),
      },
    ];
    expect(findDisallowedImporters(sources)).toEqual([
      'src/ui/workout/WorkoutScreen.tsx:1 import @/progress-store',
      'src/ui/workout/WorkoutScreen.tsx:2 import ../../progress-store/types',
      'src/ui/workout/WorkoutScreen.tsx:3 import @/progress-store/memory-storage',
    ]);
  });

  it('passes imports of the Progress_Store from its own folder and from src/ui/progress', () => {
    const sources: SourceFile[] = [
      { file: 'src/progress-store/store.ts', text: "import { x } from '@/progress-store/types';" },
      { file: 'src/ui/progress/ProgressProvider.tsx', text: "import { createProgressStore } from '@/progress-store';" },
      { file: 'src/ui/workout/WorkoutScreen.tsx', text: "import { t } from '@/ui/strings';" },
    ];
    expect(findDisallowedImporters(sources)).toEqual([]);
  });
});
