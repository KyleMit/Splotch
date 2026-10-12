import { describe, expect, it, vi } from 'vitest';

vi.mock('../../lib/net.mjs', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, lanAddresses: () => ['10.0.0.5', '192.168.1.9'] };
});

const { runOverridesScript } = await import('../ios/capture-webkit-gates.mjs');
// Shared with perf:ios:webkit:frames, which opens `/` instead — the path is the caller's.
const { resolveDeviceUrl } = await import('../lib/profile-device-session.mjs');

describe('resolveDeviceUrl', () => {
  it('points at the requested route on the first reachable LAN address', () => {
    expect(resolveDeviceUrl(undefined, 4173, '/dev/engine')).toBe(
      'http://10.0.0.5:4173/dev/engine'
    );
  });

  // The iPad opens this URL, so localhost would name the wrong machine entirely.
  it('uses a LAN address, never localhost', () => {
    expect(resolveDeviceUrl(undefined, 4173, '/')).toBe('http://10.0.0.5:4173/');
  });

  it('honours an explicit --url over the derived one', () => {
    expect(resolveDeviceUrl('http://elsewhere:9999/dev/engine', 4173, '/dev/engine')).toBe(
      'http://elsewhere:9999/dev/engine'
    );
  });
});

describe('runOverridesScript', () => {
  // The whole point of assigning every override: a window.__perfScenarios left
  // behind by an earlier run silently scopes a "full" run to one scenario.
  it('clears every override the driver reads when none are requested', () => {
    const script = runOverridesScript({});

    for (const name of ['__perfScenarios', '__perfStrokes', '__perfOps', '__perfTimeline']) {
      expect(script).toContain(`window.${name} = undefined;`);
    }
  });

  it('assigns the requested overrides', () => {
    const script = runOverridesScript({ scenarios: 'crayon-scribbles,multi-finger', ops: 200 });

    expect(script).toContain('window.__perfScenarios = "crayon-scribbles,multi-finger";');
    expect(script).toContain('window.__perfOps = 200;');
    expect(script).toContain('window.__perfStrokes = undefined;');
  });

  // Gates mode is the only mode this entry point drives: timeline mode needs a
  // Web Inspector recording, which the protocol cannot start.
  it('never selects timeline mode', () => {
    expect(runOverridesScript({ scenarios: 'crayon-scribbles' })).toContain(
      'window.__perfTimeline = undefined;'
    );
  });

  // A stale table from a previous run would otherwise satisfy the poll
  // immediately and report the wrong numbers.
  it('clears the results global the run is tracked by', () => {
    expect(runOverridesScript({})).toContain('window.__perfRows = undefined;');
  });
});
