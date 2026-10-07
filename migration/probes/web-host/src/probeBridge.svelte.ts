import { SvelteSet } from 'svelte/reactivity';
import { releaseAllPointers } from '$lib/drawing/engine';
import { appearanceState } from '$lib/state/appearance.svelte';
import { colorsState } from '$lib/state/colors.svelte';
import { settingsState } from '$lib/state/settings.svelte';
import { toolState, BRUSH_OPTIONS } from '$lib/state/tool.svelte';
import { paletteHex } from '$lib/palette';
import { canvasState } from '$lib/state/canvas.svelte';
import { PROBE_SERVER_SNAPSHOT, type ProbeSnapshot, type ProbeStore } from './probeProps';

type LiveSnapshot = Extract<ProbeSnapshot, { phase: 'live' }>;

function readSnapshot(): LiveSnapshot {
  return Object.freeze({
    phase: 'live',
    theme: appearanceState.resolvedTheme(),
    canUndo: canvasState.canUndo,
    undoCount: canvasState.undoCount,
    canvasEmpty: canvasState.canvasEmpty,
    strokeCount: canvasState.strokeCount,
    activeSwatch: colorsState.activeSwatch,
    activeColor: colorsState.activeColor,
    brush: toolState.brush,
    brushOptions: Object.freeze(
      BRUSH_OPTIONS.filter(
        ({ brush }) => brush === 'pen' || settingsState.enabledOptionalBrushes().includes(brush)
      )
    ),
  });
}

function sameSnapshot(left: LiveSnapshot, right: LiveSnapshot): boolean {
  return (
    left.theme === right.theme &&
    left.canUndo === right.canUndo &&
    left.undoCount === right.undoCount &&
    left.canvasEmpty === right.canvasEmpty &&
    left.strokeCount === right.strokeCount &&
    left.activeSwatch === right.activeSwatch &&
    left.activeColor === right.activeColor &&
    left.brush === right.brush &&
    left.brushOptions.map(({ brush }) => brush).join() ===
      right.brushOptions.map(({ brush }) => brush).join()
  );
}

export function createProbeBridge(openDialog: ProbeStore['openDialog']): {
  store: ProbeStore;
  dispose: () => void;
} {
  let snapshot = readSnapshot();
  let disposed = false;
  const listeners = new SvelteSet<() => void>();
  const stopEffects = $effect.root(() => {
    $effect(() => {
      const next = readSnapshot();
      if (disposed || sameSnapshot(snapshot, next)) return;
      snapshot = next;
      for (const listener of [...listeners]) listener();
    });
  });

  return {
    store: {
      subscribe(listener) {
        if (disposed) throw new Error('The web host bridge is disposed');
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      getSnapshot: () => snapshot,
      getServerSnapshot: () => PROBE_SERVER_SNAPSHOT,
      toggleTheme() {
        if (disposed) return;
        const current = appearanceState.resolvedTheme();
        appearanceState.setResolvedTheme(current === 'dark' ? 'light' : 'dark');
      },
      selectColor(label) {
        if (disposed) return;
        toolState.selectInkBrush();
        colorsState.selectPaletteColor(paletteHex(label));
        releaseAllPointers();
      },
      selectBrush(brush) {
        if (!disposed && snapshot.brushOptions.some((option) => option.brush === brush))
          toolState.selectBrush(brush);
      },
      openDialog(trigger) {
        if (!disposed) openDialog(trigger);
      },
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      stopEffects();
      listeners.clear();
    },
  };
}
