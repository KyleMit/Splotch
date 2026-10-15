import {
  LibraryFault,
  requireDownloadNetwork,
  type LibraryEnvironment,
} from '../offlineLibrary/contract';
import { approvedAssetUrl, MAX_PACK_FILE_BYTES, type PackFile } from '../offlineLibrary/manifest';
import { sha256Hex } from '../../../../web/src/lib/digestHex';
import { scheduleIdle } from '../../../../web/src/lib/idle';

export const LIBRARY_FILE_TIMEOUT_MS = 60_000;
const DIGEST = /^[a-f0-9]{64}$/;
export function waitForLibraryIdle(signal: AbortSignal, drawing: () => boolean): Promise<void> {
  return new Promise((resolve, reject) => {
    let cancel = () => {};
    const abort = () => {
      cancel();
      signal.removeEventListener('abort', abort);
      reject(new LibraryFault('cancelled', 'Coloring download cancelled.'));
    };
    const enter = () => {
      if (signal.aborted) return abort();
      if (drawing()) {
        cancel = scheduleIdle(enter);
        return;
      }
      signal.removeEventListener('abort', abort);
      resolve();
    };
    if (signal.aborted) abort();
    else {
      signal.addEventListener('abort', abort, { once: true });
      cancel = scheduleIdle(enter);
    }
  });
}
export function requireLibraryFile(file: PackFile): void {
  if (
    !Number.isSafeInteger(file.bytes) ||
    file.bytes <= 0 ||
    file.bytes > MAX_PACK_FILE_BYTES ||
    typeof file.sha256 !== 'string' ||
    !DIGEST.test(file.sha256)
  )
    throw new LibraryFault('corrupt', 'The coloring catalog is damaged.');
}
export async function matchesLibraryFile(bytes: Uint8Array, file: PackFile): Promise<boolean> {
  requireLibraryFile(file);
  return (
    bytes.length === file.bytes && (await sha256Hex(new Uint8Array(bytes).buffer)) === file.sha256
  );
}
function approvedDownloadUrl(file: PackFile): string {
  try {
    approvedAssetUrl(file.downloadPath);
    approvedAssetUrl(file.path);
    if (
      file.downloadPath !== file.path &&
      (!/\.(light|night)\.webp$/.test(file.path) ||
        file.downloadPath !== file.path.replace('/coloring/', '/coloring/max-1152px/'))
    )
      throw new Error('Invalid asset variant.');
  } catch {
    throw new LibraryFault('corrupt', 'The coloring catalog contains an unapproved asset.');
  }
  const url = new URL(file.downloadPath, location.origin);
  if (url.protocol !== 'https:' && url.protocol !== 'http:')
    throw new LibraryFault('unavailable', 'Coloring downloads need a hosted app.');
  return url.href;
}
async function readLibraryResponse(
  response: Response,
  file: PackFile,
  interrupted: Promise<never>,
  checkCancelled: () => void,
  environment: () => Promise<Pick<LibraryEnvironment, 'online' | 'metered'>>,
  allowMetered: boolean,
  progress: (bytes: number) => void,
  ownReader: (reader: ReadableStreamDefaultReader<Uint8Array>) => void
): Promise<Uint8Array> {
  const length = response.headers.get('content-length');
  const encoding = response.headers.get('content-encoding');
  if (
    length !== null &&
    (!encoding || encoding === 'identity') &&
    (!/^\d+$/.test(length) || Number(length) !== file.bytes)
  )
    throw new LibraryFault('corrupt', 'The coloring download has changed. Please try again later.');
  if (!response.body)
    throw new LibraryFault('unavailable', 'The coloring download is unavailable.');
  const reader = response.body.getReader();
  ownReader(reader);
  const bytes = new Uint8Array(file.bytes);
  let received = 0;
  while (true) {
    const chunk = await Promise.race([reader.read(), interrupted]);
    checkCancelled();
    requireDownloadNetwork(await Promise.race([environment(), interrupted]), allowMetered);
    checkCancelled();
    if (chunk.done) break;
    if (!(chunk.value instanceof Uint8Array) || chunk.value.length > file.bytes - received)
      throw new LibraryFault('corrupt', 'The coloring download is larger than expected.');
    bytes.set(chunk.value, received);
    received += chunk.value.length;
    progress(received);
  }
  if (!(await Promise.race([matchesLibraryFile(bytes.subarray(0, received), file), interrupted])))
    throw new LibraryFault('corrupt', 'The coloring download did not pass verification.');
  checkCancelled();
  return bytes;
}
export async function downloadLibraryFile(
  file: PackFile,
  signal: AbortSignal,
  allowMetered: boolean,
  environment: () => Promise<Pick<LibraryEnvironment, 'online' | 'metered'>>,
  progress: (bytes: number) => void
): Promise<Uint8Array> {
  requireLibraryFile(file);
  const url = approvedDownloadUrl(file);
  const controller = new AbortController();
  const cancel = () =>
    controller.abort(new LibraryFault('cancelled', 'Coloring download cancelled.'));
  if (signal.aborted) cancel();
  else signal.addEventListener('abort', cancel, { once: true });
  const timer = setTimeout(
    () =>
      controller.abort(
        new LibraryFault('unavailable', 'The coloring download timed out. Try again.')
      ),
    LIBRARY_FILE_TIMEOUT_MS
  );
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let rejectAbort: ((error: unknown) => void) | undefined;
  const interrupted = new Promise<never>((_resolve, reject) => {
    rejectAbort = reject;
  });
  const aborted = () => rejectAbort?.(controller.signal.reason);
  controller.signal.addEventListener('abort', aborted, { once: true });
  if (controller.signal.aborted) aborted();
  void interrupted.catch(() => undefined);
  function checkCancelled() {
    if (controller.signal.aborted) throw controller.signal.reason;
  }
  try {
    checkCancelled();
    requireDownloadNetwork(await Promise.race([environment(), interrupted]), allowMetered);
    checkCancelled();
    const response = await Promise.race([
      fetch(url, { signal: controller.signal, redirect: 'error', credentials: 'omit' }),
      interrupted,
    ]);
    checkCancelled();
    if (!response.ok || response.url !== url || response.redirected || !response.body)
      throw new LibraryFault(
        'unavailable',
        'This coloring book could not be downloaded. Try again later.'
      );
    return await readLibraryResponse(
      response,
      file,
      interrupted,
      checkCancelled,
      environment,
      allowMetered,
      progress,
      (owned) => {
        reader = owned;
      }
    );
  } catch (error) {
    if (controller.signal.aborted) throw controller.signal.reason;
    if (error instanceof LibraryFault) throw error;
    throw new LibraryFault(
      'unavailable',
      'This coloring book could not be downloaded. Try again later.'
    );
  } finally {
    clearTimeout(timer);
    signal.removeEventListener('abort', cancel);
    controller.signal.removeEventListener('abort', aborted);
    controller.abort();
    void reader?.cancel().catch(() => undefined);
  }
}
