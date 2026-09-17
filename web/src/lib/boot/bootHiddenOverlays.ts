import type { Component } from 'svelte';
import { scheduleIdle, scheduleInteractionIdle } from '$lib/idle';

const BACKGROUND_ORDER = [
  'parentalGate',
  'colorPicker',
  'coloringBook',
  'aiPrompt',
  // Before the modal it rescues: a run minimized into a gap where the
  // polaroid has not mounted yet has no way back.
  'aiWaiting',
  'aiResult',
  'installBanner',
  'saveFailureBanner',
  'settings',
] as const;

export type BootHiddenOverlayKey = (typeof BACKGROUND_ORDER)[number];

type OverlayCatalog = typeof import('$lib/components/overlayChunk');

const COMPONENT_EXPORTS = {
  parentalGate: 'ParentalGate',
  colorPicker: 'ColorPicker',
  coloringBook: 'ColoringBook',
  aiPrompt: 'AiImagePrompt',
  aiWaiting: 'AiWaitingPolaroid',
  aiResult: 'AiImageResult',
  installBanner: 'InstallBanner',
  saveFailureBanner: 'SaveFailureBanner',
  settings: 'SettingsModal',
} as const satisfies Record<BootHiddenOverlayKey, keyof OverlayCatalog>;

export interface BootHiddenOverlays {
  demand(key: BootHiddenOverlayKey): void;
  stop(): void;
}

// A failed chunk fetch is retried explicitly rather than by whatever happens to
// re-run a demand: each failure re-arms one idle attempt, this many times, and a
// demand retries at once — including a demand that arrived while an attempt was
// already pending, which the failure answers with an immediate retry outside
// this budget, so a resident someone is waiting on is never left to idle luck.
// Past the limit only demands retry, so a dead connection stops costing idle time.
const OVERLAY_CHUNK_IDLE_RETRY_LIMIT = 3;

type OverlayCatalogLoader = () => Promise<OverlayCatalog>;

// The boot-hidden overlays (see components/overlayChunk.ts) stay in one lazy
// chunk so startup never evaluates their component graph (ADR-0049). Demand
// mounts a requested resident as soon as that catalog is available; unrelated
// residents mount one at a time only after interaction has gone quiet.
// `loadChunk` is a test seam: the route always takes the default import, and the
// test hands in a loader it can fail on purpose to exercise the retry.
export function mountBootHiddenOverlays(
  onOverlay: (key: BootHiddenOverlayKey, overlay: Component) => void,
  loadChunk: OverlayCatalogLoader = () => import('$lib/components/overlayChunk')
): BootHiddenOverlays {
  let stopped = false;
  let idleRetriesLeft = OVERLAY_CHUNK_IDLE_RETRY_LIMIT;
  let foregroundDemandPending = false;
  let catalog: OverlayCatalog | null = null;
  let catalogPromise: Promise<OverlayCatalog> | null = null;
  let cancelBootIdle = () => {};
  let cancelBackgroundIdle = () => {};
  let backgroundGeneration = 0;
  const requested = new Set<BootHiddenOverlayKey>();
  const mounted = new Set<BootHiddenOverlayKey>();

  function component(key: BootHiddenOverlayKey): Component {
    return catalog![COMPONENT_EXPORTS[key]];
  }

  function mountOnce(key: BootHiddenOverlayKey) {
    if (stopped || !catalog || mounted.has(key)) return;
    onOverlay(key, component(key));
    mounted.add(key);
  }

  function mountRequested() {
    for (const key of requested) mountOnce(key);
  }

  function nextBackgroundKey(): BootHiddenOverlayKey | null {
    return BACKGROUND_ORDER.find((key) => !mounted.has(key)) ?? null;
  }

  function scheduleBackground() {
    cancelBackgroundIdle();
    const generation = ++backgroundGeneration;
    if (stopped || !catalog) return;
    const key = nextBackgroundKey();
    if (!key) return;
    cancelBackgroundIdle = scheduleInteractionIdle(() => {
      if (generation !== backgroundGeneration) return;
      mountOnce(key);
      scheduleBackground();
    });
  }

  function loadCatalog(): Promise<OverlayCatalog> {
    catalogPromise ??= loadChunk()
      .then((module) => {
        if (stopped) return module;
        catalog = module;
        foregroundDemandPending = false;
        mountRequested();
        scheduleBackground();
        return module;
      })
      .catch((err) => {
        catalogPromise = null;
        console.error('Boot-hidden overlay chunk failed to load:', err);
        if (!stopped && foregroundDemandPending) {
          foregroundDemandPending = false;
          void loadCatalog().catch(() => {});
        } else if (!stopped && idleRetriesLeft > 0) {
          idleRetriesLeft -= 1;
          cancelBootIdle();
          cancelBootIdle = scheduleIdle(() => {
            void loadCatalog().catch(() => {});
          });
        }
        throw err;
      });
    return catalogPromise;
  }

  cancelBootIdle = scheduleIdle(() => {
    void loadCatalog().catch(() => {});
  });

  return {
    demand(key) {
      if (stopped) return;
      if (key === 'aiResult') requested.add('aiWaiting');
      requested.add(key);
      cancelBackgroundIdle();
      backgroundGeneration += 1;
      if (catalog) {
        mountRequested();
        scheduleBackground();
        return;
      }
      cancelBootIdle();
      foregroundDemandPending = true;
      void loadCatalog().catch(() => {});
    },
    stop() {
      stopped = true;
      backgroundGeneration += 1;
      cancelBootIdle();
      cancelBackgroundIdle();
    },
  };
}
