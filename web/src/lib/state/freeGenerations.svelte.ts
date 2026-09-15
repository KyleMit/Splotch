import { apiUrl } from '$lib/api';
import { INSTALLATION_ID_HEADER } from '$lib/apiHeaders';
import { FREE_GENERATION_LIMIT } from '$lib/freeGenerations';
import { createLatestRequest, type LatestRequest } from '$lib/latestRequest';
import {
  persistedStateStatus,
  type PersistedStateStatus,
} from '$lib/boot/persistedStateStatus.svelte';
import { webInstallationId } from './webInstallationId';
import { networkState, type NetworkState } from '$lib/state/network.svelte';
import { settingsState, type SettingsState } from '$lib/state/settings.svelte';

const INSTALLATION_NAMESPACE = 'splotch-free-generation-v1';
const INSTALLATION_ID_PATTERN = /^[a-f0-9]{64}$/;

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
  const bytes = new TextEncoder().encode(`${INSTALLATION_NAMESPACE}:${raw}`);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
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
  readonly loading: boolean;
  readonly available: boolean;
  setFreeGenerationsRemaining(remaining: number): void;
  setFreeGenerationsUnavailable(): void;
  grantRefreshReady(): boolean;
  createFreeGenerationGrantRefresher(): (event?: Event) => void;
}

export function createFreeGenerations({
  settings,
  network,
  persistedStateStatus,
}: FreeGenerationsDeps): FreeGenerationsState {
  const s = $state({
    remaining: FREE_GENERATION_LIMIT,
    loading: true,
    available: false,
  });

  const freeGenerationGrantRequest = createLatestRequest();

  function setFreeGenerationsRemaining(remaining: number): void {
    s.remaining = Math.max(0, Math.min(FREE_GENERATION_LIMIT, Math.floor(remaining)));
    s.available = true;
    s.loading = false;
  }

  function setFreeGenerationsUnavailable(): void {
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

  return {
    get remaining() {
      return s.remaining;
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
    createFreeGenerationGrantRefresher() {
      let wasReady = false;
      let wasOnline = false;
      return (event) => {
        const ready = grantRefreshReady();
        const online = network.online;
        const returnedToApp =
          event?.type === 'visibilitychange' && document.visibilityState === 'visible';
        const shouldRearm =
          (ready && !wasReady) ||
          (online && !wasOnline) ||
          (returnedToApp && ready && online && !s.loading);
        wasReady = ready;
        wasOnline = online;
        if (!ready || !online) freeGenerationGrantRequest.cancel();
        if (shouldRearm && !s.available) s.loading = true;
        if (shouldRearm && ready && online && s.loading) {
          void refreshFreeGenerationGrant(freeGenerationGrantRequest);
        } else if (persistedStateStatus.hydrated && !ready) {
          setFreeGenerationsUnavailable();
        }
      };
    },
  };
}

export const freeGenerationsState = createFreeGenerations({
  settings: settingsState,
  network: networkState,
  persistedStateStatus,
});

export const {
  setFreeGenerationsRemaining,
  setFreeGenerationsUnavailable,
  createFreeGenerationGrantRefresher,
} = freeGenerationsState;
