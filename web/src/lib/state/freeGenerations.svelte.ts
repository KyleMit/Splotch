import { apiUrl } from '$lib/api';
import { INSTALLATION_ID_HEADER } from '$lib/apiHeaders';
import { sha256Hex } from '$lib/digestHex';
import { FREE_GENERATION_LIMIT } from '$lib/freeGenerations';
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
const INSTALLATION_ID_PATTERN = /^[a-f0-9]{64}$/;
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

interface FreeGenerationsDeps {
  settings: SettingsState;
  network: NetworkState;
  persistedStateStatus: PersistedStateStatus;
}

export interface FreeGenerationsState {
  readonly remaining: number;
  readonly badgeRemaining: number | null;
  readonly loading: boolean;
  readonly available: boolean;
  setFreeGenerationsRemaining(remaining: number): void;
  setFreeGenerationsUnavailable(): void;
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
  const s = $state({
    remaining: FREE_GENERATION_LIMIT,
    badgeRemaining: cachedBadgeRemaining(),
    loading: true,
    available: false,
  });

  const freeGenerationGrantRequest = createLatestRequest();
  let stopEffects: (() => void) | null = null;

  function setFreeGenerationsRemaining(remaining: number): void {
    s.remaining = Math.max(0, Math.min(FREE_GENERATION_LIMIT, Math.floor(remaining)));
    s.badgeRemaining = s.remaining;
    writeString(STORAGE_KEYS.freeGenerationBadgeHint, String(s.remaining));
    s.available = true;
    s.loading = false;
  }

  function setFreeGenerationsUnavailable(): void {
    s.badgeRemaining = null;
    writeString(STORAGE_KEYS.freeGenerationBadgeHint, BADGE_UNAVAILABLE);
    s.available = false;
    s.loading = false;
  }

  function setFreeGenerationsInactive(): void {
    s.available = false;
    s.loading = false;
  }

  function grantRefreshReady(): boolean {
    return (
      persistedStateStatus.hydrated &&
      settings.aiImageEnabled &&
      !settings.aiUserApiKey &&
      !settings.aiAccessToken
    );
  }

  async function refreshFreeGenerationGrant(latest: LatestRequest): Promise<void> {
    const request = latest.begin();
    try {
      const id = await installationId();
      if (!latest.isCurrent(request.id)) return;
      if (!INSTALLATION_ID_PATTERN.test(id)) throw new Error('Invalid installation identifier');
      const response = await fetch(apiUrl('/api/free-generation-grant'), {
        headers: { [INSTALLATION_ID_HEADER]: id },
        signal: request.signal,
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
      if (latest.isCurrent(request.id)) {
        setFreeGenerationsRemaining(status.remaining);
      }
    } catch {
      if (latest.isCurrent(request.id)) setFreeGenerationsUnavailable();
    }
  }

  function requestGrant() {
    s.loading = true;
    void refreshFreeGenerationGrant(freeGenerationGrantRequest);
  }

  // Re-runs when readiness, connectivity, or the known grant changes. A failed
  // request leaves `available` false without changing it, so a failure alone
  // never re-runs this: the next attempt waits for a reconnect, a settings
  // change, or a visible return.
  function followEligibility() {
    const ready = grantRefreshReady();
    const online = network.online;
    if (!ready || !online) {
      freeGenerationGrantRequest.cancel();
      if (persistedStateStatus.hydrated && !ready) {
        if (settings.aiUserApiKey || settings.aiAccessToken) setFreeGenerationsUnavailable();
        else setFreeGenerationsInactive();
      }
      return;
    }
    if (s.available) return;
    requestGrant();
  }

  return {
    get remaining() {
      return s.remaining;
    },
    get badgeRemaining() {
      return s.badgeRemaining;
    },
    get loading() {
      return s.loading;
    },
    get available() {
      return s.available;
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
      if (!grantRefreshReady() || !network.online || s.loading || s.available) return;
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
