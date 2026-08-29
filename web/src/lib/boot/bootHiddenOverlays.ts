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
  settings: 'SettingsModal',
} as const satisfies Record<BootHiddenOverlayKey, keyof OverlayCatalog>;

export interface BootHiddenOverlays {
  demand(key: BootHiddenOverlayKey): void;
  stop(): void;
}

// The boot-hidden overlays (see components/overlayChunk.ts) stay in one lazy
// chunk so startup never evaluates their component graph (ADR-0049). Demand
// mounts a requested resident as soon as that catalog is available; unrelated
// residents mount one at a time only after interaction has gone quiet.
export function mountBootHiddenOverlays(
  onOverlay: (key: BootHiddenOverlayKey, overlay: Component) => void
): BootHiddenOverlays {
  let stopped = false;
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
    catalogPromise ??= import('$lib/components/overlayChunk')
      .then((module) => {
        if (stopped) return module;
        catalog = module;
        mountRequested();
        scheduleBackground();
        return module;
      })
      .catch((err) => {
        catalogPromise = null;
        console.error('Boot-hidden overlay chunk failed to load:', err);
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
