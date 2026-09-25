import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import {
  advanceRecordedOn,
  applyCampaignModes,
  campaignModeSources,
  runCampaignSources,
} from '../campaign-sources.mjs';
import { sectionProvenance } from '../check-matrix-staleness.mjs';
import { normalizeMatrix } from '../gen-performance-matrix.mjs';
import { FULL_ACTION_GROUPS } from '../lib/action-applicability.mjs';
import { artifactPath, campaignTarget, planCampaign } from '../lib/campaign-plan.mjs';
import { BLOCKED_COVERAGE, FAILED, UNSCOREABLE } from '../lib/campaign-ledger.mjs';
import { cellInspection } from '../run-campaign.mjs';
import { ROOT } from '../../lib/proc.mjs';

const temporaryDirectories = [];

afterAll(() => {
  for (const directory of temporaryDirectories) rmSync(directory, { recursive: true, force: true });
});

afterEach(() => vi.restoreAllMocks());

const PRODUCT_COMMIT = 'ce88c8e587ac45847c419e05ef7a79d282bc747a';
const FOLDED_ON = '2026-09-24';
const MODE = { id: 'landscape-light', orientation: 'LANDSCAPE', theme: 'light' };
const ITEMS = ['pen-undo', 'crayon', 'magic', 'eraser', 'actions'];

function splitUndoEvidence(count = 10) {
  return {
    undoCount: count,
    undo: {
      count,
      engine: { p50: 1, p95: 1, p99: 1, max: 1 },
      nextFrame: { p50: 2, p95: 2, p99: 2, max: 2 },
      passed: true,
    },
    undoActions: Array.from({ length: count }, (_, index) => ({
      index,
      beforeCount: index,
      afterCount: index + 1,
      engineMs: 1,
      nextFrameMs: 2,
    })),
    historyBeforeUndo: { historyLength: 20 },
    historyAfterUndo: { historyLength: 20 - count },
    undoVisual: {
      changedEveryStep: true,
      samples: Array.from({ length: count + 1 }, (_, index) => ({ digests: [index] })),
      steps: Array.from({ length: count }, (_, index) => ({ index, changed: true })),
    },
  };
}

// The fold accepts exactly what the campaign runner's cellInspection accepts, so a
// drawing fixture must carry what that inspection re-derives: a fidelity verdict
// backed by healthy input stats, and a frame interval in the target's regime.
const HEALTHY_INPUT = {
  kinds: 'touch',
  trust: { share: 1 },
  movesPerSecond: 115.5,
  movesPerFrame: 1.93,
  moveGapP95Ms: 16,
  pressure: { p50: 0 },
  contactWidth: { p50: 74 },
  contactHeight: { p50: 74 },
};
const INTERVAL_MS_BY_REGIME = { '60hz': 16.7, '120hz': 8.3 };

