import localFont from 'next/font/local';

// Self-hosted fonts (SIL OFL 1.1, licence texts in ./fonts/). Next.js serves
// the files from the Site's own origin. `display: 'swap'` plus the fallback
// stacks keep text visible in a system font if a file fails to load.

/** Display font for every page heading: Creepster. */
export const displayFont = localFont({
  src: './fonts/creepster-latin-400-normal.woff2',
  weight: '400',
  display: 'swap',
  variable: '--font-display',
  fallback: ['Impact', 'Haettenschweiler', 'Arial Narrow Bold', 'system-ui', 'sans-serif'],
});

/** Body font for all other text: Atkinson Hyperlegible. */
export const bodyFont = localFont({
  src: [
    { path: './fonts/atkinson-hyperlegible-latin-400-normal.woff2', weight: '400', style: 'normal' },
    { path: './fonts/atkinson-hyperlegible-latin-700-normal.woff2', weight: '700', style: 'normal' },
  ],
  display: 'swap',
  variable: '--font-body',
  fallback: ['system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
});

/** Class names that define `--font-display` and `--font-body` on `<html>`. */
export const fontVariables = `${displayFont.variable} ${bodyFont.variable}`;
