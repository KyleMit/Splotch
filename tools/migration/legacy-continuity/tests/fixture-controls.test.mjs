import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { digest, heldNamespaceConfiguration, sourceConfiguration } from '../contract.mjs';

const ROOT = resolve(import.meta.dirname, '../../../..');
const NONCE = 'a'.repeat(32);
const FOREIGN_NONCE = 'b'.repeat(32);
const source = (path) => readFileSync(join(ROOT, path), 'utf8');
const template = (name) => source(`tools/migration/legacy-continuity/templates/${name}`);

function evaluate(bytes, dependencies, globals) {
  const module = { exports: {} };
  const javascript = ts.transpileModule(bytes, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  runInNewContext(javascript, {
    module,
    exports: module.exports,
    require(name) {
      if (!(name in dependencies)) throw new Error(`L0_TEST_MODULE_UNEXPECTED: ${name}`);
      return dependencies[name];
    },
    ...globals,
  });
  return module.exports;
}

function configuration() {
  const picture = readFileSync(join(ROOT, 'web/static/favicon-96x96.png'));
  return {
    ...sourceConfiguration(
      'held',
      source('web/src/lib/storageKeys.ts'),
      source('web/src/lib/secureStorage.ts'),
      readFileSync(join(import.meta.dirname, 'fixtures/released-storageKeys.ts.txt'), 'utf8')
    ),
    heldNamespace: heldNamespaceConfiguration(source('web/src/lib/drawing/unsavedPictureStore.ts')),
    picture: { bytes: picture.length, sha256: digest(picture), base64: picture.toString('base64') },
  };
}

function ownedPicture(config) {
  const text = (value) => ({ kind: 'string', value });
  return {
    status: 'recognized-source',
    complete: true,
    count: 1,
    key: config.heldNamespace.key,
    entryCount: 1,
    recognized: [true],
    raw: {
      kind: 'array',
      fields: {
        length: { kind: 'number', value: '1' },
        0: {
          kind: 'object',
          fields: {
            baseName: text(`l0-${NONCE}`),
            signature: text(`l0-${NONCE}`),
            type: text('image/png'),
            outcome: text('denied'),
            bytes: { kind: 'buffer', ...config.picture },
          },
        },
      },
    },
  };
}

function ownedUndefined(config) {
  return {
    status: 'invalid-source',
    complete: true,
    count: 1,
    key: config.heldNamespace.key,
    entryCount: 1,
    recognized: [false],
    raw: { kind: 'undefined' },
  };
}

function sandbox() {
  const config = configuration();
  const events = [];
  const native = new Map([[config.ownerKey, NONCE]]);
  const local = new Map([[config.unrelatedKey, `unrelated-${NONCE}`]]);
  const state = { held: ownedPicture(config), writes: [], warnings: [] };
  const keys = evaluate(source('web/src/lib/storageKeys.ts'), {}, {});
  const storage = evaluate(
    source('web/src/lib/storage.ts'),
    {
      '$app/environment': { browser: true },
      '$lib/platform': { isNative: () => false },
      './storageKeys': keys,
      './nativePlugin': {
        lazyPluginModule: () => () => {
          throw new Error('L0_TEST_NATIVE_UNEXPECTED');
        },
      },
    },
    {
      __IS_CAPACITOR__: false,
      localStorage: {
        getItem: (key) => local.get(key) ?? null,
        setItem: (key, value) => local.set(key, value),
        removeItem(key) {
          events.push(['local-remove', key]);
          if (state.removeFailure) throw new Error('L0_TEST_LOCAL_REMOVE_FAILED');
          local.delete(key);
        },
      },
      console: { warn: (...values) => state.warnings.push(values) },
    }
  );
  const heldOwner = evaluate(
    template('held-main.ts.template'),
    {
      '$lib/storage': storage,
      './fixture-config': { fixtureConfig: config },
      '$lib/drawing/unsavedPictureStore': {
        isStoredPicture: () => true,
        createUnsavedPictureStore: () => ({
          async write(values) {
            events.push('held-write');
            if (state.writeFailure) throw new Error('L0_TEST_WRITER_FAILED');
            state.writes.push(values);
            state.held = ownedPicture(config);
          },
        }),
      },
    },
    { Blob, Uint8Array, atob }
  );
  const preferences = {
    async get({ key }) {
      events.push(['get', key]);
      return { value: native.get(key) ?? null };
    },
    async set({ key, value }) {
      events.push(['set', key, value]);
      native.set(key, value);
    },
    async remove({ key }) {
      events.push(['remove', key]);
      if (state.retireFailure) throw new Error('L0_TEST_MARKER_REMOVE_FAILED');
      native.delete(key);
    },
  };
  const reader = {
    async readHeldRaw() {
      events.push('held-read');
      if (state.writes.length && state.readback) return state.readback();
      return state.held;
    },
    async putUndefinedHeldControl() {
      events.push('undefined-start');
      state.transactionStarted?.resolve();
      if (state.transaction) await state.transaction;
      state.held = ownedUndefined(config);
      events.push('undefined-complete');
    },
  };
  const fixture = evaluate(
    template('fixture.ts.template'),
    {
      '@capacitor/core': {
        registerPlugin: () => ({
          async observe() {
            return {
              platform: 'android',
              bundleId: 'art.splotch.app',
              preferences: Object.fromEntries(
                config.observedKeys
                  .filter((key) => key !== state.omitObservedKey)
                  .map((key) => [
                    key,
                    native.has(key)
                      ? { kind: 'string', value: native.get(key) }
                      : { kind: 'absent', value: null },
                  ])
              ),
              vault: Object.fromEntries(
                config.vaultAccounts.map((key) => [key, { confirmedAbsent: true }])
              ),
            };
          },
        }),
      },
      '@capacitor/preferences': { Preferences: preferences },
      '$lib/platform': { isNative: () => true },
      '$lib/storage': storage,
      '$lib/secureStorage': {},
      './fixture-config': { fixtureConfig: config },
      './held-reader': reader,
      './held-owner': heldOwner,
      './settings-parser': {
        async parsedSettings() {
          events.push('settings-parse');
          if (state.parserFailure) throw new Error('L0_TEST_PARSER_FAILED');
          return { parsed: true };
        },
      },
    },
    {
      location: {
        pathname: config.path,
        origin: 'https://localhost',
        href: `https://localhost${config.path}`,
      },
      document: { documentElement: { hasAttribute: () => false } },
      localStorage: { getItem: (key) => local.get(key) ?? null },
    }
  );
  return { config, events, native, local, state, keys, run: fixture.runFixtureCommand };
}

async function initialized() {
  const value = sandbox();
  await value.run('raw', NONCE);
  value.events.length = 0;
  return value;
}

describe('actual held fixture control sequencing with finite IO doubles', () => {
  it('requires a complete raw snapshot and fresh document for parser activation', async () => {
    const value = sandbox();
    await expect(value.run('parse', NONCE)).rejects.toThrow(/L0_RAW_SNAPSHOT_REQUIRED/);
    expect(value.events).not.toContain('settings-parse');
    await value.run('raw', NONCE);
    expect((await value.run('parse', NONCE)).result).toEqual({ parsed: true });
    await expect(value.run('parse', NONCE)).rejects.toThrow(/L0_PARSE_REQUIRES_FRESH_DOCUMENT/);
    expect(value.events.filter((event) => event === 'settings-parse')).toHaveLength(1);
    const restored = await initialized();
    expect((await restored.run('parse', NONCE)).result).toEqual({ parsed: true });
  });

  it('retains a real parser rejection until the fresh-document positive', async () => {
    const value = await initialized();
    value.state.parserFailure = true;
    await expect(value.run('parse', NONCE)).rejects.toThrow(/L0_TEST_PARSER_FAILED/);
    await expect(value.run('parse', NONCE)).rejects.toThrow(/L0_PARSE_REQUIRES_FRESH_DOCUMENT/);
    const restored = await initialized();
    expect((await restored.run('parse', NONCE)).result).toEqual({ parsed: true });
  });

  it('refuses an omitted native control marker and restores the complete raw snapshot', async () => {
    const value = sandbox();
    value.state.omitObservedKey = value.config.heldUndefinedOwnerKey;
    await expect(value.run('raw', NONCE)).rejects.toThrow(/L0_INCOMPLETE_NATIVE_OBSERVATION/);
    await expect(value.run('held-undefined', NONCE)).rejects.toThrow(/L0_RAW_SNAPSHOT_REQUIRED/);
    value.state.omitObservedKey = null;
    expect(
      (await value.run('raw', NONCE)).result.observation.preferences[
        value.config.heldUndefinedOwnerKey
      ]
    ).toEqual({ kind: 'absent', value: null });
  });

  it('requires the raw snapshot before issuing any undefined control', async () => {
    const value = sandbox();
    await expect(value.run('held-undefined', NONCE)).rejects.toThrow(/L0_RAW_SNAPSHOT_REQUIRED/);
    expect(value.native.has(value.config.heldUndefinedOwnerKey)).toBe(false);
    expect(value.events).toEqual([]);
  });

  it('issues the Preferences-only marker after the transaction barrier', async () => {
    const value = await initialized();
    const transaction = Promise.withResolvers();
    const started = Promise.withResolvers();
    value.state.transaction = transaction.promise;
    value.state.transactionStarted = started;
    const command = value.run('held-undefined', NONCE);
    await started.promise;
    expect(value.native.has(value.config.heldUndefinedOwnerKey)).toBe(false);
    transaction.resolve();
    expect((await command).result).toEqual(ownedUndefined(value.config));
    expect(value.events.indexOf('undefined-complete')).toBeLessThan(
      value.events.findIndex((event) => event[0] === 'set')
    );
    expect(value.native.get(value.config.heldUndefinedOwnerKey)).toBe(NONCE);
    expect(value.local.has(value.config.heldUndefinedOwnerKey)).toBe(false);
  });

  it('refuses an already issued marker and restores the absent-marker positive', async () => {
    const value = await initialized();
    value.native.set(value.config.heldUndefinedOwnerKey, FOREIGN_NONCE);
    await expect(value.run('held-undefined', NONCE)).rejects.toThrow(
      /L0_HELD_CONTROL_MARKER_REQUIRES_ABSENCE/
    );
    expect(value.events).not.toContain('undefined-start');
    value.native.delete(value.config.heldUndefinedOwnerKey);
    expect((await value.run('held-undefined', NONCE)).result).toEqual(ownedUndefined(value.config));
  });

  it.each([null, FOREIGN_NONCE])(
    'refuses an unissued or foreign restoration marker %s',
    async (marker) => {
      const value = await initialized();
      if (marker !== null) value.native.set(value.config.heldUndefinedOwnerKey, marker);
      value.state.held = ownedUndefined(value.config);
      await expect(value.run('held-restore-undefined', NONCE)).rejects.toThrow(
        /L0_HELD_RESTORE_MARKER_MISMATCH/
      );
      expect(value.state.writes).toEqual([]);
      expect(value.native.get(value.config.heldUndefinedOwnerKey) ?? null).toBe(marker);
    }
  );

  it.each([
    ['absent', { status: 'absent-record', count: 0 }],
    ['incomplete', { complete: false }],
    ['multiple', { count: 2 }],
    ['wrong key', { key: 'foreign' }],
    ['wrong recognition', { recognized: [true] }],
    ['null', { raw: { kind: 'null' } }],
    ['extra entry', { entryCount: 2 }],
  ])('refuses restoration over %s instead of replacing it', async (_name, changed) => {
    const value = await initialized();
    value.native.set(value.config.heldUndefinedOwnerKey, NONCE);
    value.state.held = { ...ownedUndefined(value.config), ...changed };
    await expect(value.run('held-restore-undefined', NONCE)).rejects.toThrow(
      /L0_HELD_RESTORE_REQUIRES_OWNED_UNDEFINED/
    );
    expect(value.state.writes).toEqual([]);
    expect(value.native.get(value.config.heldUndefinedOwnerKey)).toBe(NONCE);
  });

  it('runs the actual seedHeld Blob helper and waits for exact readback before marker retirement', async () => {
    const value = await initialized();
    await value.run('held-undefined', NONCE);
    const readback = Promise.withResolvers();
    const reached = Promise.withResolvers();
    value.state.readback = () => {
      reached.resolve();
      return readback.promise;
    };
    const command = value.run('held-restore-undefined', NONCE);
    await reached.promise;
    expect(value.native.get(value.config.heldUndefinedOwnerKey)).toBe(NONCE);
    readback.resolve(ownedPicture(value.config));
    expect((await command).result).toEqual(ownedPicture(value.config));
    const [picture] = value.state.writes[0];
    expect({ ...picture, blob: undefined }).toEqual({
      blob: undefined,
      baseName: `l0-${NONCE}`,
      outcome: 'denied',
      signature: `l0-${NONCE}`,
    });
    expect(picture.blob.type).toBe('image/png');
    expect(Buffer.from(await picture.blob.arrayBuffer()).toString('base64')).toBe(
      value.config.picture.base64
    );
    expect(value.native.has(value.config.heldUndefinedOwnerKey)).toBe(false);
  });

  it('retains the issued marker on wrong readback bytes and restores the helper positive', async () => {
    const value = await initialized();
    await value.run('held-undefined', NONCE);
    value.state.readback = async () => {
      const wrong = ownedPicture(value.config);
      wrong.raw.fields[0].fields.bytes.sha256 = '0'.repeat(64);
      return wrong;
    };
    await expect(value.run('held-restore-undefined', NONCE)).rejects.toThrow(
      /L0_HELD_BYTES_MISMATCH/
    );
    expect(value.native.get(value.config.heldUndefinedOwnerKey)).toBe(NONCE);
    value.state.held = ownedUndefined(value.config);
    value.state.readback = null;
    expect((await value.run('held-restore-undefined', NONCE)).result).toEqual(
      ownedPicture(value.config)
    );
    expect(value.native.has(value.config.heldUndefinedOwnerKey)).toBe(false);
  });

  it('retains the issued marker when the product-writer double refuses and restores the helper positive', async () => {
    const value = await initialized();
    await value.run('held-undefined', NONCE);
    value.state.writeFailure = true;
    await expect(value.run('held-restore-undefined', NONCE)).rejects.toThrow(
      /L0_TEST_WRITER_FAILED/
    );
    expect(value.native.get(value.config.heldUndefinedOwnerKey)).toBe(NONCE);
    expect(value.state.held).toEqual(ownedUndefined(value.config));
    value.state.writeFailure = false;
    expect((await value.run('held-restore-undefined', NONCE)).result).toEqual(
      ownedPicture(value.config)
    );
    expect(value.native.has(value.config.heldUndefinedOwnerKey)).toBe(false);
  });

  it('preserves a refused marker retirement after exact readback', async () => {
    const value = await initialized();
    await value.run('held-undefined', NONCE);
    value.state.retireFailure = true;
    await expect(value.run('held-restore-undefined', NONCE)).rejects.toThrow(
      /L0_TEST_MARKER_REMOVE_FAILED/
    );
    expect(value.native.get(value.config.heldUndefinedOwnerKey)).toBe(NONCE);
    expect(value.state.held).toEqual(ownedPicture(value.config));
  });

  it('refuses a reader role or foreign nonce before replacing the held record', async () => {
    const value = await initialized();
    await value.run('held-undefined', NONCE);
    value.config.role = 'reader';
    await expect(value.run('held-restore-undefined', NONCE)).rejects.toThrow(
      /L0_HELD_WRITER_SOURCE_REQUIRED/
    );
    value.config.role = 'held';
    await expect(value.run('held-restore-undefined', FOREIGN_NONCE)).rejects.toThrow(
      /L0_OWNERSHIP_MARKER_MISMATCH/
    );
    expect(value.state.writes).toEqual([]);
    expect((await value.run('held-restore-undefined', NONCE)).result).toEqual(
      ownedPicture(value.config)
    );
  });

  it('keeps raw PNG success separate from a swallowed actual hint deletion failure', async () => {
    const value = await initialized();
    const hint = value.keys.STORAGE_KEYS.unsavedPicturesHeld;
    value.local.set(hint, 'true');
    value.state.removeFailure = true;
    expect((await value.run('held-missing-hint', NONCE)).result).toEqual(
      ownedPicture(value.config)
    );
    expect(value.local.get(hint)).toBe('true');
    expect(value.state.warnings).toHaveLength(1);
    value.state.removeFailure = false;
    expect((await value.run('held-missing-hint', NONCE)).result).toEqual(
      ownedPicture(value.config)
    );
    expect(value.local.has(hint)).toBe(false);
  });
});