function scoreableDrawing(targetId) {
  return {
    fidelity: { passed: true },
    summaries: {
      intervalMs: INTERVAL_MS_BY_REGIME[campaignTarget(targetId).refreshRegime],
      phases: [{ input: HEALTHY_INPUT }],
    },
  };
}

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
        ...(item === 'actions' ? {} : scoreableDrawing(targetId)),
        ...(transport === 'split-input-measurement' && item === 'pen-undo'
          ? splitUndoEvidence()
          : {}),
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
    foldedOn: FOLDED_ON,
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
      foldedOn: FOLDED_ON,
      modes: [MODE.id],
      actionsUnavailableReason: 'P1: blocked by #1194.',
    });

    expect(entry.partial).toBe('actions-unavailable');
    expect(entry.mode.status).toBe('captured');
    expect(entry.mode.actionsUnavailableReason).toBe('P1: blocked by #1194.');
    expect(entry.mode).not.toHaveProperty('actionSources');
    expect(Object.keys(entry.mode.drawing)).toHaveLength(4);
  });

  describe('an artifact the campaign runner refuses', () => {
    const BLOCKED_SWEEP = {
      actionPlan: {
        blocked: [{ label: 'show AI waiting print', reason: 'no secure context' }],
      },
    };
    const MALFORMED_SWEEP = { actionPlan: { blocked: [{ reason: 'no label' }] } };
    const campaignWith = (actions) =>
      writeCampaign('ipad-device-native', 'native-capacitor-webview', {
        artifactForItem: { actions },
      });
    const statusOf = (outputRoot) =>
      cellInspection(
        planCampaign('ipad-device-native', {
          outputRoot,
          modes: [MODE.id],
          items: ['actions'],
        })[0],
        campaignTarget('ipad-device-native')
      );

    it.each([
      ['blocked', BLOCKED_SWEEP, BLOCKED_COVERAGE],
      ['malformed', MALFORMED_SWEEP, FAILED],
    ])('is not folded as a full sweep when %s, matching campaign status', (_, sweep, status) => {
      const outputRoot = campaignWith(sweep);
      const [entry] = sourcesFor('ipad-device-native', outputRoot);

      expect(statusOf(outputRoot).status).toBe(status);
      expect(entry.mode).toBeUndefined();
      expect(entry.missing).toEqual(['actions']);
      expect(entry.refusals).toEqual({ actions: status });
    });

    it('refuses a drawing whose input fidelity re-derives to a failure', () => {
      const underDriven = { ...HEALTHY_INPUT, movesPerFrame: 0.44, moveGapP95Ms: 40 };
      const outputRoot = writeCampaign('ipad-device-native', 'native-capacitor-webview', {
        artifactForItem: {
          crayon: { summaries: { intervalMs: 16.7, phases: [{ input: underDriven }] } },
        },
      });
      const [entry] = sourcesFor('ipad-device-native', outputRoot);
      const crayonCell = planCampaign('ipad-device-native', {
        outputRoot,
        modes: [MODE.id],
        items: ['crayon'],
      })[0];

      const { status } = cellInspection(crayonCell, campaignTarget('ipad-device-native'));

      expect(status).toBe(UNSCOREABLE);
      expect(entry.mode).toBeUndefined();
      expect(entry.refusals).toEqual({ crayon: UNSCOREABLE });
    });

    it('still folds a sweep whose recorded blocked list is empty', () => {
      const outputRoot = campaignWith({ actionPlan: { blocked: [] } });
      const [entry] = sourcesFor('ipad-device-native', outputRoot);

      expect(statusOf(outputRoot).ok).toBe(true);
      expect(entry.mode.actionSources).toEqual([
        expect.objectContaining({ source: expect.stringContaining('actions.json'), kind: 'full' }),
      ]);
    });

    it('folds the drawing as a partial mode when given an unavailable reason', () => {
      const [entry] = campaignModeSources('ipad-device-native', {
        outputRoot: campaignWith(BLOCKED_SWEEP),
        productCommit: PRODUCT_COMMIT,
        foldedOn: FOLDED_ON,
        modes: [MODE.id],
        actionsUnavailableReason: 'P1: AI-waiting actions need a secure context.',
      });

      expect(entry.partial).toBe('actions-unavailable');
      expect(entry.mode).not.toHaveProperty('actionSources');
    });

    it('lets the published action section be preserved over it', () => {
      const [entry] = campaignModeSources('ipad-device-native', {
        outputRoot: campaignWith(BLOCKED_SWEEP),
        productCommit: PRODUCT_COMMIT,
        foldedOn: FOLDED_ON,
        modes: [MODE.id],
        preserveActions: true,
      });

      expect(entry.partial).toBe('actions-preserved');
    });
  });

  it('accepts four complete brushes without an action artifact when preserving actions', () => {
    const outputRoot = writeCampaign('android-device-web', 'split-input-measurement', {
      omit: ['actions'],
    });
    const [entry] = campaignModeSources('android-device-web', {
      outputRoot,
      productCommit: PRODUCT_COMMIT,
      foldedOn: FOLDED_ON,
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
        foldedOn: FOLDED_ON,
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
      foldedOn: FOLDED_ON,
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

  it('names the split pen artifact as its undo source', () => {
    const outputRoot = writeCampaign('android-device-web', 'split-input-measurement');
    const [entry] = sourcesFor('android-device-web', outputRoot);

    expect(entry.mode.undoSource).toBe(entry.mode.drawing.pen[0]);
    expect(entry.mode.drawing.pen).toHaveLength(1);
  });

  it('fails closed when split pen evidence omits or contradicts the undo contract', () => {
    for (const invalid of [
      { undo: null },
      { undoCount: 9 },
      { undoVisual: { changedEveryStep: false, samples: [], steps: [] } },
    ]) {
      const outputRoot = writeCampaign('android-device-web', 'split-input-measurement', {
        artifactForItem: { 'pen-undo': invalid },
      });
      const [entry] = sourcesFor('android-device-web', outputRoot);

      expect(entry.mode).toBeUndefined();
      expect(entry.missing).toEqual(['pen']);
      expect(entry.refusals.pen).toBe(FAILED);
    }
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

  it('replaces a published preserved undo section with fresh split evidence', () => {
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

    const merged = manifest.targets[0].modes[0];
    expect(merged.undoSource).toBe(merged.drawing.pen[0]);
    expect(merged).not.toHaveProperty('undoProductCommit');
  });

  it('carries the published action section forward when requested', () => {
    const outputRoot = writeCampaign('android-device-web', 'split-input-measurement', {
      omit: ['actions'],
    });
    const entries = campaignModeSources('android-device-web', {
      outputRoot,
      productCommit: PRODUCT_COMMIT,
      foldedOn: FOLDED_ON,
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
      foldedOn: FOLDED_ON,
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
    expect(
      sectionProvenance(merged, null).map(({ section, commits }) => [section, commits])
    ).toEqual([
      ['drawing', [PRODUCT_COMMIT]],
      ['undo', [PRODUCT_COMMIT]],
      ['actions', ['aaaaaaaaaaaa']],
    ]);
  });

  it('carries a published action-unavailable reason forward when requested', () => {
    const outputRoot = writeCampaign('android-device-web', 'split-input-measurement', {
      omit: ['actions'],
    });
    const entries = campaignModeSources('android-device-web', {
      outputRoot,
      productCommit: PRODUCT_COMMIT,
      foldedOn: FOLDED_ON,
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

  it('does not inherit preserved undo provenance when fresh split evidence replaces it', () => {
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
    expect(merged.undoSource).toBe(merged.drawing.pen[0]);
    expect(merged).not.toHaveProperty('undoProductCommit');
  });

  it('marks raw published action pointers preserved instead of carrying them to be re-scored', () => {
    const rawSources = [
      { source: 'perf-profiles/old/actions.json', productCommit: 'aaaaaaaaaaaa', kind: 'full' },
    ];
    const manifest = {
      preservedEvidence: { from: 'data.json', reason: 'The action transport is blocked.' },
      targets: [
        {
          id: 'android-device-web',
          modes: [
            {
              id: MODE.id,
              status: 'captured',
              drawingProductCommit: 'aaaaaaaaaaaa',
              actionSources: rawSources,
            },
          ],
        },
      ],
    };

    applyCampaignModes(manifest, 'android-device-web', [preservingEntry(PRODUCT_COMMIT)]);

    const merged = manifest.targets[0].modes[0];
    expect(merged.actionSources).toBe('preserved');
    expect(merged).not.toHaveProperty('actionProductCommit');
    // A preserved section's commit is the one its published report carries, so
    // the old sweep stays traceable without the manifest restating it.
    const publishedMode = { actions: { sources: [{ productCommit: 'aaaaaaaaaaaa' }] } };
    expect(sectionProvenance(merged, publishedMode).at(-1)).toMatchObject({
      section: 'actions',
      state: 'preserved',
      commits: ['aaaaaaaaaaaa'],
    });
  });

  it('refuses to mark actions preserved when the manifest names no published report', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process exited');
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
              actionSources: [
                { source: 'perf-profiles/old/actions.json', productCommit: 'aaaa', kind: 'full' },
              ],
            },
          ],
        },
      ],
    };

    expect(() =>
      applyCampaignModes(manifest, 'android-device-web', [preservingEntry(PRODUCT_COMMIT)])
    ).toThrow('process exited');
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining(
        `Cannot preserve actions for android-device-web/${MODE.id}: the manifest declares no preservedEvidence source`
      )
    );
  });

  // The 2026-09-23 fold hit this for real: FULL_ACTION_GROUPS gained ai-waiting
  // and unavailable after the 2026-09-06 sweeps were published, so re-scoring
  // their raw pointers was refused and twelve sections were marked preserved by
  // hand. The published report is generated while the older group list is in
  // force, then the fold and regeneration run under the current one.
  it('regenerates a sweep that predates a FULL_ACTION_GROUPS change byte for byte', async () => {
    const { directory, published, rawManifest } = await publishPredatingSweep('old123');

    expect(() => normalizeMatrix(rawManifest(), directory)).toThrow(
      'is marked full but its actionPlan records a subset action run'
    );

    const folded = foldPreservingActions(rawManifest());
    const regenerated = normalizeMatrix(folded, directory);

    expect(folded.targets[0].modes[0].actionSources).toBe('preserved');
    expect(actionsJson(regenerated)).toBe(actionsJson(published));
    expect(regenerated.targets[0].modes[0].preservedSections).toEqual(['actions']);
  });

  // The preserved route re-derives nothing: moving the report to a new product
  // commit leaves a historical sweep exactly as published, and its capture date,
  // not an exact-commit count, says how old it is (ADR-0175).
  it('carries a preserved sweep unchanged when the fold moves the product commit', async () => {
    const { directory, published, rawManifest } = await publishPredatingSweep('final123');
    const folded = foldPreservingActions(rawManifest());
    folded.productCommit = 'next456';

    const regenerated = normalizeMatrix(folded, directory);

    expect(actionsJson(regenerated)).toBe(actionsJson(published));
  });

  // ADR-0175: every section the fold writes is dated by its artifacts' own
  // clock, oldest artifact first, and only a section none of whose artifacts
  // records one falls back to the fold date.
  it('dates each folded section from its artifacts and falls back to the fold date', () => {
    const stamped = (iso) => ({
      automation: { loadedUrl: `http://<lan-host>:4173/?perf-run=${Date.parse(iso)}` },
    });
    const outputRoot = writeCampaign('ipad-device-native', 'native-capacitor-webview', {
      artifactForItem: {
        'pen-undo': stamped('2026-09-21T01:00:00Z'),
        crayon: stamped('2026-09-20T23:59:00Z'),
        magic: stamped('2026-09-21T02:00:00Z'),
      },
    });

    const [entry] = sourcesFor('ipad-device-native', outputRoot);

    expect(entry.mode.capturedOn).toEqual({
      drawing: '2026-09-20',
      undo: '2026-09-21',
      actions: FOLDED_ON,
    });
  });

  it('keeps the date a section already carries when the fold does not write it', () => {
    const outputRoot = writeCampaign('android-device-web', 'split-input-measurement', {
      omit: ['actions'],
    });
    const entries = campaignModeSources('android-device-web', {
      outputRoot,
      productCommit: PRODUCT_COMMIT,
      foldedOn: FOLDED_ON,
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
              capturedOn: { drawing: '2026-09-01', undo: '2026-09-01', actions: '2026-09-07' },
              drawingProductCommit: 'aaaaaaaaaaaa',
              actionSources: 'captured-untracked',
            },
          ],
        },
      ],
    };

    applyCampaignModes(manifest, 'android-device-web', entries);

    expect(manifest.targets[0].modes[0].capturedOn).toEqual({
      drawing: FOLDED_ON,
      undo: FOLDED_ON,
      actions: '2026-09-07',
    });
  });

  // The generator counts ages to recordedOn, so a fold that left it behind
  // would publish a negative age for every section it just wrote.
  it('moves the report date forward to the fold date, never back', () => {
    expect(advanceRecordedOn({ recordedOn: '2026-09-23' }, FOLDED_ON).recordedOn).toBe(FOLDED_ON);
    expect(advanceRecordedOn({ recordedOn: '2026-09-30' }, FOLDED_ON).recordedOn).toBe(
      '2026-09-30'
    );
  });

  it('refuses a fold without a real fold date', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process exited');
    });

    expect(() =>
      campaignModeSources('ipad-device-native', {
        outputRoot: 'unused',
        productCommit: PRODUCT_COMMIT,
        modes: [MODE.id],
      })
    ).toThrow('process exited');
  });
});

