import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { applyCampaignModes, campaignModeSources } from '../campaign-sources.mjs';
import { artifactPath } from '../lib/campaign-plan.mjs';
import { ROOT } from '../../lib/proc.mjs';

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
    writeFileSync(
      file,
      JSON.stringify({
        transport,
        ...(transport === 'native-capacitor-webview' ? { appUrl: 'capacitor://localhost' } : {}),
      })
    );
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

  it('records a drawing-complete mode whose action sweep is blocked, when given a reason', () => {
    const outputRoot = writeCampaign('ipad-device-native', 'native-capacitor-webview', {
      omit: ['actions'],
    });
    const [entry] = campaignModeSources('ipad-device-native', {
      outputRoot,
      productCommit: PRODUCT_COMMIT,
      modes: [MODE.id],
      actionsUnavailableReason: 'P1: blocked by #1194.',
    });

    expect(entry.partial).toBe('actions');
    expect(entry.mode.status).toBe('captured');
    expect(entry.mode.actionsUnavailableReason).toBe('P1: blocked by #1194.');
    expect(entry.mode).not.toHaveProperty('actionSources');
    expect(Object.keys(entry.mode.drawing)).toHaveLength(4);
  });

  it('still refuses a mode missing a brush, reason or not', () => {
    const outputRoot = writeCampaign('ipad-device-native', 'native-capacitor-webview', {
      omit: ['magic', 'actions'],
    });
    const [entry] = campaignModeSources('ipad-device-native', {
      outputRoot,
      productCommit: PRODUCT_COMMIT,
      modes: [MODE.id],
      actionsUnavailableReason: 'P1: blocked by #1194.',
    });

    expect(entry.mode).toBeUndefined();
    expect(entry.missing).toEqual(['magic', 'actions']);
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

  it('names no undo source for the split transport, which captures drawing only', () => {
    const outputRoot = writeCampaign('android-device-web', 'split-input-measurement');
    const [entry] = sourcesFor('android-device-web', outputRoot);

    // Its pen cell has no undo phase, so naming that artifact normalizes to null
    // and drops the row rather than measuring it.
    expect(entry.mode.undoSource).toBeUndefined();
    expect(entry.mode.drawing.pen).toHaveLength(1);
  });

  it('carries a published undo measurement forward when the entry names none', () => {
    const outputRoot = writeCampaign('android-device-web', 'split-input-measurement');
    const entries = sourcesFor('android-device-web', outputRoot);
    const manifest = {
      targets: [
        {
          id: 'android-device-web',
          modes: [
            {
              id: MODE.id,
              status: 'captured',
              undoSource: 'preserved',
              undoProductCommit: 'abc',
            },
          ],
        },
      ],
    };

    applyCampaignModes(manifest, 'android-device-web', entries);

    expect(manifest.targets[0].modes[0].undoSource).toBe('preserved');
    expect(manifest.targets[0].modes[0].undoProductCommit).toBe('abc');
    expect(manifest.targets[0].modes[0].drawing.pen).toHaveLength(1);
  });

  it('pins implicit undo provenance before the drawing commit moves under it', () => {
    const outputRoot = writeCampaign('android-device-web', 'split-input-measurement');
    const entries = sourcesFor('android-device-web', outputRoot);
    // The shape every android-device-web mode actually has: an undo source with
    // no commit of its own, so the report reads provenance off drawingProductCommit
    // — which this merge is about to replace with the recapture's commit.
    const manifest = {
      targets: [
        {
          id: 'android-device-web',
          modes: [
            {
              id: MODE.id,
              status: 'captured',
              drawingProductCommit: 'aaaaaaaaaaaa',
              undoSource: 'preserved',
            },
          ],
        },
      ],
    };

    applyCampaignModes(manifest, 'android-device-web', entries);

    const merged = manifest.targets[0].modes[0];
    expect(merged.drawingProductCommit).toBe(PRODUCT_COMMIT);
    expect(merged.undoProductCommit).toBe('aaaaaaaaaaaa');
  });
});

// Issue 1309: a tracked manifest drifted from the folder's own
// `JSON.stringify(..., null, 2)` form (46 \uXXXX escapes, 230 extra bytes), so
// the next generated update carried avoidable churn. A later fold restored the
// canonical form; this pins it so hand edits cannot reintroduce the drift —
// swept from git rather than a hardcoded path, so the next dated matrix
// folder is covered the day it lands.
describe('the tracked matrix manifests', () => {
  const manifests = execFileSync('git', ['ls-files', 'scrapbook/performance/*/sources.json'], {
    cwd: ROOT,
    encoding: 'utf8',
  })
    .split('\n')
    .filter(Boolean);

  it('found at least the deployment-target manifest', () => {
    expect(manifests).toContain(
      'scrapbook/performance/2026-07-31-deployment-target-matrix/sources.json'
    );
  });

  it.each(manifests)('%s matches the folder’s canonical serialization byte for byte', (path) => {
    const raw = readFileSync(join(ROOT, path), 'utf8');

    expect(raw).toBe(`${JSON.stringify(JSON.parse(raw), null, 2)}\n`);
  });
});
