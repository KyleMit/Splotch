import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:child_process', async (importOriginal) => ({
  ...(await importOriginal()),
  spawnSync: vi.fn(),
}));
vi.mock('../lib/proc.mjs', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, sleep: vi.fn() };
});

import { spawnSync } from 'node:child_process';
import { killDevPorts } from '../stop-dev-servers.mjs';
import { ROOT, sleep } from '../lib/proc.mjs';

const PORT = 5199;
const OTHER_PORT = 5198;
const OWN_CWD = join(ROOT, 'web');
const FOREIGN_CWD = '/elsewhere/Splotch';
// How far each recheck's sleep moves the clock: a whole grace period, so a
// listener that outlives its signal reaches the deadline without real waiting.
const RECHECK_ADVANCE_MS = 1_000;

// A host behind the fake lsof and process.kill. `listeners` maps a port to the
// pids bound to it and `cwds` maps a pid to its working directory; a pid with
// no entry has a cwd lsof cannot read. A signal frees the pid's ports unless
// `survives` lists that signal for it, and `onSignal` changes the host after a
// signal lands, as another process binding the port would.
function fakeHost({ listeners, cwds = {}, survives = {}, onSignal = () => {} }) {
  const bound = new Map(
    Object.entries(listeners).map(([port, pids]) => [Number(port), new Set(pids)])
  );
  spawnSync.mockImplementation((_command, args) => {
    const port = args.find((arg) => arg.startsWith('tcp:'));
    if (port) {
      const pids = [...(bound.get(Number(port.slice('tcp:'.length))) ?? [])];
      const stdout = pids.map((pid) => `${pid}\n`).join('');
      return { status: pids.length ? 0 : 1, stdout, stderr: '' };
    }
    const pid = Number(args[args.indexOf('-p') + 1]);
    const cwd = cwds[pid];
    return cwd
      ? { status: 0, stdout: `p${pid}\nfcwd\nn${cwd}\n`, stderr: '' }
      : { status: 1, stdout: '', stderr: '' };
  });
  return vi.spyOn(process, 'kill').mockImplementation((pid, signal) => {
    if (!survives[pid]?.includes(signal)) {
      for (const pids of bound.values()) pids.delete(pid);
    }
    onSignal({ signal, bound });
    return true;
  });
}

function useAdvancingClock() {
  vi.useFakeTimers({ now: 0 });
  sleep.mockImplementation(async () => vi.setSystemTime(Date.now() + RECHECK_ADVANCE_MS));
}

afterEach(() => {
  vi.resetAllMocks();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('killDevPorts', () => {
  it("terminates this checkout's listener and succeeds once the port clears", async () => {
    const kill = fakeHost({ listeners: { [PORT]: [123] }, cwds: { 123: OWN_CWD } });

    await killDevPorts([PORT]);

    expect(kill).toHaveBeenCalledExactlyOnceWith(123, 'SIGTERM');
  });

  it('succeeds without signaling when nothing listens', async () => {
    const kill = fakeHost({ listeners: {} });

    await killDevPorts([PORT]);

    expect(kill).not.toHaveBeenCalled();
  });

  it("escalates this checkout's listener that survives SIGTERM and verifies that it exits", async () => {
    useAdvancingClock();
    const kill = fakeHost({
      listeners: { [PORT]: [123] },
      cwds: { 123: OWN_CWD },
      survives: { 123: ['SIGTERM'] },
    });

    await killDevPorts([PORT]);

    expect(kill.mock.calls).toEqual([
      [123, 'SIGTERM'],
      [123, 'SIGKILL'],
    ]);
  });

  it('fails when a listener survives SIGKILL', async () => {
    useAdvancingClock();
    fakeHost({
      listeners: { [PORT]: [123] },
      cwds: { 123: OWN_CWD },
      survives: { 123: ['SIGTERM', 'SIGKILL'] },
    });

    await expect(killDevPorts([PORT])).rejects.toThrow(
      'Port 5199 is still in use after SIGKILL (pids 123).'
    );
  });

  // The incident this guards: dev:stop SIGKILLed whatever held its ports, so a
  // human following the Android doc could take down another worktree's server
  // or an unrelated program such as Jupyter on 8888.
  it('refuses a listener outside this checkout, naming its pid and cwd, and signals nothing', async () => {
    const kill = fakeHost({ listeners: { [PORT]: [456] }, cwds: { 456: FOREIGN_CWD } });

    await expect(killDevPorts([PORT])).rejects.toThrow(
      "Port 5199 is held by pid 456 (cwd /elsewhere/Splotch), outside this checkout. dev:stop stops only this checkout's dev servers."
    );
    expect(kill).not.toHaveBeenCalled();
  });

  it('refuses a listener whose working directory cannot be read', async () => {
    const kill = fakeHost({ listeners: { [PORT]: [456] } });

    await expect(killDevPorts([PORT])).rejects.toThrow(
      'Port 5199 is held by pid 456 (cwd unreadable), outside this checkout.'
    );
    expect(kill).not.toHaveBeenCalled();
  });

  it("refuses the whole run before signaling this checkout's listener on another port", async () => {
    const kill = fakeHost({
      listeners: { [OTHER_PORT]: [123], [PORT]: [456] },
      cwds: { 123: OWN_CWD, 456: FOREIGN_CWD },
    });

    await expect(killDevPorts([OTHER_PORT, PORT])).rejects.toThrow(
      'Port 5199 is held by pid 456 (cwd /elsewhere/Splotch), outside this checkout.'
    );
    expect(kill).not.toHaveBeenCalled();
  });

  it('never SIGKILLs a listener from outside this checkout that bound during the grace period', async () => {
    useAdvancingClock();
    const kill = fakeHost({
      listeners: { [PORT]: [123] },
      cwds: { 123: OWN_CWD, 456: FOREIGN_CWD },
      onSignal: ({ signal, bound }) => {
        if (signal === 'SIGTERM') bound.set(PORT, new Set([456]));
      },
    });

    await expect(killDevPorts([PORT])).rejects.toThrow(
      'Port 5199 is held by pid 456 (cwd /elsewhere/Splotch), outside this checkout.'
    );
    expect(kill.mock.calls).toEqual([[123, 'SIGTERM']]);
  });

  it('fails when lsof cannot be launched', async () => {
    spawnSync.mockReturnValue({ error: new Error('lsof missing') });

    await expect(killDevPorts([PORT])).rejects.toThrow(
      'lsof could not be launched to check port 5199: lsof missing'
    );
  });

  it('fails when lsof is terminated by a signal', async () => {
    spawnSync.mockReturnValue({ signal: 'SIGKILL', status: null, stdout: '', stderr: '' });

    await expect(killDevPorts([PORT])).rejects.toThrow(
      'lsof was terminated by SIGKILL while checking port 5199.'
    );
  });

  it('fails when lsof reports an operational error instead of an empty match', async () => {
    spawnSync.mockReturnValue({ status: 1, stdout: '', stderr: 'lsof: unsupported TCP state' });

    await expect(killDevPorts([PORT])).rejects.toThrow(
      'lsof failed while checking port 5199: lsof: unsupported TCP state'
    );
  });
});
