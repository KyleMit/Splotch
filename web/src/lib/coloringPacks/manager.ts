import { clearOverlay } from '$lib/state/coloringBook.svelte';
import {
  coloringPacksState,
  markColoringBookInstalled,
  resetDownloadedColoringBooks,
  setInstalledColoringBooks,
} from '$lib/state/coloringPacks.svelte';
import { settingsState } from '$lib/state/settings.svelte';
import { clearLocalColoringBookRoots, setLocalColoringBookRoot } from './assetResolver';
import {
  coloringPackManifestPath,
  parseColoringPackManifest,
  type ColoringPackManifest,
  resolveColoringPackManifest,
  type ResolvedColoringPackManifest,
} from './manifest';
import { COLORING_PACK_POLICY_EVENT, COLORING_PACK_REMOVE_EVENT } from './policy';
import { currentColoringPackResolution } from './resolution';
import type { ColoringPackStore, InstalledColoringPack } from './store';

async function fetchManifest(signal?: AbortSignal): Promise<ColoringPackManifest> {
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

function automaticDownloadAllowed(): boolean {
  if (!settingsState.coloringBookEnabled) return false;
  if (__IS_CAPACITOR__ || settingsState.coloringPacksAllowMetered) return true;
  const network = navigator.connection;
  if (!network) return true;
  if (network.saveData || network.type === 'cellular') return false;
  return network.effectiveType !== 'slow-2g' && network.effectiveType !== '2g';
}

function applyLocalRoots(packs: InstalledColoringPack[]) {
  for (const pack of packs) {
    if (pack.rootPath) setLocalColoringBookRoot(pack.id, pack.rootPath);
  }
}

// Applied only once the caller has re-checked its abort signal: every write
// here is state that removal clears, so a scan still in flight when the packs
// were deleted must be dropped rather than published.
function applyInstalledPacks(
  manifest: ResolvedColoringPackManifest,
  packs: InstalledColoringPack[]
): Set<string> {
  applyLocalRoots(packs);
  const installed = new Set(packs.map((pack) => pack.id));
  setInstalledColoringBooks(
    manifest.books.filter((book) => installed.has(book.id)).map((book) => book.id)
  );
  coloringPacksState.recordInstalledPacks(
    manifest.books.length,
    packs.reduce((total, pack) => total + pack.bytes, 0)
  );
  return installed;
}

function createNativeRunQueue() {
  let pending: Promise<void> | null = null;
  return (run: () => Promise<void>) => {
    const queued = pending ? pending.then(run, run) : run();
    pending = queued;
    const release = () => {
      if (pending === queued) pending = null;
    };
    void queued.then(release, release);
    return queued;
  };
}

// Native installs survive route teardown. A remount waits through the old run's
// cleanup before rescanning the store, so only one run owns progress and installs.
const queueNativeRun = createNativeRunQueue();

// The predicate parameter is a test seam for policy changes between sequential book installs.
export function createColoringPackDownloader(downloadAllowed = automaticDownloadAllowed) {
  let stopped = false;
  let paused = false;
  let fetchedManifest: ColoringPackManifest | null = null;
  let installing = false;
  let rerunRequested = false;
  let runPromise: Promise<void> | null = null;
  let controller: AbortController | null = null;
  let activeStore: ColoringPackStore | null = null;

  // A run that may download refetches the manifest, as every run always has. One
  // that may not reuses this downloader's copy: the manifest is named by the app
  // version, and a metered connection should pay for it once, while the store
  // scan still repeats so books another tab installed or removed are seen.
  async function loadManifest(signal: AbortSignal): Promise<ResolvedColoringPackManifest> {
    if (!fetchedManifest || downloadAllowed()) fetchedManifest = await fetchManifest(signal);
    return resolveColoringPackManifest(fetchedManifest, currentColoringPackResolution());
  }

  // Discovering what is installed never waits on the download policy: a
  // metered or Save-Data connection forbids new packs, not the books already on
  // disk.
  async function run() {
    if (stopped || paused || !settingsState.coloringBookEnabled) return;
    controller = new AbortController();
    const manifest = await loadManifest(controller.signal);
    if (controller.signal.aborted) return;
    const store = await createStore();
    if (controller.signal.aborted) return;
    activeStore = store;
    const installedPacks = await store.installed(manifest);
    if (controller.signal.aborted) return;
    const installed = applyInstalledPacks(manifest, installedPacks);
    if (!downloadAllowed()) return;

    for (const book of manifest.books) {
      if (stopped || paused || controller.signal.aborted) return;
      if (book.id === manifest.starterBookId || installed.has(book.id)) continue;
      if (!downloadAllowed()) return;
      coloringPacksState.startBookDownload(book.id);
      installing = true;
      const pack = await store
        .install(manifest, book, settingsState.coloringPacksAllowMetered, controller.signal)
        .finally(() => {
          installing = false;
        });
      if (controller.signal.aborted) return;
      applyLocalRoots([pack]);
      installed.add(book.id);
      markColoringBookInstalled(book.id, book.bytes);
    }
  }

  function runWithCleanup() {
    return run()
      .catch((error) => {
        if (!controller?.signal.aborted) console.warn('Coloring-pack download paused', error);
      })
      .finally(() => {
        if (controller) coloringPacksState.endBookDownload();
        controller = null;
        activeStore = null;
        runPromise = null;
        if (stopped) removeCancellationListeners();
        if (rerunRequested) requestRun();
      });
  }

  function requestRun() {
    if (stopped || paused) return;
    if (runPromise) {
      rerunRequested = true;
      return;
    }
    rerunRequested = false;
    runPromise = __IS_CAPACITOR__ ? queueNativeRun(runWithCleanup) : runWithCleanup();
  }

  const requestWhenVisible = () => {
    if (document.visibilityState === 'visible') requestRun();
  };
  const network = navigator.connection;
  const cancelActiveWork = () => {
    controller?.abort();
    void activeStore?.cancel().catch((error) => {
      console.warn('Coloring-pack cancellation failed', error);
    });
  };
  const pause = () => {
    paused = true;
    rerunRequested = false;
    cancelActiveWork();
  };
  // Disallowing downloads cancels only a transfer: the books a finished scan
  // published stay visible, and a scan still running keeps going to publish them.
  const applyDownloadPolicy = () => {
    if (!settingsState.coloringBookEnabled) {
      pause();
      return;
    }
    if (installing && !downloadAllowed()) cancelActiveWork();
    paused = false;
    requestRun();
  };

  function removeCancellationListeners() {
    window.removeEventListener(COLORING_PACK_POLICY_EVENT, applyDownloadPolicy);
    window.removeEventListener(COLORING_PACK_REMOVE_EVENT, pause);
  }

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
      // Native work survives teardown, but keeps its cancellation listeners
      // until settlement so removal or policy-off can still abort its owner.
      if (!__IS_CAPACITOR__) controller?.abort();
      window.removeEventListener('online', requestRun);
      document.removeEventListener('visibilitychange', requestWhenVisible);
      if (!__IS_CAPACITOR__ || !runPromise) removeCancellationListeners();
      network?.removeEventListener('change', requestRun);
    },
  };
}

export async function removeDownloadedColoringPacks() {
  window.dispatchEvent(new Event(COLORING_PACK_REMOVE_EVENT));
  const store = await createStore();
  // Deliberately not loadManifest(): removal deletes every stored pack whatever
  // manifest wrote it, and fetching one made "Remove downloaded pictures" fail
  // offline.
  await store.remove();
  clearLocalColoringBookRoots();
  clearOverlay();
  resetDownloadedColoringBooks();
}
