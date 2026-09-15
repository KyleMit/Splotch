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

  it('aborts the prior controller and clears its stale UI without letting its end clear the replacement', () => {
    const machine = createAiGeneration();
    const resultState = machine;
    const firstController = new AbortController();
    const firstRun = machine.startAiGeneration('blob:first-preview', firstController, 'Crayon');
    machine.finishAiGeneration(firstRun, 'blob:first-result', 'image/png');
    machine.failAiGeneration(firstRun, 'Try again', 'retry');

    const secondRun = machine.startAiGeneration('blob:second-preview', undefined, 'Watercolor');
    machine.endAiGeneration(firstRun);

    expect(firstController.signal.aborted).toBe(true);
    expect(machine.isAiGenerationActive(firstRun)).toBe(false);
    expect(machine.isAiGenerationActive(secondRun)).toBe(true);
    expect(resultState).toMatchObject({
      generating: true,
      open: true,
      resultUrl: null,
      resultType: null,
      previewUrl: 'blob:second-preview',
      style: 'Watercolor',
      error: null,
    });
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:first-result');
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:first-preview');
  });

  it('closes the active result and allows a fresh run to start', () => {
    const machine = createAiGeneration();
    const resultState = machine;
    const controller = new AbortController();
    const firstRun = machine.startAiGeneration('blob:preview', controller, 'Paper');
    machine.finishAiGeneration(firstRun, 'blob:result', 'image/webp');
    machine.closeAiResult();

    expect(controller.signal.aborted).toBe(true);
    expect(machine.isAiGenerationActive(firstRun)).toBe(false);
    expect(resultState).toMatchObject({
      generating: false,
      open: false,
      resultUrl: null,
      resultType: null,
      previewUrl: null,
      style: null,
      error: null,
    });
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:result');
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:preview');

    const secondRun = machine.startAiGeneration(null);
    expect(machine.isAiGenerationActive(secondRun)).toBe(true);
    expect(resultState.generating).toBe(true);
    expect(resultState.open).toBe(true);
  });

  it('revokes stale preview and result URLs without changing the active run', () => {
    const machine = createAiGeneration();
    const resultState = machine;
    const staleRun = machine.startAiGeneration('blob:first-preview');
    const activeRun = machine.startAiGeneration('blob:active-preview');

    machine.setAiPreview(staleRun, 'blob:stale-preview');
    const committed = machine.finishAiGeneration(staleRun, 'blob:stale-result', 'image/png');

    expect(committed).toBe(false);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:first-preview');
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:stale-preview');
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:stale-result');
    expect(machine.isAiGenerationActive(activeRun)).toBe(true);
    expect(resultState.previewUrl).toBe('blob:active-preview');
    expect(resultState.resultUrl).toBeNull();
    expect(resultState.resultType).toBeNull();
    expect(resultState.generating).toBe(true);
  });

  it('commits the active result as a successful terminal state', () => {
    const machine = createAiGeneration();
    const resultState = machine;
    const run = machine.startAiGeneration(null, undefined, 'Felt');

    expect(machine.finishAiGeneration(run, 'blob:result', 'image/jpeg')).toBe(true);
    expect(resultState.resultUrl).toBe('blob:result');
    expect(resultState.resultType).toBe('image/jpeg');
    expect(resultState.style).toBe('Felt');
    expect(resultState.generating).toBe(false);
    expect(resultState.error).toBeNull();
  });

  it('commits an active failure with its message and kind', () => {
    const machine = createAiGeneration();
    const resultState = machine;
    const run = machine.startAiGeneration(null);

    machine.failAiGeneration(run, 'Try again', 'retry');

    expect(resultState.generating).toBe(false);
    expect(resultState.error).toEqual({ kind: 'retry', message: 'Try again' });
  });

  it('records the auto-save outcome only for the owning run and clears it on the next', () => {
    const machine = createAiGeneration();
    const resultState = machine;
    const staleRun = machine.startAiGeneration(null);
    const run = machine.startAiGeneration(null);
    machine.finishAiGeneration(run, 'blob:result', 'image/png');

    machine.setAiAutoSave(run, { status: 'failed' });
    machine.setAiAutoSave(staleRun, { status: 'photos' });
    expect(resultState.autoSave).toEqual({ status: 'failed' });

    machine.startAiGeneration(null);
    expect(resultState.autoSave).toBeNull();
  });

  it('keeps a report token only when a reportable failure supplies one', () => {
    const machine = createAiGeneration();
    const resultState = machine;
    const run = machine.startAiGeneration(null);

    machine.failAiGeneration(run, 'Draw something else', 'safety', 'signed-refusal-token');

    expect(resultState.reportToken).toBe('signed-refusal-token');
    expect(resultState.error?.kind).toBe('safety');
  });
});

