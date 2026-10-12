import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';

// The vectorize entry point spends real money: a production trace costs 1 credit of a
// metered 50-credit plan, and its whole safety story is that the free test mode is
// the default and `--production` is the only way out of it. These cases guard the
// two ways that promise could be broken silently — a request that spends despite
// announcing itself as free, and a paid run that reports itself as failed.
//
// One copy: the driver lives in tools/, not in a skill package Ruler would
// triplicate into .claude/ and .agents/.
const repoRoot = join(import.meta.dirname, '..', '..', '..');
const ENTRY_POINT = 'tools/vectorize/vectorize-image.mjs';

const load = (path) => import(pathToFileURL(join(repoRoot, path)).href);

// A real repo file, so attachInput's existence and extension checks pass.
const INPUT = join(repoRoot, 'web/static/icons/handmade-paper.webp');

describe('vectorize image entry point', () => {
  const path = ENTRY_POINT;
  it('submits the mode it printed, whatever --param is passed', async () => {
    const { parseArgs, buildVectorizeRequest } = await load(path);
    for (const argv of [
      [INPUT],
      [INPUT, '--mode', 'test_preview'],
      [INPUT, '--production'],
      [INPUT, '--param', 'processing.max_colors=2'],
      [INPUT, '--production', '--param', 'processing.max_colors=2'],
    ]) {
      const request = buildVectorizeRequest(parseArgs(argv));
      // The summary line and the outgoing request read the same field, so they
      // cannot describe different calls.
      expect(request.form.get('mode')).toBe(request.mode);
    }
  });

  // The belt (parseArgs rejection) and the braces (guarded fields written last)
  // are independent guards, so this one bypasses parseArgs to prove the ordering
  // holds on its own — a hand-built args object smuggling a `mode` param through.
  it('submits the resolved mode even if a mode param reaches buildVectorizeRequest', async () => {
    const { buildVectorizeRequest } = await load(path);
    const request = buildVectorizeRequest({
      _: [INPUT],
      params: [['mode', 'production']],
    });
    expect(request.mode).toBe('test');
    expect(request.form.get('mode')).toBe('test');
  });

  it('defaults to a free mode', async () => {
    const { parseArgs, buildVectorizeRequest } = await load(path);
    expect(buildVectorizeRequest(parseArgs([INPUT])).form.get('mode')).toBe('test');
  });

  // The defect this was written for: --param was applied after the guarded fields,
  // so `--param mode=production` printed "Mode: test (free)" and submitted
  // production — spending a credit the run said it would not spend.
  it.each([...['mode', 'output.file_format', 'policy.retention_days', 'image.url', 'receipt']])(
    'rejects --param %s instead of letting it override the flag that owns it',
    async (name) => {
      const { parseArgs } = await load(path);
      expect(() => parseArgs([INPUT, '--param', `${name}=x`])).toThrow(/is not allowed/);
    }
  );

  it('applies generic params before the guarded fields, so order alone cannot override', async () => {
    const { parseArgs, buildVectorizeRequest } = await load(path);
    const source = await import('node:fs').then((fs) =>
      fs.readFileSync(join(repoRoot, path), 'utf8')
    );
    const body = source.slice(source.indexOf('export function buildVectorizeRequest'));
    expect(body.indexOf('of args.params')).toBeLessThan(body.indexOf("form.set('mode'"));
    // And the belt still holds with an unreserved param present.
    const request = buildVectorizeRequest(
      parseArgs([INPUT, '--param', 'processing.palette=#FFF;'])
    );
    expect(request.form.get('mode')).toBe('test');
    expect(request.form.get('processing.palette')).toBe('#FFF;');
  });

  it('treats the post-charge balance lookup as best-effort', async () => {
    const source = await import('node:fs').then((fs) =>
      fs.readFileSync(join(repoRoot, path), 'utf8')
    );
    // A charged call has already spent the credit and written the result; an
    // /account failure afterwards must warn, not set a failing exit code, or an
    // agent retries the completed run and spends again.
    const block = source.slice(source.indexOf('if (charged > 0)'));
    expect(block.slice(0, block.indexOf('\n  }\n'))).toMatch(
      /try \{[\s\S]*catch[\s\S]*console\.warn/
    );
  });

  it('gives the request an overall deadline well above the 180s idle requirement', async () => {
    const source = await import('node:fs').then((fs) =>
      fs.readFileSync(join(repoRoot, path), 'utf8')
    );
    // AbortSignal.timeout is elapsed-time, not idle, so a 180s value would cancel
    // an actively-streaming slow response the service explicitly asks us to wait for.
    const deadline = /const REQUEST_DEADLINE_MS = ([\d_]+);/.exec(source)?.[1];
    expect(Number(deadline.replaceAll('_', ''))).toBeGreaterThan(180_000);
  });
  // Every other case here reaches parseArgs through import(), which evaluates the
  // whole module before the first call. The direct-run guard instead calls it
  // *during* evaluation, so a parser dependency declared below that guard is in
  // its temporal dead zone and throws for real users while every import-based
  // test passes. Spawning the entry point is the only shape that can see it.
  it('parses its own argv when run as an entry point', () => {
    const help = execFileSync(process.execPath, [join(repoRoot, path), '--help'], {
      encoding: 'utf8',
    });
    expect(help).toMatch(/Vectorize a bitmap/);
  });
});
