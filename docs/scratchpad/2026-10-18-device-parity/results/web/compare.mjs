// Prints where `rn-web` and `web-prod` disagree in a cell's observations: any differing state or
// text, and any box edge more than the plan's 2 px tolerance apart. Capture bookkeeping (shot
// paths, digests, settle timing) is not compared; the inspector reviews those images directly.
import { parseArgs } from 'node:util';
import { readJson } from './harness.mjs';

const EDGE_TOLERANCE_PX = 2;
const IGNORED = new Set(['shot', 'digest', 'settleMs', 'frames', 'ms', 'ranAt', 'consoleErrors']);

function isBox(value) {
  return (
    value &&
    typeof value === 'object' &&
    ['x', 'y', 'w', 'h'].every((key) => typeof value[key] === 'number')
  );
}

function boxDelta(a, b) {
  return Math.max(
    Math.abs(a.x - b.x),
    Math.abs(a.y - b.y),
    Math.abs(a.x + a.w - (b.x + b.w)),
    Math.abs(a.y + a.h - (b.y + b.h))
  );
}

export function differences(a, b, path = '') {
  if (isBox(a) && isBox(b)) {
    const delta = boxDelta(a, b);
    return delta > EDGE_TOLERANCE_PX ? [{ path, rn: a, prod: b, edgeDeltaPx: delta }] : [];
  }
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    return [...keys]
      .filter((key) => !IGNORED.has(key))
      .flatMap((key) => differences(a[key], b[key], path ? `${path}.${key}` : key));
  }
  return JSON.stringify(a) === JSON.stringify(b) ? [] : [{ path, rn: a, prod: b }];
}

// A cell holds either {rn-web, web-prod} or variants keyed by name, each holding both arms.
export function cellDifferences(cell) {
  if (cell['rn-web'] || cell['web-prod'])
    return { '': differences(cell['rn-web'], cell['web-prod']) };
  return Object.fromEntries(
    Object.entries(cell)
      .filter(
        ([, value]) => value && typeof value === 'object' && (value['rn-web'] || value['web-prod'])
      )
      .map(([variant, value]) => [variant, differences(value['rn-web'], value['web-prod'])])
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { values } = parseArgs({
    options: { record: { type: 'string' }, cells: { type: 'string' } },
    strict: true,
  });
  const record = readJson(values.record ?? 'web-1-observations.json');
  const names = values.cells ? values.cells.split(',') : Object.keys(record.cells);
  for (const name of names) {
    const cell = record.cells[name];
    if (!cell) continue;
    for (const [variant, diffs] of Object.entries(cellDifferences(cell))) {
      console.log(`## ${name}${variant ? ` [${variant}]` : ''}: ${diffs.length} difference(s)`);
      for (const diff of diffs)
        console.log(
          `  ${diff.path}: rn=${JSON.stringify(diff.rn)} prod=${JSON.stringify(diff.prod)}${diff.edgeDeltaPx ? ` (Δ${diff.edgeDeltaPx}px)` : ''}`
        );
    }
  }
}
