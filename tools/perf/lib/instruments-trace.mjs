// Read an `xctrace export` XML table into rows.
//
// Instruments interns repeated values: the first occurrence of a value carries
// `id="N"` and the text, and every later occurrence is `<tag ref="N"/>` with no
// text. A parser that ignores that reads most columns as empty.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function exportTable(tracePath, schema, tmpPath) {
  try {
    execFileSync(
      'xcrun',
      [
        'xctrace',
        'export',
        '--input',
        tracePath,
        '--xpath',
        `/trace-toc/run[@number="1"]/data/table[@schema="${schema}"]`,
        '--output',
        tmpPath,
      ],
      { stdio: 'ignore' }
    );
  } catch {
    return null;
  }
  return existsSync(tmpPath) ? readFileSync(tmpPath, 'utf8') : null;
}

export function parseRows(xml) {
  if (!xml) return { columns: [], rows: [] };
  const columns = [...xml.matchAll(/<mnemonic>([^<]+)<\/mnemonic>/g)].map((m) => m[1]);
  const values = new Map();
  const rows = [];
  for (const rowMatch of xml.matchAll(/<row>([\s\S]*?)<\/row>/g)) {
    const cells = [];
    for (const cell of rowMatch[1].matchAll(
      /<([\w-]+)(?:\s+([^>]*?))?(?:\/>|>([\s\S]*?)<\/\1>)/g
    )) {
      const attrs = cell[2] ?? '';
      const ref = /\bref="(\d+)"/.exec(attrs)?.[1];
      if (ref) {
        cells.push(values.get(ref));
        continue;
      }
      const id = /\bid="(\d+)"/.exec(attrs)?.[1];
      const text = cell[3] ?? '';
      if (id) values.set(id, text);
      cells.push(text);
    }
    rows.push(Object.fromEntries(columns.map((name, i) => [name, cells[i]])));
  }
  return { columns, rows };
}

// The entry point for reading a trace, kept public with no in-repo caller on
// purpose: an `xctrace` investigation is ad hoc by nature — you pick a schema
// once you know what you are chasing — and the reason this module exists is that
// hand-rolling the read is where the ref-interning trap above costs an
// afternoon. See docs/PROFILING-IPAD.md for the capture side.
/** @public */
export function readTable(tracePath, schema, tmpDir = tmpdir()) {
  const tmp = join(tmpDir, `splotch-instruments-table-${schema}.xml`);
  const xml = exportTable(tracePath, schema, tmp);
  const parsed = parseRows(xml);
  if (existsSync(tmp)) unlinkSync(tmp);
  return parsed;
}

const percentile = (values, fraction) => {
  if (!values.length) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(fraction * sorted.length) - 1)];
};

export function summarizeDurations(rows, key = 'duration') {
  const ms = rows.map((row) => Number(row[key]) / 1e6).filter((value) => Number.isFinite(value));
  if (!ms.length) return null;
  const round = (value) => Math.round(value * 100) / 100;
  return {
    n: ms.length,
    p50: round(percentile(ms, 0.5)),
    p95: round(percentile(ms, 0.95)),
    max: round(percentile(ms, 1)),
    totalMs: round(ms.reduce((total, value) => total + value, 0)),
  };
}

export function countBy(rows, key) {
  const counts = {};
  for (const row of rows) counts[row[key]] = (counts[row[key]] ?? 0) + 1;
  return counts;
}
