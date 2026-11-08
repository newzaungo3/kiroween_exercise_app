/**
 * Static guard tests for source rules that have no runtime interface:
 * central strings, colour tokens, commented `any`, and the root font size.
 *
 * Each scanner works on source text (parsed with the TypeScript compiler API
 * or a small CSS declaration reader), so the inline fixtures below run the
 * same code as the checks on the real files. A scanner that stops flagging
 * its "must be flagged" fixture fails its own test, so no rule can pass
 * vacuously.
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

import { themeCss } from '@/ui/theme/tokens';

// ---------------------------------------------------------------------------
// Files
// ---------------------------------------------------------------------------

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));

/** The only file in src/ that may hold user-facing text. */
const stringsModule = 'src/ui/strings.ts';
/** The only file in src/ that may hold colour literals. */
const tokensModule = 'src/ui/theme/tokens.ts';

interface SourceFile {
  /** Repository-relative path with forward slashes, used in failure output. */
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

function parseTypeScript(file: string, text: string): ts.SourceFile {
  const kind = file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  return ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, kind);
}

function lineOf(source: ts.SourceFile, position: number): number {
  return source.getLineAndCharacterOfPosition(position).line + 1;
}

const letterOrDigit = /[\p{L}\p{N}]/u;

/**
 * The literal text an expression can evaluate to: string literals, template
 * literal parts, and both branches of `?:`, `&&`, `||`, `??` and `+`.
 */
function literalTexts(node: ts.Expression): string[] {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return [node.text];
  }
  if (ts.isTemplateExpression(node)) {
    return [node.head.text, ...node.templateSpans.map((span) => span.literal.text)];
  }
  if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isSatisfiesExpression(node)) {
    return literalTexts(node.expression);
  }
  if (ts.isConditionalExpression(node)) {
    return [...literalTexts(node.whenTrue), ...literalTexts(node.whenFalse)];
  }
  if (ts.isBinaryExpression(node)) {
    const joining = [
      ts.SyntaxKind.AmpersandAmpersandToken,
      ts.SyntaxKind.BarBarToken,
      ts.SyntaxKind.QuestionQuestionToken,
      ts.SyntaxKind.PlusToken,
    ];
    if (joining.includes(node.operatorToken.kind)) {
      return [...literalTexts(node.left), ...literalTexts(node.right)];
    }
  }
  return [];
}

/** The literal texts of a JSX attribute value (`="…"` or `={…}`). */
function attributeTexts(attribute: ts.JsxAttribute): string[] {
  const { initializer } = attribute;
  if (initializer === undefined) return [];
  if (ts.isStringLiteral(initializer)) return [initializer.text];
  if (ts.isJsxExpression(initializer) && initializer.expression !== undefined) {
    return literalTexts(initializer.expression);
  }
  return [];
}

function attributeName(attribute: ts.JsxAttribute): string {
  return ts.isIdentifier(attribute.name) ? attribute.name.text : attribute.name.getText();
}

function propertyName(name: ts.PropertyName): string | undefined {
  return ts.isIdentifier(name) || ts.isStringLiteral(name) ? name.text : undefined;
}

// ---------------------------------------------------------------------------
// Scanner: user-facing text (Requirements 6.1, 6.5)
// ---------------------------------------------------------------------------

/**
 * JSX attributes whose value is read out or shown to the visitor. Geometry,
 * `className`, `href`, `key`, `data-*`, `aria-hidden` and similar attributes
 * carry no user-facing text.
 */
const userFacingAttributes = new Set([
  'aria-label',
  'aria-description',
  'aria-placeholder',
  'aria-roledescription',
  'aria-valuetext',
  'alt',
  'label',
  'placeholder',
  'title',
]);

/** Object properties that become the document title or description (Next.js `metadata`). */
const metadataTextProperties = new Set(['title', 'description']);

/**
 * Hardcoded user-facing text in a component or route file: JSX text, string
 * literal JSX children, literals in user-facing attributes, and literal
 * `title` or `description` values. Only text with a letter or digit counts.
 */
