import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAiGenerationMachine } from './aiGeneration.svelte';
import type { UiState } from './ui.svelte';

function createUiState(): UiState {
  return {
    resizingActionButtons: false,
    clearTutorialVisible: false,
    aiGenerating: false,
    aiResultOpen: false,
    aiResultUrl: null,
    aiPreviewUrl: null,
    aiError: false,
    aiErrorMessage: null,
    aiErrorKind: 'generic',
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
});

describe('createAiGenerationMachine', () => {
  it('gives each machine independent run ownership', () => {
    const machineA = createAiGenerationMachine(createUiState());
    const machineB = createAiGenerationMachine(createUiState());

    const runA = machineA.startAiGeneration(null);
    const runB = machineB.startAiGeneration(null);

    expect(runA).toBe(1);
    expect(runB).toBe(1);
    expect(machineA.isAiGenerationActive(runA)).toBe(true);
    expect(machineB.isAiGenerationActive(runB)).toBe(true);
  });

  it('aborts the prior controller without letting its end clear the replacement', () => {
    const machine = createAiGenerationMachine(createUiState());
    const firstController = new AbortController();
    const firstRun = machine.startAiGeneration(null, firstController);

    const secondRun = machine.startAiGeneration(null);
    machine.endAiGeneration(firstRun);

    expect(firstController.signal.aborted).toBe(true);
    expect(machine.isAiGenerationActive(firstRun)).toBe(false);
    expect(machine.isAiGenerationActive(secondRun)).toBe(true);
  });

  it('closes the active result and allows a fresh run to start', () => {
    const uiState = createUiState();
    const machine = createAiGenerationMachine(uiState);
    const controller = new AbortController();
    const firstRun = machine.startAiGeneration('blob:preview', controller);
    machine.finishAiGeneration(firstRun, 'blob:result');
    machine.closeAiResult();

    expect(controller.signal.aborted).toBe(true);
    expect(machine.isAiGenerationActive(firstRun)).toBe(false);
    expect(uiState).toMatchObject({
      aiGenerating: false,
      aiResultOpen: false,
      aiResultUrl: null,
      aiPreviewUrl: null,
      aiError: false,
      aiErrorMessage: null,
      aiErrorKind: 'generic',
    });
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:result');
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:preview');

    const secondRun = machine.startAiGeneration(null);
    expect(machine.isAiGenerationActive(secondRun)).toBe(true);
    expect(uiState.aiGenerating).toBe(true);
    expect(uiState.aiResultOpen).toBe(true);
  });

  it('revokes stale preview and result URLs without changing the active run', () => {
    const uiState = createUiState();
    const machine = createAiGenerationMachine(uiState);
    const staleRun = machine.startAiGeneration('blob:first-preview');
    const activeRun = machine.startAiGeneration('blob:active-preview');

    machine.setAiPreview(staleRun, 'blob:stale-preview');
    const committed = machine.finishAiGeneration(staleRun, 'blob:stale-result');

    expect(committed).toBe(false);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:first-preview');
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:stale-preview');
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:stale-result');
    expect(machine.isAiGenerationActive(activeRun)).toBe(true);
    expect(uiState.aiPreviewUrl).toBe('blob:active-preview');
    expect(uiState.aiResultUrl).toBeNull();
    expect(uiState.aiGenerating).toBe(true);
  });

  it('commits the active result as a successful terminal state', () => {
    const uiState = createUiState();
    const machine = createAiGenerationMachine(uiState);
    const run = machine.startAiGeneration(null);

    expect(machine.finishAiGeneration(run, 'blob:result')).toBe(true);
    expect(uiState.aiResultUrl).toBe('blob:result');
    expect(uiState.aiGenerating).toBe(false);
    expect(uiState.aiError).toBe(false);
  });

  it('commits an active failure with its message and kind', () => {
    const uiState = createUiState();
    const machine = createAiGenerationMachine(uiState);
    const run = machine.startAiGeneration(null);

    machine.failAiGeneration(run, 'Try again', 'retry');

    expect(uiState.aiGenerating).toBe(false);
    expect(uiState.aiError).toBe(true);
    expect(uiState.aiErrorMessage).toBe('Try again');
    expect(uiState.aiErrorKind).toBe('retry');
  });
});
