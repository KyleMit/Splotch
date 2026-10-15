import { forwardRef, useLayoutEffect, useRef } from 'react';
import { View, type ViewProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { InputContact, InputSample, InputTool } from './paperInput';

type Props = ViewProps & { onInput: (value: unknown) => void; onClaim: () => void };
function inputTool(tool: string): InputTool {
  return tool === 'touch' || tool === 'pen' || tool === 'mouse' ? tool : 'unknown';
}
function inputSample(event: PointerEvent): InputSample {
  return { pageX: event.pageX, pageY: event.pageY, timestamp: event.timeStamp };
}

export const PaperInputView = forwardRef<View, Props>(function PaperInputView(
  { onInput, onClaim, ...props },
  ref
) {
  const host = useRef<View | null>(null);
  const bottomInset = useSafeAreaInsets().bottom;
  const current = useRef({ onInput, onClaim, bottomInset });
  current.current = { onInput, onClaim, bottomInset };
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
    function start(event: PointerEvent) {
      if (event.button !== 0) return;
      event.preventDefault();
      current.current.onClaim();
      const identifier = String(event.pointerId);
      contacts.set(identifier, {
        identifier,
        startedAt: event.timeStamp,
        tool: inputTool(event.pointerType),
        samples: [inputSample(event)],
      });
      try {
        node.setPointerCapture(event.pointerId);
      } catch {}
      send('start', [identifier]);
    }
    function move(event: PointerEvent) {
      const identifier = String(event.pointerId);
      const contact = contacts.get(identifier);
      if (!contact) return;
      event.preventDefault();
      const coalesced = event.getCoalescedEvents?.() ?? [];
      const samples = coalesced.length ? coalesced.map(inputSample) : [inputSample(event)];
      const last = samples[samples.length - 1];
      if (
        last.timestamp !== event.timeStamp ||
        last.pageX !== event.pageX ||
        last.pageY !== event.pageY
      )
        samples.push(inputSample(event));
      contacts.set(identifier, { ...contact, samples });
      send('move', [identifier]);
    }
    function end(event: PointerEvent) {
      const identifier = String(event.pointerId);
      const contact = contacts.get(identifier);
      if (!contact) return;
      event.preventDefault();
      contacts.set(identifier, { ...contact, samples: [inputSample(event)] });
      send('end', [identifier]);
      contacts.delete(identifier);
    }
    function cancel(event: PointerEvent) {
      const identifier = String(event.pointerId);
      if (!contacts.has(identifier)) return;
      send('cancel', [identifier]);
      contacts.delete(identifier);
    }
    function cancelAll() {
      if (contacts.size) send('cancel', [...contacts.keys()]);
      contacts.clear();
    }
    node.addEventListener('pointerdown', start);
    node.addEventListener('pointermove', move);
    node.addEventListener('pointerup', end);
    node.addEventListener('pointercancel', cancel);
    node.addEventListener('lostpointercapture', cancel);
    window.addEventListener('blur', cancelAll);
    return () => {
      cancelAll();
      node.removeEventListener('pointerdown', start);
      node.removeEventListener('pointermove', move);
      node.removeEventListener('pointerup', end);
      node.removeEventListener('pointercancel', cancel);
      node.removeEventListener('lostpointercapture', cancel);
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
