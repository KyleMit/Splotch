import { clearOverlay } from '$lib/state/coloringBook.svelte';
import {
  coloringPackState,
  markColoringBookInstalled,
  resetDownloadedColoringBooks,
  setInstalledColoringBooks,
} from '$lib/state/coloringPacks.svelte';
import { settings } from '$lib/state/settings.svelte';
import { clearLocalColoringBookRoots, setLocalColoringBookRoot } from './assetResolver';
import {
  coloringPackManifestPath,
  parseColoringPackManifest,
  type ColoringPackManifest,
} from './manifest';
import { COLORING_PACK_POLICY_EVENT, COLORING_PACK_REMOVE_EVENT } from './policy';
import type { ColoringPackStore, InstalledColoringPack } from './store';

interface NetworkInformationLike extends EventTarget {
  effectiveType?: string;
  saveData?: boolean;
  type?: string;
}

async function loadManifest(signal?: AbortSignal): Promise<ColoringPackManifest> {
  const response = await fetch(coloringPackManifestPath(__APP_VERSION__), {
    cache: 'no-store',
    signal,
  });
  if (!response.ok) throw new Error(`Coloring-pack manifest unavailable (${response.status})`);
  return parseColoringPackManifest(await response.json(), __APP_VERSION__);
}

async function createStore(): Promise<ColoringPackStore> {
  return __IS_CAPACITOR__
    ? (await import('./nativeStore')).createNativeColoringPackStore()
    : (await import('./webStore')).createWebColoringPackStore();
}

function connection(): NetworkInformationLike | undefined {
  return (navigator as Navigator & { connection?: NetworkInformationLike }).connection;
}

function automaticDownloadAllowed(): boolean {
  if (__IS_CAPACITOR__ || settings.coloringPacksAllowMetered) return true;
  const network = connection();
  if (!network) return true;
  if (network.saveData || network.type === 'cellular') return false;
  return network.effectiveType !== 'slow-2g' && network.effectiveType !== '2g';
}

function applyLocalRoots(packs: InstalledColoringPack[]) {
  for (const pack of packs) {
    if (pack.rootPath) setLocalColoringBookRoot(pack.id, pack.rootPath);
  }
}

async function initializeState(
  store: ColoringPackStore,
  manifest: ColoringPackManifest
): Promise<Set<string>> {
  const installedPacks = await store.installed(manifest);
  applyLocalRoots(installedPacks);
  const installed = new Set(installedPacks.map((pack) => pack.id));
  setInstalledColoringBooks(
    manifest.books.filter((book) => installed.has(book.id)).map((book) => book.id)
  );
  coloringPackState.totalBookCount = manifest.books.length;
  coloringPackState.downloadedBytes = await store.usage(manifest);
  return installed;
}

// The predicate parameter is a test seam for policy changes between sequential book installs.
export function createColoringPackDownloader(downloadAllowed = automaticDownloadAllowed) {
  let stopped = false;
  let paused = false;
  let runPromise: Promise<void> | null = null;
  let controller: AbortController | null = null;

  async function run() {
    controller = new AbortController();
    const manifest = await loadManifest(controller.signal);
    const store = await createStore();
    const installed = await initializeState(store, manifest);
    if (!downloadAllowed()) return;

    for (const book of manifest.books) {
      if (stopped || paused || controller.signal.aborted) return;
      if (book.id === manifest.starterBookId || installed.has(book.id)) continue;
      if (!downloadAllowed()) return;
      coloringPackState.downloadingBookId = book.id;
      const pack = await store.install(
        manifest,
        book,
        settings.coloringPacksAllowMetered,
        controller.signal
      );
      applyLocalRoots([pack]);
      installed.add(book.id);
      markColoringBookInstalled(book.id);
      coloringPackState.downloadedBytes += book.bytes;
    }
  }

  function requestRun() {
    if (stopped || paused || runPromise) return;
    runPromise = run()
      .catch((error) => {
        if (!controller?.signal.aborted) console.warn('Coloring-pack download paused', error);
      })
      .finally(() => {
        coloringPackState.downloadingBookId = null;
        runPromise = null;
      });
  }

  const requestWhenVisible = () => {
    if (document.visibilityState === 'visible') requestRun();
  };
  const network = connection();
  const pause = () => {
    paused = true;
    if (!__IS_CAPACITOR__) controller?.abort();
  };
  const resumeForPolicyChange = () => {
    paused = false;
    requestRun();
  };

  return {
    start() {
      requestRun();
      window.addEventListener('online', requestRun);
      document.addEventListener('visibilitychange', requestWhenVisible);
      window.addEventListener(COLORING_PACK_POLICY_EVENT, resumeForPolicyChange);
      window.addEventListener(COLORING_PACK_REMOVE_EVENT, pause);
      network?.addEventListener('change', requestRun);
    },
    stop() {
      stopped = true;
      if (!__IS_CAPACITOR__) controller?.abort();
      window.removeEventListener('online', requestRun);
      document.removeEventListener('visibilitychange', requestWhenVisible);
      window.removeEventListener(COLORING_PACK_POLICY_EVENT, resumeForPolicyChange);
      window.removeEventListener(COLORING_PACK_REMOVE_EVENT, pause);
      network?.removeEventListener('change', requestRun);
    },
  };
}

export async function removeDownloadedColoringPacks() {
  window.dispatchEvent(new Event(COLORING_PACK_REMOVE_EVENT));
  const manifest = await loadManifest();
  const store = await createStore();
  await store.remove(manifest);
  clearLocalColoringBookRoots();
  clearOverlay();
  resetDownloadedColoringBooks();
}
