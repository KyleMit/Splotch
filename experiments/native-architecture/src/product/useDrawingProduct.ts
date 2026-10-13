import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { createDrawingProduct, type DrawingProductOwner } from './createDrawingProduct';
import { createDrawingAudio } from '../audio/drawingAudio';
import { createContactSound } from '../audio/contactSound';
import { createClearSound } from '../audio/pageTurnSound';
import { loadClearPageTurn } from '../platform/clearSound';
import { createNativeFeedback } from '../feedback/feedback';
import { createNativeAi } from '../ai/generation';
import { useAiProgressOwner } from '../ai/useAiProgress';
import { loadDrawingLoop } from '../platform/drawingAudio';
import { soundSettingsStorage } from '../platform/soundSettings';
import {
  feedbackDevice,
  feedbackOffline,
  feedbackPolicyStorage,
  feedbackTransport,
} from '../platform/feedback';
import { aiStorage, aiTransport, aiVault, admitAiImage } from '../platform/ai';
import { savePicture } from '../platform/drawingFiles';
import { prepareAiPng } from '../ai/prepare';
import { parseDrawing } from '../drawing/model';
import { initialSoundSettingsState } from '../settings/soundSettings';
import { PARENT_GATE_SHAKE_MS } from '../parentCenter/parentGate';
import type { useDrawingScreen } from '../useDrawingScreen';

const PRODUCT_TICK_MS = 1000;
function createProductServices(
  screenRef: { current: ReturnType<typeof useDrawingScreen> },
  publish: () => void,
  setAudioMessage: (message: string) => void
) {
  const product = createDrawingProduct(soundSettingsStorage, publish);
  const audio = createDrawingAudio(
    loadDrawingLoop,
    () =>
      setAudioMessage('Drawing sound is unavailable. You can keep drawing. Try another stroke.'),
    () => setAudioMessage('')
  );
  const contacts = createContactSound(audio);
  const clear = createClearSound(loadClearPageTurn);
  const feedback = createNativeFeedback({
    transport: feedbackTransport,
    device: feedbackDevice,
    offline: feedbackOffline,
    policyStorage: feedbackPolicyStorage,
    parent: product.port,
  });
  const ai = createNativeAi({
    vault: aiVault,
    storage: aiStorage,
    transport: aiTransport,
    admit: admitAiImage,
    parent: product.port,
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
          throw new Error('The drawing changed during capture.');
        const bytes = prepareAiPng(base64);
        const original = await savePicture(drawing);
        return {
          bytes,
          originalId: original.id,
          originalModel: JSON.stringify(parseDrawing(drawing)),
        };
      } finally {
        release();
      }
    },
  });
  return { product, audio, contacts, clear, feedback, ai };
}

function createProductTicker(
  product: DrawingProductOwner,
  feedback: ReturnType<typeof createNativeFeedback>,
  foreground: boolean
) {
  let disposed = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let timerDelay: number | null = null;
  function stopTimer() {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    timerDelay = null;
  }
  function reconcile() {
    const gate = product.gate.getState();
    const report = feedback.getState();
    const gateActive = gate.open && (gate.locked || gate.shaking);
    const reportActive = report.delivery.status === 'throttled';
    const delay =
      !disposed && foreground && (gateActive || reportActive)
        ? gateActive && gate.shaking
          ? PARENT_GATE_SHAKE_MS
          : PRODUCT_TICK_MS
        : null;
    if (timer !== null && timerDelay === delay) return;
    stopTimer();
    if (delay === null) return;
    timerDelay = delay;
    timer = setTimeout(() => {
      timer = null;
      timerDelay = null;
      if (disposed || !foreground) return;
      const gate = product.gate.getState();
      if (gate.open && (gate.locked || gate.shaking)) product.gate.tick();
      const report = feedback.getState();
      if (report.delivery.status === 'throttled') feedback.deliveryTick();
      reconcile();
    }, delay);
  }
  return {
    reconcile,
    setForeground(value: boolean) {
      foreground = value;
      reconcile();
    },
    dispose() {
      disposed = true;
      stopTimer();
    },
  };
}

