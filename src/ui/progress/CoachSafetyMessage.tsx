'use client';

/**
 * Read_Only_Bridge: the Safety_Message in the Coach's voice. The first render
 * uses the Default_Coach_Name; the stored name replaces it after hydration.
 * The name is a text node, never markup.
 */
import { safetyMessage } from '../crypt/labels';
import { useCoachLook } from './useCoachLook';

export function CoachSafetyMessage({ className }: { readonly className?: string }) {
  const { coachName } = useCoachLook();
  return <p className={className}>{safetyMessage(coachName)}</p>;
}
