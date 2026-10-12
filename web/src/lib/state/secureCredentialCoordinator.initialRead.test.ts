// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { UnreadableSecretError } from '../secureStorage';
import { STORAGE_KEYS } from '../storage';
import { createSecureCredentialCoordinator } from './secureCredentialCoordinator';

const CREDENTIALS = [
  { name: 'API key', legacyKey: STORAGE_KEYS.legacyAiUserApiKey },
  { name: 'access code', legacyKey: STORAGE_KEYS.legacyAiAccessToken },
] as const;

type ReadOutcome = 'valid' | 'absent' | 'unreadable' | 'transient';
const READ_OUTCOMES: ReadOutcome[] = ['valid', 'absent', 'unreadable', 'transient'];

function fixture(legacyKey: (typeof CREDENTIALS)[number]['legacyKey'], outcome: ReadOutcome) {
  let live = '';
  let stored: string | null = outcome === 'absent' ? null : 'stored-credential';
  let owned = true;
  let abandonOnPersist = false;
  const writes: string[] = [];
  const reading = Promise.withResolvers<void>();
  const releaseRead = Promise.withResolvers<void>();
  const coordinator = createSecureCredentialCoordinator(
    {
      read: () => live,
      write: (value) => {
        live = value;
      },
    },
    async (value) => {
      writes.push(value);
      stored = value || null;
      if (abandonOnPersist) owned = false;
    }
  );
  const load = async () => {
    const seen = stored;
    reading.resolve();
    await releaseRead.promise;
    if (outcome === 'unreadable') throw new UnreadableSecretError('unreadable physical row');
    if (outcome === 'transient') throw new Error('transient physical read');
    return outcome === 'absent' ? null : seen;
  };
  return {
    coordinator,
    legacyKey,
    load,
    reading,
    releaseRead,
    writes,
    owns: () => owned,
    abandonAfterPersist: () => {
      abandonOnPersist = true;
    },
    live: () => live,
    stored: () => stored,
  };
}

describe.each(CREDENTIALS)('$name initial physical read', ({ legacyKey }) => {
  it.each(READ_OUTCOMES)(
    'keeps later owned saves and clear available after a superseded %s read',
    async (outcome) => {
      const state = fixture(legacyKey, outcome);
      const hydration = state.coordinator.hydrate({ load: state.load, legacyKey });
      const settled = hydration.catch((error: unknown) => error);
      await state.reading.promise;
      const saving = state.coordinator.setCredential('verified-key', state.owns);
      state.releaseRead.resolve();
      const hydrationResult = await settled;
      const expectedHydration =
        outcome === 'unreadable'
          ? new UnreadableSecretError('unreadable physical row')
          : outcome === 'transient'
            ? new Error('transient physical read')
            : undefined;
      expect(hydrationResult).toEqual(expectedHydration);
      expect(hydrationResult instanceof UnreadableSecretError).toBe(outcome === 'unreadable');
      const permitted = outcome !== 'transient';
      await expect(saving).resolves.toBe(permitted);
      await expect(state.coordinator.setCredential('later-key')).resolves.toBe(permitted);
      await expect(state.coordinator.setCredential('')).resolves.toBe(permitted);
      expect(state.live()).toBe('');
      expect(state.stored()).toBe(permitted ? null : 'stored-credential');
      expect(state.writes).toEqual(permitted ? ['verified-key', 'later-key', ''] : []);
    }
  );

  it.each(READ_OUTCOMES)(
    'uses physical proof when a save overlapping the first %s read loses ownership after persistence',
    async (outcome) => {
      const state = fixture(legacyKey, outcome);
      const hydration = state.coordinator.hydrate({ load: state.load, legacyKey });
      const settled = hydration.catch(() => undefined);
      await state.reading.promise;
      state.abandonAfterPersist();
      const saving = state.coordinator.setCredential('abandoned-key', state.owns);
      state.releaseRead.resolve();
      await settled;
      await expect(saving).resolves.toBe(false);
      expect(state.live()).toBe('');
      const prior = outcome === 'valid' || outcome === 'transient' ? 'stored-credential' : null;
      expect(state.stored()).toBe(prior);
      const rollback = outcome === 'valid' ? 'stored-credential' : '';
      expect(state.writes).toEqual(outcome === 'transient' ? [] : ['abandoned-key', rollback]);
    }
  );

  it.each(READ_OUTCOMES)(
    'establishes a protected recovery baseline after a prior unknown slot and superseded %s read',
    async (outcome) => {
      const state = fixture(legacyKey, outcome);
      await expect(
        state.coordinator.runHydration(() => Promise.reject(new Error('earlier read failed')))
      ).rejects.toThrow('earlier read failed');
      const hydration = state.coordinator.hydrate({ load: state.load, legacyKey });
      const settled = hydration.catch(() => undefined);
      await state.reading.promise;
      state.abandonAfterPersist();
      const saving = state.coordinator.setCredential('abandoned-key', state.owns);
      state.releaseRead.resolve();
      await settled;
      await expect(saving).resolves.toBe(false);
      expect(state.live()).toBe('');
      const prior = outcome === 'valid' || outcome === 'transient' ? 'stored-credential' : null;
      expect(state.stored()).toBe(prior);
      expect(state.writes).toEqual(
        outcome === 'transient'
          ? []
          : ['abandoned-key', outcome === 'valid' ? 'stored-credential' : '']
      );
    }
  );

  it.each(READ_OUTCOMES)(
    'preserves the prior owned baseline when a later %s read is superseded',
    async (outcome) => {
      const state = fixture(legacyKey, outcome);
      await expect(state.coordinator.setCredential('owned-baseline')).resolves.toBe(true);
      const hydration = state.coordinator.hydrate({
        load: async () => {
          const result = await state.load();
          return outcome === 'valid' ? 'different-read-value' : result;
        },
        legacyKey,
      });
      const settled = hydration.catch(() => undefined);
      await state.reading.promise;
      state.abandonAfterPersist();
      const saving = state.coordinator.setCredential('abandoned-key', state.owns);
      state.releaseRead.resolve();
      await settled;
      await expect(saving).resolves.toBe(false);
      expect(state.live()).toBe('owned-baseline');
      expect(state.stored()).toBe('owned-baseline');
      expect(state.writes).toEqual(['owned-baseline', 'abandoned-key', 'owned-baseline']);
    }
  );
});