function findUserFacingText(file: string, text: string): Finding[] {
  const source = parseTypeScript(file, text);
  const findings: Finding[] = [];

  const report = (node: ts.Node, texts: readonly string[]) => {
    for (const value of texts) {
      if (letterOrDigit.test(value)) {
        findings.push({ file, line: lineOf(source, node.getStart(source)), snippet: value.trim() });
      }
    }
  };

  const visit = (node: ts.Node): void => {
    if (ts.isJsxText(node)) {
      report(node, [node.text]);
    } else if (
      ts.isJsxExpression(node) &&
      node.expression !== undefined &&
      (ts.isJsxElement(node.parent) || ts.isJsxFragment(node.parent))
    ) {
      report(node, literalTexts(node.expression));
    } else if (ts.isJsxAttribute(node) && userFacingAttributes.has(attributeName(node))) {
      report(node, attributeTexts(node));
    } else if (ts.isPropertyAssignment(node)) {
      const name = propertyName(node.name);
      if (name !== undefined && metadataTextProperties.has(name)) {
        report(node, literalTexts(node.initializer));
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(source);
  return findings;
}

// ---------------------------------------------------------------------------
// CSS declaration reader
// ---------------------------------------------------------------------------

interface CssDeclaration {
  readonly selector: string;
  readonly property: string;
  readonly value: string;
  readonly line: number;
}

/**
 * Reads every `property: value` declaration from the innermost rule blocks
 * of a style sheet, with the selector of its block. Comments are blanked out
 * first (keeping line breaks, so line numbers stay right). At-rule wrappers
 * such as `@media` are skipped; their inner rules are read as usual.
 */
function cssDeclarations(css: string): CssDeclaration[] {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, ' '));
  const lineAt = (index: number) => text.slice(0, index).split('\n').length;
  const declarations: CssDeclaration[] = [];

  for (const block of text.matchAll(/([^{};]*)\{([^{}]*)\}/g)) {
    const [whole, selector = '', body = ''] = block;
    let offset = block.index + whole.indexOf('{') + 1;
    for (const part of body.split(';')) {
      const colon = part.indexOf(':');
      if (colon > 0) {
        const leading = part.length - part.trimStart().length;
        declarations.push({
          selector: selector.trim(),
          property: part.slice(0, colon).trim().toLowerCase(),
          value: part.slice(colon + 1).trim(),
          line: lineAt(offset + leading),
        });
      }
      offset += part.length + 1;
    }
  }
  return declarations;
}

// ---------------------------------------------------------------------------
// Scanner: colours (Requirement 4.3)
// ---------------------------------------------------------------------------

const hexColour = /#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})(?![0-9a-z_-])/i;
const colourFunction = /(?<![\w-])(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color|color-mix|light-dark)\(/i;

/** CSS and style-object properties that take a colour (kebab or camel case). */
const colourProperty =
  /color|background|border|outline|fill|stroke|shadow|caret|accent|column-rule|columnRule|decoration|emphasis|flood|lighting|scrollbar/i;

/** JSX attributes that take a colour. */
const colourAttributes = new Set(['fill', 'stroke', 'color', 'stopColor', 'floodColor', 'lightingColor', 'background', 'bgcolor']);

/**
 * The CSS named colours. `transparent` and `currentColor` are allowed, so
 * they are not listed.
 */
const namedColours = new Set(
  (
    'aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet ' +
    'brown burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue ' +
    'darkcyan darkgoldenrod darkgray darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange ' +
    'darkorchid darkred darksalmon darkseagreen darkslateblue darkslategray darkslategrey darkturquoise ' +
    'darkviolet deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia ' +
    'gainsboro ghostwhite gold goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ' +
    'ivory khaki lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan ' +
    'lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen lightskyblue ' +
    'lightslategray lightslategrey lightsteelblue lightyellow lime limegreen linen magenta maroon ' +
    'mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue ' +
    'mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream mistyrose moccasin ' +
    'navajowhite navy oldlace olive olivedrab orange orangered orchid palegoldenrod palegreen ' +
    'paleturquoise palevioletred papayawhip peachpuff peru pink plum powderblue purple rebeccapurple red ' +
    'rosybrown royalblue saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue slateblue ' +
    'slategray slategrey snow springgreen steelblue tan teal thistle tomato turquoise violet wheat white ' +
    'whitesmoke yellow yellowgreen'
  ).split(' '),
);

/**
 * Words in a value that are CSS named colours. Words keep their hyphens, so
 * `var(--color-orange)` yields `color-orange`, which is not a named colour.
 */
function namedColoursIn(value: string): string[] {
  return (value.match(/[a-z][a-z-]*/gi) ?? []).filter((word) => namedColours.has(word.toLowerCase()));
}

/** Hex colours and colour functions anywhere in a value. */
function hasColourLiteral(value: string): boolean {
  return hexColour.test(value) || colourFunction.test(value);
}

/**
 * Colours in a style sheet that do not come from the Halloween_Theme
 * tokens: any hex colour or colour function, and named colours in
 * colour-bearing properties. `var(--color-…)`, `currentColor`,
 * `transparent`, `inherit`, `initial`, `unset` and `none` pass.
 */
function findCssColours(file: string, css: string): Finding[] {
  return cssDeclarations(css)
    .filter(
      ({ property, value }) =>
        hasColourLiteral(value) || (colourProperty.test(property) && namedColoursIn(value).length > 0),
    )
    .map(({ property, value, line }) => ({ file, line, snippet: `${property}: ${value}` }));
}

/** True when the node sits inside a JSX `style={…}` attribute. */
function isInsideStyleAttribute(node: ts.Node): boolean {
  for (let current = node.parent; current !== undefined; current = current.parent) {
    if (ts.isJsxAttribute(current)) return attributeName(current) === 'style';
  }
  return false;
}

/**
 * Colours in a TypeScript or TSX file that do not come from the tokens: hex
 * colours or colour functions in any string or template literal, and named
 * colours in colour attributes (`fill`, `stroke`, …) or colour properties of
 * a `style` object.
 */
function findCodeColours(file: string, text: string): Finding[] {
  const source = parseTypeScript(file, text);
  const findings: Finding[] = [];
  const report = (node: ts.Node, snippet: string) => {
    findings.push({ file, line: lineOf(source, node.getStart(source)), snippet });
  };

  const visit = (node: ts.Node): void => {
    if (
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isTemplateHead(node) ||
      ts.isTemplateMiddle(node) ||
      ts.isTemplateTail(node)
    ) {
      if (hasColourLiteral(node.text)) report(node, node.text);
    } else if (ts.isJsxAttribute(node) && colourAttributes.has(attributeName(node))) {
      for (const value of attributeTexts(node)) {
        if (namedColoursIn(value).length > 0) report(node, `${attributeName(node)}="${value}"`);
      }
    } else if (ts.isPropertyAssignment(node) && isInsideStyleAttribute(node)) {
      const name = propertyName(node.name);
      if (name !== undefined && colourProperty.test(name)) {
        for (const value of literalTexts(node.initializer)) {
          if (namedColoursIn(value).length > 0) report(node, `${name}: ${value}`);
        }
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(source);
  return findings;
}

// ---------------------------------------------------------------------------
// Scanner: `any` with a reason (Requirement 1.8)
// ---------------------------------------------------------------------------

function isJsDocNode(node: ts.Node): boolean {
  return node.kind >= ts.SyntaxKind.FirstJSDocNode && node.kind <= ts.SyntaxKind.LastJSDocNode;
}

/**
 * Every `any` type whose line, and the line before it, carry no comment.
 * Walks every token (not just nodes), so comments before a closing brace or
 * inside JSX are seen too.
 */
function findUncommentedAny(file: string, text: string): Finding[] {
  const source = parseTypeScript(file, text);
  const commentLines = new Set<number>();
  const seenComments = new Set<number>();
  const anyKeywords: ts.Node[] = [];

  const addComments = (ranges: readonly ts.CommentRange[] | undefined) => {
    for (const range of ranges ?? []) {
      if (seenComments.has(range.pos)) continue;
      seenComments.add(range.pos);
      for (let line = lineOf(source, range.pos); line <= lineOf(source, range.end); line += 1) {
        commentLines.add(line);
      }
    }
  };

  const visit = (node: ts.Node): void => {
    if (isJsDocNode(node)) return;
    addComments(ts.getLeadingCommentRanges(text, node.pos));
    addComments(ts.getTrailingCommentRanges(text, node.end));
    if (node.kind === ts.SyntaxKind.AnyKeyword) anyKeywords.push(node);
    for (const child of node.getChildren(source)) visit(child);
  };

  visit(source);
  return anyKeywords
    .map((node) => ({ node, line: lineOf(source, node.getStart(source)) }))
    .filter(({ line }) => !commentLines.has(line) && !commentLines.has(line - 1))
    .map(({ node, line }) => ({ file, line, snippet: node.parent.getText(source) }));
}

// ---------------------------------------------------------------------------
// Scanner: root font size (Requirement 5.9)
// ---------------------------------------------------------------------------

/** A single compound selector on `html` or `:root`, such as `html`, `:root` or `html:focus-within`. */
const rootSelector = /^(?:html|:root)(?:[.:#[][^\s>+~]*)?$/i;

/** A number with a unit other than `em` or `rem` (`%` is not a unit word, so it passes). */
const nonRelativeLength = /(?<![\w-])\d*\.?\d+(?!em\b|rem\b)([a-z]+)\b/gi;

/**
 * `font-size` or `font` declarations on the root element whose value uses a
 * length unit other than `%`, `em` or `rem`.
 */
function findAbsoluteRootFontSize(file: string, css: string): Finding[] {
  return cssDeclarations(css)
    .filter(
      ({ selector, property, value }) =>
        selector.split(',').some((part) => rootSelector.test(part.trim())) &&
        (property === 'font-size' || property === 'font') &&
        [...value.matchAll(nonRelativeLength)].length > 0,
    )
    .map(({ selector, property, value, line }) => ({ file, line, snippet: `${selector} { ${property}: ${value} }` }));
}

// ---------------------------------------------------------------------------
// The rules, checked on the real files
// ---------------------------------------------------------------------------

describe('source rules', () => {
  it('components show no user-facing text outside the Strings_Module', () => {
    const findings = readSources(['src'], ['.ts', '.tsx'])
      .filter(({ file }) => file !== stringsModule)
      .flatMap(({ file, text }) => findUserFacingText(file, text));
    expect(describeFindings(findings)).toEqual([]);
  });

  it('components take every colour from the Halloween_Theme tokens', () => {
    const sources = readSources(['src'], ['.css', '.ts', '.tsx']).filter(({ file }) => file !== tokensModule);
    const findings = sources.flatMap(({ file, text }) =>
      file.endsWith('.css') ? findCssColours(file, text) : findCodeColours(file, text),
    );
    expect(sources.some(({ file }) => file.endsWith('.css'))).toBe(true);
    expect(describeFindings(findings)).toEqual([]);
  });

  it('`any` appears only with a comment explaining why', () => {
    const findings = readSources(['src', 'tests'], ['.ts', '.tsx']).flatMap(({ file, text }) =>
      findUncommentedAny(file, text),
    );
    expect(describeFindings(findings)).toEqual([]);
  });

  it('the root font size is never set in an absolute unit', () => {
    const styleSheets = [
      ...readSources(['src'], ['.css']),
      { file: 'themeCss() output', text: themeCss() },
    ];
    const findings = styleSheets.flatMap(({ file, text }) => findAbsoluteRootFontSize(file, text));
    expect(describeFindings(findings)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// The scanners, checked on inline fixtures
// ---------------------------------------------------------------------------

const lines = (...rows: string[]) => rows.join('\n');
const snippets = (findings: readonly Finding[]) => findings.map(({ snippet }) => snippet);

describe('source-rule scanners', () => {
  it('the user-facing text scanner flags hardcoded text in JSX, labels and metadata', () => {
    const fixture = lines(
      "export const metadata = { title: 'Spooky Coach' };",
      'export function Hardcoded() {',
      '  return (',
      '    <nav aria-label="Sections">',
      '      <h1>Boo</h1>',
      "      {'Exercises'}",
      '      <img alt={`Coach`} />',
      '    </nav>',
      '  );',
      '}',
    );
    expect(snippets(findUserFacingText('fixture.tsx', fixture))).toEqual([
      'Spooky Coach',
      'Sections',
      'Boo',
      'Exercises',
      'Coach',
    ]);
  });

  it('the user-facing text scanner passes text from the Strings_Module and non-text attributes', () => {
    const fixture = lines(
      "import { t } from '../strings';",
      "export const metadata = { title: t('home.title') };",
      'export function FromStrings({ className }: { className: string }) {',
      '  return (',
      '    <svg className={`${className} web`} data-decoration="bat" focusable="false" viewBox="0 0 64 32" aria-hidden="true">',
      '      {/* a comment */}',
      '      <path d="M0 0 L10 10" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth={1.5} />',
      "      <a key=\"home\" href=\"/\" aria-label={t('common.backHome')}>{t('common.backHome')}</a>",
      '    </svg>',
      '  );',
      '}',
    );
    expect(findUserFacingText('fixture.tsx', fixture)).toEqual([]);
  });

  it('the colour scanner flags hex, colour functions and named colours', () => {
    const css = lines(
      '.a { color: #ff8a1f; }',
      '.b { background: rgb(0 0 0); border: 1px solid rebeccapurple; }',
      '.c { outline-color: Orange; }',
    );
    expect(snippets(findCssColours('fixture.css', css))).toEqual([
      'color: #ff8a1f',
      'background: rgb(0 0 0)',
      'border: 1px solid rebeccapurple',
      'outline-color: Orange',
    ]);

    const tsx = `export const Bad = () => <path fill="black" stroke="#fff" style={{ backgroundColor: 'hsl(0 0% 0%)', color: 'red' }} />;`;
    expect(snippets(findCodeColours('fixture.tsx', tsx))).toEqual([
      'fill="black"',
      '#fff',
      'hsl(0 0% 0%)',
      'color: red',
    ]);
  });

  it('the colour scanner passes token variables and colour keywords', () => {
    const css = lines(
      '/* #ff0000 and red inside a comment are ignored */',
      '.a { color: var(--color-orange); background: transparent; border: 0.125rem solid currentColor; outline: none; }',
      '.b { fill: inherit; stroke: initial; text-decoration: underline; color: unset; }',
      'a:focus-visible { outline: 3px solid var(--color-focus); }',
      '@media (prefers-reduced-motion: reduce) { .bat { animation: none; } }',
    );
    expect(findCssColours('fixture.css', css)).toEqual([]);

    const tsx = `export const Good = () => <path className="red" href="#main" fill="currentColor" stroke="none" style={{ color: 'var(--color-text)' }} />;`;
    expect(findCodeColours('fixture.tsx', tsx)).toEqual([]);
  });

  it('the `any` scanner flags an `any` with no comment on its line or the line before', () => {
    const fixture = lines(
      'export function parse(input: any): unknown {',
      '  return input as any;',
      '}',
    );
    expect(findUncommentedAny('fixture.ts', fixture).map(({ line }) => line)).toEqual([1, 2]);
  });

  it('the `any` scanner passes an `any` with a comment on its line or the line before', () => {
    const fixture = lines(
      '// The callback type comes from an untyped library, so any is unavoidable.',
      'export function parse(input: any): unknown {',
      '  return input;',
      '}',
      'const sameLine: any = 1; // reason on the same line',
      '/* a reason that',
      '   spans two lines */',
      'let afterBlock: any;',
      "const anyThing = 'any';",
    );
    expect(findUncommentedAny('fixture.ts', fixture)).toEqual([]);
  });

  it('the root font size scanner flags absolute units on html and :root', () => {
    const css = lines('html { font-size: 18px; }', ':root { font: 12pt/1.5 serif; }');
    expect(findAbsoluteRootFontSize('fixture.css', css).map(({ line }) => line)).toEqual([1, 2]);
  });

  it('the root font size scanner passes relative units and other elements', () => {
    const css = lines(
      'html { font-size: 100%; min-block-size: 100%; -webkit-text-size-adjust: 100%; }',
      ':root { font-size: 1.25rem; }',
      'html { font: 1em/1.5 system-ui; }',
      'body { font-size: 18px; }',
    );
    expect(findAbsoluteRootFontSize('fixture.css', css)).toEqual([]);
  });
});
