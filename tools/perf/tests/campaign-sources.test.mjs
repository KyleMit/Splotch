import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import {
  applyCampaignModes,
  campaignModeSources,
  runCampaignSources,
} from '../campaign-sources.mjs';
import { modeProvenance } from '../check-matrix-staleness.mjs';
import { artifactPath } from '../lib/campaign-plan.mjs';
import { ROOT } from '../../lib/proc.mjs';

const temporaryDirectories = [];

afterAll(() => {
  for (const directory of temporaryDirectories) rmSync(directory, { recursive: true, force: true });
});

afterEach(() => vi.restoreAllMocks());

const PRODUCT_COMMIT = 'ce88c8e587ac45847c419e05ef7a79d282bc747a';
const MODE = { id: 'landscape-light', orientation: 'LANDSCAPE', theme: 'light' };
const ITEMS = ['pen-undo', 'crayon', 'magic', 'eraser', 'actions'];

function writeCampaign(
  targetId,
  transport,
  { omit = [], artifact = {}, artifactForItem = {} } = {}
) {
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
        ...artifact,
        ...artifactForItem[item],
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

    expect(entry.partial).toBe('actions-unavailable');
    expect(entry.mode.status).toBe('captured');
    expect(entry.mode.actionsUnavailableReason).toBe('P1: blocked by #1194.');
    expect(entry.mode).not.toHaveProperty('actionSources');
    expect(Object.keys(entry.mode.drawing)).toHaveLength(4);
  });

  it('accepts four complete brushes without an action artifact when preserving actions', () => {
    const outputRoot = writeCampaign('android-device-web', 'split-input-measurement', {
      omit: ['actions'],
    });
    const [entry] = campaignModeSources('android-device-web', {
      outputRoot,
      productCommit: PRODUCT_COMMIT,
      modes: [MODE.id],
      preserveActions: true,
    });

    expect(entry.partial).toBe('actions-preserved');
    expect(entry.mode.status).toBe('captured');
    expect(entry.mode).not.toHaveProperty('actionSources');
    expect(entry.mode).not.toHaveProperty('actionsUnavailableReason');
    expect(Object.keys(entry.mode.drawing)).toHaveLength(4);
  });

  it('refuses to preserve actions over a usable action artifact', () => {
    const outputRoot = writeCampaign('android-device-web', 'split-input-measurement');
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process exited');
    });

    expect(() =>
      campaignModeSources('android-device-web', {
        outputRoot,
        productCommit: PRODUCT_COMMIT,
        modes: [MODE.id],
        preserveActions: true,
      })
    ).toThrow('process exited');
    expect(error).toHaveBeenCalledWith(expect.stringContaining('a usable action artifact exists'));
  });

  it('refuses mutually exclusive action-preservation flags', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process exited');
    });

    await expect(
      runCampaignSources([
        '--target=android-device-web',
        '--output-root=unused',
        `--product-commit=${PRODUCT_COMMIT}`,
        '--preserve-actions',
        '--actions-unavailable=blocked',
      ])
    ).rejects.toThrow('process exited');
    expect(error).toHaveBeenCalledWith(
      '--preserve-actions and --actions-unavailable cannot be combined'
    );
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

  // The 332ba4fb incident: a refuted experimental arm was promoted under the
  // baseline's label, and no artifact could contradict the hand-typed
  // --product-commit. Artifacts now record what the served-build guard proved,
  // and the fold fails closed on any contradiction — while artifacts predating
  // the fields (every fixture above) keep folding, because they cannot prove
  // either way.
  describe('build-identity binding at fold time', () => {
    const refusing = () => {
      const error = vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process exited');
      });
      return error;
    };
    const identity = {
      productCommit: PRODUCT_COMMIT,
      buildEntry: '/_app/immutable/entry/start.Aaa.js',
      buildDigest: 'a'.repeat(64),
    };

    it('refuses a --product-commit that contradicts an artifact-recorded commit, naming both', () => {
      const outputRoot = writeCampaign('android-device-web', 'split-input-measurement', {
        artifact: { ...identity, productCommit: 'f'.repeat(40) },
      });
      const error = refusing();

      expect(() => sourcesFor('android-device-web', outputRoot)).toThrow('process exited');
      expect(error).toHaveBeenCalledWith(
        expect.stringContaining(`--product-commit=${PRODUCT_COMMIT}`)
      );
      expect(error).toHaveBeenCalledWith(
        expect.stringContaining(`records productCommit ${'f'.repeat(40)}`)
      );
    });

    it('refuses folding one mode from artifacts recording different builds', () => {
      const outputRoot = writeCampaign('android-device-web', 'split-input-measurement', {
        artifact: identity,
        artifactForItem: {
          crayon: { buildEntry: '/_app/immutable/entry/start.Bbb.js', buildDigest: 'b'.repeat(64) },
        },
      });
      const error = refusing();

      expect(() => sourcesFor('android-device-web', outputRoot)).toThrow('process exited');
      expect(error).toHaveBeenCalledWith(expect.stringContaining('different build identities'));
      expect(error).toHaveBeenCalledWith(expect.stringContaining('start.Bbb.js'));
    });

    it('refuses a malformed recorded build identity rather than reading past it', () => {
      const outputRoot = writeCampaign('android-device-web', 'split-input-measurement', {
        artifactForItem: { magic: { productCommit: 42 } },
      });
      const error = refusing();

      expect(() => sourcesFor('android-device-web', outputRoot)).toThrow('process exited');
      expect(error).toHaveBeenCalledWith(expect.stringContaining('not a string'));
    });

    it('republishes an agreeing binding on the mode so readers can re-assert it', () => {
      const outputRoot = writeCampaign('android-device-web', 'split-input-measurement', {
        artifact: identity,
      });
      const [entry] = sourcesFor('android-device-web', outputRoot);

      expect(entry.mode.buildEntry).toBe(identity.buildEntry);
      expect(entry.mode.buildDigest).toBe(identity.buildDigest);
    });

    it('records no binding for artifacts predating the fields, and still folds them', () => {
      const outputRoot = writeCampaign('android-device-web', 'split-input-measurement');
      const [entry] = sourcesFor('android-device-web', outputRoot);

      expect(entry.mode.status).toBe('captured');
      expect(entry.mode).not.toHaveProperty('buildEntry');
      expect(entry.mode).not.toHaveProperty('buildDigest');
    });

    // A capture carrying the binding block with no commit is a NEW capture
    // whose build proved nothing (unstamped, dirty, or foreign) — folding it
    // would assign --product-commit to bytes nothing certifies, which is the
    // historical tolerance stretched over exactly the masquerade it must not
    // cover (Codex review round 2 of the distillation stack).
    it('refuses a recorded build identity whose productCommit is unproven', () => {
      const outputRoot = writeCampaign('android-device-web', 'split-input-measurement', {
        artifactForItem: {
          'pen-undo': { buildEntry: identity.buildEntry, buildDigest: identity.buildDigest },
        },
      });
      const error = refusing();

      expect(() => sourcesFor('android-device-web', outputRoot)).toThrow('process exited');
      expect(error).toHaveBeenCalledWith(
        expect.stringContaining('records a build identity but no productCommit')
      );
    });
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

  it('requires measured package identity before folding split-native drawing', () => {
    const actionArtifact = {
      transport: 'native-capacitor-webview',
      appUrl: 'https://localhost',
    };
    const retainedShape = writeCampaign('android-emulator-native', 'split-input-measurement', {
      artifact: { nativeApp: true, platform: 'android' },
      artifactForItem: { actions: actionArtifact },
    });
    const [rejected] = sourcesFor('android-emulator-native', retainedShape);

    expect(rejected.mode).toBeUndefined();
    expect(rejected.missing).toEqual(['pen', 'crayon', 'magic', 'eraser']);

    const attested = writeCampaign('android-emulator-native', 'split-input-measurement', {
      artifact: {
        nativeApp: true,
        platform: 'android',
        nativePackage: 'art.splotch.app',
      },
      artifactForItem: { actions: actionArtifact },
    });
    const [accepted] = sourcesFor('android-emulator-native', attested);

    expect(accepted.missing).toBeUndefined();
    expect(accepted.mode.status).toBe('captured');
    expect(Object.keys(accepted.mode.drawing)).toEqual(['pen', 'crayon', 'magic', 'eraser']);
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

  it('carries the published action section forward when requested', () => {
    const outputRoot = writeCampaign('android-device-web', 'split-input-measurement', {
      omit: ['actions'],
    });
    const entries = campaignModeSources('android-device-web', {
      outputRoot,
      productCommit: PRODUCT_COMMIT,
      modes: [MODE.id],
      preserveActions: true,
    });
    const manifest = {
      targets: [
        {
          id: 'android-device-web',
          modes: [
            {
              id: MODE.id,
              status: 'captured',
              drawingProductCommit: 'aaaaaaaaaaaa',
              actionSources: 'preserved',
            },
          ],
        },
      ],
    };

    applyCampaignModes(manifest, 'android-device-web', entries);

    const merged = manifest.targets[0].modes[0];
    expect(merged.drawingProductCommit).toBe(PRODUCT_COMMIT);
    expect(merged.actionSources).toBe('preserved');
    expect(merged).not.toHaveProperty('actionsUnavailableReason');
  });

  it('pins implicit action provenance before the drawing commit moves under it', () => {
    const outputRoot = writeCampaign('android-device-web', 'split-input-measurement', {
      omit: ['actions'],
    });
    const entries = campaignModeSources('android-device-web', {
      outputRoot,
      productCommit: PRODUCT_COMMIT,
      modes: [MODE.id],
      preserveActions: true,
    });
    const manifest = {
      targets: [
        {
          id: 'android-device-web',
          modes: [
            {
              id: MODE.id,
              status: 'captured',
              drawingProductCommit: 'aaaaaaaaaaaa',
              actionSources: 'captured-untracked',
            },
          ],
        },
      ],
    };

    applyCampaignModes(manifest, 'android-device-web', entries);

    const merged = manifest.targets[0].modes[0];
    expect(merged.drawingProductCommit).toBe(PRODUCT_COMMIT);
    expect(merged.actionProductCommit).toBe('aaaaaaaaaaaa');
    expect(modeProvenance(merged)).toEqual([PRODUCT_COMMIT, 'aaaaaaaaaaaa']);
  });

  it('carries a published action-unavailable reason forward when requested', () => {
    const outputRoot = writeCampaign('android-device-web', 'split-input-measurement', {
      omit: ['actions'],
    });
    const entries = campaignModeSources('android-device-web', {
      outputRoot,
      productCommit: PRODUCT_COMMIT,
      modes: [MODE.id],
      preserveActions: true,
    });
    const manifest = {
      targets: [
        {
          id: 'android-device-web',
          modes: [
            {
              id: MODE.id,
              status: 'captured',
              drawingProductCommit: 'aaaaaaaaaaaa',
              actionsUnavailableReason: 'P1: transport blocked.',
            },
          ],
        },
      ],
    };

    applyCampaignModes(manifest, 'android-device-web', entries);

    const merged = manifest.targets[0].modes[0];
    expect(merged.actionsUnavailableReason).toBe('P1: transport blocked.');
    expect(merged).not.toHaveProperty('actionSources');
  });

  it('refuses to preserve a missing published action section', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process exited');
    });
    const manifest = {
      targets: [
        {
          id: 'android-device-web',
          modes: [{ id: MODE.id, status: 'captured', drawingProductCommit: 'aaaaaaaaaaaa' }],
        },
      ],
    };

    expect(() =>
      applyCampaignModes(manifest, 'android-device-web', [
        {
          id: MODE.id,
          partial: 'actions-preserved',
          mode: {
            id: MODE.id,
            status: 'captured',
            drawingProductCommit: PRODUCT_COMMIT,
            drawing: {},
          },
        },
      ])
    ).toThrow('process exited');
    expect(error).toHaveBeenCalledWith(
      `Cannot preserve actions for android-device-web/${MODE.id}: no published action section`
    );
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
