import { apiUrl } from '$lib/api';
import { INSTALLATION_ID_HEADER } from '$lib/apiHeaders';
import { FREE_GENERATION_LIMIT, type FreeGenerationGrantStatus } from '$lib/freeGenerations';
import { persistedStateStatus } from '$lib/boot/persistedStateStatus.svelte';
import { network } from '$lib/state/network.svelte';
import { settings } from '$lib/state/settings.svelte';

const WEB_INSTALLATION_KEY = 'splotch-free-generation-installation-v1';
const INSTALLATION_NAMESPACE = 'splotch-free-generation-v1';
const INSTALLATION_ID_PATTERN = /^[a-f0-9]{64}$/;

export const freeGenerations = $state({
  remaining: FREE_GENERATION_LIMIT,
  loading: true,
  available: false,
});

let installationIdPromise: Promise<string> | null = null;

function webInstallationId(): string {
  try {
    const existing = localStorage.getItem(WEB_INSTALLATION_KEY);
    if (existing) return existing;
    const created = crypto.randomUUID();
    localStorage.setItem(WEB_INSTALLATION_KEY, created);
    return created;
  } catch {
    return crypto.randomUUID();
  }
}

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

export function installationId(): Promise<string> {
  installationIdPromise ??= createInstallationId().catch((error: unknown) => {
    installationIdPromise = null;
    throw error;
  });
  return installationIdPromise;
}

export function setFreeGenerationsRemaining(remaining: number): void {
  freeGenerations.remaining = Math.max(0, Math.min(FREE_GENERATION_LIMIT, Math.floor(remaining)));
  freeGenerations.available = true;
  freeGenerations.loading = false;
}

export function setFreeGenerationsUnavailable(): void {
  freeGenerations.available = false;
  freeGenerations.loading = false;
}

export function createFreeGenerationGrantRefresher(): () => void {
  let wasReady = false;
  let wasOnline = false;
  return () => {
    const ready = grantRefreshReady();
    const online = network.online;
    const shouldRearm = (ready && !wasReady) || (online && !wasOnline);
    wasReady = ready;
    wasOnline = online;
    if (shouldRearm && !freeGenerations.available) freeGenerations.loading = true;
    if (ready && online && freeGenerations.loading) {
      void refreshFreeGenerationGrant();
    } else if (persistedStateStatus.hydrated && !ready) {
      setFreeGenerationsUnavailable();
    }
  };
}

export function grantRefreshReady(): boolean {
  return (
    persistedStateStatus.hydrated &&
    settings.aiImageEnabled &&
    !settings.aiUserApiKey &&
    !settings.aiAccessToken
  );
}

async function refreshFreeGenerationGrant(): Promise<void> {
  try {
    const id = await installationId();
    if (!INSTALLATION_ID_PATTERN.test(id)) throw new Error('Invalid installation identifier');
    const response = await fetch(apiUrl('/api/free-generation-grant'), {
      headers: { [INSTALLATION_ID_HEADER]: id },
    });
    if (!response.ok) throw new Error('Grant status unavailable');
    const status = (await response.json()) as FreeGenerationGrantStatus;
    if (status.ok) setFreeGenerationsRemaining(status.remaining);
  } catch {
    setFreeGenerationsUnavailable();
  }
}
