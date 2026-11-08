import type { ReactNode } from 'react';
import { DecorationLayer } from '../decorations/DecorationLayer';
import styles from './SiteFrame.module.css';

/**
 * Wraps every screen: the Decoration band first, then the `<main>` column.
 *
 * - SiteFrame contains no `<nav>`, so the Home_Navigation stays the only
 *   navigation landmark on the Home_Screen (Requirement 2.4).
 * - The Decoration band sits in flow above `<main>`, so Decorations never
 *   cover the heading or a Navigation_Entry (Requirement 4.12).
 * - `<main>` is at most 48rem wide and centred (Requirement 5.2).
 */
export function SiteFrame({ children }: { children: ReactNode }) {
  return (
    <div className={styles.frame}>
      <DecorationLayer />
      <main className={styles.main}>{children}</main>
    </div>
  );
}
