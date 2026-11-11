'use client';

import { useCallback, useState } from 'react';

import { stillViews, type ExerciseEntry, type SameOriginAssetPath } from '@/catalog';
import { format, t } from '@/ui/strings';

import styles from './fallback.module.css';

export interface StillImageProps {
  /** Same-origin Still_Image path, taken from the Exercise_Entry. */
  readonly src: SameOriginAssetPath;
  /** Alternative text from the Strings_Module. */
  readonly alt: string;
}

/**
 * One Still_Image. A plain `<img>`, not `next/image`, because Next's image
 * optimiser runs as a server function (ADR 0002).
 *
 * If the image fails to load, it replaces itself with a bordered paragraph
 * showing its alternative text; the other Still_Images and the
 * Written_Content are unaffected (Requirement 9.11). The ref callback also
 * catches an image that had already failed before the handler could run.
 */
export function StillImage({ src, alt }: StillImageProps) {
  const [failed, setFailed] = useState(false);
  const markFailed = useCallback(() => setFailed(true), []);
  const checkAlreadyFailed = useCallback((image: HTMLImageElement | null) => {
    if (image !== null && image.complete && image.naturalWidth === 0) setFailed(true);
  }, []);

  if (failed) {
    return (
      <p className={styles.imageError} data-still-image-error="">
        {alt}
      </p>
    );
  }
  return (
    <img
      ref={checkAlreadyFailed}
      className={styles.image}
      src={src}
      alt={alt}
      decoding="async"
      onError={markFailed}
    />
  );
}

export interface StillFallbackProps {
  /** The Exercise whose Still_Images are shown. Paths come only from here (Requirement 13.7). */
  readonly exercise: ExerciseEntry;
}

/**
 * The Still_Fallback's figure list: the front, side and back Still_Images,
 * each with alternative text and a Front, Side or Back caption from the
 * Strings_Module (Requirement 9.9).
 *
 * The Viewer renders this only in the Still_Fallback, so the browser
 * requests Still_Images only then (Requirement 9.10). The Still_Fallback
 * message itself is shown by the Viewer's live region.
 */
export function StillFallback({ exercise }: StillFallbackProps) {
  const name = t(exercise.nameId);
  return (
    <ul className={styles.stills} data-viewer-stills="">
      {stillViews.map((view) => (
        <li key={view}>
          <figure className={styles.figure}>
            <StillImage
              src={exercise.stills[view]}
              alt={format(`viewer.still.${view}.alt`, { exercise: name })}
            />
            <figcaption className={styles.caption}>{t(`viewer.view.${view}`)}</figcaption>
          </figure>
        </li>
      ))}
    </ul>
  );
}
