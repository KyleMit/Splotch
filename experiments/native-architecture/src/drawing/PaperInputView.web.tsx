import { forwardRef, useLayoutEffect, useRef } from 'react';
import { View, type ViewProps, type ViewInstance } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { InputContact, InputSample, InputTool } from './paperInput';
import { takeEarlyPointers } from '../platform/earlyPointers';
import { DRAWING_LIVE_ATTRIBUTE, DRAWING_POINTER_BUTTON } from '../platform/firstFrameContract';

type Props = ViewProps & {
  onInput: (value: unknown) => void;
  onClaim: () => void;
  engineReady: () => boolean;
  onHover: (sample: InputSample | null) => void;
  erasing: boolean;
};
function inputTool(tool: string): InputTool {
  return tool === 'touch' || tool === 'pen' || tool === 'mouse' ? tool : 'unknown';
}
function inputSample(event: PointerEvent): InputSample {
  return { pageX: event.pageX, pageY: event.pageY, timestamp: event.timeStamp };
}

// Every coalesced point of a move, ending on the event's own point.
function moveSamples(event: PointerEvent) {
  const coalesced = event.getCoalescedEvents?.() ?? [];
  const samples = coalesced.length ? coalesced.map(inputSample) : [inputSample(event)];
  const last = samples[samples.length - 1];
  if (
    last.timestamp !== event.timeStamp ||
    last.pageX !== event.pageX ||
    last.pageY !== event.pageY
  )
    samples.push(inputSample(event));
  return samples;
}

type PaperPointerEvent =
  | 'pointerenter'
  | 'pointerleave'
  | 'pointerdown'
  | 'pointermove'
  | 'pointerup'
  | 'pointercancel'
  | 'lostpointercapture';
type PaperListeners = readonly (readonly [PaperPointerEvent, (event: PointerEvent) => void])[];

function listen(node: HTMLElement, listeners: PaperListeners) {
  for (const [type, listener] of listeners) node.addEventListener(type, listener);
  return () => {
    for (const [type, listener] of listeners) node.removeEventListener(type, listener);
  };
}

type Begin = (pointerId: number, pointerType: string, sample: InputSample) => void;

// A finger the prerendered shell saw land on the paper before the engine was ready starts its stroke
// here, where it is now, as if it had just come down; nothing before this point is kept.
function adoptEarlyPointers(node: HTMLElement, begin: Begin) {
  const window = node.ownerDocument.defaultView;
  if (!window) return;
  for (const pointer of takeEarlyPointers(window)) {
    const under = node.ownerDocument.elementFromPoint(pointer.clientX, pointer.clientY);
    if (!under || !node.contains(under)) continue;
    begin(pointer.pointerId, pointer.pointerType, {
      pageX: pointer.pageX,
      pageY: pointer.pageY,
      timestamp: window.performance.now(),
    });
  }
}

// The engine is ready a frame or two after the paper attaches: once the paper is measured and its ink
// can take a stroke. Checked each frame until then; nothing waits on it afterwards. Until it is, a
// finger that lands is left to the prerendered shell, which answers and records it for adoption.
// The <html> stamp tells the shell the engine has taken over.
function whenEngineReady(
  window: Window,
  current: { readonly current: { engineReady: () => boolean } },
  onReady: () => void
) {
  const root = window.document.documentElement;
  let frame = 0;
  const check = () => {
    if (!current.current.engineReady()) frame = window.requestAnimationFrame(check);
    else
      try {
        onReady();
      } finally {
        root.setAttribute(DRAWING_LIVE_ATTRIBUTE, '');
      }
  };
  check();
  return () => {
    window.cancelAnimationFrame(frame);
    root.removeAttribute(DRAWING_LIVE_ATTRIBUTE);
  };
}

type HoverOwner = {
  readonly current: { onHover: (sample: InputSample | null) => void; erasing: boolean };
};

// The eraser bubble follows a hovering mouse or pen at most once a painted frame, as shipping's
// PointerHalos.svelte does; entering, leaving and lifting take effect at once, superseding a
// queued move. Touch never hovers.
function createPointerHover(window: Window, owner: HoverOwner, live: () => boolean) {
  let frame = 0;
  let queued: InputSample | null = null;
  const hovers = (event: PointerEvent) =>
    live() && owner.current.erasing && event.pointerType !== 'touch';
  const show = (sample: InputSample | null) => {
    window.cancelAnimationFrame(frame);
    frame = 0;
    owner.current.onHover(sample);
  };
  const flush = () => {
    frame = 0;
    owner.current.onHover(queued);
  };
  return {
    place(event: PointerEvent) {
      if (hovers(event)) show(inputSample(event));
    },
    move(event: PointerEvent) {
      if (!hovers(event)) return;
      queued = inputSample(event);
      if (!frame) frame = window.requestAnimationFrame(flush);
    },
    leave(event: PointerEvent) {
      if (event.pointerType !== 'touch') show(null);
    },
    stop: () => window.cancelAnimationFrame(frame),
  };
}

