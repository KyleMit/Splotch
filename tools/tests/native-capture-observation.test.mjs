import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { describe, expect, it, vi } from 'vitest';
import {
  assertObservationComplete,
  classifyDiagnosticSvg,
  patchSnapshotMethod,
} from '../migration/probes/native-eraser/checkpoint-observation.mjs';
import { diagnosticOwner } from '../migration/probes/native-eraser/checkpoint-svg-owners.mjs';
import {
  MAX_BROWSER_PROCESSES,
  MAX_RESOURCE_PHASES,
  assertMemoryBudget,
  createBrowserMemory,
  finishBrowserAccounting,
  recordResourcePhase,
  summarizeProcessTree,
} from '../migration/probes/native-eraser/checkpoint-resources.mjs';

vi.mock('node:child_process', () => ({ execFileSync: vi.fn() }));

function decorate(calls) {
  return (original) =>
    function (callback, options) {
      calls.push({ instance: this, options });
      return original.call(this, callback, options);
    };
}

describe('actual SVG method ownership observation', () => {
  it('wraps an actual own capture method and preserves receiver/callback/cleanup identity', () => {
    const prototype = { toDataURL: vi.fn() };
    const receiver = Object.create(prototype);
    const release = vi.fn();
    const callback = vi.fn();
    receiver.elementRef = { current: { identity: 'actual snapshot node' } };
    receiver.toDataURL = function (accept, options) {
      expect(this).toBe(receiver);
      expect(options).toEqual({ width: 1024, height: 768 });
      accept('own-PNG');
      return release;
    };
    const calls = [],
      state = { patched: new WeakSet() };
    patchSnapshotMethod(state, receiver, decorate(calls));
    const wrapped = receiver.toDataURL;
    patchSnapshotMethod(state, receiver, decorate(calls));
    expect(receiver.toDataURL).toBe(wrapped);
    expect(receiver.toDataURL(callback, { width: 1024, height: 768 })).toBe(release);
    expect(callback).toHaveBeenCalledExactlyOnceWith('own-PNG');
    expect(calls).toEqual([{ instance: receiver, options: { width: 1024, height: 768 } }]);
    expect(prototype.toDataURL).not.toHaveBeenCalled();
  });

  it('wraps a shared prototype once while retaining each actual receiver', () => {
    const release = vi.fn();
    class Snapshot {
      toDataURL(callback) {
        callback(this.label);
        return release;
      }
    }
    const first = new Snapshot(),
      second = new Snapshot();
    first.label = 'first';
    second.label = 'second';
    const calls = [],
      state = { patched: new WeakSet() };
    patchSnapshotMethod(state, first, decorate(calls));
    patchSnapshotMethod(state, second, decorate(calls));
    const callback = vi.fn();
    expect(first.toDataURL(callback)).toBe(release);
    expect(second.toDataURL(callback)).toBe(release);
    expect(calls.map((item) => item.instance)).toEqual([first, second]);
    expect(callback.mock.calls).toEqual([['first'], ['second']]);
  });

  it('refuses a missing actual method instead of silently collecting incomplete evidence', () => {
    expect(() => patchSnapshotMethod({ patched: new WeakSet() }, {}, decorate([]))).toThrow(
      'Missing actual SVG capture method'
    );
  });
});

