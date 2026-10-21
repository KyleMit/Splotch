import { readFileSync, readdirSync, statSync } from 'node:fs';
const root = 'docs/scratchpad/2026-10-21-rn-bug-hunt-web/evidence/visual',
  rows = [];
function walk(path) {
  for (const e of readdirSync(path, { withFileTypes: true })) {
    const p = path + '/' + e.name;
    if (e.isDirectory()) walk(p);
    else if (e.name === 'comparison.json')
      rows.push({ ...JSON.parse(readFileSync(p, 'utf8')), mtime: statSync(p).mtimeMs });
  }
}
walk(root);
const nonSettings = rows.flatMap((r) =>
  (r.boxDifferences ?? [])
    .filter((d) => !d.key.startsWith('settings'))
    .map((d) => ({ id: r.id, key: d.key, type: d.type, maxDelta: d.maxDelta }))
);
const latest = rows
  .sort((a, b) => b.mtime - a.mtime)
  .slice(0, 1)
  .map((r) => r.id);
console.log(
  JSON.stringify({
    at: new Date().toISOString(),
    counts: Object.fromEntries(
      ['chromium', 'webkit', 'firefox'].map((e) => [e, rows.filter((r) => r.engine === e).length])
    ),
    compared: rows.filter((r) => r.status === 'COMPARED').length,
    blocked: rows
      .filter((r) => r.status === 'BLOCKED')
      .map((r) => ({ id: r.id, errors: r.errors })),
    unsettled: rows.filter((r) => r.unsettled?.length).map((r) => r.id),
    nonSettingsDifferences: nonSettings.length,
    examples: nonSettings.sort((a, b) => (b.maxDelta ?? 0) - (a.maxDelta ?? 0)).slice(0, 8),
    latest,
  })
);
