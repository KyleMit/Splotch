import { parseArgs } from 'node:util';
import { findFreePort } from './lib/net.mjs';
import { isMain, parseNumberFlag, runMain, TCP_PORT } from './lib/proc.mjs';

const parsePortFlag = (name, raw) =>
  raw === undefined ? undefined : parseNumberFlag(name, raw, TCP_PORT);

export async function showFreePort(argv = process.argv.slice(2)) {
  const { values } = parseArgs({
    args: argv,
    options: { from: { type: 'string' }, to: { type: 'string' }, host: { type: 'string' } },
    allowPositionals: false,
  });
  const port = await findFreePort({
    from: parsePortFlag('from', values.from),
    to: parsePortFlag('to', values.to),
    host: values.host,
  });
  console.log(port);
}

if (isMain(import.meta.url)) runMain(showFreePort);