const BIRTH = 'Fri Oct 9 07:37:29 2026';
const row = (pid, parent, rss) => [pid, parent, rss, BIRTH].join(' ');
describe('startup-inclusive bounded browser process accounting', () => {
  it('retains owned nested process RSS and birth identities while excluding foreign roots', () => {
    const sample = summarizeProcessTree(
      10,
      [row(30, 20, 25), row(20, 10, 50), row(10, 1, 100), row(40, 1, 999)].join('\n')
    );
    expect(sample.rssBytes).toBe(175 * 1024);
    expect(sample.processes.map((item) => item.pid)).toEqual([30, 20, 10]);
    expect(sample.processes.every((item) => item.birth === BIRTH)).toBe(true);
  });

  it('includes a phase high-water sample that exceeds asynchronous sampling', () => {
    const phases = [],
      sample = summarizeProcessTree(10, row(10, 1, 300));
    const peak = recordResourcePhase(phases, 'export-complete', 123, sample, 100 * 1024);
    expect(peak).toBe(300 * 1024);
    expect(
      recordResourcePhase(phases, 'later', 124, summarizeProcessTree(10, row(10, 1, 200)), peak)
    ).toBe(peak);
    expect(phases[0].processes).toEqual(sample.processes);
  });

  it('refuses a higher final sample and missing observation without changing the original ceiling', () => {
    const baseline = 100,
      ceiling = 256;
    expect(() =>
      assertMemoryBudget(baseline, baseline + ceiling, ceiling, undefined)
    ).not.toThrow();
    expect(() => assertMemoryBudget(baseline, baseline + ceiling + 1, ceiling, undefined)).toThrow(
      'RSS growth exceeded'
    );
    expect(() => assertMemoryBudget(undefined, baseline, ceiling, undefined)).toThrow(
      'baseline is unavailable'
    );
    expect(() => assertMemoryBudget(baseline, baseline, ceiling, 'Missing owned PID')).toThrow();
  });

  it('fails closed on root loss, duplicate identities and malformed RSS', () => {
    expect(() => summarizeProcessTree(10, row(20, 1, 1))).toThrow('root is absent');
    expect(() => summarizeProcessTree(10, [row(10, 1, 1), row(10, 1, 2)].join('\n'))).toThrow(
      'Duplicate'
    );
    expect(() => summarizeProcessTree(10, row(10, 1, 'unknown'))).toThrow();
  });

  it('refuses process/phase inventory overflow without culling or raising the original ceilings', () => {
    const text = Array.from({ length: MAX_BROWSER_PROCESSES + 1 }, (_, index) =>
      row(10 + index, index ? 10 : 1, 1)
    ).join('\n');
    expect(() => summarizeProcessTree(10, text)).toThrow('process inventory limit');
    const phases = [],
      sample = summarizeProcessTree(10, row(10, 1, 1));
    for (let count = 0; count < MAX_RESOURCE_PHASES; count += 1)
      recordResourcePhase(phases, 'phase', count, sample, 0);
    expect(() => recordResourcePhase(phases, 'overflow', 1, sample, 0)).toThrow(
      'phase inventory limit'
    );
    expect(phases).toHaveLength(MAX_RESOURCE_PHASES);
  });
});

