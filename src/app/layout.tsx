import type { ReactNode } from 'react';

import { fontVariables } from '@/ui/fonts';
import { homeMetadata, siteViewport } from '@/ui/metadata';
import { SiteFrame } from '@/ui/site-frame/SiteFrame';
import { activeLocale } from '@/ui/strings';
import { themeCss } from '@/ui/theme/tokens';

import './globals.css';

export const metadata = homeMetadata();
export const viewport = siteViewport;

/**
 * Root layout for every screen.
 *
 * - `<html lang>` follows the active Locale (Requirement 2.5).
 * - The Halloween_Theme tokens go into a `<style>` element in `<head>`, so
 *   the dark background applies on first paint and with JavaScript
 *   disabled (Requirement 4.1).
 * - The font classes define `--font-display` and `--font-body` (Requirement 4.4).
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang={activeLocale} className={fontVariables}>
      <head>
        {/* themeCss() contains no `<`, so raw insertion cannot close the element early. */}
        <style dangerouslySetInnerHTML={{ __html: themeCss() }} />
      </head>
      <body>
        <SiteFrame>{children}</SiteFrame>
      </body>
    </html>
  );
}
