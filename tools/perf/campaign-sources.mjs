// Fold a finished campaign's output tree into the performance-matrix manifest.
//
//   npm run perf:campaign:sources -- --target=ipad-device-native \
//     --output-root=perf-profiles/2026-08-21-physical-devices \
//     --product-commit=<sha> --manifest=<sources.json>
//
// The campaign already knows where every cell writes, so deriving the manifest
// entries from `artifactPath` rather than retyping them is what keeps a path or a
// product commit from being transcribed wrong into a cell that then reads as
// measured. A mode is normally rewritten only when all five of its artifacts are
// present and captured through the right transport. The explicit action-only
// exceptions either record why actions are unavailable or preserve the published
// action section while replacing a complete four-brush drawing capture.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { ROOT, fail, isMain, runMain } from '../lib/proc.mjs';
import {
  CAMPAIGN_MODES,
  SPLIT_TRANSPORT,
  UNDO_COUNT,
  artifactMatchesRuntime,
  artifactPath,
  campaignTarget,
  splitUndoEvidenceProblem,
} from './lib/campaign-plan.mjs';

const BRUSH_BY_ITEM = { 'pen-undo': 'pen', crayon: 'crayon', magic: 'magic', eraser: 'eraser' };

function readArtifact(relativePath) {
  const full = isAbsolute(relativePath) ? relativePath : join(ROOT, relativePath);
  if (!existsSync(full)) return null;
  try {
    return JSON.parse(readFileSync(full, 'utf8'));
  } catch {
    return null;
  }
}

// A cell counts only if it parses AND records the transport its target asked for —
// the same acceptance the campaign runner applies, so the two cannot disagree.
function usableCellArtifact(relativePath, runtime) {
  const artifact = readArtifact(relativePath);
  return artifact !== null && artifactMatchesRuntime(artifact, runtime) ? artifact : null;
}

function recordedBuildField(artifact, path, field) {
  const recorded = artifact?.[field] ?? null;
  if (recorded !== null && typeof recorded !== 'string') {
    fail(
      `${path} records ${field} ${JSON.stringify(recorded)}, which is not a string — ` +
        'a malformed build identity is an invalid artifact, not a historical one'
    );
  }
  return recorded;
}

// The fold binds each mode to ONE build (issue: a refuted experimental arm was
// promoted under the baseline's label — 332ba4fb). Both checks fail closed for
// artifacts that RECORD the fields and deliberately accept artifacts predating
// them, the same convention gesturePlan and appUrl follow: an old artifact
// cannot prove either way, while a new one that contradicts is exactly the
// wrong-number this guard exists to refuse. Capturing against a historical
// build stays possible (--allow-foreign-build) — the guard binds folding, not
// capturing.
function assertModeBuildIdentity(targetId, modeId, cells, productCommit) {
  for (const { path, artifact } of cells) {
    const recorded = recordedBuildField(artifact, path, 'productCommit');
    if (recorded !== null && recorded !== productCommit) {
      fail(
        `Cannot fold ${targetId}/${modeId}: --product-commit=${productCommit} contradicts ` +
          `${path}, which records productCommit ${recorded}. One of the two names the wrong ` +
          'build; the artifact was there.'
      );
    }
    // A capture that carries the binding block with no commit is not historical
    // — it is a NEW capture whose build could not prove its commit (unstamped,
    // dirty tree, or --allow-foreign-build), and folding it would assign
    // --product-commit to bytes nothing certifies. Only artifacts predating the
    // block entirely keep the historical tolerance. No override: the diagnostic
    // home for a foreign or dirty build is perf:rescore, never the committed
    // matrix.
    const identityRecorded =
      recordedBuildField(artifact, path, 'buildEntry') !== null ||
      recordedBuildField(artifact, path, 'buildDigest') !== null;
    if (identityRecorded && recorded === null) {
      fail(
        `Cannot fold ${targetId}/${modeId}: ${path} records a build identity but no ` +
          `productCommit — its build was unstamped, dirty, or deliberately foreign, so ` +
          `nothing certifies that --product-commit=${productCommit} describes its bytes. ` +
          'Recapture from a clean `npm run perf:build` of the intended commit.'
      );
    }
  }
  const identified = cells
    .map(({ path, artifact }) => ({
      path,
      buildEntry: recordedBuildField(artifact, path, 'buildEntry'),
      buildDigest: recordedBuildField(artifact, path, 'buildDigest'),
    }))
    .filter((cell) => cell.buildEntry !== null || cell.buildDigest !== null);
  const identities = [
    ...new Set(identified.map((cell) => `${cell.buildEntry}|${cell.buildDigest}`)),
  ];
  if (identities.length > 1) {
    const detail = identified
      .map((cell) => `${cell.path} (${cell.buildEntry ?? 'no entry'}, ${cell.buildDigest})`)
      .join('; ');
    fail(
      `Cannot fold ${targetId}/${modeId}: its artifacts record different build identities — ` +
        `the mode mixes arms, and one number would describe two products. ${detail}`
    );
  }
  if (!identified.length) return null;
  return {
    ...(identified[0].buildEntry !== null ? { buildEntry: identified[0].buildEntry } : {}),
    ...(identified[0].buildDigest !== null ? { buildDigest: identified[0].buildDigest } : {}),
  };
}

