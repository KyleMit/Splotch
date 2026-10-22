// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  RECOVERY_PATH,
  RECOVERY_PROTOCOL,
  RECOVERY_VERSION_HEADER,
} from '../../src/lib/ai/generationAttempt';
import { RECOVERY_SERVICE_QUALIFIED, recoveryServiceEnabled } from './generationAttemptPolicy';
describe('recovery activation boundary', () => {
  it('pins Node smoke literals to the shared protocol it cannot import directly', () => {
    const smoke = readFileSync(
      new URL('../../tools/api-smoke/lib/recovery-contract.mjs', import.meta.url),
      'utf8'
    );
    expect(smoke).toContain(RECOVERY_PATH);
    expect(smoke).toContain(RECOVERY_PROTOCOL);
    expect(smoke).toContain(RECOVERY_VERSION_HEADER);
  });
  it('keeps qualification closed even when configuration requests activation', () => {
    expect(RECOVERY_SERVICE_QUALIFIED).toBe(false);
    expect(recoveryServiceEnabled('true')).toBe(false);
    expect(recoveryServiceEnabled(undefined)).toBe(false);
  });
});
