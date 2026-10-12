import {
  copyFileSync,
  existsSync,
  readFileSync,
  rmSync,
  symlinkSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { parseLaunchArgs } from '../launch.mjs';
import { MAX_ROUNDS, readLedgerRecord, writeLedgerRecord } from '../ledger.mjs';
import { runStreaming, STREAM_FAILURE } from '../stream.mjs';
import { createDisposableWorktree, removeDisposableWorktree } from '../worktree.mjs';
import {
  BASE,
  HEAD,
  ORIGINAL_SESSION,
  OTHER_SESSION,
  FINDINGS,
  createFixture,
  sha256,
} from './roundAuthorizationFixture.mjs';

vi.mock('../stream.mjs', async (importOriginal) => ({
  ...(await importOriginal()),
  runStreaming: vi.fn(),
}));
vi.mock('../post-review.mjs', async (importOriginal) => ({
  ...(await importOriginal()),
  readPullRequest: vi.fn(),
}));
vi.mock('../worktree.mjs', async (importOriginal) => ({
  ...(await importOriginal()),
  git: vi.fn(),
  resolveScope: vi.fn(),
  createDisposableWorktree: vi.fn(),
  removeDisposableWorktree: vi.fn(),
  writeReviewPacket: vi.fn(),
}));

describe('explicit human-authorized PR continuation', () => {
  it('keeps the ordinary cap and resumes only one extra round with durable original history', async () => {
    const f = createFixture();
    try {
      await expect(f.run({ roundAuthorizationFile: undefined })).rejects.toThrow(
        'budget of 3 exhausted'
      );
      expect(runStreaming).not.toHaveBeenCalled();
      const done = await f.run();
      const evidence = {
        grant: f.grant,
        priorLedgerRecord: f.record,
        authorizationFileSha256: sha256(readFileSync(f.grantPath)),
      };
      expect(done).toMatchObject({
        round: 4,
        rivalSessionId: ORIGINAL_SESSION,
        roundAuthorization: evidence,
      });
      expect(f.vendor.buildArgs).toHaveBeenCalledWith(
        expect.objectContaining({ rivalSession: { mode: 'resume', id: ORIGINAL_SESSION } })
      );
      expect(f.vendor.newSessionId).not.toHaveBeenCalled();
      expect(readLedgerRecord(f.path)).toMatchObject({
        rounds: 4,
        rivalSessionId: ORIGINAL_SESSION,
        lastBase: BASE,
        lastHead: HEAD,
        historicalField: 'preserved',
        roundAuthorization: evidence,
      });
      expect(JSON.parse(readFileSync(join(done.session, 'session.json'), 'utf8'))).toMatchObject({
        round: 4,
        resumed: true,
        roundAuthorization: evidence,
      });
      expect(JSON.parse(readFileSync(join(done.session, 'done.json'), 'utf8'))).toMatchObject({
        roundAuthorization: evidence,
      });
      expect(f.claims()).toHaveLength(1);
      expect(statSync(f.claims()[0]).mode & 0o777).toBe(0o600);
      expect(JSON.parse(readFileSync(f.claims()[0], 'utf8'))).toMatchObject({
        state: 'started',
        session: done.session,
        evidence,
      });
      await expect(f.run({ roundAuthorizationFile: undefined })).rejects.toThrow(
        'budget of 3 exhausted'
      );
      await expect(f.run()).rejects.toThrow('does not match');
      expect(runStreaming).toHaveBeenCalledTimes(1);
      expect(MAX_ROUNDS).toBe(3);
    } finally {
      f.dispose();
    }
  });

  it.each(['empty', 'relative', 'directory', 'symlink', 'oversized'])(
    'refuses an invalid authorization file boundary: %s',
    async (kind) => {
      const f = createFixture();
      const link = join(f.root, 'grant-link.json');
      symlinkSync(f.grantPath, link);
      const paths = {
        empty: '',
        relative: 'authorization.json',
        directory: f.root,
        symlink: link,
        oversized: f.grantPath,
      };
      if (kind === 'oversized') writeFileSync(f.grantPath, ' '.repeat(256 * 1024 + 1));
      try {
        await expect(f.run({ roundAuthorizationFile: paths[kind] })).rejects.toThrow();
        expect(runStreaming).not.toHaveBeenCalled();
        expect(readFileSync(f.path)).toEqual(f.originalBytes);
      } finally {
        f.dispose();
      }
    }
  );

  it.each([
    [
      'checkout',
      (g) => {
        g.repoRoot = '/different-checkout';
      },
    ],
    [
      'PR',
      (g) => {
        g.pullRequest = 8;
      },
    ],
    [
      'vendor',
      (g) => {
        g.rival = 'codex';
      },
    ],
    [
      'conversation',
      (g) => {
        g.rivalSessionId = OTHER_SESSION;
      },
    ],
    [
      'ledger bytes',
      (g) => {
        g.ledgerSha256 = '0'.repeat(64);
      },
    ],
    [
      'prior count',
      (g) => {
        g.priorRounds = 2;
      },
    ],
    [
      'next count',
      (g) => {
        g.authorizedRound = 5;
      },
    ],
    [
      'unknown field',
      (g) => {
        g.unboundScope = true;
      },
    ],
    [
      'quote',
      (g) => {
        g.authorization.quote = '';
      },
    ],
    [
      'chat source',
      (g) => {
        g.authorization.source = ' ';
      },
    ],
    [
      'provenance kind',
      (g) => {
        g.authorization.kind = 'agent-assumption';
      },
    ],
    [
      'unknown provenance',
      (g) => {
        g.authorization.agentApproval = true;
      },
    ],
  ])(
    'refuses a mismatched or malformed %s before a stream or ledger write',
    async (name, mutate) => {
      const f = createFixture();
      try {
        mutate(f.grant);
        f.writeGrant();
        await expect(f.run()).rejects.toThrow();
        expect(runStreaming).not.toHaveBeenCalled();
        expect(createDisposableWorktree).not.toHaveBeenCalled();
        expect(readFileSync(f.path)).toEqual(f.originalBytes);
      } finally {
        f.dispose();
      }
    }
  );

  it.each(['missing', 'corrupt', 'foreign', 'below cap', 'already authorized'])(
    'refuses a %s ledger rather than creating a reviewer',
    async (kind) => {
      const f = createFixture();
      try {
        const shapes = {
          foreign: { ...f.record, rival: 'codex' },
          'below cap': { ...f.record, rounds: 2 },
          'already authorized': { ...f.record, roundAuthorization: {} },
        };
        if (kind === 'missing') rmSync(f.path);
        else if (kind === 'corrupt') writeFileSync(f.path, '{bad');
        else writeLedgerRecord(f.path, shapes[kind]);
        const before = existsSync(f.path) ? readFileSync(f.path) : undefined;
        await expect(f.run()).rejects.toThrow('does not match');
        expect(existsSync(f.path) ? readFileSync(f.path) : undefined).toEqual(before);
        expect(f.vendor.newSessionId).not.toHaveBeenCalled();
        expect(runStreaming).not.toHaveBeenCalled();
      } finally {
        f.dispose();
      }
    }
  );

  it.each(Object.values(STREAM_FAILURE))(
    'retains the original ledger and consumed claim after a failed stream (%s)',
    async (code) => {
      const f = createFixture();
      const error = Object.assign(new Error('authorized stream failed'), { code });
      vi.mocked(runStreaming).mockRejectedValue(error);
      try {
        await expect(f.run()).rejects.toBe(error);
        expect(readFileSync(f.path)).toEqual(f.originalBytes);
        expect(f.claims()).toHaveLength(1);
        expect(JSON.parse(readFileSync(f.claims()[0], 'utf8')).state).toBe('started');
        const renamedGrant = join(f.root, 'renamed-grant.json');
        copyFileSync(f.grantPath, renamedGrant);
        await expect(f.run({ roundAuthorizationFile: renamedGrant })).rejects.toThrow(
          'replay refused'
        );
        expect(runStreaming).toHaveBeenCalledTimes(1);
        expect(f.vendor.newSessionId).not.toHaveBeenCalled();
        expect(JSON.parse(readFileSync(join(f.sessions[0], 'failed.json'), 'utf8'))).toMatchObject({
          reason: error.message,
          code,
        });
      } finally {
        f.dispose();
      }
    }
  );

  it('retains the consumed claim when the returned findings document is invalid', async () => {
    const f = createFixture();
    vi.mocked(runStreaming).mockResolvedValue({
      sessionId: ORIGINAL_SESSION,
      message: 'not findings',
    });
    try {
      await expect(f.run()).rejects.toThrow('findings did not validate');
      expect(readFileSync(f.path)).toEqual(f.originalBytes);
      expect(JSON.parse(readFileSync(f.claims()[0], 'utf8')).state).toBe('started');
      await expect(f.run()).rejects.toThrow('replay refused');
      expect(runStreaming).toHaveBeenCalledTimes(1);
    } finally {
      f.dispose();
    }
  });

  it('releases a pre-stream setup claim and permits the same authorized continuation after repair', async () => {
    const f = createFixture();
    const error = new Error('worktree provisioning failed');
    vi.mocked(createDisposableWorktree).mockImplementationOnce(() => {
      throw error;
    });
    try {
      await expect(f.run()).rejects.toBe(error);
      expect(f.claims()).toEqual([]);
      expect(readFileSync(f.path)).toEqual(f.originalBytes);
      expect(runStreaming).not.toHaveBeenCalled();
      expect(removeDisposableWorktree).toHaveBeenCalledTimes(1);
      await expect(f.run()).resolves.toMatchObject({ round: 4, rivalSessionId: ORIGINAL_SESSION });
      expect(runStreaming).toHaveBeenCalledTimes(1);
    } finally {
      f.dispose();
    }
  });

  it.each(['lost', 'changed'])(
    'cleans the owned worktree and preserves the setup error when the claim is %s',
    async (kind) => {
      const f = createFixture();
      const error = new Error('primary setup failure');
      vi.mocked(createDisposableWorktree).mockImplementation(() => {
        const claimPath = f.claims()[0];
        if (kind === 'lost') rmSync(claimPath);
        else
          writeFileSync(
            claimPath,
            JSON.stringify({ state: 'reserved', session: '/different-session' })
          );
        throw error;
      });
      try {
        await expect(f.run()).rejects.toBe(error);
        expect(removeDisposableWorktree).toHaveBeenCalledTimes(1);
        expect(f.progress.some((line) => line.startsWith('review cleanup failed:'))).toBe(true);
        expect(readFileSync(f.path)).toEqual(f.originalBytes);
        expect(runStreaming).not.toHaveBeenCalled();
      } finally {
        f.dispose();
      }
    }
  );

  it('refuses a concurrent replay while the first substantive continuation is in progress', async () => {
    const f = createFixture();
    let complete;
    let started;
    const startedPromise = new Promise((resolve) => {
      started = resolve;
    });
    vi.mocked(runStreaming).mockImplementation(() => {
      started();
      return new Promise((resolve) => {
        complete = resolve;
      });
    });
    try {
      const first = f.run();
      await startedPromise;
      await expect(f.run()).rejects.toThrow('replay refused');
      expect(runStreaming).toHaveBeenCalledTimes(1);
      complete({ sessionId: ORIGINAL_SESSION, message: JSON.stringify(FINDINGS) });
      await expect(first).resolves.toMatchObject({ round: 4 });
    } finally {
      f.dispose();
    }
  });

  it('refuses another returned reviewer identity while preserving the ledger and consumed claim', async () => {
    const f = createFixture();
    vi.mocked(runStreaming).mockResolvedValue({
      sessionId: OTHER_SESSION,
      message: JSON.stringify(FINDINGS),
    });
    try {
      await expect(f.run()).rejects.toThrow('different reviewer conversation');
      expect(readFileSync(f.path)).toEqual(f.originalBytes);
      expect(f.claims()).toHaveLength(1);
      expect(existsSync(join(f.sessions[0], 'done.json'))).toBe(false);
    } finally {
      f.dispose();
    }
  });

  it('refuses a ledger change during the substantive stream rather than overwriting it', async () => {
    const f = createFixture();
    const changed = { ...f.record, lastHead: HEAD };
    vi.mocked(runStreaming).mockImplementation(async () => {
      writeLedgerRecord(f.path, changed);
      return { sessionId: ORIGINAL_SESSION, message: JSON.stringify(FINDINGS) };
    });
    try {
      await expect(f.run()).rejects.toThrow('ledger changed');
      expect(readLedgerRecord(f.path)).toEqual(changed);
      expect(JSON.parse(readFileSync(f.claims()[0], 'utf8')).state).toBe('started');
      expect(existsSync(join(f.sessions[0], 'done.json'))).toBe(false);
    } finally {
      f.dispose();
    }
  });

  it('refuses a ledger change before the stream starts and preserves the changed record', async () => {
    const f = createFixture();
    const changed = { ...f.record, lastHead: HEAD };
    vi.mocked(createDisposableWorktree).mockImplementation(() =>
      writeLedgerRecord(f.path, changed)
    );
    try {
      await expect(f.run()).rejects.toThrow('ledger changed');
      expect(runStreaming).not.toHaveBeenCalled();
      expect(readLedgerRecord(f.path)).toEqual(changed);
      expect(f.claims()).toEqual([]);
    } finally {
      f.dispose();
    }
  });
});

describe('authorization option conflicts', () => {
  it('rejects reset flags even when the authorization path is empty', () => {
    expect(() =>
      parseLaunchArgs(['--pr', '7', '--fresh', '--round-authorization-file', ''])
    ).toThrow('requires an existing PR review');
  });

  it.each(
    [
      ['--pr', '7', '--fresh'],
      ['--pr', '7', '--end-session'],
      ['--pr', '7', '--question-file', '/q'],
      ['--base', 'main'],
      ['--commit', HEAD],
      ['--uncommitted'],
      [],
    ].map((flags) => ({ flags }))
  )('refuses incompatible launch flags $flags', ({ flags }) => {
    expect(() =>
      parseLaunchArgs([...flags, '--round-authorization-file', '/authorization.json'])
    ).toThrow('requires an existing PR review');
  });
});