export function useDrawingProduct(screen: ReturnType<typeof useDrawingScreen>) {
  const screenRef = useRef(screen);
  screenRef.current = screen;
  const [, update] = useState(0);
  const [audioMessage, setAudioMessage] = useState('');
  const [services, setServices] = useState<{
    product: DrawingProductOwner;
    audio: ReturnType<typeof createDrawingAudio>;
    contacts: ReturnType<typeof createContactSound>;
    clear: ReturnType<typeof createClearSound>;
    feedback: ReturnType<typeof createNativeFeedback>;
    ai: ReturnType<typeof createNativeAi>;
  } | null>(null);
  useEffect(() => {
    let alive = true;
    let foreground = AppState.currentState === 'active';
    let reconcileTimer: (() => void) | null = null;
    const publish = () => {
      if (alive) {
        update((value) => value + 1);
        reconcileTimer?.();
      }
    };
    const services = createProductServices(screenRef, publish, setAudioMessage);
    const { product, audio, contacts, clear, feedback, ai } = services;
    const ticker = createProductTicker(product, feedback, foreground);
    reconcileTimer = ticker.reconcile;
    let feedbackOpen = feedback.getState().open;
    const offFeedback = feedback.subscribe(() => {
      const open = feedback.getState().open;
      if (open !== feedbackOpen) {
        feedbackOpen = open;
        publish();
      } else reconcileTimer?.();
    });
    const offAi = ai.subscribe(publish);
    const subscription = AppState.addEventListener('change', (next) => {
      foreground = next === 'active';
      ticker.setForeground(foreground);
      if (!foreground) {
        product.background();
        ai.close();
        feedback.close();
        contacts.interrupt();
      }
      audio.setForeground(foreground);
      clear.setForeground(foreground);
      reconcileTimer?.();
    });
    audio.setForeground(foreground);
    clear.setForeground(foreground);
    setServices(services);
    void product.settings.load();
    void feedback.loadPolicy();
    return () => {
      alive = false;
      ticker.dispose();
      subscription.remove();
      offFeedback();
      offAi();
      product.dispose();
      feedback.dispose();
      ai.dispose();
      contacts.dispose();
      clear.dispose();
      audio.dispose();
    };
  }, []);
  const settings = services?.product.getState().settings ?? initialSoundSettingsState();
  const aiState = services?.ai.getState() ?? null;
  const aiProgress = useAiProgressOwner(aiState);
  const parentCenterOpen = services?.product.getState().parentCenterOpen ?? false;
  useEffect(() => {
    if (parentCenterOpen) {
      services?.ai.close();
      services?.feedback.close();
    }
  }, [services, parentCenterOpen]);
  useEffect(() => {
    services?.audio.setLevel(settings.soundLevel);
    services?.audio.setEnabled(settings.soundEnabled);
    services?.clear.setLevel(settings.soundLevel);
    services?.clear.setEnabled(settings.soundEnabled);
    if (!settings.soundEnabled) services?.contacts.interrupt();
    if (!settings.aiEnabled) services?.ai.close();
  }, [services, settings.soundEnabled, settings.soundLevel, settings.aiEnabled]);
  useEffect(() => {
    if (settings.status !== 'loading')
      screenRef.current.setColoringBookEnabled(settings.coloringBookEnabled);
  }, [settings.status, settings.coloringBookEnabled]);
  return {
    sound: {
      settings,
      audioMessage,
      owner: services
        ? {
            audio: services.audio,
            contacts: services.contacts,
            clear: services.clear,
            settings: services.product.settings,
          }
        : null,
    },
    feedback: { owner: services?.feedback ?? null, state: services?.feedback.getState() ?? null },
    ai: { owner: services?.ai ?? null, state: aiState, progress: aiProgress },
    owner: services?.product ?? null,
    state: services?.product.getState() ?? null,
  };
}