describe('consumed late browser accounting', () => {
  function accounting({
    firstFailure,
    sourceFailure,
    diagnosticFailure,
    surviving = [],
    latePeak = 200,
  } = {}) {
    const report = { status: 'passed-browser-only', replayBudgetMs: 60000 };
    if (firstFailure) report.firstFailure = firstFailure;
    const events = [];
    let active = true,
      peak = 100;
    const whileSampling = (name) => {
      expect(active).toBe(true);
      events.push(name);
    };
    const steps = {
      observe: async () => {
        whileSampling('diagnostic');
        await Promise.resolve();
        if (diagnosticFailure) throw new Error('Supplemental diagnostic failed');
        peak = latePeak;
        return { supplemental: true };
      },
      verifySource: async () => {
        whileSampling('source');
        if (sourceFailure) throw new Error('Final source changed');
        return 'exact';
      },
      beginClosing: () => whileSampling('closing'),
      closeBrowser: async () => {
        whileSampling('browser-close');
        await Promise.resolve();
        return true;
      },
      closeServer: async () => {
        whileSampling('server-close');
        return true;
      },
      sample: () => {
        whileSampling('final-sample');
        return { rssBytes: 0, processes: surviving };
      },
      stopSampling: () => {
        events.push('sampler-stop');
        active = false;
      },
      enforceBudget: () => {
        expect(active).toBe(false);
        assertMemoryBudget(100, peak, 256, undefined);
      },
      memory: () => ({ baselineRss: 100, peakRss: peak }),
      elapsed: () => 1000,
    };
    return { report, events, steps };
  }

  it('keeps sampling through awaited diagnostic/source/close then enforces the late peak', async () => {
    const { report, events, steps } = accounting({ latePeak: 357 });
    await finishBrowserAccounting(report, steps);
    expect(events).toEqual([
      'diagnostic',
      'source',
      'closing',
      'browser-close',
      'server-close',
      'final-sample',
      'sampler-stop',
    ]);
    expect(report.status).toBe('failed');
    expect(report.firstFailure).toContain('RSS growth exceeded');
    expect(report.memory.peakRss).toBe(357);
    expect(report.liveOwnedHandles).toEqual([]);
  });

  it('reports the complete accounted lifetime against the unchanged replay ceiling', async () => {
    const { report, steps } = accounting();
    steps.elapsed = () => 60001;
    await finishBrowserAccounting(report, steps);
    expect(report.totalElapsedMs).toBe(60001);
    expect(report.status).toBe('failed');
    expect(report.firstFailure).toContain('supplied replay budget');
  });

  it('reflects mandatory source failure in final status while keeping the original first failure', async () => {
    const { report, steps } = accounting({
      firstFailure: 'Original pixel failure',
      sourceFailure: true,
    });
    await finishBrowserAccounting(report, steps);
    expect(report.status).toBe('failed');
    expect(report.firstFailure).toBe('Original pixel failure');
    expect(report.sourceValidationFailure).toContain('Final source changed');
    expect(report.browserClosed).toBe(true);
    expect(report.serverClosed).toBe(true);
  });

  it('labels supplemental diagnostic failure without inventing a new mandatory observation gate', async () => {
    const { report, steps } = accounting({ diagnosticFailure: true });
    await finishBrowserAccounting(report, steps);
    expect(report.status).toBe('passed-browser-only');
    expect(report.terminalObservationScope).toContain('Supplemental');
    expect(report.terminalObservationFailure).toContain('Supplemental diagnostic failed');
    expect(report.sourceAfter).toBe('exact');
  });

  it('refuses remaining owned children after successful close instead of claiming normal exit', async () => {
    const { report, steps } = accounting({ surviving: [{ pid: 20, birth: BIRTH }] });
    await finishBrowserAccounting(report, steps);
    expect(report.status).toBe('failed');
    expect(report.firstFailure).toContain('processes remain');
    expect(report.liveOwnedHandles).toEqual([{ pid: 20, birth: BIRTH }]);
  });

  it('preserves a failed browser close while still attempting server closure', async () => {
    const { report, steps } = accounting();
    steps.closeBrowser = async () => {
      throw new Error('Browser close failed');
    };
    await finishBrowserAccounting(report, steps);
    expect(report.status).toBe('failed');
    expect(report.firstFailure).toContain('Browser close failed');
    expect(report.serverClosed).toBe(true);
  });

  it('refuses malformed final memory observation instead of declaring clean shutdown', async () => {
    const { report, steps } = accounting();
    steps.sample = () => {
      throw new Error('Malformed process inventory');
    };
    await finishBrowserAccounting(report, steps);
    expect(report.status).toBe('failed');
    expect(report.firstFailure).toContain('Malformed');
    expect(report.liveOwnedHandles).toBeNull();
  });

  it('consumes the actual memory owner closing transition before allowing verified normal exit', () => {
    const memory = createBrowserMemory(10);
    vi.mocked(execFileSync).mockReturnValue([row(10, 1, 100), row(20, 10, 50)].join('\n'));
    expect(memory.sample().rssBytes).toBe(150 * 1024);
    vi.mocked(execFileSync).mockReturnValue(row(20, 1, 200));
    expect(() => memory.sample()).toThrow('root is absent');
    memory.beginClosing();
    expect(memory.sample().rssBytes).toBe(200 * 1024);
    vi.mocked(execFileSync).mockReturnValue(row(40, 1, 999));
    expect(memory.sample().processes).toEqual([]);
    expect(execFileSync).toHaveBeenCalledWith('ps', ['-axo', 'pid=,ppid=,rss=,lstart='], {
      encoding: 'utf8',
    });
  });

  it('tracks birth-validated reparented children through close and refuses missing/reused identities', () => {
    const tracking = { known: new Map(), rootBirth: null, closing: false };
    summarizeProcessTree(10, [row(10, 1, 100), row(20, 10, 50)].join('\n'), tracking);
    expect(() => summarizeProcessTree(10, row(20, 1, 200), tracking)).toThrow('root is absent');
    tracking.closing = true;
    const survivor = summarizeProcessTree(10, row(20, 1, 200), tracking);
    expect(survivor.rssBytes).toBe(200 * 1024);
    expect(survivor.processes[0].pid).toBe(20);
    expect(() =>
      summarizeProcessTree(10, row(20, 1, 200).replace('07:37:29', '07:37:30'), tracking)
    ).toThrow('birth mismatch');
    expect(() => summarizeProcessTree(10, '', tracking)).toThrow('Empty process inventory');
    expect(() => summarizeProcessTree(10, '20 1 200 malformed', tracking)).toThrow('Malformed');
    expect(summarizeProcessTree(10, row(40, 1, 999), tracking).processes).toEqual([]);
  });

  it('binds the actual driver finally to awaited accounting, live sampling, source checks and exit refusal', () => {
    const driver = readFileSync(
      new URL('../migration/probes/native-eraser/checkpoint-browser.mjs', import.meta.url),
      'utf8'
    ).replace(/\s+/g, ' ');
    const closing = driver.slice(driver.indexOf(' } finally {'));
    expect(driver).toContain('memoryOwner = createBrowserMemory(report.ownedBrowserPid)');
    expect(closing).toContain('await finishBrowserAccounting(report, {');
    expect(closing).toContain(
      "verifySource: async () => { await assertSource(source); return 'exact'; }"
    );
    expect(closing).toContain('beginClosing: () => memoryOwner?.beginClosing()');
    expect(closing).toContain(
      "closeBrowser: async () => { if (!browser) return 'not-created'; await browser.close(); return true; }"
    );
    expect(closing).toContain(
      "closeServer: async () => { if (!server) return 'not-created'; await server.close(); return true; }"
    );
    expect(closing).toContain('const sample = memoryOwner?.sample()');
    expect(closing).toContain('stopSampling: () => { if (sampler) clearInterval(sampler); }');
    expect(closing).toContain("if (report.status === 'failed') process.exitCode = 1");
    expect(closing.indexOf('await finishBrowserAccounting')).toBeLessThan(
      closing.indexOf("await writeFile(join(output, 'result.json')")
    );
  });
});

