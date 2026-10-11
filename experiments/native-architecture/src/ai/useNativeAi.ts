import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { createNativeAi, type NativeAiOwner, type AiState } from './generation';
import { aiStorage, aiTransport, aiVault, admitAiImage } from '../platform/ai';
import { savePicture } from '../platform/drawingFiles';
import { prepareAiPng } from './prepare';
import type { useDrawingScreen } from '../useDrawingScreen';
const GATE_TICK_MS = 1000;
export function useNativeAi(screen: ReturnType<typeof useDrawingScreen>) {
  const screenRef = useRef(screen);
  screenRef.current = screen;
  const [owner, setOwner] = useState<NativeAiOwner | null>(null);
  const [state, setState] = useState<AiState | null>(null);
  useEffect(() => {
    const instance = createNativeAi({
      vault: aiVault,
      storage: aiStorage,
      transport: aiTransport,
      admit: admitAiImage,
      async prepare() {
        const current = screenRef.current;
        const surface = current.surface.current;
        if (!surface || current.disabled)
          throw new Error('Lift your finger before preparing an AI picture.');
        const release = surface.lockInput();
        try {
          const drawing = current.currentDrawing();
          const base64 = await surface.capturePng(drawing);
          if (current.currentDrawing() !== drawing)
            throw new Error('The drawing changed before preparation finished.');
          const bytes = prepareAiPng(base64);
          const original = await savePicture(drawing);
          return { bytes, originalId: original.id };
        } finally {
          release();
        }
      },
    });
    setOwner(instance);
    setState(instance.getState());
    const unsubscribe = instance.subscribe(() => setState(instance.getState()));
    const lifecycle = AppState.addEventListener('change', (next) => {
      if (next !== 'active') instance.close();
    });
    return () => {
      unsubscribe();
      lifecycle.remove();
      instance.dispose();
    };
  }, []);
  useEffect(() => {
    if (!owner || !state?.gate.open) return;
    const timer = setInterval(owner.gateTick, GATE_TICK_MS);
    return () => clearInterval(timer);
  }, [owner, state?.gate.open]);
  return { owner, state };
}
