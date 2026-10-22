import { vi } from 'vitest';

export function makeRegistration({
  waiting = null as ServiceWorker | null,
  installing = null as ServiceWorker | null,
} = {}) {
  return {
    update: vi.fn().mockResolvedValue(undefined),
    waiting,
    installing,
    addEventListener: vi.fn(),
  } as unknown as ServiceWorkerRegistration;
}

export function makeWorker() {
  return {
    state: 'installed',
    postMessage: vi.fn(),
    addEventListener: vi.fn(),
  };
}

export function stubServiceWorker(reg?: ServiceWorkerRegistration) {
  const container = {
    ready: new Promise(() => {}), // never resolves — keeps test side-effect-free
    getRegistration: vi.fn().mockResolvedValue(reg),
    register: vi.fn().mockResolvedValue(undefined),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
  Object.defineProperty(navigator, 'serviceWorker', {
    value: container,
    configurable: true,
    writable: true,
  });
  return container;
}

export function stubDeployedVersion(version: string | null) {
  globalThis.fetch =
    version === null
      ? vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
      : (vi.fn().mockResolvedValue({
          ok: true,
          json: () => Promise.resolve({ version }),
        } as Response) as typeof fetch);
}

export function stubReloadableLocation() {
  Object.defineProperty(window, 'location', {
    value: { href: 'https://splotch.art/', reload: vi.fn() },
    writable: true,
    configurable: true,
  });
}

export function setDocumentVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
}

export function restoreDocumentVisibility() {
  Reflect.deleteProperty(document, 'visibilityState');
}

export function controllerChangeListeners(container: {
  addEventListener: ReturnType<typeof vi.fn>;
}) {
  return container.addEventListener.mock.calls
    .filter(([type]) => type === 'controllerchange')
    .map(([, listener]) => listener as EventListener);
}
