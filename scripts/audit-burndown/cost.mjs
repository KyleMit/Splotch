// cost.mjs — what has this burndown cost, and what will the full run cost?
// Sums the `claude -p` JSON envelopes saved per call in .audit-work/logs/.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { chdirRoot, countEntries, LOGS, WORK } from './lib.mjs';

chdirRoot();

const files = existsSync(LOGS) ? readdirSync(LOGS).filter((f) => f.endsWith('.json')) : [];
if (files.length === 0) {
  console.log('no run logs yet');
  process.exit(0);
}

const envelopes = files.map((f) => {
  try {
    return { file: f, ...JSON.parse(readFileSync(join(LOGS, f), 'utf8')) };
  } catch {
    return { file: f };
  }
});

const sum = (list, key) => list.reduce((acc, e) => acc + (e[key] ?? 0), 0);

console.log('by role');
for (const role of ['verify', 'impl', 'review', 'fix']) {
  const roleEnvelopes = envelopes.filter((e) => e.file.includes(`.${role}`));
  if (roleEnvelopes.length === 0) continue;
  const cost = sum(roleEnvelopes, 'total_cost_usd');
  console.log(
    `  ${role.padEnd(8)} ${String(roleEnvelopes.length).padStart(3)} calls   $${cost.toFixed(4)}`
  );
}

const total = sum(envelopes, 'total_cost_usd');
const done = existsSync(join(WORK, 'completed.log'))
  ? readFileSync(join(WORK, 'completed.log'), 'utf8')
      .split('\n')
      .filter((l) => l.trim()).length
  : 0;
const remaining = countEntries() ?? 0;

console.log();
console.log(`total spend    $${total.toFixed(4)}`);
console.log(`total turns    ${sum(envelopes, 'num_turns')}`);
console.log(`wall time      ${Math.floor(sum(envelopes, 'duration_ms') / 60000)} min`);

if (done > 0) {
  const perIssue = total / done;
  console.log();
  console.log(`per issue      $${perIssue.toFixed(4)}`);
  console.log(
    `projected      $${(perIssue * remaining).toFixed(2)} to finish the remaining ${remaining}`
  );
}

console.log('\nany capped or errored calls');
const errored = envelopes.filter((e) => e.is_error === true);
if (errored.length === 0) console.log('  none');
const bySubtype = new Map();
for (const e of errored) {
  const key = e.subtype ?? 'error';
  bySubtype.set(key, (bySubtype.get(key) ?? 0) + 1);
}
for (const [subtype, count] of bySubtype) console.log(`  ${count}  ${subtype}`);
