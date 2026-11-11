import styles from './fallback.module.css';

type LoadingArtProps = {
  readonly className?: string;
};

/**
 * Loading art of the Loading_State: a skull rising out of a grave under the
 * moon. Purely visual, so it is hidden from assistive technology; the
 * Viewer's live region carries the Loading_State message (Requirement 9.2).
 *
 * The skull drifts up and down with a transform-only CSS animation, which
 * `prefers-reduced-motion: reduce` switches off (Requirement 11.5). Every
 * shape is filled with `currentColor` and coloured by token variables.
 */
export function LoadingArt({ className }: LoadingArtProps) {
  const classes = className ? `${styles.loadingArt} ${className}` : styles.loadingArt;
  return (
    <div className={classes} aria-hidden="true" data-viewer-loading-art="">
      <svg className={styles.loadingSvg} focusable="false" viewBox="0 0 120 100">
        <circle className={styles.moon} cx={96} cy={18} r={11} fill="currentColor" />
        <path
          className={styles.gravestone}
          fill="currentColor"
          d="M14 84 V44 C14 30 44 30 44 44 V84 Z"
        />
        <g className={styles.skull}>
          <path
            fill="currentColor"
            d="M74 50 C74 38 98 38 98 50 C98 57 95 60 93 61 V67 H79 V61 C77 60 74 57 74 50 Z"
          />
          <circle className={styles.eye} cx={81} cy={51} r={3.5} fill="currentColor" />
          <circle className={styles.eye} cx={91} cy={51} r={3.5} fill="currentColor" />
        </g>
        <path className={styles.ground} fill="currentColor" d="M0 78 Q60 70 120 78 V100 H0 Z" />
      </svg>
    </div>
  );
}