// Issue 2268: stranded action sweeps could not land without recapturing all four
// brushes, because the fold took only whole modes. A section fold writes one
// section with its own commit and date and keeps the rest exactly as published.
describe('section folds', () => {
  const DRAWING_COMMIT = '3928cd88edbf441530e473a4e3c0b6767926bfc6';
  const OLD_ACTIONS_COMMIT = 'e5142fab8ff2d4b5c8ee767e244c495cec3ba8d3';
  const publishedMode = (overrides = {}) => ({
    id: MODE.id,
    orientation: MODE.orientation,
    theme: MODE.theme,
    status: 'captured',
    capturedOn: { drawing: '2026-09-23', undo: '2026-09-23', actions: '2026-09-07' },
    drawingProductCommit: DRAWING_COMMIT,
    buildEntry: '/_app/immutable/entry/start.drawing.js',
    buildDigest: 'drawing-digest',
    drawing: {
      pen: ['perf-profiles/old/pen.json'],
      crayon: ['perf-profiles/old/crayon.json'],
      magic: ['perf-profiles/old/magic.json'],
      eraser: ['perf-profiles/old/eraser.json'],
    },
    undoSource: 'perf-profiles/old/pen.json',
    actionSources: 'preserved',
    ...overrides,
  });
  const manifestWith = (mode) => ({
    targets: [{ id: 'android-device-web', modes: [mode] }],
  });
  const foldSections = (sections, options = {}) =>
    campaignModeSources('android-device-web', {
      outputRoot: writeCampaign('android-device-web', 'split-input-measurement', options),
      productCommit: PRODUCT_COMMIT,
      foldedOn: FOLDED_ON,
      modes: [MODE.id],
      sections,
    });
  const refusing = () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process exited');
    });
    return error;
  };

  it('folds an action section onto a mode whose drawing comes from another commit', () => {
    const entries = foldSections(['actions'], {
      omit: ['pen-undo', 'crayon', 'magic', 'eraser'],
    });
    const manifest = manifestWith(publishedMode());

    applyCampaignModes(manifest, 'android-device-web', entries);

    const merged = manifest.targets[0].modes[0];
    const { actionSources, capturedOn, ...rest } = merged;
    const { actionSources: _published, capturedOn: _dates, ...unchanged } = publishedMode();
    expect(rest).toEqual(unchanged);
    expect(actionSources).toEqual([
      {
        source: expect.stringContaining('actions.json'),
        productCommit: PRODUCT_COMMIT,
        kind: 'full',
      },
    ]);
    expect(capturedOn).toEqual({ drawing: '2026-09-23', undo: '2026-09-23', actions: FOLDED_ON });
    expect(
      sectionProvenance(merged, null).map(({ section, commits, capturedOn: date }) => [
        section,
        commits,
        date,
      ])
    ).toEqual([
      ['drawing', [DRAWING_COMMIT], '2026-09-23'],
      ['undo', [DRAWING_COMMIT], '2026-09-23'],
      ['actions', [PRODUCT_COMMIT], FOLDED_ON],
    ]);
  });

  it('needs only the cells the folded section is built from', () => {
    const [entry] = foldSections(['actions'], { omit: ['crayon', 'magic', 'eraser'] });

    expect(entry.sections).toEqual(['actions']);
    expect(Object.keys(entry.mode)).toEqual([
      'id',
      'orientation',
      'theme',
      'status',
      'capturedOn',
      'actionSources',
    ]);
  });

  it('keeps refusing a blocked-coverage sweep', () => {
    const [entry] = foldSections(['actions'], {
      artifactForItem: {
        actions: { actionPlan: { blocked: [{ label: 'show AI waiting print', reason: 'x' }] } },
      },
    });

    expect(entry.mode).toBeUndefined();
    expect(entry.refusals).toEqual({ actions: BLOCKED_COVERAGE });
  });

  it('replaces an action-unavailable reason and a captured-untracked pin', () => {
    const manifest = manifestWith(
      publishedMode({
        actionSources: 'captured-untracked',
        actionProductCommit: OLD_ACTIONS_COMMIT,
        actionsUnavailableReason: 'P1: transport blocked.',
      })
    );

    applyCampaignModes(manifest, 'android-device-web', foldSections(['actions']));

    const merged = manifest.targets[0].modes[0];
    expect(merged.actionSources[0].productCommit).toBe(PRODUCT_COMMIT);
    expect(merged).not.toHaveProperty('actionProductCommit');
    expect(merged).not.toHaveProperty('actionsUnavailableReason');
  });

  it('pins the carried undo and action commits before a drawing fold moves them', () => {
    const manifest = manifestWith(
      publishedMode({ actionSources: 'captured-untracked', capturedOn: undefined })
    );

    applyCampaignModes(manifest, 'android-device-web', foldSections(['drawing']));

    const merged = manifest.targets[0].modes[0];
    expect(merged.drawingProductCommit).toBe(PRODUCT_COMMIT);
    expect(merged.drawing.pen).toEqual([expect.stringContaining('pen-real-screen')]);
    expect(merged.undoSource).toBe('perf-profiles/old/pen.json');
    expect(merged).not.toHaveProperty('buildEntry');
    expect(merged).not.toHaveProperty('buildDigest');
    expect(merged.capturedOn).toEqual({ drawing: FOLDED_ON });
    expect(
      sectionProvenance(merged, null).map(({ section, commits }) => [section, commits])
    ).toEqual([
      ['drawing', [PRODUCT_COMMIT]],
      ['undo', [DRAWING_COMMIT]],
      ['actions', [DRAWING_COMMIT]],
    ]);
  });

  it('gives an undo folded alone its own commit and leaves the pen drawing', () => {
    const manifest = manifestWith(publishedMode());

    applyCampaignModes(
      manifest,
      'android-device-web',
      foldSections(['undo'], { omit: ['crayon', 'magic', 'eraser', 'actions'] })
    );

    const merged = manifest.targets[0].modes[0];
    expect(merged.drawing.pen).toEqual(['perf-profiles/old/pen.json']);
    expect(merged.undoSource).toEqual(expect.stringContaining('pen-real-screen'));
    expect(merged.undoProductCommit).toBe(PRODUCT_COMMIT);
    expect(merged.drawingProductCommit).toBe(DRAWING_COMMIT);
  });

  it('leaves the undo commit implicit when the drawing folds beside it', () => {
    const manifest = manifestWith(publishedMode({ undoProductCommit: OLD_ACTIONS_COMMIT }));

    applyCampaignModes(manifest, 'android-device-web', foldSections(['drawing', 'undo']));

    const merged = manifest.targets[0].modes[0];
    expect(merged.undoSource).toBe(merged.drawing.pen[0]);
    expect(merged).not.toHaveProperty('undoProductCommit');
    expect(merged.actionSources).toBe('preserved');
    expect(merged.capturedOn.actions).toBe('2026-09-07');
  });

  it('refuses a recorded build that contradicts the section commit', () => {
    const error = refusing();

    expect(() =>
      foldSections(['actions'], { artifactForItem: { actions: { productCommit: 'f00' } } })
    ).toThrow('process exited');
    expect(error).toHaveBeenCalledWith(expect.stringContaining('contradicts'));
  });

  it('takes the whole-mode path when every section is named', () => {
    const [entry] = foldSections(['actions', 'undo', 'drawing']);

    expect(entry).not.toHaveProperty('sections');
    expect(entry.mode.actionSources).toHaveLength(1);
    expect(Object.keys(entry.mode.drawing)).toHaveLength(4);
  });

  it('refuses to fold one section onto a mode that publishes none', () => {
    const error = refusing();
    const manifest = manifestWith({
      id: MODE.id,
      orientation: MODE.orientation,
      theme: MODE.theme,
      status: 'unavailable',
      reason: 'Not captured.',
    });

    expect(() =>
      applyCampaignModes(manifest, 'android-device-web', foldSections(['actions']))
    ).toThrow('process exited');
    expect(error).toHaveBeenCalledWith(expect.stringContaining('Fold the whole mode'));
  });

  it.each([
    [['brushes'], {}],
    [[], {}],
    [['actions'], { preserveActions: true }],
    [['drawing'], { actionsUnavailableReason: 'blocked' }],
    [['drawing', 'undo', 'actions'], { preserveActions: true }],
  ])('refuses sections %j with %j', (sections, options) => {
    refusing();

    expect(() =>
      campaignModeSources('android-device-web', {
        outputRoot: 'unused',
        productCommit: PRODUCT_COMMIT,
        foldedOn: FOLDED_ON,
        modes: [MODE.id],
        sections,
        ...options,
      })
    ).toThrow('process exited');
  });

  it('folds from the command line into the manifest it names', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse(`${FOLDED_ON}T12:00:00Z`));
    const outputRoot = writeCampaign('android-device-web', 'split-input-measurement', {
      omit: ['pen-undo', 'crayon', 'magic', 'eraser'],
    });
    const manifestPath = join(dirname(outputRoot), 'sources.json');
    writeFileSync(
      manifestPath,
      JSON.stringify({ recordedOn: '2026-09-23', ...manifestWith(publishedMode()) })
    );

    await runCampaignSources([
      '--target=android-device-web',
      `--output-root=${outputRoot}`,
      `--product-commit=${PRODUCT_COMMIT}`,
      `--modes=${MODE.id}`,
      '--sections=actions',
      `--manifest=${manifestPath}`,
    ]);

    const written = JSON.parse(readFileSync(manifestPath, 'utf8'));
    expect(written.recordedOn).toBe(FOLDED_ON);
    expect(written.targets[0].modes[0].actionSources[0].productCommit).toBe(PRODUCT_COMMIT);
    expect(written.targets[0].modes[0].drawingProductCommit).toBe(DRAWING_COMMIT);
  });
});

