/**
 * Viewing earns nothing: browsing Exercises and Stretches never touches the
 * Progress store or the Workout engine, and never reads or writes browser
 * storage (Requirements 10.1, 10.2).
 *
 * The files of the Catalog, the Viewer, the Exercise screens and the
 * Exercise and Stretch routes are scanned with the TypeScript compiler API
 * (comments and strings are not code, so they never count). Each folder must
 * yield at least one file, so a moved folder cannot pass vacuously, and the
 * scanner has one fixture it must flag and one it must pass.
 *
 * `module-boundaries.test.ts` does not export its helpers, so this file keeps
 * a minimal copy of its approach.
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));

const scannedFolders = [
  'src/catalog',
  'src/viewer',
  'src/ui/exercises',
  'src/app/exercises',
  'src/app/stretches',
] as const;

const codeExtensions = ['.ts', '.tsx'] as const;

/** Module paths that browsing must never reach. */
const forbiddenModules = ['progress-store', 'workout-engine'] as const;

/** Browser storage globals that browsing must never touch. */
const storageNames = new Set(['localStorage', 'sessionStorage', 'indexedDB']);

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
    else if (codeExtensions.some((extension) => entry.name.endsWith(extension))) found.push(full);
  }
  return found;
}

function readFolder(folder: string): { file: string; text: string }[] {
  return listFiles(path.join(repoRoot, folder))
    .map((full) => ({
      file: path.relative(repoRoot, full).split(path.sep).join('/'),
      text: readFileSync(full, 'utf8'),
    }))
    .sort((a, b) => a.file.localeCompare(b.file));
}

function literalText(node: ts.Node | undefined): string | null {
  return node !== undefined && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))
    ? node.text
    : null;
}

/**
 * Imports of a forbidden module (static, `export … from`, `import x = require`,
 * dynamic `import()`, `require()` and `typeof import()` types) and uses of
 * `localStorage`, `sessionStorage`, `indexedDB` or `document.cookie`.
 * Comments and string contents are ignored.
 */
function findViewingViolations(file: string, text: string): Finding[] {
  const kind = file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, kind);
  const findings: Finding[] = [];

  const report = (node: ts.Node, snippet: string): void => {
    const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
    findings.push({ file, line, snippet });
  };
  const checkSpecifier = (node: ts.Node, specifier: string | null): void => {
    if (specifier !== null && forbiddenModules.some((name) => specifier.includes(name))) {
      report(node, `import ${specifier}`);
    }
  };

  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node)) {
      checkSpecifier(node, literalText(node.moduleSpecifier));
    } else if (ts.isExportDeclaration(node)) {
      checkSpecifier(node, literalText(node.moduleSpecifier));
    } else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
      checkSpecifier(node, literalText(node.moduleReference.expression));
    } else if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === 'require'))
    ) {
      checkSpecifier(node, literalText(node.arguments[0]));
    } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) {
      checkSpecifier(node, literalText(node.argument.literal));
    } else if (ts.isIdentifier(node) && storageNames.has(node.text)) {
      report(node, node.text);
    } else if (
      ts.isPropertyAccessExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'document' &&
      node.name.text === 'cookie'
    ) {
      report(node, 'document.cookie');
    }
    ts.forEachChild(node, visit);
  };

  visit(source);
  return findings.sort((a, b) => a.line - b.line);
}

const describeFindings = (findings: readonly Finding[]): string[] =>
  findings.map(({ file, line, snippet }) => `${file}:${line} ${snippet}`);

describe('viewing earns nothing', () => {
  it.each(scannedFolders)('%s yields at least one file to scan', (folder) => {
    expect(readFolder(folder).length).toBeGreaterThan(0);
  });

  it('browsing Exercises and Stretches imports no Progress store or Workout engine and touches no browser storage', () => {
    const findings = scannedFolders
      .flatMap(readFolder)
      .flatMap(({ file, text }) => findViewingViolations(file, text));
    expect(describeFindings(findings)).toEqual([]);
  });
});

describe('viewing-earns-nothing scanner', () => {
  it('flags Progress store and Workout engine imports and browser storage use', () => {
    const fixture = [
      "import { addCandy } from '@/progress-store';",
      "export { start } from '../workout-engine/engine';",
      "const lazy = await import('@/progress-store/store');",
      "const saved = localStorage.getItem('candy');",
      "const other = window.sessionStorage;",
      'const db = indexedDB;',
      'const jar = document.cookie;',
    ].join('\n');
    expect(findViewingViolations('src/catalog/fixture.ts', fixture).map(({ snippet }) => snippet)).toEqual([
      'import @/progress-store',
      'import ../workout-engine/engine',
      'import @/progress-store/store',
      'localStorage',
      'sessionStorage',
      'indexedDB',
      'document.cookie',
    ]);
  });

  it('passes comments, strings and ordinary imports', () => {
    const fixture = [
      '// import { addCandy } from "@/progress-store"; localStorage document.cookie',
      '/** Uses sessionStorage and indexedDB in a comment only. */',
      "import { entries } from './entries';",
      "import type { StringId } from '@/ui/strings';",
      "const note = 'localStorage and workout-engine are only text here';",
      'const entry = { cookie: 1 };',
      'const value = entry.cookie;',
    ].join('\n');
    expect(findViewingViolations('src/catalog/fixture.ts', fixture)).toEqual([]);
  });
});
