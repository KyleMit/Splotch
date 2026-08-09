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
  resolveColoringPackManifest,
  type ResolvedColoringPackManifest,
} from './manifest';
import { COLORING_PACK_POLICY_EVENT, COLORING_PACK_REMOVE_EVENT } from './policy';
import { currentColoringPackResolution } from './resolution';
import type { ColoringPackStore, InstalledColoringPack } from './store';

interface NetworkInformationLike extends EventTarget {
  effectiveType?: string;
  saveData?: boolean;
  type?: string;
}

async function loadManifest(signal?: AbortSignal): Promise<ResolvedColoringPackManifest> {
  const response = await fetch(coloringPackManifestPath(__APP_VERSION__), {
    cache: 'no-store',
    signal,
  });
  if (!response.ok) throw new Error(`Coloring-pack manifest unavailable (${response.status})`);
  return resolveColoringPackManifest(
    parseColoringPackManifest(await response.json(), __APP_VERSION__),
    currentColoringPackResolution()
  );
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
  if (!settings.coloringBookEnabled) return false;
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
  manifest: ResolvedColoringPackManifest
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
  let rerunRequested = false;
  let runPromise: Promise<void> | null = null;
  let controller: AbortController | null = null;
  let activeStore: ColoringPackStore | null = null;

  async function run() {
    if (!downloadAllowed()) return;
    controller = new AbortController();
    const manifest = await loadManifest(controller.signal);
    if (controller.signal.aborted || !downloadAllowed()) return;
    const store = await createStore();
    if (controller.signal.aborted || !downloadAllowed()) return;
    activeStore = store;
    const installed = await initializeState(store, manifest);
    if (controller.signal.aborted || !downloadAllowed()) return;

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
    if (stopped || paused) return;
    if (runPromise) {
      rerunRequested = true;
      return;
    }
    rerunRequested = false;
    runPromise = run()
      .catch((error) => {
        if (!controller?.signal.aborted) console.warn('Coloring-pack download paused', error);
      })
      .finally(() => {
        coloringPackState.downloadingBookId = null;
        controller = null;
        activeStore = null;
        runPromise = null;
        if (rerunRequested) requestRun();
      });
  }

  const requestWhenVisible = () => {
    if (document.visibilityState === 'visible') requestRun();
  };
  const network = connection();
  const pause = () => {
    paused = true;
    rerunRequested = false;
    controller?.abort();
    void activeStore?.cancel().catch((error) => {
      console.warn('Coloring-pack cancellation failed', error);
    });
  };
  const applyDownloadPolicy = () => {
    if (!downloadAllowed()) {
      pause();
      return;
    }
    paused = false;
    requestRun();
  };

  return {
    start() {
      requestRun();
      window.addEventListener('online', requestRun);
      document.addEventListener('visibilitychange', requestWhenVisible);
      window.addEventListener(COLORING_PACK_POLICY_EVENT, applyDownloadPolicy);
      window.addEventListener(COLORING_PACK_REMOVE_EVENT, pause);
      network?.addEventListener('change', requestRun);
    },
    stop() {
      stopped = true;
      if (!__IS_CAPACITOR__) controller?.abort();
      window.removeEventListener('online', requestRun);
      document.removeEventListener('visibilitychange', requestWhenVisible);
      window.removeEventListener(COLORING_PACK_POLICY_EVENT, applyDownloadPolicy);
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
