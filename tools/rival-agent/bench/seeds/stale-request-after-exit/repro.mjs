// Fails when a pending request is handed out after the rival's terminal file exists.
import { randomUUID } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const spool = await import(pathToFileURL(join(process.cwd(), 'tools/rival-agent/spool.mjs')).href);
const root = mkdtempSync(join(tmpdir(), 'rival-bench-stale-'));
const session = spool.createSessionDirectory(randomUUID(), root);
spool.appendRequest(session, { command: 'echo stale', why: 'stale' });
spool.writeJsonAtomic(spool.sessionPath(session, spool.SESSION_FILES.done), {});
const outcome = await spool.waitForPendingOrEnd(session, { timeoutMs: 0 });
if (outcome.state !== 'done') throw new Error(`expected done, got ${outcome.state}`);
