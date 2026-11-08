import { Bat } from './Bat';
import { Cobweb } from './Cobweb';
import styles from './decorations.module.css';

/**
 * The decorative band at the top of every screen: two cobwebs and two bats.
 *
 * - `aria-hidden` removes every Decoration from the accessibility tree, and
 *   the SVGs are not focusable (Requirement 4.7).
 * - The band is in flow above `<main>` and ignores pointer events, so
 *   Decorations never cover the heading or a Navigation_Entry and take no
 *   taps (Requirement 4.12).
 */
export function DecorationLayer() {
  return (
    <div className={styles.layer} aria-hidden="true">
      <Cobweb className={styles.webLeft} />
      <Cobweb className={styles.webRight} />
      <Bat className={styles.batOne} />
      <Bat className={styles.batTwo} />
    </div>
  );
}
