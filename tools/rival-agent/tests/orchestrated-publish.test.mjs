import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { launch } from '../launch.mjs';
import { FAKE_IOS_UDID } from '../../perf/lib/device-identifiers.mjs';
import { publishReview } from '../../../.agents/skills/run-rival-agent/scripts/claude-review-publish.mjs';

vi.mock('../launch.mjs', async (importOriginal) => ({
  ...(await importOriginal()),
  launch: vi.fn(),
}));
vi.mock('node:child_process', async (importOriginal) => ({
  ...(await importOriginal()),
  spawnSync: vi.fn(),
}));

const BASE = 'a'.repeat(40);
const HEAD = 'b'.repeat(40);

describe('orchestrated publisher publication boundary', () => {
  let session;
  afterEach(() => {
    if (session) rmSync(session, { recursive: true, force: true });
    vi.resetAllMocks();
  });

  function setup(findings) {
    session = mkdtempSync(join(tmpdir(), 'orchestrated-review-test-'));
    mkdirSync(join(session, 'packet'));
    writeFileSync(
      join(session, 'packet/diff.patch'),
      '--- a/file.mjs\n+++ b/file.mjs\n@@ -1 +1 @@\n-old\n+new\n'
    );
    writeFileSync(
      join(session, 'session.json'),
      JSON.stringify({
        rival: 'claude',
        round: 1,
        scope: { description: 'pull request 7', base: BASE, head: HEAD },
      })
    );
    writeFileSync(join(session, 'findings.json'), JSON.stringify(findings));
    vi.mocked(launch).mockResolvedValue({ session });
    const reviews = [];
    vi.mocked(spawnSync).mockImplementation((_command, args, options) => {
      if (args[0] === 'pr')
        return {
          status: 0,
          stdout: JSON.stringify({
            number: 7,
            state: 'OPEN',
            isCrossRepository: false,
            baseRefOid: BASE,
            headRefOid: HEAD,
          }),
        };
      if (args.includes('POST')) {
        const request = JSON.parse(options.input);
        const review = {
          id: 42,
          html_url: 'review-url',
          body: request.body,
          commit_id: request.commit_id,
          state: 'COMMENTED',
        };
        reviews.push(review);
        return { status: 0, stdout: JSON.stringify(review) };
      }
      return { status: 0, stdout: JSON.stringify([reviews]) };
    });
  }

  it.each(['summary', 'inline'])(
    'blocks sensitive %s output from the real shared publisher',
    async (field) => {
      const value = FAKE_IOS_UDID;
      const findings = {
        summary: field === 'summary' ? value : 'Checked the diff.',
        findings: [
          {
            path: 'file.mjs',
            line: 1,
            startLine: null,
            side: 'RIGHT',
            severity: 'blocking',
            body: field === 'inline' ? value : 'Fix the regression.',
          },
        ],
        unverified: [],
      };
      setup(findings);
      await expect(publishReview(7)).rejects.toThrow(/publication blocked/);
      expect(vi.mocked(spawnSync).mock.calls.some(([, args]) => args.includes('POST'))).toBe(false);
      expect(JSON.parse(readFileSync(join(session, 'findings.json'), 'utf8'))).toEqual(findings);
    }
  );

  it('publishes clean orchestrated findings unchanged', async () => {
    setup({ summary: 'Checked the diff.', findings: [], unverified: [] });
    await expect(publishReview(7)).resolves.toMatchObject({
      state: 'posted',
      reviewId: 42,
      session,
    });
    const [, , options] = vi.mocked(spawnSync).mock.calls.find(([, args]) => args.includes('POST'));
    expect(JSON.parse(options.input).body).toContain('Checked the diff.');
    expect(JSON.parse(options.input).body).not.toContain('Sanitized review:');
  });
});
