/**
 * Browser adapter: downloads the Coach_Asset from the Site's own origin.
 *
 * Network errors and HTTP errors are reported separately, as
 * `CoachAssetError('network')` and `CoachAssetError('http', status)`.
 * An abort (Retry, or leaving the page) is rethrown unchanged so the caller
 * can ignore it. No decisions here: the load state machine decides what
 * each error means.
 */
import { CoachAssetError } from '../logic/load-state';

function isAbort(error: unknown, signal: AbortSignal): boolean {
  return signal.aborted || (error instanceof DOMException && error.name === 'AbortError');
}

/**
 * Fetches the Coach_Asset or Accessory_Asset at `path` (a same-origin path
 * from the Catalog; a plain string here, as Viewer code may not import the
 * Catalog's path type) with GET and same-origin credentials, and returns its bytes.
 */
export async function fetchCoachAsset(path: string, signal: AbortSignal): Promise<ArrayBuffer> {
  let response: Response;
  try {
    response = await fetch(path, { method: 'GET', signal, credentials: 'same-origin' });
  } catch (error) {
    if (isAbort(error, signal)) throw error;
    throw new CoachAssetError('network');
  }

  if (!response.ok) throw new CoachAssetError('http', response.status);

  try {
    return await response.arrayBuffer();
  } catch (error) {
    // The connection dropped while the body was downloading.
    if (isAbort(error, signal)) throw error;
    throw new CoachAssetError('network');
  }
}
