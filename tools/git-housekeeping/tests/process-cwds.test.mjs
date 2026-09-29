import { describe, expect, it } from 'vitest';
import { listProcessCwds, parseLsofCwds, processesUsing } from '../lib/process-cwds.mjs';

const LIVE_LISTING_TIMEOUT_MS = 20_000;

describe('parseLsofCwds', () => {
  it('pairs each n record with the p and c fields of its block', () => {
    const text = [
      'p411',
      'cloginwindow',
      'fcwd',
      'n/',
      'p99544',
      'cclaude',
      'fcwd',
      'n/tmp/wt',
      'p7',
      'fcwd',
      'n/x',
      '',
    ].join('\n');
    expect(parseLsofCwds(text)).toEqual([
      { pid: 411, command: 'loginwindow', cwd: '/' },
      { pid: 99544, command: 'claude', cwd: '/tmp/wt' },
      { pid: 7, command: null, cwd: '/x' },
    ]);
  });
});

describe('listProcessCwds', () => {
  const own = { pid: process.pid, command: 'node', cwd: '/tmp/here' };
  const other = { pid: 424242, command: 'zsh', cwd: '/tmp/wt' };

  it('answers with the first listing that names this process', () => {
    expect(listProcessCwds({ readers: [() => [], () => [other, own]] })).toEqual({
      ok: true,
      entries: [other, own],
    });
  });

  it('reports an empty listing as unusable rather than as an empty answer', () => {
    expect(listProcessCwds({ readers: [() => []] })).toEqual({
      ok: false,
      reason: 'no process listing names this process, so none can be trusted',
    });
  });

  it('reports a listing of other processes only as unusable', () => {
    expect(listProcessCwds({ readers: [() => [other]] }).ok).toBe(false);
  });

  // The premise the guard rests on, checked against the real listing of the
  // host running the tests rather than a double. `lsof` walks every process,
  // which takes about a second on a busy host and longer on a loaded one.
  it('names this process when it reads the host', { timeout: LIVE_LISTING_TIMEOUT_MS }, () => {
    const listing = listProcessCwds();
    expect(listing.ok).toBe(true);
    expect(listing.entries.map(({ pid }) => pid)).toContain(process.pid);
  });
});

describe('processesUsing', () => {
  const cwds = [
    { pid: 1, command: 'zsh', cwd: '/tmp/wt' },
    { pid: 2, command: 'node', cwd: '/tmp/wt/web' },
    { pid: 3, command: 'zsh', cwd: '/tmp/wt2' },
    { pid: 4, command: 'zsh', cwd: '/tmp' },
  ];

  it('matches the directory itself and anything below it, not a sibling sharing the prefix', () => {
    expect(processesUsing('/tmp/wt', cwds, { ignorePids: [] }).map((p) => p.pid)).toEqual([1, 2]);
    expect(processesUsing('/tmp/wt/', cwds, { ignorePids: [] }).map((p) => p.pid)).toEqual([1, 2]);
  });

  it('ignores the script and the npm that launched it by default', () => {
    const own = [
      { pid: process.pid, command: 'node', cwd: '/tmp/wt' },
      { pid: process.ppid, command: 'npm', cwd: '/tmp/wt' },
    ];
    expect(processesUsing('/tmp/wt', own)).toEqual([]);
  });
});
