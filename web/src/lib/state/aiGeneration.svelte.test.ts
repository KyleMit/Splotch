import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAiGeneration } from './aiGeneration.svelte';

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
});

describe('createAiGeneration', () => {
  it('gives each machine independent run ownership', () => {
    const machineA = createAiGeneration();
    const machineB = createAiGeneration();

    const runA = machineA.startAiGeneration(null);
    const runB = machineB.startAiGeneration(null);

    expect(runA).toBe(1);
    expect(runB).toBe(1);
    expect(machineA.isAiGenerationActive(runA)).toBe(true);
    expect(machineB.isAiGenerationActive(runB)).toBe(true);
  });

  it('refuses writes through the phase getter', () => {
    const machine = createAiGeneration();
    machine.startAiGeneration(null);

    expect(() => {
      Object.assign(machine.phase, { kind: 'closed' });
    }).toThrow(TypeError);
    expect(machine.phase).toEqual({ kind: 'generating' });
  });

  it('aborts the prior controller and clears its stale UI without letting its end clear the replacement', () => {
    const machine = createAiGeneration();
    const firstController = new AbortController();
    const firstRun = machine.startAiGeneration('blob:first-preview', firstController, 'Crayon');
    machine.finishAiGeneration(firstRun, 'blob:first-result', 'image/png');
    machine.failAiGeneration(firstRun, 'Try again', 'retry');

    const secondRun = machine.startAiGeneration('blob:second-preview', undefined, 'Watercolor');
    machine.endAiGeneration(firstRun);

    expect(firstController.signal.aborted).toBe(true);
    expect(machine.isAiGenerationActive(firstRun)).toBe(false);
    expect(machine.isAiGenerationActive(secondRun)).toBe(true);
    expect(machine.phase).toEqual({ kind: 'generating' });
    expect(machine.previewUrl).toBe('blob:second-preview');
    expect(machine.style).toBe('Watercolor');
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:first-result');
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:first-preview');
  });

  it('closes the active result and allows a fresh run to start', () => {
    const machine = createAiGeneration();
    const controller = new AbortController();
    const firstRun = machine.startAiGeneration('blob:preview', controller, 'Paper');
    machine.finishAiGeneration(firstRun, 'blob:result', 'image/webp');
    machine.closeAiResult();

    expect(controller.signal.aborted).toBe(true);
    expect(machine.isAiGenerationActive(firstRun)).toBe(false);
    expect(machine.phase).toEqual({ kind: 'closed' });
    expect(machine.previewUrl).toBeNull();
    expect(machine.style).toBeNull();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:result');
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:preview');

    const secondRun = machine.startAiGeneration(null);
    expect(machine.isAiGenerationActive(secondRun)).toBe(true);
    expect(machine.phase).toEqual({ kind: 'generating' });
  });

  it('revokes stale preview and result URLs without changing the active run', () => {
    const machine = createAiGeneration();
    const staleRun = machine.startAiGeneration('blob:first-preview');
    const activeRun = machine.startAiGeneration('blob:active-preview');

    machine.setAiPreview(staleRun, 'blob:stale-preview');
    const committed = machine.finishAiGeneration(staleRun, 'blob:stale-result', 'image/png');

    expect(committed).toBe(false);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:first-preview');
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:stale-preview');
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:stale-result');
    expect(machine.isAiGenerationActive(activeRun)).toBe(true);
    expect(machine.previewUrl).toBe('blob:active-preview');
    expect(machine.phase).toEqual({ kind: 'generating' });
  });

  it('commits the active result as a successful terminal state', () => {
    const machine = createAiGeneration();
    const run = machine.startAiGeneration(null, undefined, 'Felt');

    expect(machine.finishAiGeneration(run, 'blob:result', 'image/jpeg')).toBe(true);
    expect(machine.phase).toEqual({
      kind: 'result',
      url: 'blob:result',
      type: 'image/jpeg',
      reportToken: null,
      autoSave: null,
    });
    expect(machine.style).toBe('Felt');
  });

  it('commits an active failure with its message and kind', () => {
    const machine = createAiGeneration();
    const run = machine.startAiGeneration(null);

    machine.failAiGeneration(run, 'Try again', 'retry');

    expect(machine.phase).toEqual({
      kind: 'error',
      errorKind: 'retry',
      message: 'Try again',
      reportToken: null,
      details: null,
    });
  });

  it('cannot hold a picture and an error at once: a failure after a result releases the picture', () => {
    const machine = createAiGeneration();
    const run = machine.startAiGeneration(null);
    machine.finishAiGeneration(run, 'blob:result', 'image/png');

    machine.failAiGeneration(run, 'Try again', 'retry');

    expect(machine.phase.kind).toBe('error');
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:result');
  });

  it('records the auto-save outcome only for the owning run and clears it on the next', () => {
    const machine = createAiGeneration();
    const staleRun = machine.startAiGeneration(null);
    const run = machine.startAiGeneration(null);
    machine.finishAiGeneration(run, 'blob:result', 'image/png');

    machine.setAiAutoSave(run, { status: 'failed' });
    machine.setAiAutoSave(staleRun, { status: 'photos' });
    expect(machine.phase).toMatchObject({ kind: 'result', autoSave: { status: 'failed' } });

    machine.startAiGeneration(null);
    expect(machine.phase).toEqual({ kind: 'generating' });
  });

  it('ignores an auto-save outcome while no picture is on screen', () => {
    const machine = createAiGeneration();
    const run = machine.startAiGeneration(null);

    machine.setAiAutoSave(run, { status: 'failed' });

    expect(machine.phase).toEqual({ kind: 'generating' });
  });

  it('keeps a report token only when a reportable failure supplies one', () => {
    const machine = createAiGeneration();
    const run = machine.startAiGeneration(null);

    machine.failAiGeneration(run, 'Draw something else', 'safety', 'signed-refusal-token');

    expect(machine.phase).toMatchObject({
      kind: 'error',
      errorKind: 'safety',
      reportToken: 'signed-refusal-token',
    });
  });
});

