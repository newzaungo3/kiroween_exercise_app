import styles from './decorations.module.css';

type CobwebProps = {
  readonly className?: string;
};

/** Angles (degrees) of the radial threads, fanning out from the top-left corner. */
const radialAngles = [0, 22.5, 45, 67.5, 90] as const;
/** Radii of the sagging spiral threads, in viewBox units. */
const ringRadii = [24, 48, 72, 94] as const;
/** How far each spiral thread sags toward the corner (control point radius factor). */
const sag = 0.82;

function point(radius: number, degrees: number): string {
  const radians = (degrees * Math.PI) / 180;
  const x = radius * Math.cos(radians);
  const y = radius * Math.sin(radians);
  return `${x.toFixed(1)} ${y.toFixed(1)}`;
}

function buildWebPath(): string {
  const radials = radialAngles.map((angle) => `M0 0 L${point(100, angle)}`);
  const rings = ringRadii.flatMap((radius) =>
    radialAngles.slice(1).map((angle, index) => {
      const previous = radialAngles[index] ?? 0;
      const middle = (previous + angle) / 2;
      return `M${point(radius, previous)} Q${point(radius * sag, middle)} ${point(radius, angle)}`;
    }),
  );
  return [...radials, ...rings].join(' ');
}

/** Built once at module load; the geometry never changes. */
const webPath = buildWebPath();

/**
 * Cobweb Decoration: a corner web stroked in `currentColor`, anchored at the
 * top-left. Mirror it with CSS for the top-right corner. Purely visual; the
 * DecorationLayer hides it from assistive technology.
 */
export function Cobweb({ className }: CobwebProps) {
  const classes = className ? `${styles.web} ${className}` : styles.web;
  return (
    <svg
      className={classes}
      data-decoration="cobweb"
      focusable="false"
      viewBox="0 0 100 100"
    >
      <path
        d={webPath}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
      />
    </svg>
  );
}
