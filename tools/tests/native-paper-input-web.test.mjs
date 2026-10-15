// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act, createElement, forwardRef } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { PaperInputView } from '../../experiments/native-architecture/src/drawing/PaperInputView.web.tsx';
import { readPaperInput } from '../../experiments/native-architecture/src/drawing/paperInput.ts';

vi.mock('react-native', () => ({
  View: forwardRef(({ children, testID, pointerEvents: _pointerEvents, ...props }, ref) =>
    createElement('div', { ...props, ref, 'data-testid': testID }, children)
  ),
}));
vi.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ bottom: 34 }) }));
let root, host, input, claim;
beforeEach(async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  input = vi.fn();
  claim = vi.fn();
  await act(async () =>
    root.render(createElement(PaperInputView, { onInput: input, onClaim: claim }))
  );
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});
function pointer(type, x, y, timestamp, extra = {}) {
  const event = new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    pointerId: 7,
    pointerType: 'pen',
    button: 0,
    clientX: x,
    clientY: y,
    ...extra,
  });
  Object.defineProperties(event, {
    timeStamp: { value: timestamp },
    pageX: { value: x },
    pageY: { value: y },
  });
  return event;
}

it('delivers public pointer tool and every coalesced point through the validated wire contract', () => {
  const paper = host.firstChild;
  paper.dispatchEvent(pointer('pointerdown', 50, 50, 100));
  const move = pointer('pointermove', 200, 100, 130);
  Object.defineProperty(move, 'getCoalescedEvents', {
    value: () => [
      pointer('pointermove', 100, 100, 110),
      pointer('pointermove', 150, 50, 120),
      pointer('pointermove', 200, 100, 130),
    ],
  });
  paper.dispatchEvent(move);
  paper.dispatchEvent(pointer('pointerup', 250, 50, 140));
  expect(claim).toHaveBeenCalledTimes(1);
  expect(input.mock.calls.map(([packet]) => packet.phase)).toEqual(['start', 'move', 'end']);
  expect(readPaperInput(input.mock.calls[1][0])?.contacts[0]).toEqual({
    identifier: '7',
    startedAt: 100,
    tool: 'pen',
    samples: [
      { pageX: 100, pageY: 100, timestamp: 110 },
      { pageX: 150, pageY: 50, timestamp: 120 },
      { pageX: 200, pageY: 100, timestamp: 130 },
    ],
  });
});

it('cancels on capture loss and ignores the departed contact until a fresh pointerdown', () => {
  const paper = host.firstChild;
  paper.dispatchEvent(pointer('pointerdown', 50, 50, 100));
  paper.dispatchEvent(pointer('lostpointercapture', 50, 50, 110));
  paper.dispatchEvent(pointer('pointermove', 80, 80, 120));
  expect(input.mock.calls.map(([packet]) => packet.phase)).toEqual(['start', 'cancel']);
});

it('cancels a held contact on unmount and removes all late event listeners', async () => {
  const paper = host.firstChild;
  paper.dispatchEvent(pointer('pointerdown', 50, 50, 100));
  await act(async () => root.render(null));
  paper.dispatchEvent(pointer('pointermove', 80, 80, 120));
  window.dispatchEvent(new Event('blur'));
  expect(input.mock.calls.map(([packet]) => packet.phase)).toEqual(['start', 'cancel']);
});

it('binds both native paper views to the same direct event and public metadata APIs', () => {
  const read = (path) =>
    readFileSync(
      resolve(import.meta.dirname, '../../experiments/native-architecture', path),
      'utf8'
    );
  const adapter = read('src/drawing/PaperInputView.tsx');
  const android = read(
    'android/app/src/main/java/art/splotch/migration/probe/SplotchPaperInput.kt'
  );
  const ios = read('ios/HelloWorld/SplotchPaperInput.swift');
  const bridge = read('ios/HelloWorld/SplotchPaperInput.m');
  const project = read('ios/HelloWorld.xcodeproj/project.pbxproj');
  expect(adapter).toContain("requireNativeComponent<NativeProps>('SplotchPaperInput')");
  expect(android).toContain('"registrationName" to "onPaperInput"');
  expect(android).toContain('class SplotchPaperInputManager : ReactViewManager()');
  expect(android).toContain('super.getExportedCustomDirectEventTypeConstants()');
  expect(android).toContain('event.getToolType(index)');
  expect(android).toContain('event.getHistoricalX(index, history)');
  expect(android).toContain('override fun canCoalesce() = false');
  expect(ios).toContain('coalescedTouches(for: contact.touch)');
  expect(ios).toContain('switch touch.type');
  expect(bridge).toContain('RCT_EXPORT_VIEW_PROPERTY(onPaperInput, RCTDirectEventBlock)');
  expect(project).toContain('SplotchPaperInput.swift in Sources');
});
