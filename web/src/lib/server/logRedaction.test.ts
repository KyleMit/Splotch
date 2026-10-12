// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { sha256Hex } from '$lib/digestHex';
import { isInstallationId } from '$lib/installationId';
import { newJobId } from './generationJobs';
import { loggableError, loggableFailure } from './logRedaction';

// Minted the way production mints them rather than typed out, so a change to
// either id's shape fails here instead of quietly slipping past the mask.
async function installationIdLike(): Promise<string> {
  const id = await sha256Hex(new TextEncoder().encode('an installation'));
  expect(isInstallationId(id)).toBe(true);
  return id;
}

describe('loggableError', () => {
  it('masks every job id in a failure and keeps the rest of the message', () => {
    const cause = new Error(`put ${newJobId()}/image and ${newJobId()}/input failed`);

    expect(loggableError(cause)).toBe('put <redacted id>/image and <redacted id>/input failed');
  });

  it('masks an installation id, the key of every free grant', async () => {
    const installationId = await installationIdLike();
    const cause = new Error(`free-generation-grants setJSON ${installationId} failed`);

    expect(loggableError(cause)).toBe('free-generation-grants setJSON <redacted id> failed');
  });

  it('logs a failure that is not an Error by its string form', () => {
    expect(loggableError(`gone: ${newJobId()}`)).toBe('gone: <redacted id>');
  });
});

describe('loggableFailure', () => {
  it('keeps the stack and cause chain an unexpected failure is diagnosed by, ids masked', async () => {
    const installationId = await installationIdLike();
    const cause = new Error('grant store unreachable', {
      cause: new Error(`GET /free-generation-grants/${installationId} reset`),
    });

    const logged = loggableFailure(cause);

    expect(logged).toContain('Error: grant store unreachable');
    expect(logged).toContain('logRedaction.test.ts');
    expect(logged).toContain('GET /free-generation-grants/<redacted id> reset');
    expect(logged).not.toContain(installationId);
  });
});
