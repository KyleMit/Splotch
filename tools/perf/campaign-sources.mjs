// Fold a finished campaign's output tree into the performance-matrix manifest.
//
//   npm run perf:campaign:sources -- --target=ipad-device-native \
//     --output-root=perf-profiles/2026-08-21-physical-devices \
//     --product-commit=<sha> --manifest=<sources.json>
//
// The campaign already knows where every cell writes, so deriving the manifest
// entries from the plan's `artifact` paths rather than retyping them is what keeps a path or a
// product commit from being transcribed wrong into a cell that then reads as
// measured. A mode is normally rewritten only when all five of its artifacts are
// present and accepted by the campaign runner's own inspection. The explicit action-only
// exceptions either record why actions are unavailable or preserve the published
// action section while replacing a complete four-brush drawing capture. `--sections=`
// narrows the fold to one or two sections, each written with its own product commit and
// capture date while the mode's other sections stay exactly as published.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { ROOT, fail, isMain, runMain } from '../lib/proc.mjs';
import { CAPTURED_UNTRACKED, PRESERVED } from './gen-performance-matrix.mjs';
import { cellInspection } from './run-campaign.mjs';
import { CAMPAIGN_MODES, campaignTarget, planCampaign } from './lib/campaign-plan.mjs';
import { MATRIX_SECTIONS, isCaptureDate, sectionCapturedOn, utcDate } from './lib/capture-date.mjs';

const BRUSH_BY_ITEM = { 'pen-undo': 'pen', crayon: 'crayon', magic: 'magic', eraser: 'eraser' };

// The plan cells each section is built from. Undo is read from the pen artifact,
// so a pen capture that folds its undo alone leaves the published pen drawing in place.
const SECTION_ITEMS = {
  drawing: Object.keys(BRUSH_BY_ITEM),
  undo: ['pen-undo'],
  actions: ['actions'],
};

function readArtifact(relativePath) {
  const full = isAbsolute(relativePath) ? relativePath : join(ROOT, relativePath);
  if (!existsSync(full)) return null;
  try {
    return JSON.parse(readFileSync(full, 'utf8'));
  } catch {
    return null;
  }
}

