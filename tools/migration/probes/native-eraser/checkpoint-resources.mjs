import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

export const MAX_BROWSER_PROCESSES = 32;
export const MAX_RESOURCE_PHASES = 16;
const BYTES_PER_KIB = 1024;

export function summarizeProcessTree(pid, text, tracking = null) {
  const rows = text
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [child, parent, rss, ...birth] = line.trim().split(/\s+/);
      const values = [child, parent, rss].map(Number);
      assert.ok(values.every((value) => Number.isSafeInteger(value) && value >= 0));
      assert.ok(
        birth.length === 5 && Number.isFinite(Date.parse(birth.join(' '))),
        'Malformed process birth identity'
      );
      return {
        pid: values[0],
        parent: values[1],
        rssBytes: values[2] * BYTES_PER_KIB,
        birth: birth.join(' '),
      };
    });
  assert.ok(rows.length > 0, 'Empty process inventory');
  assert.equal(new Set(rows.map((row) => row.pid)).size, rows.length, 'Duplicate process PID');
  const root = rows.find((row) => row.pid === pid);
  assert.ok(root || tracking?.closing, 'Owned browser root is absent');
  if (root && tracking) {
    assert.ok(
      !tracking.rootBirth || tracking.rootBirth === root.birth,
      'Owned browser birth mismatch'
    );
    tracking.rootBirth = root.birth;
  }
  const owned = new Set(root ? [pid] : []);
  if (tracking)
    for (const row of rows) {
      const birth = tracking.known.get(row.pid);
      if (birth) {
        assert.equal(row.birth, birth, 'Observed browser child birth mismatch');
        owned.add(row.pid);
      }
    }
  for (;;) {
    const prior = owned.size;
    for (const row of rows) if (owned.has(row.parent)) owned.add(row.pid);
    if (owned.size === prior) break;
  }
  const processes = rows.filter((row) => owned.has(row.pid));
  assert.ok(processes.length <= MAX_BROWSER_PROCESSES, 'Browser process inventory limit');
  if (tracking) tracking.known = new Map(processes.map((row) => [row.pid, row.birth]));
  return { rssBytes: processes.reduce((sum, row) => sum + row.rssBytes, 0), processes };
}

export function createBrowserMemory(pid) {
  const tracking = { known: new Map(), rootBirth: null, closing: false };
  return {
    beginClosing() {
      tracking.closing = true;
    },
    sample() {
      return summarizeProcessTree(
        pid,
        execFileSync('ps', ['-axo', 'pid=,ppid=,rss=,lstart='], {
          encoding: 'utf8',
        }),
        tracking
      );
    },
  };
}

export function recordResourcePhase(phases, phase, elapsedMs, sample, peakRss) {
  assert.ok(phases.length < MAX_RESOURCE_PHASES, 'Resource phase inventory limit');
  phases.push({ phase, elapsedMs, ...sample });
  return Math.max(peakRss, sample.rssBytes);
}

export function assertMemoryBudget(baselineRss, peakRss, budgetBytes, samplingFailure) {
  assert.equal(samplingFailure, undefined);
  assert.ok(Number.isFinite(baselineRss), 'Owned browser RSS baseline is unavailable');
  assert.ok(
    peakRss - baselineRss <= budgetBytes,
    'Owned browser RSS growth exceeded the supplied budget'
  );
}

export async function finishBrowserAccounting(report, steps) {
  function fail(name, error) {
    report[name] = error instanceof Error ? error.stack : String(error);
    report.firstFailure ??= report[name];
    report.status = 'failed';
  }
  async function mandatory(name, task) {
    try {
      return await task();
    } catch (error) {
      fail(name, error);
      return undefined;
    }
  }
  report.terminalObservationScope =
    'Supplemental diagnostic; mandatory reference is observations[0]';
  try {
    report.terminalObservation = await steps.observe();
  } catch (error) {
    report.terminalObservationFailure = String(error);
  }
  report.sourceAfter = await mandatory('sourceValidationFailure', steps.verifySource);
  steps.beginClosing();
  report.browserClosed = await mandatory('browserCloseFailure', steps.closeBrowser);
  report.serverClosed = await mandatory('serverCloseFailure', steps.closeServer);
  try {
    report.terminalMemory = steps.sample();
    if (report.terminalMemory)
      assert.equal(
        report.terminalMemory.processes.length,
        0,
        'Owned browser processes remain after close'
      );
  } catch (error) {
    fail('terminalMemoryFailure', error);
  }
  steps.stopSampling();
  try {
    steps.enforceBudget();
  } catch (error) {
    fail('terminalMemoryFailure', error);
  }
  report.memory = steps.memory();
  report.totalElapsedMs = steps.elapsed();
  try {
    assert.ok(
      report.totalElapsedMs <= report.replayBudgetMs,
      'Owned browser accounting exceeded the supplied replay budget'
    );
  } catch (error) {
    fail('terminalTimeFailure', error);
  }
  report.closedAt = new Date().toISOString();
  report.liveOwnedHandles = report.terminalMemory?.processes ?? null;
}
