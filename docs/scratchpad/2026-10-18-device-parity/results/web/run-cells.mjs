// Runs named cells from a cell module and merges their observations into its JSON record, so a
// batch can be rerun alone: node run-cells.mjs --module web-1 --cells driver,back-desktop
import { parseArgs } from 'node:util';
import { launch, readJson, writeJson } from './harness.mjs';

const BATCH_LIMIT_MS = 600_000;

const { values } = parseArgs({
  options: {
    module: { type: 'string' },
    cells: { type: 'string' },
    record: { type: 'string' },
    list: { type: 'boolean' },
  },
  strict: true,
});
if (!values.module) throw new Error('Usage: --module <web-1|ai-1> [--cells a,b] [--list]');
const { CELLS, RECORD: DEFAULT_RECORD } = await import(`./${values.module}-cells.mjs`);
// A long cell can run beside another batch when it writes its own record file.
const RECORD = values.record ?? DEFAULT_RECORD;
if (values.list) {
  console.log(Object.keys(CELLS).join('\n'));
  process.exit(0);
}
const names = values.cells ? values.cells.split(',') : Object.keys(CELLS);
const unknown = names.filter((name) => !CELLS[name]);
if (unknown.length) throw new Error(`Unknown cells: ${unknown.join(', ')}`);

const record = readJson(RECORD) ?? { cells: {} };
const browser = await launch();
record.browser = `chromium ${browser.version()} (headless)`;
const batchStarted = Date.now();
try {
  for (const name of names) {
    if (Date.now() - batchStarted > BATCH_LIMIT_MS) {
      console.log(`batch limit reached before ${name}; rerun the remaining cells`);
      break;
    }
    const started = Date.now();
    process.stdout.write(`${name} … `);
    const observation = await CELLS[name](browser);
    record.cells[name] = {
      ranAt: new Date(started).toISOString(),
      ms: Date.now() - started,
      ...observation,
    };
    writeJson(RECORD, record);
    console.log(`${Date.now() - started} ms`);
    console.log(JSON.stringify(observation, null, 1).slice(0, 4000));
  }
} finally {
  await browser.close();
}
