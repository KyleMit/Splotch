import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  buildGenerationPlan,
  parseSoundEffectArgs,
  runGenerationPlan,
} from '../generate-sound-effects.mjs';

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
  });
});
