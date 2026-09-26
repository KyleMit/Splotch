#!/usr/bin/env node

// Regenerates the tables in docs/CODE-MAP.md from one commit's tree. See
// tools/code-map/README.md.

import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

import { isMain, parseOrFail, ROOT, runMain } from '../lib/proc.mjs';
import { countLinesByOid, listTrackedBlobs, resolveCommit } from './lib/code-map-inventory.mjs';
import {
  assignFiles,
  renderAssignmentsTsv,
  renderBlocks,
  spliceBlocks,
  summarize,
  unusedDomainRules,
} from './lib/code-map-report.mjs';
import { CODE_MAP_PATH } from './lib/code-map-rules.mjs';

const USAGE = `Usage: npm run gen:code-map -- [options]

  --ref <rev>      Commit whose tree is counted (default HEAD)
  --assignments    Print every tracked path with its area, bucket, and line count as TSV
                   instead of writing ${CODE_MAP_PATH}`;

function readOptions(argv) {
  const { values } = parseOrFail(() =>
    parseArgs({
      args: argv,
      options: {
        ref: { type: 'string', default: 'HEAD' },
        assignments: { type: 'boolean', default: false },
        help: { type: 'boolean', default: false },
      },
    })
  );
  return values;
}

function formatMarkdown(path) {
  const result = spawnSync('npx', ['dprint', 'fmt', path], { cwd: ROOT, stdio: 'pipe' });
  if (result.status !== 0) {
    throw new Error(`dprint could not format ${path}: ${result.stderr?.toString().trim()}`);
  }
}

export function generateCodeMap(argv = process.argv.slice(2)) {
  const options = readOptions(argv);
  if (options.help) {
    console.log(USAGE);
    return;
  }
  const commit = resolveCommit(options.ref);
  const blobs = listTrackedBlobs(commit.sha);
  const assignments = assignFiles(blobs.map((blob) => blob.path));
  const measured = new Set(
    assignments.filter((entry) => entry.kind === 'measured').map((entry) => entry.path)
  );
  const measuredBlobs = blobs.filter((blob) => measured.has(blob.path));
  const linesByOid = countLinesByOid(measuredBlobs.map((blob) => blob.oid));
  const linesByPath = new Map(measuredBlobs.map((blob) => [blob.path, linesByOid.get(blob.oid)]));

  if (options.assignments) {
    console.log(renderAssignmentsTsv(assignments, linesByPath));
    return;
  }

  const summary = summarize(assignments, linesByPath);
  const documentPath = join(ROOT, CODE_MAP_PATH);
  const document = readFileSync(documentPath, 'utf8');
  writeFileSync(documentPath, spliceBlocks(document, renderBlocks(summary, commit)));
  formatMarkdown(CODE_MAP_PATH);
  console.log(
    `Wrote ${CODE_MAP_PATH} from ${commit.sha} (${commit.date}): ` +
      `${summary.measuredLoc.toLocaleString('en-US')} LOC across ${summary.measuredFiles} files`
  );
  for (const rule of unusedDomainRules(assignments)) {
    console.warn(`warning: web/src domain rule matched no file — ${rule}`);
  }
}

if (isMain(import.meta.url)) runMain(async () => generateCodeMap());
