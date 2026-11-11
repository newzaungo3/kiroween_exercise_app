/**
 * Halloween_Theme colour tokens.
 *
 * This is the only file in `src/` allowed to contain colour literals.
 * Everything else takes colours from the CSS custom properties that
 * `themeCss()` emits (`var(--color-…)`).
 */
export const colors = {
  bg: '#0b0710', // page background, near-black purple
  surface: '#1c1027', // Navigation_Entry background
  text: '#f5eeff', // body and heading text
  textMuted: '#cbbbe3', // tagline, messages
  orange: '#ff8a1f', // accent: link text, entry borders
  purple: '#a66dff', // accent: tagline highlight, bats
  focus: '#ffb366', // focus indicator
  bat: '#a66dff', // bat Decoration
  web: '#9a8bb3', // cobweb Decoration
  onAccent: '#0b0710', // label on the selected Playback_Speed (orange fill); equals bg
  sceneSky: '#120b1f', // Graveyard_Scene background and fog colour
  sceneGround: '#231a2e', // ground disc
  sceneGravestone: '#6d6478', // gravestones
  sceneMoon: '#f4ecd0', // moon disc
  sceneMoonGlow: '#3a2f55', // glow disc behind the moon
  sceneAmbientSky: '#8f86b8', // hemisphere light, sky colour
  sceneAmbientGround: '#1a1224', // hemisphere light, ground colour
  sceneMoonlight: '#d9d4ff', // directional light
} as const;

export type ColorToken = keyof typeof colors;

/** Turns a lower-camel-case token name into kebab case (`textMuted` → `text-muted`). */
function toKebabCase(name: string): string {
  return name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

/**
 * Serialises the tokens as CSS custom properties on `:root`, then gives
 * `html` the theme background and text colour.
 *
 * Never sets a root font size, so the browser's text-size setting scales
 * the whole layout (Requirement 5.9).
 */
export function themeCss(tokens: Readonly<Record<string, string>> = colors): string {
  const declarations = Object.entries(tokens)
    .map(([name, value]) => `--color-${toKebabCase(name)}:${value};`)
    .join('');
  return `:root{${declarations}}html{background:var(--color-bg);color:var(--color-text);}`;
}
