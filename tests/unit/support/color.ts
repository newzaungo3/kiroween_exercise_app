// Test-only colour helpers for checking the Halloween_Theme tokens.
// Pure functions: no imports from src/, no I/O.
// Every function accepts colours only in `#rrggbb` form (either letter case)
// and throws on any other input.

type Rgb = readonly [r: number, g: number, b: number];

const hexPattern = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i;

/** Parses `#rrggbb` into 0–255 channels. Throws if `hex` is not in that form. */
function parseHex(hex: string): Rgb {
  const match = hexPattern.exec(hex);
  if (match === null) {
    throw new Error(`Expected a colour in #rrggbb form, got ${JSON.stringify(hex)}`);
  }
  const [, r = '', g = '', b = ''] = match;
  return [parseInt(r, 16), parseInt(g, 16), parseInt(b, 16)];
}

/** Converts one 0–255 sRGB channel to linear light (WCAG 2.x, sRGB transfer function). */
function linearChannel(channel: number): number {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/**
 * WCAG 2.x relative luminance of a `#rrggbb` colour:
 * 0 for black, 1 for white.
 */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = parseHex(hex);
  return 0.2126 * linearChannel(r) + 0.7152 * linearChannel(g) + 0.0722 * linearChannel(b);
}

/**
 * WCAG 2.x contrast ratio of two `#rrggbb` colours:
 * (lighter + 0.05) / (darker + 0.05), between 1 and 21. Order of arguments does not matter.
 */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * HSL hue of a `#rrggbb` colour in degrees, in the range [0, 360).
 * Returns NaN for an achromatic colour (black, white or any grey), which has no hue,
 * so a hue-range check on a grey fails instead of passing at 0°.
 */
export function hue(hex: string): number {
  const [r255, g255, b255] = parseHex(hex);
  const r = r255 / 255;
  const g = g255 / 255;
  const b = b255 / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  if (delta === 0) {
    return Number.NaN;
  }
  let sector: number;
  if (max === r) {
    sector = ((g - b) / delta) % 6;
  } else if (max === g) {
    sector = (b - r) / delta + 2;
  } else {
    sector = (r - g) / delta + 4;
  }
  const degrees = sector * 60;
  return degrees < 0 ? degrees + 360 : degrees;
}
