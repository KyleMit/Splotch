import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ROOT } from '../../lib/proc.mjs';
import { writeArtifactFile } from '../split-capture/capture-device-frames.mjs';

// Session 01a049ec: both split-capture children wrote their artifact to
// join(ROOT, output), which rebases an absolute --output under ROOT — the
// campaign runner's inspector resolved the same flag with an isAbsolute guard,
// so it could not see what the children wrote, and delete-before-retry removed
// a valid product-red artifact on the path only the inspector was watching.
describe('writeArtifactFile', () => {
  const directories = [];

  afterEach(() => {
    for (const directory of directories.splice(0)) {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  const scratch = () => {
    const directory = mkdtempSync(join(tmpdir(), 'splotch-artifact-out-'));
    directories.push(directory);
    return directory;
  };

  it('writes an absolute --output to that path, not rebased under ROOT', () => {
    const output = join(scratch(), 'nested', 'artifact.json');

    const written = writeArtifactFile(output, { transport: 'split' });

    expect(written).toBe(output);
    expect(JSON.parse(readFileSync(output, 'utf8'))).toEqual({ transport: 'split' });
    expect(existsSync(join(ROOT, output))).toBe(false);
  });

  it('resolves a relative --output against ROOT', () => {
    const target = join(scratch(), 'artifact.json');

    const written = writeArtifactFile(relative(ROOT, target), { transport: 'split' });

    expect(written).toBe(target);
    expect(existsSync(target)).toBe(true);
  });
});
