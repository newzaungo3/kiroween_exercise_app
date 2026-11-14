/**
 * Helpers for the Crypt_Screen: locators for the option rows and their
 * buttons, the Unlock_Helper, and readers for the Viewer's look attributes.
 * Names come from the Strings_Module and the Crypt_Content, never literals.
 */
import { expect, type Locator, type Page } from '@playwright/test';

import { cryptContent, type CryptOption } from '@/catalog';
import { locales } from '@/ui/strings';

const en = locales.en;

/** Fills `{name}` placeholders of an English template. */
function fill(template: string, values: Readonly<Record<string, string>>): string {
  return template.replace(/\{(\w+)\}/g, (_match, key: string) => values[key] ?? '');
}

/** Escapes text for use inside a regular expression. */
function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Every Coach color and Accessory of the Crypt_Content, colors first. */
export const cryptOptions: readonly CryptOption[] = [
  ...cryptContent.coachColors,
  ...cryptContent.accessories,
];

/** The display name of an option, from its Strings_Module identifier. */
export function nameOf(option: CryptOption): string {
  return en[option.nameId];
}

/** The option with this display name or Option_Id. Throws when there is none. */
export function findOption(nameOrId: string): CryptOption {
  const option = cryptOptions.find((entry) => nameOf(entry) === nameOrId || entry.id === nameOrId);
  if (option === undefined) throw new Error(`The Crypt_Content has no option "${nameOrId}".`);
  return option;
}

/** The accessible name of an option's Equip button. */
export function equipName(option: CryptOption): string {
  return fill(en['crypt.equip'], { option: nameOf(option) });
}

/** The accessible name of an option's Preview button. */
export function previewName(option: CryptOption): string {
  return fill(en['crypt.preview'], { option: nameOf(option) });
}

/** The accessible name of an option's Unlock button, with its Price. */
export function unlockName(option: CryptOption): string {
  return fill(en['crypt.unlock'], { option: nameOf(option), price: String(option.price) });
}

/** The row (list item) of one option. */
export function optionRow(page: Page, option: CryptOption | string): Locator {
  const entry = typeof option === 'string' ? findOption(option) : option;
  return page
    .getByRole('listitem')
    .filter({ has: page.getByText(nameOf(entry), { exact: true }) });
}

/** The Equip toggle of an Owned option (a button with `aria-pressed`). */
export function equipToggle(page: Page, option: CryptOption | string): Locator {
  const entry = typeof option === 'string' ? findOption(option) : option;
  return page.getByRole('button', { name: equipName(entry), exact: true });
}

/** The Preview toggle of a Locked option (a button with `aria-pressed`). */
export function previewToggle(page: Page, option: CryptOption | string): Locator {
  const entry = typeof option === 'string' ? findOption(option) : option;
  return page.getByRole('button', { name: previewName(entry), exact: true });
}

/** The Unlock button of a Locked option. Disabled when the Candy is not enough. */
export function unlockButton(page: Page, option: CryptOption | string): Locator {
  const entry = typeof option === 'string' ? findOption(option) : option;
  return page.getByRole('button', { name: unlockName(entry), exact: true });
}

/** The Shortfall text of a Locked option ("N more Candy needed"), inside its row. */
export function shortfallText(page: Page, option: CryptOption | string): Locator {
  const [before = '', after = ''] = en['crypt.needMore'].split('{count}');
  return optionRow(page, option).getByText(
    new RegExp(`^${escapeRegExp(before)}\\d+${escapeRegExp(after)}$`),
  );
}

/** The Coach name text field. */
export function coachNameField(page: Page): Locator {
  return page.getByRole('textbox', { name: en['crypt.name.label'] });
}

/** The button that saves the Coach name. */
export function saveNameButton(page: Page): Locator {
  return page.getByRole('button', { name: en['crypt.name.save'] });
}

/** The Candy balance line (`role="status"`) of the Crypt_Screen. */
export function cryptBalance(page: Page): Locator {
  const [before = '', after = ''] = en['crypt.balance'].split('{candy}');
  return page
    .getByRole('status')
    .filter({ hasText: new RegExp(`^${escapeRegExp(before)}\\d+${escapeRegExp(after)}$`) });
}

/** The polite live region that announces Unlocks, equips and names. */
export function liveRegion(page: Page): Locator {
  return page.locator('p[aria-live="polite"]');
}

/**
 * Unlock_Helper: clicks the Unlock button of the option (display name or
 * Option_Id), then waits for the unlocked announcement in the live region.
 */
export async function unlockOption(page: Page, optionName: string): Promise<void> {
  const option = findOption(optionName);
  await unlockButton(page, option).click();
  const [before = '', after = ''] = fill(en['crypt.announce.unlocked'], {
    option: nameOf(option),
    candy: '{candy}',
  }).split('{candy}');
  await expect(liveRegion(page)).toHaveText(
    new RegExp(`^${escapeRegExp(before)}\\d+${escapeRegExp(after)}$`),
  );
}

/** The Viewer_Area that carries the look attributes. */
function viewerArea(page: Page): Locator {
  return page.locator('[data-viewer-phase]');
}

/** The Viewer's `data-coach-color`: a Coach color id, `asset`, or null before it applies. */
export async function coachColorOf(page: Page): Promise<string | null> {
  return viewerArea(page).getAttribute('data-coach-color');
}

/** The Viewer's `data-coach-accessories` as a list of shown node names. */
export async function coachAccessoriesOf(page: Page): Promise<string[]> {
  const text = await viewerArea(page).getAttribute('data-coach-accessories');
  return text === null || text === '' ? [] : text.split(' ');
}

/** The Viewer's `data-accessories` state, or null when absent. */
export async function accessoriesState(page: Page): Promise<string | null> {
  return viewerArea(page).getAttribute('data-accessories');
}
