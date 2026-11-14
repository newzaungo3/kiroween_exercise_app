/**
 * Maps each Coach color id of the Crypt_Content to its theme token.
 * The colour values stay in `src/ui/theme/tokens.ts`.
 */
import type { CoachColorId } from '@/catalog';
import { colors, type ColorToken } from '@/ui/theme/tokens';

export const coachColorToken: { readonly [K in CoachColorId]: ColorToken } = {
  bone: 'coachBone',
  ash: 'coachAsh',
  moonlight: 'coachMoonlight',
  ember: 'coachEmber',
  slime: 'coachSlime',
  witch: 'coachWitch',
};

/** The '#rrggbb' value of a Coach color. */
export function coachColorHex(id: CoachColorId): string {
  return colors[coachColorToken[id]];
}

const cssVarName: { readonly [K in CoachColorId]: string } = {
  bone: '--color-coach-bone',
  ash: '--color-coach-ash',
  moonlight: '--color-coach-moonlight',
  ember: '--color-coach-ember',
  slime: '--color-coach-slime',
  witch: '--color-coach-witch',
};

/** The CSS custom property reference of a Coach color, for swatches. */
export function coachColorVar(id: CoachColorId): string {
  return `var(${cssVarName[id]})`;
}
