import { createElement, forwardRef } from 'react';
import { emptyDrawing } from '../../src/drawing/model.ts';
import { adoptPaper, LEGACY_PAPER } from '../../src/drawing/paperSpace.ts';

export { LEGACY_PAPER };

export function legacyDrawing(rainbow = 0, pageId = 'blank') {
  return { version: 5, pageId, rainbow, strokes: [] };
}

export function adoptedDrawing(frame, rainbow = 0, pageId = 'blank') {
  return {
    ...emptyDrawing(rainbow, pageId),
    paper: adoptPaper(frame.width, frame.height, frame.pixelRatio),
  };
}

export function canonicalPaper() {
  return adoptPaper(1024, 768, 1);
}

export function createPaperInputView(View, record) {
  return forwardRef(function PaperInputViewPort({ onPaperInput, ...props }, ref) {
    record(onPaperInput);
    return createElement(View, { ...props, ref });
  });
}

export function paperInputPacket(phase, event, sequence, viewport) {
  const active = event.nativeEvent.touches;
  const changed = event.nativeEvent.changedTouches.filter(
    (touch) => phase !== 'end' || !active.some((item) => item.identifier === touch.identifier)
  );
  if (!changed.length && phase !== 'cancel') return null;
  const contacts = new Map(
    [...active, ...changed].map((touch) => [String(touch.identifier), touch])
  );
  return {
    phase,
    sequence,
    viewport,
    changed: changed.map((touch) => String(touch.identifier)),
    contacts: [...contacts.values()].map((touch) => ({
      identifier: String(touch.identifier),
      startedAt: event.touchHistory?.touchBank[touch.identifier]?.startTimeStamp ?? touch.timestamp,
      tool: touch.tool ?? 'touch',
      samples: [{ pageX: touch.pageX, pageY: touch.pageY, timestamp: touch.timestamp }],
    })),
  };
}
