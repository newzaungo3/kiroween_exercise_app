import type { CryptOption } from '@/catalog';
import { format, t } from '@/ui/strings';

/** The display name of a Coach color or Accessory. */
export function optionName(option: CryptOption): string {
  return t(option.nameId);
}

/** The Coach name to show: the stored one, or the default when there is none. */
export function coachNameOrDefault(name: string | null): string {
  return name === null || name === '' ? t('coach.defaultName') : name;
}

/** The Safety_Message in the Coach's voice, using the Coach name. */
export function safetyMessage(name: string | null): string {
  return format('safety.coachMessage', { coach: coachNameOrDefault(name) });
}
