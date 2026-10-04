// The targeted E2E gate's port. Playwright serves on SPLOTCH_E2E_PORT, 4173 when it is unset, and
// fails when another worktree's server already holds that port. The driver charged that red to the
// fix under review: three implementer rounds, then a deferral saying the fix broke a spec. So each
// gate run gets a port the probe found free, unless the operator chose one.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  approved,
  createRun,
  enterTempBacklog,
  implemented,
  verifiedValid,
} from './fixtures/run-harness.mjs';

const SPEC = 'tests/flows-undo-persistence.spec.ts';
const E2E_CMD = 'npm run test:e2e -- --retries=1';
const PROBED_PORT = 47123;
const OPERATOR_PORT = '4999';

const gatedFix = (options, api) => {
  if (options.role === 'verify') return verifiedValid(api, [SPEC]);
  if (options.role === 'implement') return implemented(api);
  return approved;
};

const e2eCommands = (shellCommands) =>
  shellCommands.filter((command) => command.includes('test:e2e'));

beforeEach(enterTempBacklog);

describe('the targeted E2E gate', () => {
  it('runs Playwright on the port the probe found free', async () => {
    const { events, shellCommands, run } = createRun({
      env: { MAX_ISSUES: '1' },
      findFreePort: async () => PROBED_PORT,
      respond: gatedFix,
    });

    await run.execute();

    expect(e2eCommands(shellCommands)).toEqual([
      `SPLOTCH_E2E_PORT=${PROBED_PORT} ${E2E_CMD} ${SPEC}`,
    ]);
    expect(events).toContain(`  E2E gate: SPLOTCH_E2E_PORT=${PROBED_PORT} ${SPEC}`);
  });

  it('probes again when a fix round is gated', async () => {
    let nextPort = PROBED_PORT;
    let e2eRuns = 0;
    const { shellCommands, run } = createRun({
      env: { MAX_ISSUES: '1' },
      findFreePort: async () => nextPort++,
      shellResult: (command) =>
        command.includes('test:e2e') && (e2eRuns += 1) === 1
          ? { status: 1, stdout: '1 failed', stderr: '' }
          : undefined,
      respond: gatedFix,
    });

    await run.execute();

    expect(e2eCommands(shellCommands)).toEqual([
      `SPLOTCH_E2E_PORT=${PROBED_PORT} ${E2E_CMD} ${SPEC}`,
      `SPLOTCH_E2E_PORT=${PROBED_PORT + 1} ${E2E_CMD} ${SPEC}`,
    ]);
  });

  it.each([
    { pinned: 'exported to the driver', exported: OPERATOR_PORT, e2eCmd: E2E_CMD },
    {
      pinned: 'assigned in E2E_CMD',
      exported: undefined,
      e2eCmd: `SPLOTCH_E2E_PORT=${OPERATOR_PORT} ${E2E_CMD}`,
    },
  ])('leaves an operator port $pinned as written', async ({ exported, e2eCmd }) => {
    vi.stubEnv('SPLOTCH_E2E_PORT', exported);
    const findFreePort = vi.fn(async () => PROBED_PORT);
    const { events, shellCommands, run } = createRun({
      env: { MAX_ISSUES: '1', E2E_CMD: e2eCmd },
      findFreePort,
      respond: gatedFix,
    });

    await run.execute();

    expect(e2eCommands(shellCommands)).toEqual([`${e2eCmd} ${SPEC}`]);
    expect(events).toContain(`  E2E gate: ${SPEC}`);
    expect(findFreePort).not.toHaveBeenCalled();
  });
});
