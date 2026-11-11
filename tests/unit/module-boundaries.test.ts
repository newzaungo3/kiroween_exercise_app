/**
 * Module-boundary guard tests: the dependency rules of the design's module
 * view, checked on the source text of `src/`.
 *
 * - The Catalog imports only from `src/catalog/`, plus the type `StringId`
 *   from the Strings_Module, and touches no browser global (Requirement 1.7).
 * - Viewer logic (`src/viewer/logic/`) imports only from itself and touches
 *   no browser global, so it runs in the `node` environment with an injected
 *   clock.
 * - Only `src/viewer/scene/` imports Three.js or React Three Fiber, and
 *   nothing outside it reaches it except the one `import('./scene/Scene3D')`
 *   in the Viewer island, so only the Exercise_Detail_Screen downloads 3D
 *   code (Requirement 13.6). The UI and the routes reach the Viewer only
 *   through `@/viewer/ViewerIsland`.
 * - The Viewer holds no asset path and no Demo_Clip name: they come from the
 *   Catalog, so a CC0_Fallback is a content change (Requirements 13.7, 15.5).
 * - The Viewer turns on no shadows and no post-processing (Requirement 5.3).
 *
 * Each scanner parses source text with the TypeScript compiler API, in the
 * style of `source-rules.test.ts`, and has one inline fixture it must flag
 * and one it must pass, so no rule can pass vacuously.
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

import { exercises } from '@/catalog';

// ---------------------------------------------------------------------------
// Files
// ---------------------------------------------------------------------------

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));

const catalogDir = 'src/catalog';
const viewerDir = 'src/viewer';
const viewerLogicDir = 'src/viewer/logic';
const viewerSceneDir = 'src/viewer/scene';
/** The one file that may reach the Viewer scene, and the module it reaches. */
const sceneImporter = 'src/viewer/ViewerIsland.tsx';
const sceneEntry = 'src/viewer/scene/Scene3D';
/** The only Viewer module that code outside `src/viewer/` may import. */
const viewerEntry = 'src/viewer/ViewerIsland';

const codeExtensions = ['.ts', '.tsx'] as const;

