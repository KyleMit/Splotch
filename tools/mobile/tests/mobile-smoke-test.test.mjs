import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ROOT, sh } from '../../lib/proc.mjs';
import { DEV_APP_ID, STORE_APP_ID } from '../../release/lib/native-app.mjs';
import { SMOKE_FLOW, flowForAppId, runMaestroSmoke } from '../lib/mobile-smoke-test.mjs';

vi.mock('../../lib/proc.mjs', async (importOriginal) => ({
  ...(await importOriginal()),
  sh: vi.fn(),
}));
vi.mock('../lib/maestro.mjs', () => ({ maestroPath: () => 'maestro' }));

const committedFlow = readFileSync(join(ROOT, SMOKE_FLOW), 'utf8');

// A function returned from beforeEach runs as its cleanup, and mockReset returns the mock.
beforeEach(() => {
  sh.mockReset();
});

describe('flowForAppId', () => {
  it('changes only the appId header line', () => {
    const derived = flowForAppId(committedFlow, DEV_APP_ID);
    const changed = committedFlow
      .split('\n')
      .map((line, index) => [line, derived.split('\n')[index]])
      .filter(([before, after]) => before !== after);
    expect(changed).toEqual([[`appId: ${STORE_APP_ID}`, `appId: ${DEV_APP_ID}`]]);
  });

  it('fails on a flow that does not name the store identity', () => {
    expect(() => flowForAppId('appId: art.splotch.other\n---\n', DEV_APP_ID)).toThrow(
      `${SMOKE_FLOW} does not open with appId: ${STORE_APP_ID}`
    );
  });
});

describe('runMaestroSmoke', () => {
  it('runs the committed flow against the store identity on the named device', async () => {
    await runMaestroSmoke({ device: 'emulator-5556' });
    expect(sh.mock.calls).toEqual([[`"maestro" --device emulator-5556 test "${SMOKE_FLOW}"`]]);
  });

  it('runs a derived copy for another identity, then removes it', async () => {
    let derivedPath;
    let derivedFlow;
    sh.mockImplementation(async (command) => {
      [, derivedPath] = command.match(/test "([^"]+)"$/);
      derivedFlow = readFileSync(derivedPath, 'utf8');
    });

    await runMaestroSmoke({ device: 'emulator-5556', appId: DEV_APP_ID });

    expect(derivedPath).not.toBe(SMOKE_FLOW);
    expect(derivedFlow).toBe(flowForAppId(committedFlow, DEV_APP_ID));
    expect(existsSync(derivedPath)).toBe(false);
  });
});