export function campaignModeSources(
  targetId,
  { outputRoot, productCommit, modes, actionsUnavailableReason, preserveActions = false }
) {
  const target = campaignTarget(targetId);
  const selected = modes?.length
    ? CAMPAIGN_MODES.filter((mode) => modes.includes(mode.id))
    : CAMPAIGN_MODES;

  return selected.map((mode) => {
    const paths = Object.fromEntries(
      Object.entries(BRUSH_BY_ITEM).map(([item, brush]) => [
        brush,
        artifactPath(outputRoot, targetId, mode, item),
      ])
    );
    const actions = artifactPath(outputRoot, targetId, mode, 'actions');
    const actionsArtifact = usableCellArtifact(actions, target.runtime);
    if (preserveActions && actionsArtifact) {
      fail(
        `Cannot preserve actions for ${targetId}/${mode.id}: a usable action artifact exists at ${actions}`
      );
    }
    const brushArtifacts = Object.fromEntries(
      Object.entries(paths).map(([brush, path]) => [
        brush,
        usableCellArtifact(path, target.runtime),
      ])
    );
    const missing = Object.entries(brushArtifacts)
      .filter(([, artifact]) => artifact === null)
      .map(([brush]) => brush);
    if (
      target.transport === SPLIT_TRANSPORT &&
      brushArtifacts.pen &&
      splitUndoEvidenceProblem(brushArtifacts.pen, UNDO_COUNT)
    ) {
      missing.push('undo');
    }
    if (!preserveActions && !actionsArtifact) missing.push('actions');
    // A mode whose only gap is the action sweep still carries four scored brushes and an
    // undo probe. The manifest already has a shape for that — `actionsUnavailableReason`,
    // which the report renders as no action data — so it is filed as the partial
    // measurement it is rather than discarded beside genuinely uncaptured modes.
    const actionsOnly = missing.length === 1 && missing[0] === 'actions';
    if (missing.length && !(actionsOnly && actionsUnavailableReason)) {
      return { id: mode.id, missing };
    }

    const foldingActions = !preserveActions && !actionsOnly;
    const buildIdentity = assertModeBuildIdentity(
      targetId,
      mode.id,
      [
        ...Object.entries(brushArtifacts).map(([brush, artifact]) => ({
          path: paths[brush],
          artifact,
        })),
        ...(foldingActions ? [{ path: actions, artifact: actionsArtifact }] : []),
      ],
      productCommit
    );

    return {
      id: mode.id,
      ...(preserveActions
        ? { partial: 'actions-preserved' }
        : actionsOnly
          ? { partial: 'actions-unavailable' }
          : {}),
      mode: {
        id: mode.id,
        orientation: mode.orientation,
        theme: mode.theme,
        status: 'captured',
        drawingProductCommit: productCommit,
        // The binding the artifacts recorded, republished per mode so a manifest
        // reader can re-assert which build every number in the mode describes.
        ...(buildIdentity ?? {}),
        drawing: Object.fromEntries(Object.entries(paths).map(([brush, path]) => [brush, [path]])),
        undoSource: paths.pen,
        ...(preserveActions
          ? {}
          : actionsOnly
            ? { actionsUnavailableReason }
            : { actionSources: [{ source: actions, productCommit, kind: 'full' }] }),
      },
    };
  });
}