describe('minimizing a waiting generation', () => {
  it('keeps the run alive so the picture can still be delivered into it', () => {
    const machine = createAiGeneration();
    const id = machine.startAiGeneration(null);

    machine.minimizeAiResult();
    expect(machine.minimized).toBe(true);
    // The whole trick: the run stays open, which is what finishAiGeneration
    // checks. Minimizing must not become a way to throw away a paid picture.
    expect(machine.phase).toEqual({ kind: 'generating' });
    expect(machine.finishAiGeneration(id, 'blob:done', 'image/png')).toBe(true);
    expect(machine.phase).toMatchObject({ kind: 'result', url: 'blob:done' });
  });

  it('refuses to minimize a result there is already something to look at', () => {
    const machine = createAiGeneration();
    const id = machine.startAiGeneration(null);
    machine.finishAiGeneration(id, 'blob:done', 'image/png');

    machine.minimizeAiResult();
    expect(machine.minimized).toBe(false);
  });

  it('restores, and clears the flag when the run is closed or a new one starts', () => {
    const machine = createAiGeneration();
    machine.startAiGeneration(null);

    machine.minimizeAiResult();
    machine.restoreAiResult();
    expect(machine.minimized).toBe(false);

    machine.minimizeAiResult();
    machine.closeAiResult();
    expect(machine.minimized).toBe(false);

    machine.startAiGeneration(null);
    machine.minimizeAiResult();
    machine.startAiGeneration(null);
    expect(machine.minimized).toBe(false);
  });
});

describe('consecutive generation failures', () => {
  it('retains failures across retries and resets them on success and close', () => {
    const machine = createAiGeneration();
    const first = machine.startAiGeneration(null);
    machine.failAiGeneration(first, undefined, 'retry');
    expect(machine.consecutiveFailures).toBe(1);
    const second = machine.startAiGeneration(null);
    machine.failAiGeneration(second, undefined, 'retry');
    expect(machine.consecutiveFailures).toBe(2);
    const third = machine.startAiGeneration(null);
    machine.finishAiGeneration(third, 'blob:result', 'image/png');
    expect(machine.consecutiveFailures).toBe(0);
    machine.failAiGeneration(third, undefined, 'retry');
    machine.closeAiResult();
    expect(machine.consecutiveFailures).toBe(0);
  });

  it('ignores stale failures and clears the streak on a safety refusal', () => {
    const machine = createAiGeneration();
    const first = machine.startAiGeneration(null);
    machine.failAiGeneration(first, undefined, 'retry');
    const second = machine.startAiGeneration(null);
    machine.failAiGeneration(first, undefined, 'retry');
    expect(machine.consecutiveFailures).toBe(1);
    machine.failAiGeneration(second, undefined, 'safety');
    expect(machine.consecutiveFailures).toBe(0);
  });

  it('retains only the owning drawing and releases it when closed', () => {
    const machine = createAiGeneration();
    const first = machine.startAiGeneration(null);
    const second = machine.startAiGeneration(null);
    const drawing = new Blob(['drawing']);
    machine.setAiDrawing(first, new Blob(['stale']));
    expect(machine.drawing).toBeNull();
    machine.setAiDrawing(second, drawing);
    machine.failAiGeneration(second, undefined, 'retry');
    expect(machine.drawing).toBe(drawing);
    machine.closeAiResult();
    expect(machine.drawing).toBeNull();
  });
});