describe('strict global SVG owner admission', () => {
  const spinner = { kind: 'unknown', ancestors: [{ name: 'ActivityIndicator', key: null }] };
  function node({ progressbar = true, paper = false } = {}) {
    return {
      closest: (selector) =>
        selector === '[role="progressbar"]' ? (progressbar ? {} : null) : paper ? {} : null,
    };
  }
  it('classifies only an actual ActivityIndicator ancestor inside its progressbar outside paper', () => {
    expect(classifyDiagnosticSvg(node(), spinner).kind).toBe('noncapture-activity-indicator');
    expect(() => classifyDiagnosticSvg(node({ progressbar: false }), spinner)).toThrow(
      'Unclassified'
    );
    expect(() => classifyDiagnosticSvg(node({ paper: true }), spinner)).toThrow('Unclassified');
    expect(() => classifyDiagnosticSvg(node(), { kind: 'unknown', ancestors: [] })).toThrow(
      'Unclassified'
    );
    expect(() => classifyDiagnosticSvg(node(), { kind: 'invented-owner', ancestors: [] })).toThrow(
      'Unclassified'
    );
  });
  it('requires the real method on a capture owner even under ActivityIndicator ancestry', () => {
    const owner = { ...spinner, kind: 'checkpoint' };
    expect(classifyDiagnosticSvg(node(), owner).kind).toBe('required-capture');
    expect(() => patchSnapshotMethod({ patched: new WeakSet() }, {}, decorate([]))).toThrow(
      'Missing actual'
    );
  });
  it('refuses missing or failed mandatory metadata independently of pixel/resource success', () => {
    expect(() => assertObservationComplete({ diagnosticErrors: [] })).not.toThrow();
    expect(() => assertObservationComplete({})).toThrow('Mandatory SVG');
    expect(() =>
      assertObservationComplete({ diagnosticErrors: ['Missing actual SVG capture method'] })
    ).toThrow('Mandatory SVG');
    const driver = readFileSync(
      new URL('../migration/probes/native-eraser/checkpoint-browser.mjs', import.meta.url),
      'utf8'
    );
    expect(driver).toMatch(
      /preserveObservation\(output, name, observation\)\);\s*assertObservationComplete\(observation\);/
    );
  });
});

describe('actual named production outline ownership', () => {
  function tree(ancestor, pageOutline) {
    const node = {};
    const instance = {
      elementRef: { current: node },
      props: {
        children: pageOutline
          ? { type: function PageOutline() {} }
          : { type: function Unrelated() {} },
      },
    };
    node.__reactFiber$fixture = {
      type: 'svg',
      stateNode: node,
      return: {
        type: function Svg() {},
        stateNode: instance,
        return: { type: { name: ancestor }, key: null },
      },
    };
    return node;
  }
  it('requires both the actual Svg instance children and the owning production ancestor', () => {
    expect(diagnosticOwner(tree('DrawingSurface', true)).kind).toBe('paper-outline');
    expect(diagnosticOwner(tree('ColoringPagePicker', true)).kind).toBe('page-preview');
    expect(diagnosticOwner(tree('DrawingSurface', false)).kind).toBe('unknown');
    expect(diagnosticOwner(tree('Unrelated', true)).kind).toBe('unknown');
  });
});