// LiveSurface.svelte's canvas: a crosshair over the paper, hidden under the eraser's bubble.
function usePaperCursor(host: { readonly current: ViewInstance | null }, erasing: boolean) {
  useLayoutEffect(() => {
    if (host.current instanceof HTMLElement)
      host.current.style.cursor = erasing ? 'none' : 'crosshair';
  }, [host, erasing]);
}

export const PaperInputView = forwardRef<ViewInstance, Props>(function PaperInputView(
  { onInput, onClaim, engineReady, onHover, erasing, ...props },
  ref
) {
  const host = useRef<ViewInstance | null>(null);
  const bottomInset = useSafeAreaInsets().bottom;
  const current = useRef({ onInput, onClaim, engineReady, onHover, erasing, bottomInset });
  current.current = { onInput, onClaim, engineReady, onHover, erasing, bottomInset };
  usePaperCursor(host, erasing);
  useLayoutEffect(() => {
    const candidate: unknown = host.current;
    if (!(candidate instanceof HTMLElement))
      throw new Error('The drawing input view is unavailable.');
    const node = candidate;
    const candidateWindow = node.ownerDocument.defaultView;
    if (!candidateWindow) throw new Error('The drawing window is unavailable.');
    const window = candidateWindow;
    const contacts = new Map<string, InputContact>();
    let sequence = 0;
    function send(phase: 'start' | 'move' | 'end' | 'cancel', changed: string[]) {
      current.current.onInput({
        sequence: sequence++,
        phase,
        changed,
        contacts: [...contacts.values()],
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight,
          bottomInset: current.current.bottomInset,
        },
      });
      for (const [identifier, contact] of contacts)
        contacts.set(identifier, {
          ...contact,
          samples: [contact.samples[contact.samples.length - 1]],
        });
    }
    function begin(pointerId: number, pointerType: string, sample: InputSample) {
      current.current.onClaim();
      const identifier = String(pointerId);
      contacts.set(identifier, {
        identifier,
        startedAt: sample.timestamp,
        tool: inputTool(pointerType),
        samples: [sample],
      });
      try {
        node.setPointerCapture(pointerId);
      } catch {}
      send('start', [identifier]);
    }
    let live = false;
    const hover = createPointerHover(window, current, () => live);
    function start(event: PointerEvent) {
      if (event.button !== DRAWING_POINTER_BUTTON || !live) return;
      event.preventDefault();
      hover.place(event);
      begin(event.pointerId, event.pointerType, inputSample(event));
    }
    function move(event: PointerEvent) {
      const identifier = String(event.pointerId);
      const contact = contacts.get(identifier);
      // The bubble's place follows a held mouse too, so it is current when the stroke is cut short.
      hover.move(event);
      if (!contact) return;
      event.preventDefault();
      contacts.set(identifier, { ...contact, samples: moveSamples(event) });
      send('move', [identifier]);
    }
    function end(event: PointerEvent) {
      const identifier = String(event.pointerId);
      const contact = contacts.get(identifier);
      if (!contact) return;
      event.preventDefault();
      hover.place(event);
      contacts.set(identifier, { ...contact, samples: [inputSample(event)] });
      send('end', [identifier]);
      contacts.delete(identifier);
    }
    function cancel(event: PointerEvent) {
      const identifier = String(event.pointerId);
      if (!contacts.has(identifier)) return;
      hover.place(event);
      send('cancel', [identifier]);
      contacts.delete(identifier);
    }
    function cancelAll() {
      if (contacts.size) send('cancel', [...contacts.keys()]);
      contacts.clear();
    }
    const unlisten = listen(node, [
      ['pointerenter', hover.place],
      ['pointerleave', hover.leave],
      ['pointerdown', start],
      ['pointermove', move],
      ['pointerup', end],
      ['pointercancel', cancel],
      ['lostpointercapture', cancel],
    ]);
    window.addEventListener('blur', cancelAll);
    const stopWaiting = whenEngineReady(window, current, () => {
      live = true;
      adoptEarlyPointers(node, begin);
    });
    return () => {
      stopWaiting();
      cancelAll();
      hover.stop();
      unlisten();
      window.removeEventListener('blur', cancelAll);
    };
  }, []);
  return (
    <View
      {...props}
      pointerEvents="box-only"
      ref={(node) => {
        host.current = node;
        if (typeof ref === 'function') ref(node);
        else if (ref) ref.current = node;
      }}
    />
  );
});
