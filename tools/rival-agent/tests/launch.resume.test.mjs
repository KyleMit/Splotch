import { describe, expect, it, vi } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launch, ledgerKeyFor, parseLaunchArgs } from '../launch.mjs';
import { ledgerPath, readLedgerRecord, writeLedgerRecord } from '../ledger.mjs';
import { runStreaming, STREAM_FAILURE } from '../stream.mjs';
import {
  createDisposableWorktree,
  git,
  removeDisposableWorktree,
  resolveScope,
} from '../worktree.mjs';

vi.mock('../stream.mjs', async (importOriginal) => ({
  ...(await importOriginal()),
  runStreaming: vi.fn(),
}));

vi.mock('../worktree.mjs', async (importOriginal) => ({
  ...(await importOriginal()),
  git: vi.fn(),
  resolveScope: vi.fn(),
  createDisposableWorktree: vi.fn(),
  removeDisposableWorktree: vi.fn(),
  writeReviewPacket: vi.fn(),
}));

const ORIGINAL_SESSION = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const BASE = 'a'.repeat(40);
const HEAD = 'b'.repeat(40);

function createResumeFixture() {
  vi.clearAllMocks();
  const root = mkdtempSync(join(tmpdir(), 'rival-resume-test-'));
  const sessions = [];
  const options = parseLaunchArgs(['--cwd', root, '--base', BASE]);
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
    if (args[0] === 'log') return '';
    return args[1] === '--show-toplevel' ? root : 'feature';
  });
  vi.mocked(resolveScope).mockReturnValue({ base: BASE, head: HEAD, description: 'test branch' });
  const path = ledgerPath(
    ledgerKeyFor({ repoRoot: root, rival: vendor.rival, scope: options.scope, branch: 'feature' }),
    vendor.ledgerDirectory
  );
  writeLedgerRecord(path, {
    rival: vendor.rival,
    rivalSessionId: ORIGINAL_SESSION,
    rounds: 2,
    lastBase: BASE,
    lastHead: BASE,
  });
  return {
    path,
    vendor,
    run: () =>
      launch(options, vendor, {
        onProgress(line) {
          if (line.startsWith('session: ')) sessions.push(line.slice('session: '.length));
        },
      }),
    dispose() {
      for (const session of sessions) rmSync(session, { recursive: true, force: true });
      rmSync(root, { recursive: true, force: true });
    },
  };
}

describe('reviewer resume provenance', () => {
  it.each(Object.values(STREAM_FAILURE))(
    'preserves the ledger and stops after one failed resume (%s)',
    async (code) => {
      const fixture = createResumeFixture();
      const original = readFileSync(fixture.path);
      const failure = Object.assign(new Error('resume failed'), { code });
      vi.mocked(runStreaming).mockRejectedValue(failure);
      try {
        await expect(fixture.run()).rejects.toBe(failure);
        expect(runStreaming).toHaveBeenCalledTimes(1);
        expect(fixture.vendor.buildArgs).toHaveBeenCalledWith(
          expect.objectContaining({ rivalSession: { mode: 'resume', id: ORIGINAL_SESSION } })
        );
        expect(fixture.vendor.newSessionId).not.toHaveBeenCalled();
        expect(readFileSync(fixture.path)).toEqual(original);
        expect(removeDisposableWorktree).toHaveBeenCalledTimes(1);
        const session = join(vi.mocked(createDisposableWorktree).mock.calls[0][2], '..');
        expect(JSON.parse(readFileSync(join(session, 'failed.json'), 'utf8'))).toMatchObject({
          reason: failure.message,
          code,
        });
      } finally {
        fixture.dispose();
      }
    }
  );

  it('resumes a restored reviewer at its remaining round and refuses another round', async () => {
    const fixture = createResumeFixture();
    const findings = { summary: 'Verified restoration', findings: [], unverified: [] };
    vi.mocked(runStreaming).mockResolvedValue({
      sessionId: ORIGINAL_SESSION,
      message: JSON.stringify(findings),
    });
    try {
      const done = await fixture.run();
      expect(done).toMatchObject({ round: 3, rivalSessionId: ORIGINAL_SESSION });
      expect(readLedgerRecord(fixture.path)).toMatchObject({
        rivalSessionId: ORIGINAL_SESSION,
        rounds: 3,
        lastBase: BASE,
        lastHead: HEAD,
      });
      await expect(fixture.run()).rejects.toThrow('review round budget of 3 exhausted');
      expect(runStreaming).toHaveBeenCalledTimes(1);
      expect(fixture.vendor.newSessionId).not.toHaveBeenCalled();
    } finally {
      fixture.dispose();
    }
  });
});
