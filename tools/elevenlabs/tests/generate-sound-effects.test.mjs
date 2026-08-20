import { chmod, mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  buildGenerationPlan,
  parseSoundEffectArgs,
  runGenerationPlan,
  runSoundEffectsCli,
} from '../generate-sound-effects.mjs';
import {
  DEFAULT_MAX_RETRIES,
  DEFAULT_OUTPUT_FORMAT,
  DEFAULT_PROMPT_INFLUENCE,
  MAX_DURATION_SECONDS,
  MAX_PROMPT_INFLUENCE,
  MIN_DURATION_SECONDS,
  MIN_PROMPT_INFLUENCE,
} from '../lib/sound-effects-client.mjs';

describe('ElevenLabs sound-effect generator', () => {
  it('requires an explicit fixed or automatic duration for a single paid call', async () => {
    const args = parseSoundEffectArgs(['--text', 'Pop']);
    await expect(buildGenerationPlan(args)).rejects.toThrow(
      'Choose --duration <seconds> or --auto-duration explicitly.'
    );
  });

  it('validates the complete batch and keeps outputs inside its directory', async () => {
    const outputDir = await mkdtemp(join(tmpdir(), 'elevenlabs-plan-'));
    const input = join(outputDir, 'candidates.json');
    await writeFile(
      input,
      JSON.stringify({
        defaults: { durationSeconds: 0.5, promptInfluence: 0.7 },
        candidates: [
          { file: 'one.mp3', text: 'One pop' },
          { file: 'nested/two.mp3', text: 'Two pops', loop: true },
        ],
      })
    );

    const plan = await buildGenerationPlan(
      parseSoundEffectArgs(['--input', input, '--out-dir', outputDir])
    );

    expect(plan.candidates).toEqual([
      expect.objectContaining({
        out: join(outputDir, 'one.mp3'),
        request: expect.objectContaining({ durationSeconds: 0.5, promptInfluence: 0.7 }),
      }),
      expect.objectContaining({
        out: join(outputDir, 'nested/two.mp3'),
        request: expect.objectContaining({ loop: true }),
      }),
    ]);
  });

  it('rejects an invalid later candidate before any generation can begin', async () => {
    const outputDir = await mkdtemp(join(tmpdir(), 'elevenlabs-invalid-'));
    const input = join(outputDir, 'candidates.json');
    await writeFile(
      input,
      JSON.stringify({
        defaults: { durationSeconds: 0.5 },
        candidates: [
          { file: 'valid.mp3', text: 'Pop' },
          { file: '../escape.mp3', text: 'Another pop' },
        ],
      })
    );

    await expect(
      buildGenerationPlan(parseSoundEffectArgs(['--input', input, '--out-dir', outputDir]))
    ).rejects.toThrow('must stay inside --out-dir');
  });

  it('lets a candidate explicitly choose automatic duration over a fixed batch default', async () => {
    const outputDir = await mkdtemp(join(tmpdir(), 'elevenlabs-auto-'));
    const input = join(outputDir, 'candidates.json');
    await writeFile(
      input,
      JSON.stringify({
        defaults: { durationSeconds: 0.5 },
        candidates: [{ file: 'auto.mp3', text: 'Rain ambience', durationSeconds: null }],
      })
    );

    const plan = await buildGenerationPlan(
      parseSoundEffectArgs(['--input', input, '--out-dir', outputDir])
    );

    expect(plan.candidates[0].request.durationSeconds).toBeNull();
  });

  it('rejects a null defaults object instead of silently treating it as empty', async () => {
    const outputDir = await mkdtemp(join(tmpdir(), 'elevenlabs-null-defaults-'));
    const input = join(outputDir, 'candidates.json');
    await writeFile(
      input,
      JSON.stringify({
        defaults: null,
        candidates: [{ file: 'pop.mp3', text: 'Pop', durationSeconds: 0.5 }],
      })
    );

    await expect(
      buildGenerationPlan(parseSoundEffectArgs(['--input', input, '--out-dir', outputDir]))
    ).rejects.toThrow('defaults must be an object');
  });

  it('writes successes, continues after failures, and resumes by skipping existing files', async () => {
    const outputDir = await mkdtemp(join(tmpdir(), 'elevenlabs-run-'));
    const existing = join(outputDir, 'existing.mp3');
    const generated = join(outputDir, 'generated.mp3');
    const failed = join(outputDir, 'failed.mp3');
    await writeFile(existing, 'keeper');
    const client = {
      generateSoundEffect: vi.fn(async ({ text }) => {
        if (text === 'fail') throw new Error('rate limit');
        return { bytes: Buffer.from(`audio:${text}`), characterCost: null };
      }),
    };

    const result = await runGenerationPlan(
      {
        outputDir,
        candidates: [
          { out: existing, request: { text: 'existing' } },
          { out: failed, request: { text: 'fail' } },
          { out: generated, request: { text: 'new' } },
        ],
      },
      { client, log: vi.fn() }
    );

    expect(result).toMatchObject({ generated: 1, skipped: 1 });
    expect(result.failures).toHaveLength(1);
    expect(client.generateSoundEffect).toHaveBeenCalledTimes(2);
    await expect(readFile(existing, 'utf8')).resolves.toBe('keeper');
    await expect(readFile(generated, 'utf8')).resolves.toBe('audio:new');
    expect((await stat(generated)).mode & 0o777).toBe(0o666 & ~process.umask());
  });

  it('preserves an existing output mode when overwriting it', async () => {
    const outputDir = await mkdtemp(join(tmpdir(), 'elevenlabs-overwrite-'));
    const out = join(outputDir, 'preserved.mp3');
    await writeFile(out, 'old');
    await chmod(out, 0o640);
    const client = {
      generateSoundEffect: vi.fn(async () => ({
        bytes: Buffer.from('replacement'),
        characterCost: null,
      })),
    };

    const result = await runGenerationPlan(
      { outputDir, candidates: [{ out, request: { text: 'new' } }] },
      { client, overwrite: true, log: vi.fn() }
    );

    expect(result.generated).toBe(1);
    await expect(readFile(out, 'utf8')).resolves.toBe('replacement');
    expect((await stat(out)).mode & 0o777).toBe(0o640);
  });

  it('reports a paid generation discarded after losing the output race', async () => {
    const outputDir = await mkdtemp(join(tmpdir(), 'elevenlabs-race-'));
    const out = join(outputDir, 'raced.mp3');
    const log = vi.fn();
    const client = {
      generateSoundEffect: vi.fn(async () => {
        await writeFile(out, 'winner');
        return { bytes: Buffer.from('discarded'), characterCost: null };
      }),
    };

    const result = await runGenerationPlan(
      { outputDir, candidates: [{ out, request: { text: 'raced' } }] },
      { client, log }
    );

    expect(result).toMatchObject({ generated: 0, skipped: 0, discarded: 1 });
    expect(log).toHaveBeenCalledWith(expect.stringContaining('after this generation was paid for'));
    await expect(readFile(out, 'utf8')).resolves.toBe('winner');
  });

  it('exercises the full CLI seam, dotenv comments, retries, and reviewable plan output', async () => {
    const workingDir = await mkdtemp(join(tmpdir(), 'elevenlabs-cli-'));
    const out = join(workingDir, 'pop.mp3');
    await writeFile(
      join(workingDir, '.env.local'),
      'ELEVENLABS_API_KEY=sk-sound-effects # local key\n'
    );
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ detail: { message: 'Slow down' } }), {
          status: 429,
          headers: { 'retry-after': '0' },
        })
      )
      .mockResolvedValueOnce(new Response(Buffer.from('audio')));
    const sleepImpl = vi.fn(async () => undefined);
    const log = vi.fn();
    const warn = vi.fn();

    await runSoundEffectsCli(
      ['--text', '  Soft pop  ', '--duration', '0.5', '--influence', '0.7', '--out', out],
      { cwd: workingDir, env: {}, fetchImpl, sleepImpl, log, warn }
    );

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls[0][1].headers['xi-api-key']).toBe('sk-sound-effects');
    expect(sleepImpl).toHaveBeenCalledWith(0);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('retry 1/3'));
    expect(log.mock.calls.flat().join('\n')).toContain('"Soft pop"');
    expect(log.mock.calls.flat().join('\n')).toContain('influence=0.7');
    await expect(readFile(out, 'utf8')).resolves.toBe('audio');
  });

  it('keeps documented schema values aligned with the client constants', async () => {
    const readme = await readFile(join(import.meta.dirname, '..', 'README.md'), 'utf8');
    const log = vi.fn();
    await runSoundEffectsCli(['--help'], { log });
    const help = log.mock.calls.flat().join('\n');

    expect(help).toContain(`from ${MIN_DURATION_SECONDS} to ${MAX_DURATION_SECONDS} seconds`);
    expect(help).toContain(`from ${MIN_PROMPT_INFLUENCE} to ${MAX_PROMPT_INFLUENCE}`);
    expect(help).toContain(`default: ${DEFAULT_PROMPT_INFLUENCE}`);
    expect(help).toContain(`default: ${DEFAULT_MAX_RETRIES}`);
    expect(help).toContain(`default: ${DEFAULT_OUTPUT_FORMAT}`);
    expect(readme).toContain(`${MIN_DURATION_SECONDS}–${MAX_DURATION_SECONDS} seconds`);
    expect(readme).toContain(`${MIN_PROMPT_INFLUENCE}–${MAX_PROMPT_INFLUENCE}`);
  });
});
