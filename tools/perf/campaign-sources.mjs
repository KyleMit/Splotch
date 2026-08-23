// Fold a finished campaign's output tree into the performance-matrix manifest.
//
//   npm run perf:campaign:sources -- --target=ipad-device-native \
//     --output-root=perf-profiles/2026-08-21-physical-devices \
//     --product-commit=<sha> --manifest=<sources.json>
//
// The campaign already knows where every cell writes, so deriving the manifest
// entries from `artifactPath` rather than retyping them is what keeps a path or a
// product commit from being transcribed wrong into a cell that then reads as
// measured. A mode is rewritten only when all five of its artifacts are present
// and captured through the right transport; anything short of that is reported and
// its existing entry — usually an `unavailable` reason — is left alone, because a
// partially captured mode is not a captured one.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { ROOT, fail, isMain, runMain } from '../lib/proc.mjs';
import {
  CAMPAIGN_MODES,
  SPLIT_TRANSPORT,
  artifactMatchesRuntime,
  artifactPath,
  campaignTarget,
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
function usableCell(relativePath, runtime) {
  const artifact = readArtifact(relativePath);
  return artifact !== null && artifactMatchesRuntime(artifact, runtime);
}

export function campaignModeSources(
  targetId,
  { outputRoot, productCommit, modes, actionsUnavailableReason }
) {
  const target = campaignTarget(targetId);
  const capturesUndo = target.transport !== SPLIT_TRANSPORT;
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
    const missing = [
      ...Object.entries(paths)
        .filter(([, path]) => !usableCell(path, target.runtime))
        .map(([brush]) => brush),
      ...(usableCell(actions, target.runtime) ? [] : ['actions']),
    ];
    // A mode whose only gap is the action sweep still carries four scored brushes and an
    // undo probe. The manifest already has a shape for that — `actionsUnavailableReason`,
    // which the report renders as no action data — so it is filed as the partial
    // measurement it is rather than discarded beside genuinely uncaptured modes.
    const actionsOnly = missing.length === 1 && missing[0] === 'actions';
    if (missing.length && !(actionsOnly && actionsUnavailableReason)) {
      return { id: mode.id, missing };
    }

    return {
      id: mode.id,
      ...(actionsOnly ? { partial: 'actions' } : {}),
      mode: {
        id: mode.id,
        orientation: mode.orientation,
        theme: mode.theme,
        status: 'captured',
        drawingProductCommit: productCommit,
        drawing: Object.fromEntries(Object.entries(paths).map(([brush, path]) => [brush, [path]])),
        // The split transport is drawing-only — its pen cell has no undo phase, so
        // naming that artifact as the undo source normalizes to null and silently
        // drops the mode's undo row. Omitting it lets applyCampaignModes carry the
        // existing measurement forward instead.
        ...(capturesUndo ? { undoSource: paths.pen } : {}),
        ...(actionsOnly
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
    // The commit has to be resolved here rather than copied, because undo
    // provenance is usually implicit: a mode carrying `undoSource` alone lets the
    // report fall back to its `drawingProductCommit`, and this merge is about to
    // replace that with the commit the DRAWING was recaptured at. Copying the
    // absent field would silently re-date the preserved undo rows to a commit
    // they were never measured at, and the provenance table prints that date.
    const existing = target.modes[index];
    target.modes[index] = {
      ...entry.mode,
      ...(entry.mode.undoSource === undefined && existing.undoSource !== undefined
        ? {
            undoSource: existing.undoSource,
            undoProductCommit: existing.undoProductCommit ?? existing.drawingProductCommit,
          }
        : {}),
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
  if (!targetId || !outputRoot || !productCommit) {
    fail('--target, --output-root, and --product-commit are all required');
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
  });

  for (const entry of entries.filter((candidate) => candidate.missing)) {
    console.log(`SKIP  ${entry.id} — missing or wrong-transport: ${entry.missing.join(', ')}`);
  }
  const ready = entries.filter((entry) => entry.mode);
  for (const entry of ready.filter((candidate) => candidate.partial)) {
    console.log(
      `PARTIAL ${entry.id} — drawing and undo only; ${entry.partial} recorded unavailable`
    );
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
