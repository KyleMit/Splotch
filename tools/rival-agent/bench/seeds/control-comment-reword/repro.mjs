// A control carries no defect; its repro passes before and after the patch.
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

await import(pathToFileURL(join(process.cwd(), 'tools/rival-agent/spool.mjs')).href);