// The entry shape `campaignModeSources` returns under --preserve-actions: a
// folded drawing recapture whose mode carries no action section of its own.
function preservingEntry(productCommit, mode = { id: MODE.id }) {
  return {
    id: mode.id,
    partial: 'actions-preserved',
    mode: { status: 'captured', drawingProductCommit: productCommit, ...mode },
  };
}

const PREDATING_ACTION_GROUPS = FULL_ACTION_GROUPS.filter(
  (group) => group !== 'ai-waiting' && group !== 'unavailable'
);

const actionsJson = (matrix) => JSON.stringify(matrix.targets[0].modes[0].actions, null, 2);

// Publishes data.json from the raw sweep while the older FULL_ACTION_GROUPS is in
// force, on a fresh module graph so the statically imported generator keeps the
// current list.
async function publishPredatingSweep(sweepProductCommit) {
  const directory = mkdtempSync(join(tmpdir(), 'splotch-preserve-actions-'));
  temporaryDirectories.push(directory);
  const source = writePredatingActionSweep(directory, PREDATING_ACTION_GROUPS);
  const rawManifest = () =>
    predatingFixtureManifest([{ source, productCommit: sweepProductCommit, kind: 'full' }]);

  vi.resetModules();
  vi.doMock('../lib/action-applicability.mjs', async (importOriginal) => ({
    ...(await importOriginal()),
    FULL_ACTION_GROUPS: PREDATING_ACTION_GROUPS,
  }));
  const { normalizeMatrix: normalizeWithPredatingGroups } =
    await import('../gen-performance-matrix.mjs');
  vi.doUnmock('../lib/action-applicability.mjs');
  const { preservedEvidence: _unpublished, ...firstPublication } = rawManifest();
  const published = normalizeWithPredatingGroups(firstPublication, directory);
  writeFileSync(join(directory, 'data.json'), `${JSON.stringify(published, null, 2)}\n`);
  expect(published.targets[0].modes[0].actions.actionPlan.actionGroups).toEqual(
    PREDATING_ACTION_GROUPS
  );
  expect(published.targets[0].modes[0].actions.results).toHaveLength(2);
  return { directory, published, rawManifest };
}

