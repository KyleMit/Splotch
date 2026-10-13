import { type RefObject, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { createDrawingProduct, type DrawingProductOwner } from './createDrawingProduct';
import { productOwners } from './productOwnersLoader';
import type { createProductOwners, ProductOwners } from './productOwners';
import { createDrawingAudio } from '../audio/drawingAudio';
import { createContactSound } from '../audio/contactSound';
import { createClearSound } from '../audio/pageTurnSound';
import { applySoundChoices } from '../audio/soundGates';
import { createVolumePreview } from '../audio/volumePreview';
import { loadClearPageTurn } from '../platform/clearSound';
import { useAiProgressOwner } from '../ai/useAiProgress';
import { loadDrawingLoop } from '../platform/drawingAudio';
import { subscribePencilDoubleTap } from '../platform/pencilDoubleTap';
import { impactThreshold } from '../platform/clearHaptics';
import { soundSettingsStorage } from '../platform/soundSettings';
import { initialSoundSettingsState, type SoundSettingsState } from '../settings/soundSettings';
import { PARENT_GATE_SHAKE_MS } from '../parentCenter/parentGate';
import { openAppSettings } from '../platform/appSettings';
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
  const preview = createVolumePreview(loadDrawingLoop);
  return { product, audio, contacts, clear, preview };
}

type ProductServices = ReturnType<typeof createProductServices>;

// The Settings sound choices applied to the sound owners as they change: the Sound switch and its
// sources gate playback, and the Volume preview answers to the Sound switch alone.
function useSoundChoices(
  services: ProductServices | null,
  { soundEnabled, soundVolume, drawingSoundEnabled, deleteSoundEnabled }: SoundSettingsState
) {
  useEffect(() => {
    services?.preview.setAllowed(soundEnabled);
  }, [services, soundEnabled]);
  useEffect(() => {
    if (services)
      applySoundChoices(services, {
        soundEnabled,
        soundVolume,
        drawingSoundEnabled,
        deleteSoundEnabled,
      });
  }, [services, soundEnabled, soundVolume, drawingSoundEnabled, deleteSoundEnabled]);
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

// The drawing screen's choices that follow saved settings: the coloring book's availability, and
// the Pen fallback when the tool drawer is hidden.
function useScreenFollowsSettings(
  screenRef: RefObject<ReturnType<typeof useDrawingScreen>>,
  brushesReady: boolean,
  settings: SoundSettingsState
) {
  useEffect(() => {
    if (settings.status !== 'loading')
      screenRef.current.setColoringBookEnabled(settings.coloringBookEnabled);
  }, [screenRef, settings.status, settings.coloringBookEnabled]);
  const drawerHidden = settings.status !== 'loading' && !settings.toolDrawerEnabled;
  useEffect(() => {
    if (drawerHidden && brushesReady) screenRef.current.fallBackFromOptionalBrushes();
  }, [screenRef, drawerHidden, brushesReady]);
}

export function useDrawingProduct(screen: ReturnType<typeof useDrawingScreen>) {
  const screenRef = useRef(screen);
  screenRef.current = screen;
  const [, update] = useState(0);
  const [audioMessage, setAudioMessage] = useState('');
  const [services, setServices] = useState<ProductServices | null>(null);
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
    const { product, audio, contacts, clear, preview } = services;
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
      preview.setForeground(foreground);
      reconcileTimer?.();
    });
    audio.setForeground(foreground);
    clear.setForeground(foreground);
    preview.setForeground(foreground);
    // Shipping handleDoubleTap: every tap records a Pencil, which reveals the parent's opt-out.
    const offPencil = subscribePencilDoubleTap(() => {
      void product.settings.markApplePencilSeen();
      const settings = product.getState().settings;
      // Shipping asks actionControlShown('eraserEnabled'): the Eraser hides with the drawer.
      const enabled = settings?.pencilEraserEnabled === true && settings.toolDrawerEnabled;
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
      preview.dispose();
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
  useSoundChoices(services, settings);
  useEffect(() => {
    if (!settings.aiEnabled) owners?.ai.close();
  }, [owners, settings.aiEnabled]);
  useScreenFollowsSettings(screenRef, screen.brushPreferences.status === 'ready', settings);
  return {
    sound: {
      settings,
      audioMessage,
      owner: services
        ? {
            audio: services.audio,
            contacts: services.contacts,
            clear: services.clear,
            preview: services.preview,
            settings: services.product.settings,
          }
        : null,
    },
    feedback: { owner: owners?.feedback ?? null, state: owners?.feedback.getState() ?? null },
    ai: { owner: owners?.ai ?? null, state: aiState, progress: aiProgress },
    owner: services?.product ?? null,
    state: services?.product.getState() ?? null,
    // Settings is outside the app, so it sits behind the same gate as every other way out.
    openAppSettings() {
      services?.product.port.request('externalLinks', (proof) => {
        if (proof.valid()) openAppSettings();
      });
    },
  };
}
