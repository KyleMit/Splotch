// Issue 2217: perf:device:frames ran the SvelteKit served-build guard against
// every host, so the floor control — which has no build — could never be
// captured through it. The capture now recognises the floor host and proves
// the floor's own served bytes instead.
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  closeFloorControlHost,
  createFloorControlHost,
  FLOOR_CONTROL_PAGE,
  floorControlIdentity,
} from '../split-capture/serve-floor-control.mjs';
import { fetchAcceptedProbeReport } from '../split-capture/lib/probe-host-protocol.mjs';
import {
  assertServedPageIdentity,
  drivenCaptureArtifact,
  floorControlRequestProblem,
} from '../split-capture/capture-device-frames.mjs';

const FLOOR_REQUEST = {
  brush: 'pen',
  theme: 'light',
  undoCount: 0,
  allowForeignBuild: false,
  nativeApp: false,
};

describe('a device capture against the floor control', () => {
  const started = [];

  afterEach(async () => {
    for (const server of started.splice(0)) await closeFloorControlHost(server);
  });

  async function floorHostAt() {
    const { server, state } = createFloorControlHost({ log: () => {} });
    started.push(server);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    return { base: `http://127.0.0.1:${server.address().port}`, state };
  }

  it('proves the floor by its served bytes instead of running the build guard', async () => {
    const { base } = await floorHostAt();
    const buildIdentity = vi.fn();

    const identity = await assertServedPageIdentity(base, FLOOR_REQUEST, { buildIdentity });

    expect(buildIdentity).not.toHaveBeenCalled();
    expect(identity.page).toBe(FLOOR_CONTROL_PAGE);
    expect(identity.servedBuild).toEqual({
      productCommit: null,
      buildEntry: null,
      buildDigest: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
  });

  it('still runs the served-build guard for the app probe host', async () => {
    const servedBuild = { productCommit: 'abc', buildEntry: '/entry.js', buildDigest: 'd' };
    const buildIdentity = vi.fn(async () => servedBuild);

    const identity = await assertServedPageIdentity('http://probe.test', FLOOR_REQUEST, {
      readState: async () => ({ ready: null, hasReport: false }),
      buildIdentity,
    });

    expect(identity).toEqual({ page: 'app', servedBuild });
    expect(buildIdentity).toHaveBeenCalledWith('http://probe.test', {
      allowForeignBuild: false,
      nativeApp: false,
    });
  });

  it('refuses a floor host serving bytes that are not this checkout’s floor', async () => {
    const { base } = await floorHostAt();
    const fetchText = async (url) => {
      const body = await fetch(url).then((response) => response.text());
      return url.pathname === '/__probe/control.js' ? `${body}\n// another checkout` : body;
    };

    const { problem, buildDigest } = await floorControlIdentity(base, fetchText);

    expect(problem).toContain('/__probe/control.js');
    expect(buildDigest).toBeNull();
  });

  it('refuses a request the floor cannot honour before touching the device', async () => {
    const { base } = await floorHostAt();

    await expect(
      assertServedPageIdentity(base, { ...FLOOR_REQUEST, brush: 'eraser' })
    ).rejects.toThrow(/--brush=pen/);
    expect(floorControlRequestProblem({ ...FLOOR_REQUEST, theme: 'dark' })).toMatch(/light/);
    expect(floorControlRequestProblem({ ...FLOOR_REQUEST, undoCount: 2 })).toMatch(/undo/);
    expect(floorControlRequestProblem({ ...FLOOR_REQUEST, nativeApp: true })).toMatch(
      /--native-app/
    );
    expect(floorControlRequestProblem(FLOOR_REQUEST)).toBeNull();
  });

  it('serves the accepted report on the route the capture reads it from', async () => {
    const { base, state } = await floorHostAt();
    state.plan = { ...state.plan, label: 'floor-run', nonce: 'floor-run' };
    await fetch(`${base}/__probe/report`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ nonce: 'floor-run', report: { events: [1, 2] } }),
    });

    const payload = await fetchAcceptedProbeReport(base);

    expect(payload.report.events).toEqual([1, 2]);
  });

  it('records which page the artifact measured', () => {
    expect(drivenCaptureArtifact({ page: FLOOR_CONTROL_PAGE }).page).toBe(FLOOR_CONTROL_PAGE);
    expect(drivenCaptureArtifact({}).page).toBe('app');
  });
});
