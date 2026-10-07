import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

const GROUP_OBSERVATION_DEADLINE_MS = 1_000;

export function controlGroupObservation(pid) {
  try {
    const raw = execFileSync('/bin/ps', ['-axo', 'pid=,pgid='], {
      encoding: 'utf8',
      timeout: GROUP_OBSERVATION_DEADLINE_MS,
      env: { ...process.env, LC_ALL: 'C' },
    });
    const rows = raw
      .trim()
      .split('\n')
      .map((row) => {
        const match = row.trim().match(/^(\d+)\s+(\d+)$/);
        assert.ok(match, 'L0_CONTROL_PROCESS_TABLE_UNQUALIFIED');
        return { pid: Number(match[1]), pgid: Number(match[2]) };
      });
    assert.ok(
      rows.some((row) => row.pid === process.pid),
      'L0_CONTROL_PROCESS_TABLE_INCOMPLETE'
    );
    return { status: rows.some((row) => row.pgid === pid) ? 'present' : 'absent' };
  } catch (error) {
    return { status: 'indeterminate', error: String(error) };
  }
}
