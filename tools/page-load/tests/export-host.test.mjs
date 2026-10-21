import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { EXPORT_HOST_READY_PREFIX, exportAssetUrls, whenReady } from '../lib/export-host.mjs';

const HOST_WAIT_MS = 1_000;

function standInChild() {
  const child = new EventEmitter();
  child.stdout = new PassThrough();
  return child;
}

describe('exportAssetUrls', () => {
  it('lists each file the document names under the hashed asset folder, once', () => {
    const html =
      '<script type="application/json" id="startup-scripts">' +
      '["/_expo/static/js/web/index-abc.js","/_expo/static/js/web/__expo-metro-runtime-def.js"]' +
      '</script><link rel="stylesheet" href="/_expo/static/css/strict-123.css">' +
      '<script src="/_expo/static/js/web/index-abc.js"></script>';

    expect(exportAssetUrls(html)).toEqual([
      '/_expo/static/js/web/index-abc.js',
      '/_expo/static/js/web/__expo-metro-runtime-def.js',
      '/_expo/static/css/strict-123.css',
    ]);
  });

  it('lists nothing for a document that names none', () => {
    expect(exportAssetUrls('<p>Not found</p><img src="/favicon.ico">')).toEqual([]);
  });
});

describe('whenReady', () => {
  it('resolves on the line the host prints once it is listening', async () => {
    const child = standInChild();
    const ready = whenReady(child, HOST_WAIT_MS);

    child.stdout.write('starting\n');
    child.stdout.write(`${EXPORT_HOST_READY_PREFIX}http://127.0.0.1:1/\n`);

    await expect(ready).resolves.toBeUndefined();
  });

  it('rejects when the host exits first, as it does for a port already in use', async () => {
    const child = standInChild();
    const ready = whenReady(child, HOST_WAIT_MS);

    child.emit('exit', 1, null);

    await expect(ready).rejects.toThrow('exited (code 1) before it was ready');
  });

  it('rejects when the host never says it is ready', async () => {
    const child = standInChild();

    await expect(whenReady(child, 20)).rejects.toThrow('was not ready within 20ms');
  });

  it('stops listening for an exit once it has settled', async () => {
    const child = standInChild();
    const ready = whenReady(child, HOST_WAIT_MS);
    child.stdout.write(`${EXPORT_HOST_READY_PREFIX}http://127.0.0.1:1/\n`);
    await ready;

    expect(child.listenerCount('exit')).toBe(0);
  });
});