interface SourceFile {
  /** Repository-relative path with forward slashes, used to classify imports and in failure output. */
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

function readSources(directories: readonly string[], extensions: readonly string[]): SourceFile[] {
  return directories
    .flatMap((directory) => listFiles(path.join(repoRoot, directory), extensions))
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

/** `file:line snippet`, so a failing test prints where each violation sits. */
function describeFindings(findings: readonly Finding[]): string[] {
  return findings.map(({ file, line, snippet }) => `${file}:${line} ${snippet}`);
}

/** Findings in line order; findings on the same line keep their order. */
function byLine(findings: readonly Finding[]): Finding[] {
  return [...findings].sort((a, b) => a.line - b.line);
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

type ReferenceKind = 'import' | 'export' | 'import-equals' | 'dynamic' | 'require' | 'type-query';

interface ModuleReference {
  readonly file: string;
  readonly line: number;
  readonly kind: ReferenceKind;
  /** The module specifier; null for a computed `import(…)` or `require(…)`. */
  readonly specifier: string | null;
  /**
   * The Repository path a relative or `@/` specifier points at, without a
   * script extension (`src/viewer/scene/Scene3D`); null for a package.
   */
  readonly resolved: string | null;
  /** True for `import type`, `export type` and `typeof import(…)`. */
  readonly typeOnly: boolean;
  /** The imported or re-exported names; null for a default, namespace, `*` or side-effect import. */
  readonly names: readonly string[] | null;
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

/** Package name of a specifier: `@scope/name/sub` → `@scope/name`, `name/sub` → `name`. */
function packageName(specifier: string): string {
  const parts = specifier.split('/');
  return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : (parts[0] ?? specifier);
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

function importedNames(clause: ts.ImportClause | undefined): readonly string[] | null {
  const bindings = clause?.namedBindings;
  if (clause === undefined || clause.name !== undefined || bindings === undefined || !ts.isNamedImports(bindings)) {
    return null;
  }
  return bindings.elements.map((element) => (element.propertyName ?? element.name).text);
}

function exportedNames(declaration: ts.ExportDeclaration): readonly string[] | null {
  const clause = declaration.exportClause;
  if (clause === undefined || !ts.isNamedExports(clause)) return null;
  return clause.elements.map((element) => (element.propertyName ?? element.name).text);
}

/**
 * Every module a file references: static imports (including `import type`
 * and side-effect imports), `export … from`, `import x = require(…)`,
 * dynamic `import(…)`, `require(…)` and `typeof import(…)` types.
 */
function moduleReferences(file: string, text: string): ModuleReference[] {
  const source = parseTypeScript(file, text);
  const references: ModuleReference[] = [];

  const add = (
    node: ts.Node,
    kind: ReferenceKind,
    specifier: string | null,
    typeOnly: boolean,
    names: readonly string[] | null,
  ): void => {
    references.push({
      file,
      line: lineOf(source, node),
      kind,
      specifier,
      resolved: specifier === null ? null : resolveSpecifier(file, specifier),
      typeOnly,
      names,
    });
  };

  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node)) {
      const clause = node.importClause;
      const typeOnly = clause !== undefined && isTypeOnlyClause(clause);
      add(node, 'import', literalSpecifier(node.moduleSpecifier), typeOnly, importedNames(clause));
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier !== undefined) {
      add(node, 'export', literalSpecifier(node.moduleSpecifier), node.isTypeOnly, exportedNames(node));
    } else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
      add(node, 'import-equals', literalSpecifier(node.moduleReference.expression), node.isTypeOnly, null);
    } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      add(node, 'dynamic', literalSpecifier(node.arguments[0]), false, null);
    } else if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'require') {
      add(node, 'require', literalSpecifier(node.arguments[0]), false, null);
    } else if (ts.isImportTypeNode(node)) {
      const specifier = ts.isLiteralTypeNode(node.argument) ? literalSpecifier(node.argument.literal) : null;
      add(node, 'type-query', specifier, true, null);
    }
    ts.forEachChild(node, visit);
  };

  visit(source);
  return references;
}

function referenceFinding(reference: ModuleReference): Finding {
  return {
    file: reference.file,
    line: reference.line,
    snippet: `${reference.kind} ${reference.specifier ?? '<computed>'}`,
  };
}

function isInside(reference: ModuleReference, directory: string): boolean {
  return reference.resolved !== null && isUnder(reference.resolved, directory);
}

// ---------------------------------------------------------------------------
// Browser globals
// ---------------------------------------------------------------------------

/**
 * Browser globals that pure modules must not touch: the DOM, browser storage,
 * the network, and the page's own clock and frame loop (pure modules take
 * time as an argument).
 */
const browserGlobals = new Set([
  'window',
  'document',
  'navigator',
  'globalThis',
  'localStorage',
  'sessionStorage',
  'indexedDB',
  'performance',
  'requestAnimationFrame',
  'cancelAnimationFrame',
  'matchMedia',
  'fetch',
  'XMLHttpRequest',
  'IntersectionObserver',
  'ResizeObserver',
  'MutationObserver',
]);

/** DOM types that pure modules must not name. */
const domTypeNames = new Set([
  'Document',
  'Window',
  'Navigator',
  'Storage',
  'Element',
  'EventTarget',
  'Event',
  'PointerEvent',
  'WheelEvent',
  'MouseEvent',
  'TouchEvent',
  'KeyboardEvent',
  'MediaQueryList',
  'DOMRect',
]);
const domTypePrefix = /^(?:HTML|SVG|WebGL)\w/;

function isBrowserName(name: string): boolean {
  return browserGlobals.has(name) || domTypeNames.has(name) || domTypePrefix.test(name);
}