// A cell counts only if the campaign runner itself would accept it: this is the
// same cellInspection perf:campaign:status reports from, over the same plan cell,
// so the fold can never publish an artifact status calls outstanding — a
// blocked-coverage sweep, a failed fidelity verdict, or the wrong transport. The
// runner's status comes back with a refusal so the fold can name it.
function inspectCell(cell, target) {
  const { ok, status } = cellInspection(cell, target);
  return ok ? { artifact: readArtifact(cell.artifact), status } : { artifact: null, status };
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

// A section fold writes only the sections it names, each bound to this fold's
// product commit and dated by its own artifacts, and requires only the cells those
// sections are built from. The mode's other sections are not read here at all:
// applyCampaignModes carries them from the manifest on the route they already
// have, so a fresh action sweep can land on a mode whose drawing came from another
// commit without recapturing the drawing or re-dating it.
function sectionModeSource(targetId, target, mode, cells, { sections, productCommit, foldedOn }) {
  const items = [...new Set(sections.flatMap((section) => SECTION_ITEMS[section]))];
  const inspections = Object.fromEntries(
    items.map((item) => [item, inspectCell(cells[item], target)])
  );
  const refusals = Object.fromEntries(
    items
      .filter((item) => inspections[item].artifact === null)
      .map((item) => [BRUSH_BY_ITEM[item] ?? item, inspections[item].status])
  );
  const missing = Object.keys(refusals);
  if (missing.length) return { id: mode.id, missing, refusals };

  const artifactOf = (item) => inspections[item].artifact;
  const buildIdentity = assertModeBuildIdentity(
    targetId,
    mode.id,
    items.map((item) => ({ path: cells[item].artifact, artifact: artifactOf(item) })),
    productCommit
  );
  const folds = (section) => sections.includes(section);
  const capturedOn = Object.fromEntries(
    sections.map((section) => [
      section,
      sectionCapturedOn(SECTION_ITEMS[section].map(artifactOf), foldedOn),
    ])
  );
  return {
    id: mode.id,
    sections,
    mode: {
      id: mode.id,
      orientation: mode.orientation,
      theme: mode.theme,
      status: 'captured',
      capturedOn,
      ...(folds('drawing')
        ? {
            drawingProductCommit: productCommit,
            // The mode's recorded build identity names its drawing build, so only
            // a fold that writes the drawing may replace it.
            ...(buildIdentity ?? {}),
            drawing: Object.fromEntries(
              Object.entries(BRUSH_BY_ITEM).map(([item, brush]) => [brush, [cells[item].artifact]])
            ),
          }
        : {}),
      ...(folds('undo')
        ? {
            undoSource: cells['pen-undo'].artifact,
            // Beside a drawing fold the undo commit stays implicit, exactly as a
            // whole-mode fold writes it; alone it differs from the drawing's.
            ...(folds('drawing') ? {} : { undoProductCommit: productCommit }),
          }
        : {}),
      ...(folds('actions')
        ? { actionSources: [{ source: cells.actions.artifact, productCommit, kind: 'full' }] }
        : {}),
    },
  };
}

export function campaignModeSources(
  targetId,
  {
    outputRoot,
    productCommit,
    foldedOn,
    modes,
    actionsUnavailableReason,
    preserveActions = false,
    sections,
  }
) {
  if (!isCaptureDate(foldedOn)) fail(`foldedOn must be a YYYY-MM-DD date, got ${foldedOn}`);
  const sectionSubset = sectionFoldSubset(sections);
  if (sectionSubset && (preserveActions || actionsUnavailableReason)) {
    fail(
      'A section fold writes only the sections it names and keeps the rest as published; ' +
        'it cannot be combined with --preserve-actions or --actions-unavailable'
    );
  }
  const target = campaignTarget(targetId);
  const selected = modes?.length
    ? CAMPAIGN_MODES.filter((mode) => modes.includes(mode.id))
    : CAMPAIGN_MODES;

  return selected.map((mode) => {
    const cells = Object.fromEntries(
      planCampaign(targetId, { outputRoot, modes: [mode.id] }).map((cell) => [cell.item, cell])
    );
    if (sectionSubset) {
      return sectionModeSource(targetId, target, mode, cells, {
        sections: sectionSubset,
        productCommit,
        foldedOn,
      });
    }
    const paths = Object.fromEntries(
      Object.entries(BRUSH_BY_ITEM).map(([item, brush]) => [brush, cells[item].artifact])
    );
    const actions = cells.actions.artifact;
    const actionsInspection = inspectCell(cells.actions, target);
    const actionsArtifact = actionsInspection.artifact;
    if (preserveActions && actionsArtifact) {
      fail(
        `Cannot preserve actions for ${targetId}/${mode.id}: a usable action artifact exists at ${actions}`
      );
    }
    const brushInspections = Object.fromEntries(
      Object.entries(BRUSH_BY_ITEM).map(([item, brush]) => [
        brush,
        inspectCell(cells[item], target),
      ])
    );
    const brushArtifacts = Object.fromEntries(
      Object.entries(brushInspections).map(([brush, { artifact }]) => [brush, artifact])
    );
    const refusals = Object.fromEntries(
      Object.entries(brushInspections)
        .filter(([, { artifact }]) => artifact === null)
        .map(([brush, { status }]) => [brush, status])
    );
    if (!preserveActions && !actionsArtifact) refusals.actions = actionsInspection.status;
    const missing = Object.keys(refusals);
    // A mode whose only gap is the action sweep still carries four scored brushes and an
    // undo probe. The manifest already has a shape for that — `actionsUnavailableReason`,
    // which the report renders as no action data — so it is filed as the partial
    // measurement it is rather than discarded beside genuinely uncaptured modes.
    const actionsOnly = missing.length === 1 && missing[0] === 'actions';
    if (missing.length && !(actionsOnly && actionsUnavailableReason)) {
      return { id: mode.id, missing, refusals };
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

    // Each section is dated by the artifacts it is built from, so a section this
    // fold does not write keeps the date it already carries (applyCampaignModes).
    const capturedOn = {
      drawing: sectionCapturedOn(Object.values(brushArtifacts), foldedOn),
      undo: sectionCapturedOn([brushArtifacts.pen], foldedOn),
      ...(foldingActions ? { actions: sectionCapturedOn([actionsArtifact], foldedOn) } : {}),
    };

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
        capturedOn,
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

// Naming every section is a whole-mode fold, so it takes the whole-mode path and
// its completeness rules rather than a second route to the same result.
function sectionFoldSubset(sections) {
  if (sections === undefined) return null;
  const named = [...new Set(sections)];
  const unknown = named.filter((section) => !MATRIX_SECTIONS.includes(section));
  if (!named.length || unknown.length) {
    fail(
      `--sections takes a comma-separated subset of ${MATRIX_SECTIONS.join(', ')}; got ` +
        `${JSON.stringify(sections)}`
    );
  }
  if (named.length === MATRIX_SECTIONS.length) return null;
  return MATRIX_SECTIONS.filter((section) => named.includes(section));
}

// Preserving actions carries the PUBLISHED section, never its raw inputs. Raw
// `actionSources` pointers are re-scored by gen:performance-matrix under current
// rules, so a sweep that predates a FULL_ACTION_GROUPS change is refused outright
// and any other rule change would re-derive the numbers the flag promised to keep.
// PRESERVED is the generator's own route for copying a section from
// `preservedEvidence.from` unchanged. A section that is already PRESERVED or
// CAPTURED_UNTRACKED is published-section-routed already and keeps its route.
function preservedActionSection(manifest, targetId, modeId, existing) {
  if (Array.isArray(existing.actionSources)) {
    if (!manifest.preservedEvidence) {
      fail(
        `Cannot preserve actions for ${targetId}/${modeId}: the manifest declares no ` +
          'preservedEvidence source to carry the published section from. Declare ' +
          'preservedEvidence (the published data.json and why its raw inputs are not re-read) first.'
      );
    }
    return { actionSources: PRESERVED };
  }
  if (existing.actionSources !== undefined) {
    return {
      actionSources: existing.actionSources,
      ...(existing.actionSources === CAPTURED_UNTRACKED
        ? { actionProductCommit: existing.actionProductCommit ?? existing.drawingProductCommit }
        : {}),
    };
  }
  if (existing.actionsUnavailableReason !== undefined) {
    return { actionsUnavailableReason: existing.actionsUnavailableReason };
  }
  return {};
}

// A section fold rewrites only its own sections' fields and keeps every other
// field of the published mode, including each carried section's route: a raw
// drawing stays raw and re-scored, a preserved one stays preserved. Converting a
// carried section to preserved would freeze a release-gate drawing's verdict
// behind PRESERVED_VERDICT_REASON for no reason but that a different section moved.
//
// Two carried commits are implicit — undo and captured-untracked actions fall back
// to drawingProductCommit — so a drawing fold pins them first, or the carried
// section would silently take the new drawing's commit.
function foldSections(existing, entry, targetId) {
  if (existing.status !== 'captured') {
    fail(
      `Cannot fold ${entry.sections.join(', ')} alone into ${targetId}/${entry.id}: the mode ` +
        'publishes no captured sections to keep beside it. Fold the whole mode.'
    );
  }
  const folds = (section) => entry.sections.includes(section);
  const { capturedOn, ...written } = entry.mode;
  const merged = { ...existing };
  if (folds('drawing')) {
    delete merged.buildEntry;
    delete merged.buildDigest;
    if (!folds('undo') && existing.undoSource !== undefined) {
      merged.undoProductCommit = existing.undoProductCommit ?? existing.drawingProductCommit;
    }
    if (!folds('actions') && existing.actionSources === CAPTURED_UNTRACKED) {
      merged.actionProductCommit = existing.actionProductCommit ?? existing.drawingProductCommit;
    }
  }
  if (folds('undo') && folds('drawing')) delete merged.undoProductCommit;
  if (folds('actions')) {
    delete merged.actionProductCommit;
    delete merged.actionsUnavailableReason;
  }
  return Object.assign(merged, written, {
    capturedOn: { ...existing.capturedOn, ...capturedOn },
  });
}

export function applyCampaignModes(manifest, targetId, entries) {
  const target = manifest.targets?.find((candidate) => candidate.id === targetId);
  if (!target) fail(`Manifest has no target ${targetId}`);
  for (const entry of entries) {
    if (!entry.mode) continue;
    const index = target.modes.findIndex((mode) => mode.id === entry.id);
    if (index === -1) fail(`Manifest target ${targetId} has no mode ${entry.id}`);
    if (entry.sections) {
      target.modes[index] = foldSections(target.modes[index], entry, targetId);
      continue;
    }
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
        ? preservedActionSection(manifest, targetId, entry.id, existing)
        : {};
    const carriesUndo = entry.mode.undoSource === undefined && existing.undoSource !== undefined;
    const carriedDates = {
      ...(carriesUndo && existing.capturedOn?.undo ? { undo: existing.capturedOn.undo } : {}),
      ...(entry.partial === 'actions-preserved' && existing.capturedOn?.actions
        ? { actions: existing.capturedOn.actions }
        : {}),
    };
    target.modes[index] = {
      ...entry.mode,
      capturedOn: { ...entry.mode.capturedOn, ...carriedDates },
      ...(carriesUndo
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

// The report's date moves with every fold, since the generator counts each
// section's age to it: a fold that left it behind would publish negative ages.
export function advanceRecordedOn(manifest, foldedOn) {
  if (!isCaptureDate(manifest.recordedOn) || foldedOn > manifest.recordedOn) {
    manifest.recordedOn = foldedOn;
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

  const list = (value) =>
    value
      ?.split(',')
      .map((entry) => entry.trim())
      .filter(Boolean);
  const foldedOn = utcDate(Date.now());
  const entries = campaignModeSources(targetId, {
    outputRoot,
    productCommit,
    foldedOn,
    modes: list(flag('modes')),
    actionsUnavailableReason: flag('actions-unavailable'),
    preserveActions,
    sections: list(flag('sections')),
  });

  for (const entry of entries.filter((candidate) => candidate.missing)) {
    const refused = entry.missing.map((name) => `${name} (${entry.refusals[name]})`);
    console.log(`SKIP  ${entry.id} — not accepted by the campaign runner: ${refused.join(', ')}`);
  }
  const ready = entries.filter((entry) => entry.mode);
  for (const entry of ready.filter((candidate) => candidate.partial)) {
    const detail =
      entry.partial === 'actions-preserved'
        ? 'drawing folded; prior actions preserved'
        : 'drawing folded; actions recorded unavailable';
    console.log(`PARTIAL ${entry.id} — ${detail}`);
  }
  for (const entry of ready.filter((candidate) => candidate.sections)) {
    const kept = MATRIX_SECTIONS.filter((section) => !entry.sections.includes(section));
    console.log(
      `SECTIONS ${entry.id} — ${entry.sections.join(', ')} folded; ${kept.join(', ')} kept as published`
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
  if (ready.length) advanceRecordedOn(manifest, foldedOn);
  writeFileSync(full, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Updated ${manifestPath}`);
  return entries;
}

if (isMain(import.meta.url)) runMain(runCampaignSources);