describe('minimizing a waiting generation', () => {
  it('keeps the run alive so the picture can still be delivered into it', () => {
    const machine = createAiGeneration();
    const state = machine;
    const id = machine.startAiGeneration(null);

    machine.minimizeAiResult();
    expect(state.minimized).toBe(true);
    // The whole trick: `open` stays true, which is what finishAiGeneration
    // checks. Minimizing must not become a way to throw away a paid picture.
    expect(state.open).toBe(true);
    expect(machine.finishAiGeneration(id, 'blob:done', 'image/png')).toBe(true);
    expect(state.resultUrl).toBe('blob:done');
  });

  it('refuses to minimize a result there is already something to look at', () => {
    const machine = createAiGeneration();
    const state = machine;
    const id = machine.startAiGeneration(null);
    machine.finishAiGeneration(id, 'blob:done', 'image/png');

    machine.minimizeAiResult();
    expect(state.minimized).toBe(false);
  });

  it('restores, and clears the flag when the run is closed or a new one starts', () => {
    const machine = createAiGeneration();
    const state = machine;
    machine.startAiGeneration(null);

    machine.minimizeAiResult();
    machine.restoreAiResult();
    expect(state.minimized).toBe(false);

    machine.minimizeAiResult();
    machine.closeAiResult();
    expect(state.minimized).toBe(false);

    machine.startAiGeneration(null);
    machine.minimizeAiResult();
    machine.startAiGeneration(null);
    expect(state.minimized).toBe(false);
  });
});

describe('consecutive generation failures', () => {
  it('retains failures across retries and resets them on success and close', () => {
    const machine = createAiGeneration();
    const state = machine;
    const first = machine.startAiGeneration(null);
    machine.failAiGeneration(first, undefined, 'retry');
    expect(state.consecutiveFailures).toBe(1);
    const second = machine.startAiGeneration(null);
    machine.failAiGeneration(second, undefined, 'retry');
    expect(state.consecutiveFailures).toBe(2);
    const third = machine.startAiGeneration(null);
    machine.finishAiGeneration(third, 'blob:result', 'image/png');
    expect(state.consecutiveFailures).toBe(0);
    machine.failAiGeneration(third, undefined, 'retry');
    machine.closeAiResult();
    expect(state.consecutiveFailures).toBe(0);
  });

  it('ignores stale failures and clears the streak on a safety refusal', () => {
    const machine = createAiGeneration();
    const state = machine;
    const first = machine.startAiGeneration(null);
    machine.failAiGeneration(first, undefined, 'retry');
    const second = machine.startAiGeneration(null);
    machine.failAiGeneration(first, undefined, 'retry');
    expect(state.consecutiveFailures).toBe(1);
    machine.failAiGeneration(second, undefined, 'safety');
    expect(state.consecutiveFailures).toBe(0);
  });

  it('retains only the owning drawing and releases it when closed', () => {
    const machine = createAiGeneration();
    const state = machine;
    const first = machine.startAiGeneration(null);
    const second = machine.startAiGeneration(null);
    const drawing = new Blob(['drawing']);
    machine.setAiDrawing(first, new Blob(['stale']));
    expect(state.drawing).toBeNull();
    machine.setAiDrawing(second, drawing);
    machine.failAiGeneration(second, undefined, 'retry');
    expect(state.drawing).toBe(drawing);
    machine.closeAiResult();
    expect(state.drawing).toBeNull();
  });
});
