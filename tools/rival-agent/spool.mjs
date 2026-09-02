import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

// Every session directory is owner-only: the spool carries whole command outputs from the reviewed
// checkout, and tmpdir() is world-listable on Linux.
const SESSION_DIRECTORY_MODE = 0o700;
const FILE_MODE = 0o600;
export const SESSION_ROOT = join(tmpdir(), 'splotch-rival-agent');

export const SESSION_FILES = Object.freeze({
  session: 'session.json',
  done: 'done.json',
  failed: 'failed.json',
  findings: 'findings.json',
  rawResult: 'rival-result.txt',
  log: 'rival.ndjson',
  packet: 'packet',
  requests: 'requests',
  replies: 'replies',
  outputs: 'outputs',
});

// A reply carries at most this much of the command output inline; the full text stays in the
// spool file. Past reviews' commands averaged a few kilobytes, and a test run that floods the
// rival's context with megabytes of output is worth less to it than the tail that names the
// failure, which is why the tail keeps the larger share.
export const MAX_INLINE_OUTPUT_CHARS = 48 * 1024;
const INLINE_HEAD_CHARS = 16 * 1024;
export const REPLY_POLL_MS = 250;

export function sessionPath(session, ...parts) {
  return join(session, ...parts);
}

export function createSessionDirectory(id, root = SESSION_ROOT) {
  mkdirSync(root, { recursive: true, mode: SESSION_DIRECTORY_MODE });
  const session = join(root, id);
  mkdirSync(session, { mode: SESSION_DIRECTORY_MODE });
  for (const directory of [
    SESSION_FILES.packet,
    SESSION_FILES.requests,
    SESSION_FILES.replies,
    SESSION_FILES.outputs,
  ]) {
    mkdirSync(join(session, directory), { mode: SESSION_DIRECTORY_MODE });
  }
  return session;
}

// Written to a sibling and renamed so a reader polling the directory never sees a half-written
// file: the broker server and the handler CLI are separate processes watching the same spool.
export function writeJsonAtomic(path, value) {
  const temporary = join(dirname(path), `.${Date.now()}-${process.pid}.tmp`);
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: FILE_MODE });
  renameSync(temporary, path);
}

export function readJson(path) {
  if (!existsSync(path)) return undefined;
  return JSON.parse(readFileSync(path, 'utf8'));
}

function sequenceNumbers(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory)
    .map((name) => /^(\d+)\.json$/.exec(name)?.[1])
    .filter(Boolean)
    .map(Number)
    .sort((a, b) => a - b);
}

export function appendRequest(session, { command, why }) {
  const directory = sessionPath(session, SESSION_FILES.requests);
  const seq = (sequenceNumbers(directory).at(-1) ?? 0) + 1;
  const request = { seq, command, why, createdAt: new Date().toISOString() };
  writeJsonAtomic(join(directory, `${seq}.json`), request);
  return request;
}

export function readRequests(session) {
  const directory = sessionPath(session, SESSION_FILES.requests);
  return sequenceNumbers(directory).map((seq) => readJson(join(directory, `${seq}.json`)));
}

export function readReply(session, seq) {
  return readJson(sessionPath(session, SESSION_FILES.replies, `${seq}.json`));
}

export function outputPath(session, seq) {
  return sessionPath(session, SESSION_FILES.outputs, `${seq}.out`);
}

export function truncateOutput(text) {
  if (text.length <= MAX_INLINE_OUTPUT_CHARS) return { text, truncated: false };
  const head = text.slice(0, INLINE_HEAD_CHARS);
  const tail = text.slice(-(MAX_INLINE_OUTPUT_CHARS - INLINE_HEAD_CHARS));
  const omitted = text.length - head.length - tail.length;
  return {
    text: `${head}\n[… ${omitted} characters omitted; the full output is in the spool …]\n${tail}`,
    truncated: true,
  };
}

export function writeReply(session, seq, reply) {
  const path = sessionPath(session, SESSION_FILES.replies, `${seq}.json`);
  if (existsSync(path)) throw new Error(`request ${seq} already has a reply`);
  writeJsonAtomic(path, { seq, repliedAt: new Date().toISOString(), ...reply });
}

export function pendingRequests(session) {
  return readRequests(session).filter((request) => readReply(session, request.seq) === undefined);
}

export function readSession(session) {
  return readJson(sessionPath(session, SESSION_FILES.session));
}

export function readDone(session) {
  return readJson(sessionPath(session, SESSION_FILES.done));
}

export function readFailed(session) {
  return readJson(sessionPath(session, SESSION_FILES.failed));
}

function newestMtime(directory) {
  if (!existsSync(directory)) return 0;
  return readdirSync(directory).reduce(
    (newest, name) => Math.max(newest, statSync(join(directory, name)).mtimeMs),
    statSync(directory).mtimeMs
  );
}

// The rival is silent on its stream while a brokered request is out with the handler, so the
// watchdog counts spool traffic as liveness alongside stream events.
export function lastSpoolActivityAt(session) {
  return Math.max(
    newestMtime(sessionPath(session, SESSION_FILES.requests)),
    newestMtime(sessionPath(session, SESSION_FILES.replies))
  );
}

// An unanswered request means the handler is deciding or running the command — a full test run
// can sit silent for well past the stream's stall budget — so the request itself counts as
// activity until it has waited this long. Both CLIs' MCP tool timeouts are raised to match.
export const PENDING_REQUEST_TIMEOUT_MS = 60 * 60 * 1000;

export function spoolActivityAt(session, now = Date.now) {
  const [oldestPending] = pendingRequests(session);
  if (oldestPending) {
    const requestedAt = Date.parse(oldestPending.createdAt);
    if (now() - requestedAt < PENDING_REQUEST_TIMEOUT_MS) return now();
  }
  return lastSpoolActivityAt(session);
}

const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));

export async function waitForReply(session, seq, { pollMs = REPLY_POLL_MS, shouldStop } = {}) {
  for (;;) {
    const reply = readReply(session, seq);
    if (reply) return reply;
    if (shouldStop?.()) return undefined;
    await sleep(pollMs);
  }
}

export async function waitForPendingOrEnd(
  session,
  { timeoutMs, pollMs = REPLY_POLL_MS, now = Date.now } = {}
) {
  const deadline = now() + timeoutMs;
  for (;;) {
    const pending = pendingRequests(session);
    if (pending.length > 0) return { state: 'request', request: pending[0] };
    const failed = readFailed(session);
    if (failed) return { state: 'failed', failed };
    const done = readDone(session);
    if (done) return { state: 'done', done };
    if (now() >= deadline) return { state: 'waiting' };
    await sleep(pollMs);
  }
}
