// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';
import { createSecureCredentialCoordinator } from './secureCredentialCoordinator';

describe('createSecureCredentialCoordinator', () => {
  it('gives each coordinator an independent write queue', async () => {
    let finishFirstWrite!: () => void;
    const firstState = { credential: '' };
    const secondState = { credential: '' };
    const firstCoordinator = createSecureCredentialCoordinator(
      firstState,
      'credential',
      () =>
        new Promise<void>((resolve) => {
          finishFirstWrite = resolve;
        })
    );
    const secondCoordinator = createSecureCredentialCoordinator(
      secondState,
      'credential',
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
      state,
      'credential',
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
    const coordinator = createSecureCredentialCoordinator(state, 'credential', async () => {});

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
