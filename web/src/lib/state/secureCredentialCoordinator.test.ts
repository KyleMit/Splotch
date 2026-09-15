// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';
import {
  createSecureCredentialCoordinator,
  type CredentialMirror,
} from './secureCredentialCoordinator';

function mirrorOf(state: { credential: string }): CredentialMirror {
  return {
    read: () => state.credential,
    write: (value) => {
      state.credential = value;
    },
  };
}

describe('createSecureCredentialCoordinator', () => {
  it('gives each coordinator an independent write queue', async () => {
    let finishFirstWrite!: () => void;
    const firstState = { credential: '' };
    const secondState = { credential: '' };
    const firstCoordinator = createSecureCredentialCoordinator(
      mirrorOf(firstState),
      () =>
        new Promise<void>((resolve) => {
          finishFirstWrite = resolve;
        })
    );
    const secondCoordinator = createSecureCredentialCoordinator(
      mirrorOf(secondState),
      async () => {}
    );

    const firstWrite = firstCoordinator.setCredential('first');
    await vi.waitFor(() => expect(finishFirstWrite).toBeTypeOf('function'));

    await expect(secondCoordinator.setCredential('second')).resolves.toBe(true);
    expect(secondState.credential).toBe('second');

    finishFirstWrite();
    await expect(firstWrite).resolves.toBe(true);
    expect(firstState.credential).toBe('first');
  });

  it('runs hydration after a secure write already in the queue', async () => {
    let finishWrite!: () => void;
    const events: string[] = [];
    const state = { credential: '' };
    const coordinator = createSecureCredentialCoordinator(
      mirrorOf(state),
      () =>
        new Promise<void>((resolve) => {
          finishWrite = () => {
            events.push('write');
            resolve();
          };
        })
    );

    const write = coordinator.setCredential('saved');
    await vi.waitFor(() => expect(finishWrite).toBeTypeOf('function'));
    const hydration = coordinator.runHydration(async () => {
      events.push('hydrate');
    });
    finishWrite();
    await Promise.all([write, hydration]);

    expect(events).toEqual(['write', 'hydrate']);
    expect(state.credential).toBe('saved');
  });

  it('invalidates hydration ownership when a newer write is issued', async () => {
    let finishHydration!: () => void;
    let ownsAfterWait = true;
    const state = { credential: '' };
    const coordinator = createSecureCredentialCoordinator(mirrorOf(state), async () => {});

    const hydration = coordinator.runHydration(
      (ownsHydration) =>
        new Promise<void>((resolve) => {
          finishHydration = () => {
            ownsAfterWait = ownsHydration();
            resolve();
          };
        })
    );
    await vi.waitFor(() => expect(finishHydration).toBeTypeOf('function'));
    const write = coordinator.setCredential('newer');
    finishHydration();
    await Promise.all([hydration, write]);

    expect(ownsAfterWait).toBe(false);
    expect(state.credential).toBe('newer');
  });
});

describe('createSecureCredentialCoordinator after a failed hydration', () => {
  it('keeps the stored secret when a save is abandoned mid-write', async () => {
    const state = { credential: '' };
    let storedSecret = 'stored-secret';
    let requestOwned = true;
    const coordinator = createSecureCredentialCoordinator(mirrorOf(state), async (value) => {
      storedSecret = value;
      requestOwned = false;
    });

    await expect(
      coordinator.runHydration(() => Promise.reject(new Error('secure storage unreadable')))
    ).rejects.toThrow('secure storage unreadable');
    await expect(coordinator.setCredential('abandoned', () => requestOwned)).resolves.toBe(false);

    expect(storedSecret).toBe('stored-secret');
  });

  it('keeps the stored secret when a recovery hydration is superseded by an abandoned save', async () => {
    const state = { credential: '' };
    let storedSecret = 'stored-secret';
    let requestOwned = true;
    const coordinator = createSecureCredentialCoordinator(mirrorOf(state), async (value) => {
      storedSecret = value;
      requestOwned = false;
    });
    await expect(
      coordinator.runHydration(() => Promise.reject(new Error('secure storage unreadable')))
    ).rejects.toThrow('secure storage unreadable');

    const recovery = coordinator.runHydration(async (ownsHydration) => {
      if (!ownsHydration()) return;
      state.credential = storedSecret;
    });
    const save = coordinator.setCredential('abandoned', () => requestOwned);
    await expect(recovery).resolves.toBeUndefined();
    await expect(save).resolves.toBe(false);

    expect(state.credential).toBe('');
    expect(storedSecret).toBe('stored-secret');
  });
});
