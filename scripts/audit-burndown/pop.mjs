// pop.mjs — deterministic surgery on docs/AUDIT.md (see lib.mjs for why no
// agent touches that file directly).
//
//   node scripts/audit-burndown/pop.mjs            print the first entry
//   node scripts/audit-burndown/pop.mjs --delete   print it AND remove it
//   node scripts/audit-burndown/pop.mjs --count    print how many entries remain
//   node scripts/audit-burndown/pop.mjs --peek N   print the Nth entry, no removal
//
// Override the target file with AUDIT_FILE=path.
// Exit codes: 0 ok, 2 bad usage / missing file, 3 backlog empty.

import { existsSync } from 'node:fs';
import { auditFile, chdirRoot, countEntries, deleteFirstEntry, getEntry } from './lib.mjs';

chdirRoot();

const file = auditFile();
const mode = process.argv[2] ?? 'print';

if (!existsSync(file)) {
  console.error(`pop: no such file: ${file}`);
  process.exit(2);
}

if (mode === '--count') {
  console.log(countEntries(file));
  process.exit(0);
}

let index = 1;
if (mode === '--peek') {
  index = Number(process.argv[3]);
  if (!Number.isInteger(index) || index < 1) {
    console.error('pop: --peek needs a positive number');
    process.exit(2);
  }
}

const entry = getEntry(index, file);
if (entry === null) {
  if (index === 1) {
    console.error('AUDIT_EMPTY');
    process.exit(3);
  }
  console.error(`pop: no entry at index ${index}`);
  process.exit(2);
}

console.log(entry);
if (mode === '--delete') deleteFirstEntry(file);
