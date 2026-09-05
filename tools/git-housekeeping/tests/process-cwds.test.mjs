import { describe, expect, it } from 'vitest';
import { parseLsofCwds, processesUsing } from '../lib/process-cwds.mjs';

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
