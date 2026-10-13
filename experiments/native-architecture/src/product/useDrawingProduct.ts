import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { createDrawingProduct, type DrawingProductOwner } from './createDrawingProduct';
import { productOwners } from './productOwnersLoader';
import type { createProductOwners, ProductOwners } from './productOwners';
import { createDrawingAudio } from '../audio/drawingAudio';
import { createContactSound } from '../audio/contactSound';
import { createClearSound } from '../audio/pageTurnSound';
import { loadClearPageTurn } from '../platform/clearSound';
import { useAiProgressOwner } from '../ai/useAiProgress';
import { loadDrawingLoop } from '../platform/drawingAudio';
import { subscribePencilDoubleTap } from '../platform/pencilDoubleTap';
import { impactThreshold } from '../platform/clearHaptics';
import { soundSettingsStorage } from '../platform/soundSettings';
import { initialSoundSettingsState } from '../settings/soundSettings';
import { PARENT_GATE_SHAKE_MS } from '../parentCenter/parentGate';
import type { NativeFeedbackOwner } from '../feedback/feedback';
import type { useDrawingScreen } from '../useDrawingScreen';

const PRODUCT_TICK_MS = 1000;
function createProductServices(publish: () => void, setAudioMessage: (message: string) => void) {
  const product = createDrawingProduct(soundSettingsStorage, publish);
  const audio = createDrawingAudio(
    loadDrawingLoop,
    () =>
      setAudioMessage('Drawing sound is unavailable. You can keep drawing. Try another stroke.'),
    () => setAudioMessage('')
  );
  const contacts = createContactSound(audio);
  const clear = createClearSound(loadClearPageTurn);
  return { product, audio, contacts, clear };
}

function createProductTicker(
  product: DrawingProductOwner,
  feedback: () => NativeFeedbackOwner | null,
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
    const report = feedback()?.getState();
    const gateActive = gate.open && (gate.locked || gate.shaking);
    const reportActive = report?.delivery.status === 'throttled';
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
      const owner = feedback();
      if (owner?.getState().delivery.status === 'throttled') owner.deliveryTick();
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

// Feedback and AI report to the product, so they attach to it once their module is loaded: at
// once on native, as a chunk on web (productOwnersLoader.web.ts).
function attachProductOwners(
  owners: ProductOwners,
  publish: () => void,
  reconcileTimer: () => void
) {
  const { feedback, ai } = owners;
  let feedbackOpen = feedback.getState().open;
  const offFeedback = feedback.subscribe(() => {
    const open = feedback.getState().open;
    if (open !== feedbackOpen) {
      feedbackOpen = open;
      publish();
    } else reconcileTimer();
  });
  const offAi = ai.subscribe(publish);
  void feedback.loadPolicy();
  return () => {
    offFeedback();
    offAi();
    feedback.dispose();
    ai.dispose();
  };
}

export function useDrawingProduct(screen: ReturnType<typeof useDrawingScreen>) {
  const screenRef = useRef(screen);
  screenRef.current = screen;
  const [, update] = useState(0);
  const [audioMessage, setAudioMessage] = useState('');
  const [services, setServices] = useState<ReturnType<typeof createProductServices> | null>(null);
  const [owners, setOwners] = useState<ProductOwners | null>(null);
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
    const services = createProductServices(publish, setAudioMessage);
    const { product, audio, contacts, clear } = services;
    let attached: ProductOwners | null = null;
    let detachOwners: (() => void) | null = null;
    const ticker = createProductTicker(product, () => attached?.feedback ?? null, foreground);
    reconcileTimer = ticker.reconcile;
    const attach = (create: typeof createProductOwners) => {
      if (!alive || attached) return;
      attached = create(screenRef, product.port);
      detachOwners = attachProductOwners(attached, publish, ticker.reconcile);
      setOwners(attached);
    };
    const loadOwners = () => {
      if (attached) return;
      productOwners
        .load()
        .then(attach)
        .catch((error: unknown) => console.error('Feedback and AI failed to load:', error));
    };
    const subscription = AppState.addEventListener('change', (next) => {
      foreground = next === 'active';
      ticker.setForeground(foreground);
      if (!foreground) {
        product.background();
        attached?.ai.close();
        attached?.feedback.close();
        contacts.interrupt();
      } else {
        // A chunk that failed to load (offline before the service worker installed) is retried
        // when the app comes back, as a failed sheet is retried from its Try again.
        loadOwners();
      }
      audio.setForeground(foreground);
      clear.setForeground(foreground);
      reconcileTimer?.();
    });
    audio.setForeground(foreground);
    clear.setForeground(foreground);
    // Shipping handleDoubleTap: every tap records a Pencil, which reveals the parent's opt-out.
    const offPencil = subscribePencilDoubleTap(() => {
      void product.settings.markApplePencilSeen();
      const enabled = product.getState().settings?.pencilEraserEnabled === true;
      if (enabled && screenRef.current.toggleEraser()) impactThreshold();
    });
    setServices(services);
    void product.settings.load();
    const loaded = productOwners.current();
    if (loaded) attach(loaded);
    else loadOwners();
    return () => {
      alive = false;
      ticker.dispose();
      offPencil();
      subscription.remove();
      detachOwners?.();
      product.dispose();
      contacts.dispose();
      clear.dispose();
      audio.dispose();
    };
  }, []);
  const settings = services?.product.getState().settings ?? initialSoundSettingsState();
  const aiState = owners?.ai.getState() ?? null;
  const aiProgress = useAiProgressOwner(aiState);
  const parentCenterOpen = services?.product.getState().parentCenterOpen ?? false;
  useEffect(() => {
    if (parentCenterOpen) {
      owners?.ai.close();
      owners?.feedback.close();
    }
  }, [owners, parentCenterOpen]);
  useEffect(() => {
    services?.audio.setLevel(settings.soundLevel);
    services?.audio.setEnabled(settings.soundEnabled);
    services?.clear.setLevel(settings.soundLevel);
    services?.clear.setEnabled(settings.soundEnabled);
    if (!settings.soundEnabled) services?.contacts.interrupt();
  }, [services, settings.soundEnabled, settings.soundLevel]);
  useEffect(() => {
    if (!settings.aiEnabled) owners?.ai.close();
  }, [owners, settings.aiEnabled]);
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
    feedback: { owner: owners?.feedback ?? null, state: owners?.feedback.getState() ?? null },
    ai: { owner: owners?.ai ?? null, state: aiState, progress: aiProgress },
    owner: services?.product ?? null,
    state: services?.product.getState() ?? null,
  };
}
