import { apiUrl } from '$lib/api';
import { INSTALLATION_ID_HEADER } from '$lib/apiHeaders';
import { sha256Hex } from '$lib/digestHex';
import { FREE_GENERATION_LIMIT, isInstallationId } from '$lib/freeGenerations';
import { createLatestRequest, type LatestRequest } from '$lib/latestRequest';
import { readString, STORAGE_KEYS, writeString } from '$lib/storage';
import {
  persistedStateStatus,
  type PersistedStateStatus,
} from '$lib/boot/persistedStateStatus.svelte';
import { webInstallationId } from './webInstallationId';
import { networkState, type NetworkState } from '$lib/state/network.svelte';
import { settingsState, type SettingsState } from '$lib/state/settings.svelte';

const INSTALLATION_NAMESPACE = 'splotch-free-generation-v1';
const BADGE_UNAVAILABLE = 'unavailable';

function cachedBadgeRemaining(): number | null {
  const raw = readString(STORAGE_KEYS.freeGenerationBadgeHint, null);
  if (raw === BADGE_UNAVAILABLE) return null;
  if (raw === null) return FREE_GENERATION_LIMIT;
  if (raw === '') return FREE_GENERATION_LIMIT;
  const count = Number(raw);
  return Number.isInteger(count) && count >= 0 && count <= FREE_GENERATION_LIMIT
    ? count
    : FREE_GENERATION_LIMIT;
}

let installationIdPromise: Promise<string> | null = null;

async function rawInstallationId(): Promise<string> {
  if (__IS_CAPACITOR__) {
    const { Device } = await import('@capacitor/device');
    return (await Device.getId()).identifier;
  }
  return webInstallationId();
}

async function createInstallationId(): Promise<string> {
  const raw = await rawInstallationId();
  return sha256Hex(new TextEncoder().encode(`${INSTALLATION_NAMESPACE}:${raw}`));
}

// A memoized promise that resets itself on rejection, so a failed derivation is
// retried rather than replayed.
export function installationId(): Promise<string> {
  installationIdPromise ??= createInstallationId().catch((error: unknown) => {
    installationIdPromise = null;
    throw error;
  });
  return installationIdPromise;
}

async function fetchGrantRemaining(id: string, signal: AbortSignal): Promise<number> {
  if (!isInstallationId(id)) throw new Error('Invalid installation identifier');
  const response = await fetch(apiUrl('/api/free-generation-grant'), {
    headers: { [INSTALLATION_ID_HEADER]: id },
    signal,
  });
  if (!response.ok) throw new Error('Grant status unavailable');
  const status: unknown = await response.json();
  if (
    typeof status !== 'object' ||
    status === null ||
    !('ok' in status) ||
    status.ok !== true ||
    !('remaining' in status) ||
    typeof status.remaining !== 'number' ||
    !Number.isFinite(status.remaining)
  ) {
    throw new Error('Invalid grant status');
  }
  return status.remaining;
}

interface FreeGenerationsDeps {
  // Whether a credential is held, never the credential itself: the grant only
  // needs to know whether the parent is on the free tier.
  settings: Pick<SettingsState, 'aiImageEnabled' | 'aiCredentialKind'>;
  network: NetworkState;
  persistedStateStatus: PersistedStateStatus;
}

// Only a grant the server answered carries a count. `loading` waits on
// hydration, connectivity, or the request in flight; `inactive` is AI switched
// off with no credential, when no grant is requested (ADR-0127); `unavailable`
// is a saved credential or a grant that could not be read.
export type FreeGenerationGrant =
  | { status: 'loading' }
  | { status: 'inactive' }
  | { status: 'unavailable' }
  | { status: 'available'; remaining: number };

export interface FreeGenerationsState {
  readonly grant: FreeGenerationGrant;
  // The count the latest grant answer this session reported, kept after the
  // grant stops being followed; null until one answers.
  readonly lastGrantRemaining: number | null;
  readonly badgeRemaining: number | null;
  setFreeGenerationsRemaining(remaining: number): void;
  setFreeGenerationsUnavailable(): void;
  // Public only for tests; production reads it through install()'s effect and
  // retryOnVisibleReturn().
  grantRefreshReady(): boolean;
  // Follows readiness and connectivity: a grant is requested whenever both hold
  // and none is known yet, and cancelled the moment either drops.
  install(): void;
  dispose(): void;
  // The one trigger that is an event rather than a state change: coming back to
  // a visible page retries a grant that failed, while ready and online.
  retryOnVisibleReturn(): void;
}

