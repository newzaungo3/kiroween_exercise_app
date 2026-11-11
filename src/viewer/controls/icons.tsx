/**
 * Inline SVG icons for the Playback_Controls and Camera_Controls.
 *
 * Every icon is decorative: `aria-hidden="true"` and not focusable, because
 * the button around it carries the accessible name from the Strings_Module.
 * Shapes are filled with `currentColor`, so they take the button's text
 * colour from the Halloween_Theme tokens.
 */
import type { ReactNode } from 'react';

interface IconProps {
  readonly className?: string;
}

function Icon({ className, children }: IconProps & { readonly children: ReactNode }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      width="24"
      height="24"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

/** Counter-clockwise arrow over the top: the camera turns towards the Coach's left side. */
export function RotateLeftIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M19 15A7 7 0 0 0 5 15L2 15L6.25 20L10.5 15L7.5 15A4.5 4.5 0 0 1 16.5 15Z" />
    </Icon>
  );
}

/** Clockwise arrow over the top, the mirror of RotateLeftIcon. */
export function RotateRightIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M5 15A7 7 0 0 1 19 15L22 15L17.75 20L13.5 15L16.5 15A4.5 4.5 0 0 0 7.5 15Z" />
    </Icon>
  );
}

/** Upward arrow: raises the camera. */
export function TiltUpIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M12 3L20 11L14.5 11L14.5 21L9.5 21L9.5 11L4 11Z" />
    </Icon>
  );
}

/** Downward arrow: lowers the camera. */
export function TiltDownIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M12 21L20 13L14.5 13L14.5 3L9.5 3L9.5 13L4 13Z" />
    </Icon>
  );
}

/** Magnifier ring and handle shared by the zoom icons. */
function Magnifier() {
  return (
    <>
      <path
        fillRule="evenodd"
        d="M10 3a7 7 0 1 0 0 14a7 7 0 1 0 0-14Zm0 2a5 5 0 1 1 0 10a5 5 0 1 1 0-10Z"
      />
      <path d="M15.2 13.8L21.2 19.8L19.8 21.2L13.8 15.2Z" />
    </>
  );
}

/** Magnifier with a plus. */
export function ZoomInIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <Magnifier />
      <path d="M9 7h2v2h2v2h-2v2H9v-2H7V9h2Z" />
    </Icon>
  );
}

/** Magnifier with a minus. */
export function ZoomOutIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <Magnifier />
      <path d="M7 9h6v2H7Z" />
    </Icon>
  );
}

/** Triangle pointing right. */
export function PlayIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M7 4L20 12L7 20Z" />
    </Icon>
  );
}

/** Two vertical bars. */
export function PauseIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M6 4h4v16H6Zm8 0h4v16h-4Z" />
    </Icon>
  );
}

/** Check mark on the selected Playback_Speed, so selection is not shown by colour alone. */
export function CheckIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M9 16.2L4.8 12L3.4 13.4L9 19L21 7L19.6 5.6Z" />
    </Icon>
  );
}