export function applyCampaignModes(manifest, targetId, entries) {
  const target = manifest.targets?.find((candidate) => candidate.id === targetId);
  if (!target) fail(`Manifest has no target ${targetId}`);
  for (const entry of entries) {
    if (!entry.mode) continue;
    const index = target.modes.findIndex((mode) => mode.id === entry.id);
    if (index === -1) fail(`Manifest target ${targetId} has no mode ${entry.id}`);
    // A transport that cannot capture a section leaves it off the entry, and the
    // mode keeps whatever it already published. Replacing the object wholesale
    // would discard that measurement without saying so.
    //
    // The commits have to be resolved here rather than copied, because undo and
    // captured-untracked action provenance can be implicit: both fall back to the
    // drawingProductCommit this merge is about to replace. Carrying either section
    // without its own commit would silently re-date it to the drawing recapture.
    const existing = target.modes[index];
    if (
      entry.partial === 'actions-preserved' &&
      existing.actionSources === undefined &&
      existing.actionsUnavailableReason === undefined
    ) {
      fail(`Cannot preserve actions for ${targetId}/${entry.id}: no published action section`);
    }
    const preservedActions =
      entry.partial === 'actions-preserved'
        ? existing.actionSources !== undefined
          ? {
              actionSources: existing.actionSources,
              ...(existing.actionSources === 'captured-untracked'
                ? {
                    actionProductCommit:
                      existing.actionProductCommit ?? existing.drawingProductCommit,
                  }
                : {}),
            }
          : existing.actionsUnavailableReason !== undefined
            ? { actionsUnavailableReason: existing.actionsUnavailableReason }
            : {}
        : {};
    target.modes[index] = {
      ...entry.mode,
      ...(entry.mode.undoSource === undefined && existing.undoSource !== undefined
        ? {
            undoSource: existing.undoSource,
            undoProductCommit: existing.undoProductCommit ?? existing.drawingProductCommit,
          }
        : {}),
      ...preservedActions,
    };
  }
  return manifest;
}

export async function runCampaignSources(argv = process.argv.slice(2)) {
  const flag = (name, fallback) => {
    const prefix = `--${name}=`;
    return argv.find((entry) => entry.startsWith(prefix))?.slice(prefix.length) ?? fallback;
  };
  const targetId = flag('target');
  const outputRoot = flag('output-root');
  const productCommit = flag('product-commit');
  const manifestPath = flag('manifest');
  const preserveActions = argv.includes('--preserve-actions');
  if (!targetId || !outputRoot || !productCommit) {
    fail('--target, --output-root, and --product-commit are all required');
  }
  if (preserveActions && flag('actions-unavailable')) {
    fail('--preserve-actions and --actions-unavailable cannot be combined');
  }

  const modes = flag('modes')
    ?.split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  const entries = campaignModeSources(targetId, {
    outputRoot,
    productCommit,
    modes,
    actionsUnavailableReason: flag('actions-unavailable'),
    preserveActions,
  });

  for (const entry of entries.filter((candidate) => candidate.missing)) {
    console.log(`SKIP  ${entry.id} — missing or wrong-transport: ${entry.missing.join(', ')}`);
  }
  const ready = entries.filter((entry) => entry.mode);
  for (const entry of ready.filter((candidate) => candidate.partial)) {
    const detail =
      entry.partial === 'actions-preserved'
        ? 'drawing folded; prior actions preserved'
        : 'drawing folded; actions recorded unavailable';
    console.log(`PARTIAL ${entry.id} — ${detail}`);
  }
  console.log(`${targetId}: ${ready.length}/${entries.length} modes ready`);

  if (!manifestPath) {
    console.log(
      JSON.stringify(
        ready.map((entry) => entry.mode),
        null,
        2
      )
    );
    return entries;
  }
  const full = isAbsolute(manifestPath) ? manifestPath : join(ROOT, manifestPath);
  const manifest = JSON.parse(readFileSync(full, 'utf8'));
  applyCampaignModes(manifest, targetId, ready);
  writeFileSync(full, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Updated ${manifestPath}`);
  return entries;
}

if (isMain(import.meta.url)) runMain(runCampaignSources);