export function createFreeGenerations({
  settings,
  network,
  persistedStateStatus,
}: FreeGenerationsDeps): FreeGenerationsState {
  let grant = $state.raw<FreeGenerationGrant>({ status: 'loading' });
  let lastGrantRemaining = $state<number | null>(null);
  let badgeRemaining = $state(cachedBadgeRemaining());
  // followEligibility reads this, never `grant`. The effect writes `grant`
  // itself, each write a fresh object, so reading it there re-runs the effect
  // until Svelte aborts with effect_update_depth_exceeded. This boolean changes
  // only when a grant becomes known or stops being known.
  const grantKnown = $derived(grant.status === 'available');

  const freeGenerationGrantRequest = createLatestRequest();
  let stopEffects: (() => void) | null = null;

  function setFreeGenerationsRemaining(count: number): void {
    const remaining = Math.max(0, Math.min(FREE_GENERATION_LIMIT, Math.floor(count)));
    grant = { status: 'available', remaining };
    lastGrantRemaining = remaining;
    badgeRemaining = remaining;
    writeString(STORAGE_KEYS.freeGenerationBadgeHint, String(remaining));
  }

  function setFreeGenerationsUnavailable(): void {
    grant = { status: 'unavailable' };
    badgeRemaining = null;
    writeString(STORAGE_KEYS.freeGenerationBadgeHint, BADGE_UNAVAILABLE);
  }

  function setFreeGenerationsInactive(): void {
    grant = { status: 'inactive' };
  }

  function grantRefreshReady(): boolean {
    return (
      persistedStateStatus.hydrated &&
      settings.aiImageEnabled &&
      settings.aiCredentialKind() === 'none'
    );
  }

  async function refreshFreeGenerationGrant(latest: LatestRequest): Promise<void> {
    const request = latest.begin();
    try {
      const id = await installationId();
      if (!latest.isCurrent(request.id)) return;
      const remaining = await fetchGrantRemaining(id, request.signal);
      if (latest.isCurrent(request.id)) {
        setFreeGenerationsRemaining(remaining);
      }
    } catch {
      if (latest.isCurrent(request.id)) setFreeGenerationsUnavailable();
    }
  }

  function requestGrant() {
    grant = { status: 'loading' };
    void refreshFreeGenerationGrant(freeGenerationGrantRequest);
  }

  // Re-runs when readiness, connectivity, or whether a grant is known changes.
  // A failed request moves from loading to unavailable, neither of them known,
  // so a failure alone never re-runs this: the next attempt waits for a
  // reconnect, a settings change, or a visible return.
  function followEligibility() {
    const ready = grantRefreshReady();
    const online = network.online;
    if (!ready || !online) {
      freeGenerationGrantRequest.cancel();
      if (persistedStateStatus.hydrated && !ready) {
        if (settings.aiCredentialKind() !== 'none') setFreeGenerationsUnavailable();
        else setFreeGenerationsInactive();
      }
      return;
    }
    if (grantKnown) return;
    requestGrant();
  }

  return {
    get grant() {
      return grant;
    },
    get lastGrantRemaining() {
      return lastGrantRemaining;
    },
    get badgeRemaining() {
      return badgeRemaining;
    },
    setFreeGenerationsRemaining,
    setFreeGenerationsUnavailable,
    grantRefreshReady,
    install() {
      stopEffects ??= $effect.root(() => {
        $effect(followEligibility);
      });
    },
    dispose() {
      stopEffects?.();
      stopEffects = null;
      freeGenerationGrantRequest.cancel();
    },
    // Only a grant that failed is retried here: one in flight keeps its request,
    // and a known grant needs none. Offline or not ready, there is nothing to
    // retry into, and a hidden page is not a return.
    retryOnVisibleReturn() {
      if (document.visibilityState !== 'visible') return;
      if (!grantRefreshReady() || !network.online) return;
      if (grant.status === 'loading' || grant.status === 'available') return;
      requestGrant();
    },
  };
}

export const freeGenerationsState = createFreeGenerations({
  settings: settingsState,
  network: networkState,
  persistedStateStatus,
});

export const { setFreeGenerationsRemaining, setFreeGenerationsUnavailable, retryOnVisibleReturn } =
  freeGenerationsState;

// Installed at module load (no component host): the grant follows readiness
// from the moment the module is part of a route, which is when a surface that
// shows it first imports it. Client-only: effects never run during SSR anyway.
if (typeof document !== 'undefined') freeGenerationsState.install();
