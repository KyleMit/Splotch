import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { applyCampaignModes, campaignModeSources } from '../campaign-sources.mjs';
import { artifactPath } from '../lib/campaign-plan.mjs';

const temporaryDirectories = [];

afterAll(() => {
  for (const directory of temporaryDirectories) rmSync(directory, { recursive: true, force: true });
});

const PRODUCT_COMMIT = 'ce88c8e587ac45847c419e05ef7a79d282bc747a';
const MODE = { id: 'landscape-light', orientation: 'LANDSCAPE', theme: 'light' };
const ITEMS = ['pen-undo', 'crayon', 'magic', 'eraser', 'actions'];

function writeCampaign(targetId, transport, { omit = [] } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'splotch-campaign-'));
  temporaryDirectories.push(root);
  for (const item of ITEMS) {
    if (omit.includes(item)) continue;
    const file = join(root, artifactPath('out', targetId, MODE, item));
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify({ transport }));
  }
  return join(root, 'out');
}

const sourcesFor = (targetId, outputRoot) =>
  campaignModeSources(targetId, {
    outputRoot,
    productCommit: PRODUCT_COMMIT,
    modes: [MODE.id],
  });

describe('campaign sources', () => {
  it('derives every evidence path from the plan that wrote it', () => {
    const outputRoot = writeCampaign('ipad-device-native', 'native-capacitor-webview');
    const [entry] = sourcesFor('ipad-device-native', outputRoot);

    expect(entry.mode.status).toBe('captured');
    expect(entry.mode.drawingProductCommit).toBe(PRODUCT_COMMIT);
    expect(Object.keys(entry.mode.drawing)).toEqual(['pen', 'crayon', 'magic', 'eraser']);
    expect(entry.mode.drawing.pen).toEqual([entry.mode.undoSource]);
    expect(entry.mode.actionSources).toEqual([
      {
        source: expect.stringContaining('actions.json'),
        productCommit: PRODUCT_COMMIT,
        kind: 'full',
      },
    ]);
  });

  it('refuses a mode whose action sweep never landed', () => {
    const outputRoot = writeCampaign('ipad-device-native', 'native-capacitor-webview', {
      omit: ['actions'],
    });
    const [entry] = sourcesFor('ipad-device-native', outputRoot);

    expect(entry.mode).toBeUndefined();
    expect(entry.missing).toEqual(['actions']);
  });

  it('refuses a native mode captured through a browser transport', () => {
    const outputRoot = writeCampaign('ipad-device-native', 'browser');
    const [entry] = sourcesFor('ipad-device-native', outputRoot);

    expect(entry.mode).toBeUndefined();
    expect(entry.missing).toEqual(['pen', 'crayon', 'magic', 'eraser', 'actions']);
  });

  it('leaves an unavailable mode alone rather than half-writing it', () => {
    const outputRoot = writeCampaign('ipad-device-native', 'native-capacitor-webview', {
      omit: ['magic'],
    });
    const entries = sourcesFor('ipad-device-native', outputRoot);
    const manifest = {
      targets: [
        {
          id: 'ipad-device-native',
          modes: [{ id: MODE.id, status: 'unavailable', reason: 'P1: tunnel unavailable.' }],
        },
      ],
    };

    applyCampaignModes(
      manifest,
      'ipad-device-native',
      entries.filter((entry) => entry.mode)
    );

    expect(manifest.targets[0].modes[0]).toEqual({
      id: MODE.id,
      status: 'unavailable',
      reason: 'P1: tunnel unavailable.',
    });
  });

  it('replaces the matching mode in place', () => {
    const outputRoot = writeCampaign('ipad-device-native', 'native-capacitor-webview');
    const entries = sourcesFor('ipad-device-native', outputRoot);
    const manifest = {
      targets: [
        {
          id: 'ipad-device-native',
          modes: [
            { id: 'portrait-light', status: 'unavailable', reason: 'untouched' },
            { id: MODE.id, status: 'unavailable', reason: 'replace me' },
          ],
        },
      ],
    };

    applyCampaignModes(manifest, 'ipad-device-native', entries);

    expect(manifest.targets[0].modes[0].reason).toBe('untouched');
    expect(manifest.targets[0].modes[1].status).toBe('captured');
  });
});
