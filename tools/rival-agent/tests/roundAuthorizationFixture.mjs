import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { vi } from 'vitest';
import { launch, ledgerKeyFor, parseLaunchArgs } from '../launch.mjs';
import { ledgerPath, MAX_ROUNDS, writeLedgerRecord } from '../ledger.mjs';
import { runStreaming } from '../stream.mjs';
import { git, resolveScope } from '../worktree.mjs';
import { readPullRequest } from '../post-review.mjs';

export const ORIGINAL_SESSION = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
export const OTHER_SESSION = 'ffffffff-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const OLD_BASE = 'a'.repeat(40);
const OLD_HEAD = 'b'.repeat(40);
export const BASE = 'c'.repeat(40);
export const HEAD = 'd'.repeat(40);
export const FINDINGS = {
  summary: 'Verified authorized continuation',
  findings: [],
  unverified: [],
};

export function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

export function createFixture() {
  vi.resetAllMocks();
  const root = mkdtempSync(join(tmpdir(), 'rival-authorization-test-'));
  const sessions = [];
  const progress = [];
  const grantPath = join(root, 'human-authorization.json');
  const options = parseLaunchArgs([
    '--cwd',
    root,
    '--pr',
    '7',
    '--round-authorization-file',
    grantPath,
  ]);
  const vendor = {
    rival: 'claude',
    command: 'unused-test-command',
    ledgerDirectory: join(root, 'ledger'),
    prepare: () => ({ env: {} }),
    resolveModel: () => 'test-model',
    buildArgs: vi.fn(() => []),
    newSessionId: vi.fn(),
  };
  vi.mocked(git).mockImplementation((cwd, args) => {
    if (args[0] === 'log' || args[0] === 'fetch') return '';
    if (args[0] === 'remote') return 'https://github.com/KyleMit/Splotch';
    if (args[0] === 'ls-remote') return `${HEAD}\trefs/heads/feature`;
    return args[1] === '--show-toplevel' ? root : 'feature';
  });
  vi.mocked(readPullRequest).mockReturnValue({
    headRefName: 'feature',
    headRefOid: HEAD,
    baseRefOid: BASE,
  });
  vi.mocked(resolveScope).mockReturnValue({ base: BASE, head: HEAD, description: 'test PR' });
  vi.mocked(runStreaming).mockResolvedValue({
    sessionId: ORIGINAL_SESSION,
    message: JSON.stringify(FINDINGS),
  });
  const path = ledgerPath(
    ledgerKeyFor({ repoRoot: root, rival: vendor.rival, scope: options.scope }),
    vendor.ledgerDirectory
  );
  const record = {
    rival: vendor.rival,
    rivalSessionId: ORIGINAL_SESSION,
    rounds: MAX_ROUNDS,
    lastBase: OLD_BASE,
    lastHead: OLD_HEAD,
    updatedAt: '2026-10-01T00:00:00.000Z',
    historicalField: 'preserved',
  };
  writeLedgerRecord(path, record);
  const originalBytes = readFileSync(path);
  const grant = {
    schemaVersion: 1,
    repoRoot: root,
    pullRequest: 7,
    rival: vendor.rival,
    rivalSessionId: ORIGINAL_SESSION,
    ledgerSha256: sha256(originalBytes),
    priorRounds: MAX_ROUNDS,
    authorizedRound: MAX_ROUNDS + 1,
    authorization: {
      kind: 'direct-human-message',
      quote: 'I authorize one additional review round in the original conversation.',
      source: 'Codex chat test / direct user message',
      recordedAt: '2026-10-08T00:00:00.000Z',
    },
  };
  const writeGrant = (value = grant) => writeFileSync(grantPath, `${JSON.stringify(value)}\n`);
  writeGrant();
  const claimDirectory = join(vendor.ledgerDirectory, 'round-authorizations');
  return {
    root,
    path,
    options,
    vendor,
    grantPath,
    grant,
    record,
    originalBytes,
    writeGrant,
    sessions,
    progress,
    claimDirectory,
    claims: () =>
      existsSync(claimDirectory)
        ? readdirSync(claimDirectory).map((name) => join(claimDirectory, name))
        : [],
    run: (overrides = {}) =>
      launch({ ...options, ...overrides }, vendor, {
        onProgress(line) {
          progress.push(line);
          if (line.startsWith('session: ')) sessions.push(line.slice('session: '.length));
        },
      }),
    dispose() {
      for (const session of sessions) rmSync(session, { recursive: true, force: true });
      rmSync(root, { recursive: true, force: true });
    },
  };
}
