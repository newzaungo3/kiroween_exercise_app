import styles from './decorations.module.css';

type BatProps = {
  readonly className?: string;
};

/**
 * Bat Decoration: a filled silhouette in `currentColor`. Purely visual;
 * the DecorationLayer hides it from assistive technology.
 */
export function Bat({ className }: BatProps) {
  const classes = className ? `${styles.bat} ${className}` : styles.bat;
  return (
    <svg
      className={classes}
      data-decoration="bat"
      focusable="false"
      viewBox="0 0 64 32"
    >
      <path
        fill="currentColor"
        d="M32 9 L30 5 L29 10 C24 7 12 5 2 8 C7 10 9 14 9 19 C13 16 17 16 19 20 C22 17 26 17 28 22 C29 20 31 19 32 21 C33 19 35 20 36 22 C38 17 42 17 45 20 C47 16 51 16 55 19 C55 14 57 10 62 8 C52 5 40 7 35 10 L34 5 Z"
      />
    </svg>
  );
}