/**
 * False where an identifier names a member rather than referring to a
 * variable or type: `x.document`, `A.B`, `{ document: … }`, `{ document }`
 * in a binding pattern's property name, interface members and JSX
 * attribute names.
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

/** References to browser globals and DOM types in a TypeScript file. Comments and strings are ignored. */
function findBrowserReferences(file: string, text: string): Finding[] {
  const source = parseTypeScript(file, text);
  const findings: Finding[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isIdentifier(node) && isBrowserName(node.text) && isReferencePosition(node)) {
      findings.push({ file, line: lineOf(source, node), snippet: node.text });
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return findings;
}

// ---------------------------------------------------------------------------
// Scanner: the Catalog (Requirement 1.7)
// ---------------------------------------------------------------------------

function isAllowedCatalogReference(reference: ModuleReference): boolean {
  if (isInside(reference, catalogDir)) return true;
  // The one outside reference: the type StringId from the Strings_Module.
  return (
    reference.kind === 'import' &&
    reference.resolved === 'src/ui/strings' &&
    reference.typeOnly &&
    reference.names !== null &&
    reference.names.length > 0 &&
    reference.names.every((name) => name === 'StringId')
  );
}

/**
 * Catalog code that reaches outside the Catalog: any module reference other
 * than a Catalog file or `import type { StringId } from '@/ui/strings'`
 * (so React, Three.js, the Viewer and storage libraries are all flagged),
 * and any browser global such as `localStorage`.
 */
function findCatalogBoundaryViolations(file: string, text: string): Finding[] {
  const references = moduleReferences(file, text)
    .filter((reference) => !isAllowedCatalogReference(reference))
    .map(referenceFinding);
  return byLine([...references, ...findBrowserReferences(file, text)]);
}

// ---------------------------------------------------------------------------
// Scanner: Viewer logic
// ---------------------------------------------------------------------------

/**
 * Viewer logic that reaches outside `src/viewer/logic/`: any module
 * reference that does not resolve into that folder (React, Three.js, Next.js,
 * the browser adapters, the UI), and any browser global or DOM type.
 */
function findViewerLogicViolations(file: string, text: string): Finding[] {
  const references = moduleReferences(file, text)
    .filter((reference) => !isInside(reference, viewerLogicDir))
    .map(referenceFinding);
  return byLine([...references, ...findBrowserReferences(file, text)]);
}

// ---------------------------------------------------------------------------
// Scanner: Three.js only in the Viewer scene (Requirement 13.6)
// ---------------------------------------------------------------------------

function isThreeReference(reference: ModuleReference): boolean {
  if (reference.specifier === null || reference.resolved !== null) return false;
  const name = packageName(reference.specifier);
  return name === 'three' || name.startsWith('@react-three/');
}

/** References to `three`, `three/*` or `@react-three/*` from a file outside `src/viewer/scene/`. */
function findMisplacedThreeImports(file: string, text: string): Finding[] {
  if (isUnder(file, viewerSceneDir)) return [];
  return moduleReferences(file, text).filter(isThreeReference).map(referenceFinding);
}

// ---------------------------------------------------------------------------
// Scanner: the Viewer scene is reached only through one dynamic import (Requirement 13.6)
// ---------------------------------------------------------------------------

/**
 * Every reference to a file under `src/viewer/scene/` from outside it,
 * other than one dynamic `import('./scene/Scene3D')` in the Viewer island.
 * Static imports, `import type`, `export … from` and `typeof import(…)` are
 * all flagged, and so is a computed `import(…)`, whose target cannot be
 * checked. Also reports when the island's dynamic import is missing or
 * appears more than once.
 */
function findSceneEntryViolations(sources: readonly SourceFile[]): string[] {
  const violations: string[] = [];
  let entries = 0;

  for (const { file, text } of sources) {
    if (isUnder(file, viewerSceneDir)) continue;
    for (const reference of moduleReferences(file, text)) {
      const where = describeFindings([referenceFinding(reference)]);
      if (reference.kind === 'dynamic' && reference.specifier === null) {
        violations.push(...where);
      } else if (!isInside(reference, viewerSceneDir)) {
        continue;
      } else if (reference.kind === 'dynamic' && file === sceneImporter && reference.resolved === sceneEntry) {
        entries += 1;
      } else {
        violations.push(...where);
      }
    }
  }

  if (entries !== 1) {
    violations.push(`expected exactly one import('./scene/Scene3D') in ${sceneImporter}, found ${entries}`);
  }
  return violations;
}

// ---------------------------------------------------------------------------
// Scanner: code outside the Viewer reaches it only through the island
// ---------------------------------------------------------------------------

/** References from a file outside `src/viewer/` to any Viewer module other than `@/viewer/ViewerIsland`. */
function findViewerReachThrough(file: string, text: string): Finding[] {
  if (isUnder(file, viewerDir)) return [];
  return moduleReferences(file, text)
    .filter((reference) => isInside(reference, viewerDir) && reference.resolved !== viewerEntry)
    .map(referenceFinding);
}

// ---------------------------------------------------------------------------
// Scanner: asset paths and clip names only from the Catalog (Requirements 13.7, 15.5)
// ---------------------------------------------------------------------------

/** An `assets/` folder in a path, e.g. `/assets/coach/…`. */
const assetFolder = /(?:^|\/)assets\//;

/** The Demo_Clip names and asset file names the Catalog holds, so the Viewer cannot repeat them. */
function catalogAssetNames(): string[] {
  const names = exercises.flatMap((entry) => [
    entry.coach.demoClip,
    path.posix.basename(entry.coach.asset),
    ...Object.values(entry.stills).map((still) => path.posix.basename(still)),
  ]);
  return [...new Set(names)];
}

function mentionsAsset(value: string, names: readonly string[]): boolean {
  return assetFolder.test(value) || names.some((name) => value.includes(name));
}

/**
 * Hardcoded asset references in Viewer code: a string literal or template
 * piece that contains an `assets/` folder or one of the Catalog's Demo_Clip
 * names and asset file names. In CSS, any line outside a comment that does.
 */
function findHardcodedAssetReferences(file: string, text: string, names: readonly string[]): Finding[] {
  if (file.endsWith('.css')) {
    const css = text.replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, ' '));
    return css
      .split('\n')
      .map((line, index) => ({ file, line: index + 1, snippet: line.trim() }))
      .filter(({ snippet }) => mentionsAsset(snippet, names));
  }

  const source = parseTypeScript(file, text);
  const findings: Finding[] = [];
  const visit = (node: ts.Node): void => {
    if (
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isTemplateHead(node) ||
      ts.isTemplateMiddle(node) ||
      ts.isTemplateTail(node)
    ) {
      if (mentionsAsset(node.text, names)) findings.push({ file, line: lineOf(source, node), snippet: node.text });
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return findings;
}

// ---------------------------------------------------------------------------
// Scanner: no shadows and no post-processing (Requirement 5.3)
// ---------------------------------------------------------------------------

/** Object members that turn on real-time shadows. */
const shadowMembers = new Set(['castShadow', 'receiveShadow', 'shadowMap']);

const postprocessingSpecifier =
  /^(?:postprocessing|@react-three\/postprocessing)(?:\/|$)|^three\/(?:addons|examples\/jsm)\/postprocessing\//;

function attributeName(attribute: ts.JsxAttribute): string {
  return ts.isIdentifier(attribute.name) ? attribute.name.text : attribute.name.getText();
}

function isFalseAttribute(attribute: ts.JsxAttribute): boolean {
  const { initializer } = attribute;
  return (
    initializer !== undefined &&
    ts.isJsxExpression(initializer) &&
    initializer.expression?.kind === ts.SyntaxKind.FalseKeyword
  );
}

function memberName(name: ts.PropertyName): string | undefined {
  return ts.isIdentifier(name) || ts.isStringLiteral(name) ? name.text : undefined;
}

/**
 * Shadows or post-processing in Viewer code: `castShadow`, `receiveShadow`
 * and `shadow-*` JSX attributes, a `shadows` prop or property other than
 * `false`, any `castShadow`, `receiveShadow` or `shadowMap` member access or
 * object property, any `EffectComposer`, and imports of `postprocessing`,
 * `@react-three/postprocessing` or Three.js's postprocessing addons.
 */
function findShadowsAndPostprocessing(file: string, text: string): Finding[] {
  const source = parseTypeScript(file, text);
  const findings: Finding[] = moduleReferences(file, text)
    .filter((reference) => reference.specifier !== null && postprocessingSpecifier.test(reference.specifier))
    .map(referenceFinding);
  const report = (node: ts.Node, snippet = node.getText(source)): void => {
    findings.push({ file, line: lineOf(source, node), snippet });
  };

  const visit = (node: ts.Node): void => {
    if (ts.isJsxAttribute(node)) {
      const name = attributeName(node);
      if (name === 'castShadow' || name === 'receiveShadow' || name.startsWith('shadow-')) report(node);
      else if (name === 'shadows' && !isFalseAttribute(node)) report(node);
    } else if (ts.isPropertyAccessExpression(node) && shadowMembers.has(node.name.text)) {
      report(node);
    } else if (ts.isPropertyAssignment(node) || ts.isShorthandPropertyAssignment(node)) {
      const name = memberName(node.name);
      const isFalse = ts.isPropertyAssignment(node) && node.initializer.kind === ts.SyntaxKind.FalseKeyword;
      if (name !== undefined && (shadowMembers.has(name) || (name === 'shadows' && !isFalse))) report(node);
    } else if (ts.isIdentifier(node) && node.text === 'EffectComposer') {
      report(node);
    }
    ts.forEachChild(node, visit);
  };

  visit(source);
  return byLine(findings);
}

// ---------------------------------------------------------------------------
// The rules, checked on the real files
// ---------------------------------------------------------------------------

describe('module boundaries', () => {
  it('the Catalog imports nothing from React, Three.js, the Viewer or browser storage', () => {
    const sources = readSources([catalogDir], codeExtensions);
    expect(sources.length).toBeGreaterThan(0);
    const findings = sources.flatMap(({ file, text }) => findCatalogBoundaryViolations(file, text));
    expect(describeFindings(findings)).toEqual([]);
  });

  it('Viewer logic imports nothing from React, Three.js or the DOM', () => {
    const sources = readSources([viewerLogicDir], codeExtensions);
    expect(sources.length).toBeGreaterThan(0);
    const findings = sources.flatMap(({ file, text }) => findViewerLogicViolations(file, text));
    expect(describeFindings(findings)).toEqual([]);
  });

  it('only the Viewer scene imports Three.js', () => {
    const findings = readSources(['src'], codeExtensions).flatMap(({ file, text }) =>
      findMisplacedThreeImports(file, text),
    );
    expect(describeFindings(findings)).toEqual([]);

    // Not vacuous: the scene itself does import Three.js.
    const sceneImports = readSources([viewerSceneDir], codeExtensions).flatMap(({ file, text }) =>
      moduleReferences(file, text).filter(isThreeReference),
    );
    expect(sceneImports.length).toBeGreaterThan(0);
  });

  it('the Viewer scene is reached only through one dynamic import', () => {
    expect(findSceneEntryViolations(readSources(['src'], codeExtensions))).toEqual([]);
  });

  it('the UI and the routes reach the Viewer only through the Viewer island', () => {
    const findings = readSources(['src'], codeExtensions).flatMap(({ file, text }) =>
      findViewerReachThrough(file, text),
    );
    expect(describeFindings(findings)).toEqual([]);
  });

  it('the Viewer reads asset paths and clip names only from the Catalog', () => {
    const names = catalogAssetNames();
    expect(names.length).toBeGreaterThan(0);
    const findings = readSources([viewerDir], [...codeExtensions, '.css']).flatMap(({ file, text }) =>
      findHardcodedAssetReferences(file, text, names),
    );
    expect(describeFindings(findings)).toEqual([]);
  });

  it('the Viewer turns on no shadows and no post-processing', () => {
    const findings = readSources([viewerDir], codeExtensions).flatMap(({ file, text }) =>
      findShadowsAndPostprocessing(file, text),
    );
    expect(describeFindings(findings)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// The scanners, checked on inline fixtures
// ---------------------------------------------------------------------------

const lines = (...rows: string[]) => rows.join('\n');
const snippets = (findings: readonly Finding[]) => findings.map(({ snippet }) => snippet);

describe('module-boundary scanners', () => {
  it('the Catalog scanner flags outside imports and browser storage', () => {
    const fixture = lines(
      "import { useState } from 'react';",
      "import { Object3D } from 'three';",
      "import { ViewerIsland } from '@/viewer/ViewerIsland';",
      "import { t } from '@/ui/strings';",
      "import { type StringId, format } from '@/ui/strings';",
      "export { colors } from '../ui/theme/tokens';",
      "const saved = localStorage.getItem('candy');",
      "const lazy = await import('../viewer/logic/orbit');",
      'const other = window.sessionStorage;',
    );
    expect(snippets(findCatalogBoundaryViolations('src/catalog/fixture.ts', fixture))).toEqual([
      'import react',
      'import three',
      'import @/viewer/ViewerIsland',
      'import @/ui/strings',
      'import @/ui/strings',
      'export ../ui/theme/tokens',
      'localStorage',
      'dynamic ../viewer/logic/orbit',
      'window',
    ]);
  });

  it('the Catalog scanner passes Catalog imports and the StringId type', () => {
    const fixture = lines(
      '/** Nothing from window.localStorage, only a comment. */',
      "import type { StringId } from '@/ui/strings';",
      "import { type StringId as Id } from '../ui/strings';",
      "import { exerciseContent } from './exercises';",
      "import type { ExerciseEntry } from '@/catalog/types';",
      "export { validateCatalog } from './validate';",
      "export type { Difficulty } from './types';",
      "type Lazy = typeof import('./types');",
      "const entry = { document: 'localStorage', storage: 1 };",
      'const value = entry.document;',
    );
    expect(findCatalogBoundaryViolations('src/catalog/fixture.ts', fixture)).toEqual([]);
  });

  it('the Viewer logic scanner flags React, Three.js, other folders and the DOM', () => {
    const fixture = lines(
      "import { useEffect } from 'react';",
      "import type { Vector3 } from 'three';",
      "import { colors } from '@/ui/theme/tokens';",
      "import { detectWebGL2 } from '../browser/detect-webgl';",
      'export function now(): number { return performance.now(); }',
      'export function hidden(): boolean { return document.hidden || window.innerWidth === 0; }',
      'export function width(canvas: HTMLCanvasElement): number { return canvas.width; }',
    );
    expect(snippets(findViewerLogicViolations('src/viewer/logic/fixture.ts', fixture))).toEqual([
      'import react',
      'import three',
      'import @/ui/theme/tokens',
      'import ../browser/detect-webgl',
      'performance',
      'document',
      'window',
      'HTMLCanvasElement',
    ]);
  });

  it('the Viewer logic scanner passes imports inside the folder and member names', () => {
    const fixture = lines(
      "import { clampOrbit, type Orbit } from './orbit';",
      "import type { Vec3 } from '@/viewer/logic/geometry-types';",
      "export { computeFraming } from './framing';",
      '/** Reads window.document in a comment only. */',
      'export interface Sample { readonly document: string; readonly window: number }',
      'export function pick(sample: Sample, now: number): string { return `${sample.document}:${now}`; }',
      "const reasons = ['no-webgl', 'document'];",
    );
    expect(findViewerLogicViolations('src/viewer/logic/fixture.ts', fixture)).toEqual([]);
  });

  it('the Three.js scanner flags Three.js and R3F imports outside the Viewer scene', () => {
    const fixture = lines(
      "import { Canvas } from '@react-three/fiber';",
      "import type { Object3D } from 'three';",
      "const loader = await import('three/addons/loaders/GLTFLoader.js');",
      "type Mesh = import('three').Mesh;",
    );
    expect(snippets(findMisplacedThreeImports('src/viewer/ViewerIsland.tsx', fixture))).toEqual([
      'import @react-three/fiber',
      'import three',
      'dynamic three/addons/loaders/GLTFLoader.js',
      'type-query three',
    ]);
  });

  it('the Three.js scanner passes the Viewer scene and look-alike names', () => {
    const scene = lines(
      "import { Canvas } from '@react-three/fiber';",
      "import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';",
    );
    expect(findMisplacedThreeImports('src/viewer/scene/fixture.tsx', scene)).toEqual([]);

    const elsewhere = lines("import { threeQuarters } from './three';", "const label = 'three';");
    expect(findMisplacedThreeImports('src/viewer/logic/fixture.ts', elsewhere)).toEqual([]);
  });

  it('the scene-entry scanner flags static, type and extra references to the Viewer scene', () => {
    const island = lines(
      "import type { Scene3DProps } from './scene/Scene3D';",
      "const Scene3D = dynamic(() => import('./scene/Scene3D'));",
      "const Actor = dynamic(() => import('./scene/CoachActor'));",
    );
    const controls = lines(
      "export { CoachActor } from '../scene/CoachActor';",
      "type Props = typeof import('@/viewer/scene/Scene3D');",
      "const name = './scene/Scene3D'; const lazy = import(name);",
    );
    expect(
      findSceneEntryViolations([
        { file: 'src/viewer/ViewerIsland.tsx', text: island },
        { file: 'src/viewer/controls/fixture.tsx', text: controls },
      ]),
    ).toEqual([
      'src/viewer/ViewerIsland.tsx:1 import ./scene/Scene3D',
      'src/viewer/ViewerIsland.tsx:3 dynamic ./scene/CoachActor',
      'src/viewer/controls/fixture.tsx:1 export ../scene/CoachActor',
      'src/viewer/controls/fixture.tsx:2 type-query @/viewer/scene/Scene3D',
      'src/viewer/controls/fixture.tsx:3 dynamic <computed>',
    ]);

    expect(findSceneEntryViolations([])).toEqual([
      "expected exactly one import('./scene/Scene3D') in src/viewer/ViewerIsland.tsx, found 0",
    ]);
  });

  it('the scene-entry scanner passes one dynamic import from the Viewer island', () => {
    expect(
      findSceneEntryViolations([
        {
          file: 'src/viewer/ViewerIsland.tsx',
          text: lines(
            '// The comment import("./scene/CoachActor") is not code.',
            "import { CoachAssetError } from './logic/load-state';",
            "const Scene3D = dynamic(() => import('./scene/Scene3D'), { ssr: false });",
          ),
        },
        { file: 'src/viewer/scene/Scene3D.tsx', text: "import { CoachActor } from './CoachActor';" },
        { file: 'src/viewer/controls/fixture.tsx', text: "import type { Orbit } from '../logic/orbit';" },
      ]),
    ).toEqual([]);
  });

  it('the Viewer entry scanner flags UI imports of Viewer internals', () => {
    const fixture = lines(
      "import { ViewerIsland } from '@/viewer/ViewerIsland';",
      "import { createViewerController } from '@/viewer/logic/controller';",
      "import type { ViewerSnapshot } from '../../viewer/logic/controller';",
      "import styles from '@/viewer/ViewerIsland.module.css';",
    );
    expect(snippets(findViewerReachThrough('src/ui/exercises/fixture.tsx', fixture))).toEqual([
      'import @/viewer/logic/controller',
      'import ../../viewer/logic/controller',
      'import @/viewer/ViewerIsland.module.css',
    ]);
  });

  it('the Viewer entry scanner passes the Viewer island and Viewer-internal imports', () => {
    const route = lines(
      "import { ViewerIsland } from '../../viewer/ViewerIsland';",
      "import { exercises } from '@/catalog';",
    );
    expect(findViewerReachThrough('src/app/exercises/fixture.tsx', route)).toEqual([]);
    expect(findViewerReachThrough('src/viewer/controls/fixture.tsx', "import { t } from '@/viewer/logic/orbit';")).toEqual(
      [],
    );
  });

  it('the asset scanner flags asset paths, Demo_Clip names and asset file names', () => {
    const names = ['demo_loop', 'coach_grave_rise.glb', 'grave_rise_front.png'];
    const tsx = lines(
      "const asset = '/assets/coach/coach_grave_rise.glb';",
      'const still = `/assets/coach/stills/${view}.png`;',
      "const clip = findDemoClip(clips, 'demo_loop');",
      'export const Still = () => <img src="/assets/coach/stills/grave_rise_front.png" alt="" />;',
      "const bare = 'coach_grave_rise.glb';",
    );
    expect(snippets(findHardcodedAssetReferences('src/viewer/fixture.tsx', tsx, names))).toEqual([
      '/assets/coach/coach_grave_rise.glb',
      '/assets/coach/stills/',
      'demo_loop',
      '/assets/coach/stills/grave_rise_front.png',
      'coach_grave_rise.glb',
    ]);

    const css = lines('.stage {', '  background: url(/assets/coach/stills/grave_rise_front.png);', '}');
    expect(describeFindings(findHardcodedAssetReferences('src/viewer/fixture.module.css', css, names))).toEqual([
      'src/viewer/fixture.module.css:2 background: url(/assets/coach/stills/grave_rise_front.png);',
    ]);
  });

  it('the asset scanner passes paths read from the Exercise_Entry and comments', () => {
    const names = ['demo_loop', 'coach_grave_rise.glb'];
    const tsx = lines(
      '// Paths come from the Catalog, e.g. /assets/coach/coach_grave_rise.glb and demo_loop.',
      'const { asset, demoClip } = exercise.coach;',
      "const response = await fetch(asset, { credentials: 'same-origin' });",
      'const folder = LoaderUtils.extractUrlBase(asset);',
      "const label = 'demo loop';",
    );
    expect(findHardcodedAssetReferences('src/viewer/fixture.tsx', tsx, names)).toEqual([]);

    const css = lines('/* not from /assets/coach/ */', '.stage { background: var(--color-bg); }');
    expect(findHardcodedAssetReferences('src/viewer/fixture.module.css', css, names)).toEqual([]);
  });

  it('the shadow scanner flags shadows, shadow maps and post-processing', () => {
    const fixture = lines(
      "import { EffectComposer, Bloom } from '@react-three/postprocessing';",
      "import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';",
      'export const Scene = () => (',
      '  <Canvas shadows>',
      '    <mesh castShadow receiveShadow={false} />',
      '    <directionalLight shadow-mapSize={[1024, 1024]} />',
      '    <EffectComposer><Bloom /></EffectComposer>',
      '  </Canvas>',
      ');',
      'export function setUp(gl: Renderer, mesh: Mesh): void {',
      '  gl.shadowMap.enabled = true;',
      '  mesh.castShadow = true;',
      '}',
      'const options = { shadows: true };',
    );
    expect(describeFindings(findShadowsAndPostprocessing('src/viewer/scene/fixture.tsx', fixture))).toEqual([
      'src/viewer/scene/fixture.tsx:1 import @react-three/postprocessing',
      'src/viewer/scene/fixture.tsx:1 EffectComposer',
      'src/viewer/scene/fixture.tsx:2 import three/addons/postprocessing/RenderPass.js',
      'src/viewer/scene/fixture.tsx:4 shadows',
      'src/viewer/scene/fixture.tsx:5 castShadow',
      'src/viewer/scene/fixture.tsx:5 receiveShadow={false}',
      'src/viewer/scene/fixture.tsx:6 shadow-mapSize={[1024, 1024]}',
      'src/viewer/scene/fixture.tsx:7 EffectComposer',
      'src/viewer/scene/fixture.tsx:7 EffectComposer',
      'src/viewer/scene/fixture.tsx:11 gl.shadowMap',
      'src/viewer/scene/fixture.tsx:12 mesh.castShadow',
      'src/viewer/scene/fixture.tsx:14 shadows: true',
    ]);
  });

  it('the shadow scanner passes shadows={false} and an unshadowed scene', () => {
    const fixture = lines(
      '// No castShadow, receiveShadow or EffectComposer: comments are not code.',
      'export const Scene = () => (',
      '  <Canvas frameloop="demand" flat shadows={false}>',
      '    <mesh rotation-y={1}><meshLambertMaterial color={colors.sceneGround} /></mesh>',
      '    <hemisphereLight args={[sky, ground, 0.9]} />',
      '  </Canvas>',
      ');',
      "const label = 'castShadow';",
      'const options = { shadows: false };',
    );
    expect(findShadowsAndPostprocessing('src/viewer/scene/fixture.tsx', fixture)).toEqual([]);
  });
});
