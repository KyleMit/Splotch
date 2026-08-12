import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAiGenerationMachine, type AiResultState } from './aiGeneration.svelte';

function createAiResultState(): AiResultState {
  return {
    generating: false,
    open: false,
    resultUrl: null,
    resultType: null,
    previewUrl: null,
    style: null,
    reportToken: null,
    error: null,
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
});

describe('createAiGenerationMachine', () => {
  it('gives each machine independent run ownership', () => {
    const machineA = createAiGenerationMachine(createAiResultState());
    const machineB = createAiGenerationMachine(createAiResultState());

    const runA = machineA.startAiGeneration(null);
    const runB = machineB.startAiGeneration(null);

    expect(runA).toBe(1);
    expect(runB).toBe(1);
    expect(machineA.isAiGenerationActive(runA)).toBe(true);
    expect(machineB.isAiGenerationActive(runB)).toBe(true);
  });

  it('aborts the prior controller and clears its stale UI without letting its end clear the replacement', () => {
    const resultState = createAiResultState();
    const machine = createAiGenerationMachine(resultState);
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
    const resultState = createAiResultState();
    const machine = createAiGenerationMachine(resultState);
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
    const resultState = createAiResultState();
    const machine = createAiGenerationMachine(resultState);
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
    const resultState = createAiResultState();
    const machine = createAiGenerationMachine(resultState);
    const run = machine.startAiGeneration(null, undefined, 'Felt');

    expect(machine.finishAiGeneration(run, 'blob:result', 'image/jpeg')).toBe(true);
    expect(resultState.resultUrl).toBe('blob:result');
    expect(resultState.resultType).toBe('image/jpeg');
    expect(resultState.style).toBe('Felt');
    expect(resultState.generating).toBe(false);
    expect(resultState.error).toBeNull();
  });

  it('commits an active failure with its message and kind', () => {
    const resultState = createAiResultState();
    const machine = createAiGenerationMachine(resultState);
    const run = machine.startAiGeneration(null);

    machine.failAiGeneration(run, 'Try again', 'retry');

    expect(resultState.generating).toBe(false);
    expect(resultState.error).toEqual({ kind: 'retry', message: 'Try again' });
  });
});