function foldPreservingActions(manifest) {
  return applyCampaignModes(manifest, 'fixture', [
    preservingEntry('final123', {
      id: 'portrait-light',
      orientation: 'PORTRAIT',
      theme: 'light',
      drawing: {},
    }),
  ]);
}

function writePredatingActionSweep(directory, actionGroups) {
  const labels = ['idle frame control', 'expand action drawer'];
  const path = join(directory, 'actions.json');
  writeFileSync(
    path,
    JSON.stringify({
      orientation: 'PORTRAIT',
      theme: 'light',
      repeats: 4,
      samples: labels.flatMap((label) =>
        Array.from({ length: 4 }, (_, index) => ({
          label,
          warmup: index === 0,
          eventType: 'click',
          trusted: true,
          firstFrameMs: 3 + index,
          readyMs: 5 + index,
          postActionFrameGapsMs: [8, 9 + index],
        }))
      ),
      actionPlan: {
        schemaVersion: 1,
        actionGroups,
        applicableLabels: labels,
        notApplicable: [],
        context: { orientation: 'PORTRAIT', settingsShell: 'sectioned' },
      },
    })
  );
  return path;
}

function predatingFixtureManifest(actionSources) {
  const unavailable = (orientation, theme) => ({
    id: `${orientation.toLowerCase()}-${theme}`,
    orientation,
    theme,
    status: 'unavailable',
    reason: 'Not captured.',
  });
  return {
    schemaVersion: 3,
    recordedOn: '2026-09-23',
    productCommit: 'final123',
    preservedEvidence: { from: 'data.json', reason: 'The action transport is blocked.' },
    targets: [
      {
        id: 'fixture',
        number: 1,
        label: 'Fixture',
        platform: 'test',
        deviceKind: 'physical',
        runtime: 'web',
        environment: 'test device',
        fidelity: 'synthetic-advisory',
        modes: [
          {
            id: 'portrait-light',
            orientation: 'PORTRAIT',
            theme: 'light',
            status: 'captured',
            drawingProductCommit: 'old123',
            drawing: {},
            actionSources,
          },
          unavailable('PORTRAIT', 'dark'),
          unavailable('LANDSCAPE', 'light'),
          unavailable('LANDSCAPE', 'dark'),
        ],
      },
    ],
  };
}

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
