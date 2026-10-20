// Prints the crash matrix's valid/invalid counts and verdicts per scenario, target, and arm.
import { isMain, runMain } from '../lib/proc.mjs';
import { parseFlags } from './lib/cli-flags.mjs';
import { readCrashMatrix, tallyCrashRuns } from './lib/crash-tally.mjs';

const FLAGS = { root: { type: 'string' }, json: { type: 'boolean', default: false } };
const COLUMNS = ['valid', 'alive', 'crashed', 'screened', 'invalid', 'diagnostics'];

export function analyzeCrashMatrix(argv) {
  const { values } = parseFlags(argv, { options: FLAGS, required: ['root'] });
  const { runs, archivedInvalid } = readCrashMatrix(values.root);
  const rows = tallyCrashRuns(runs);
  if (values.json) {
    console.log(JSON.stringify({ rows, archivedInvalid }, null, 1));
    return;
  }
  console.log(['scenario', 'target', 'arm', ...COLUMNS].join(' '));
  for (const row of rows) {
    console.log([row.scenario, row.target, row.arm, ...COLUMNS.map((c) => row[c])].join(' '));
  }
  console.log('archived invalid runs', JSON.stringify(archivedInvalid));
}

if (isMain(import.meta.url)) runMain(async () => analyzeCrashMatrix(process.argv.slice(2)));
