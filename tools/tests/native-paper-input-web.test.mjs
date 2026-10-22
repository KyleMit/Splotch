// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act, createElement, forwardRef } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { PaperInputView } from '../../src/drawing/PaperInputView.web.tsx';
import { readPaperInput } from '../../src/drawing/paperInput.ts';

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
    root.render(
      createElement(PaperInputView, { onInput: input, onClaim: claim, engineReady: () => true })
    )
  );
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
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

it('retains the latest move when the browser coalesced batch ends before it', () => {
  const paper = host.firstChild;
  paper.dispatchEvent(pointer('pointerdown', 50, 50, 100));
  const move = pointer('pointermove', 200, 100, 130);
  Object.defineProperty(move, 'getCoalescedEvents', {
    value: () => [pointer('pointermove', 100, 100, 110), pointer('pointermove', 150, 50, 120)],
  });
  paper.dispatchEvent(move);
  expect(readPaperInput(input.mock.calls.at(-1)[0])?.contacts[0].samples).toEqual([
    { pageX: 100, pageY: 100, timestamp: 110 },
    { pageX: 150, pageY: 50, timestamp: 120 },
    { pageX: 200, pageY: 100, timestamp: 130 },
  ]);
  paper.dispatchEvent(pointer('pointermove', 240, 150, 140));
  expect(readPaperInput(input.mock.calls.at(-1)[0])?.contacts[0].samples).toEqual([
    { pageX: 240, pageY: 150, timestamp: 140 },
  ]);
});

it('cancels a held contact on unmount and removes all late event listeners', async () => {
  const paper = host.firstChild;
  paper.dispatchEvent(pointer('pointerdown', 50, 50, 100));
  await act(async () => root.render(null));
  paper.dispatchEvent(pointer('pointermove', 80, 80, 120));
  window.dispatchEvent(new Event('blur'));
  expect(input.mock.calls.map(([packet]) => packet.phase)).toEqual(['start', 'cancel']);
});

it('cancels every held pointer on window blur and accepts a fresh contact afterward', () => {
  const paper = host.firstChild;
  paper.dispatchEvent(pointer('pointerdown', 50, 50, 100));
  paper.dispatchEvent(pointer('pointerdown', 90, 90, 110, { pointerType: 'touch', pointerId: 9 }));
  window.dispatchEvent(new Event('blur'));
  const canceled = readPaperInput(input.mock.calls.at(-1)[0]);
  expect(canceled).toMatchObject({ phase: 'cancel', changed: ['7', '9'] });
  expect(canceled.contacts.map((contact) => contact.identifier)).toEqual(['7', '9']);
  paper.dispatchEvent(pointer('pointermove', 100, 100, 120));
  paper.dispatchEvent(pointer('pointerup', 110, 110, 130, { pointerId: 9 }));
  expect(input).toHaveBeenCalledTimes(3);
  paper.dispatchEvent(pointer('pointerdown', 150, 150, 140));
  expect(readPaperInput(input.mock.calls.at(-1)[0])).toMatchObject({
    phase: 'start',
    changed: ['7'],
    contacts: [{ identifier: '7', startedAt: 140 }],
  });
  expect(claim).toHaveBeenCalledTimes(3);
});

it('keeps the other pointer active when one contact is canceled', () => {
  const paper = host.firstChild;
  paper.dispatchEvent(pointer('pointerdown', 50, 50, 100));
  paper.dispatchEvent(pointer('pointerdown', 90, 90, 110, { pointerType: 'touch', pointerId: 9 }));
  paper.dispatchEvent(pointer('pointercancel', 50, 50, 120));
  paper.dispatchEvent(pointer('pointermove', 60, 60, 130));
  paper.dispatchEvent(
    pointer('pointermove', 100, 100, 140, { pointerType: 'touch', pointerId: 9 })
  );
  expect(input.mock.calls.map(([packet]) => packet.phase)).toEqual([
    'start',
    'start',
    'cancel',
    'move',
  ]);
  expect(readPaperInput(input.mock.calls.at(-1)[0])).toMatchObject({
    phase: 'move',
    changed: ['9'],
    contacts: [{ identifier: '9', samples: [{ pageX: 100, pageY: 100, timestamp: 140 }] }],
  });
});

async function renderHovering(erasing) {
  const log = [];
  const frames = [];
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => frames.push(callback));
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => {
    frames[id - 1] = null;
  });
  input.mockImplementation((packet) => log.push(packet.phase));
  const onHover = vi.fn((sample) => log.push(sample));
  await act(async () =>
    root.render(
      createElement(PaperInputView, {
        onInput: input,
        onClaim: claim,
        engineReady: () => true,
        onHover,
        erasing,
      })
    )
  );
  const runFrames = () => frames.splice(0).forEach((callback) => callback?.());
  return { paper: host.firstChild, onHover, log, runFrames };
}
const mouse = { pointerType: 'mouse' };

it('follows a hovering mouse at most once a frame while erasing, and leaves at once', async () => {
  const { paper, onHover, runFrames } = await renderHovering(true);
  expect(paper.style.cursor).toBe('none');
  paper.dispatchEvent(pointer('pointerenter', 60, 70, 10, mouse));
  expect(onHover).toHaveBeenLastCalledWith({ pageX: 60, pageY: 70, timestamp: 10 });
  paper.dispatchEvent(pointer('pointermove', 80, 90, 20, mouse));
  paper.dispatchEvent(pointer('pointermove', 100, 110, 30, mouse));
  expect(onHover).toHaveBeenCalledTimes(1);
  runFrames();
  expect(onHover).toHaveBeenCalledTimes(2);
  expect(onHover).toHaveBeenLastCalledWith({ pageX: 100, pageY: 110, timestamp: 30 });
  paper.dispatchEvent(pointer('pointermove', 120, 130, 40, mouse));
  paper.dispatchEvent(pointer('pointerleave', 120, 130, 41, mouse));
  runFrames();
  expect(onHover).toHaveBeenCalledTimes(3);
  expect(onHover).toHaveBeenLastCalledWith(null);
  expect(input).not.toHaveBeenCalled();
});

it('places the bubble where a mouse presses, lifts or loses its stroke, ahead of its packet', async () => {
  const { paper, log } = await renderHovering(true);
  paper.dispatchEvent(pointer('pointerdown', 50, 50, 100, mouse));
  paper.dispatchEvent(pointer('pointerup', 70, 80, 140, mouse));
  paper.dispatchEvent(pointer('pointerdown', 90, 90, 200, mouse));
  paper.dispatchEvent(pointer('lostpointercapture', 95, 99, 210, mouse));
  expect(log).toEqual([
    { pageX: 50, pageY: 50, timestamp: 100 },
    'start',
    { pageX: 70, pageY: 80, timestamp: 140 },
    'end',
    { pageX: 90, pageY: 90, timestamp: 200 },
    'start',
    { pageX: 95, pageY: 99, timestamp: 210 },
    'cancel',
  ]);
});

it('keeps the bubble’s place current while a mouse holds its stroke', async () => {
  const { paper, onHover, log, runFrames } = await renderHovering(true);
  paper.dispatchEvent(pointer('pointerdown', 50, 50, 100, mouse));
  paper.dispatchEvent(pointer('pointermove', 150, 160, 120, mouse));
  runFrames();
  expect(onHover).toHaveBeenLastCalledWith({ pageX: 150, pageY: 160, timestamp: 120 });
  expect(log.filter((entry) => typeof entry === 'string')).toEqual(['start', 'move']);
});

it('drops a hovering move still queued when the mouse presses', async () => {
  const { paper, onHover, runFrames } = await renderHovering(true);
  paper.dispatchEvent(pointer('pointermove', 80, 90, 20, mouse));
  paper.dispatchEvent(pointer('pointerdown', 85, 95, 30, mouse));
  runFrames();
  expect(onHover.mock.calls).toEqual([[{ pageX: 85, pageY: 95, timestamp: 30 }]]);
});

it('keeps the mouse bubble when a finger leaves the paper', async () => {
  const { paper, onHover } = await renderHovering(true);
  paper.dispatchEvent(pointer('pointerenter', 60, 70, 10, mouse));
  paper.dispatchEvent(
    pointer('pointerleave', 300, 200, 20, { pointerType: 'touch', pointerId: 9 })
  );
  expect(onHover.mock.calls).toEqual([[{ pageX: 60, pageY: 70, timestamp: 10 }]]);
});

it.each([
  ['a finger while erasing', true, 'touch', 'none'],
  ['a mouse with a drawing brush', false, 'mouse', 'crosshair'],
])('shows no hover bubble for %s', async (_case, erasing, pointerType, cursor) => {
  const { paper, onHover, runFrames } = await renderHovering(erasing);
  expect(paper.style.cursor).toBe(cursor);
  paper.dispatchEvent(pointer('pointerenter', 60, 70, 10, { pointerType }));
  paper.dispatchEvent(pointer('pointermove', 80, 90, 20, { pointerType }));
  runFrames();
  expect(onHover).not.toHaveBeenCalled();
});

it('binds both native paper views to the same direct event and public metadata APIs', () => {
  const read = (path) => readFileSync(resolve(import.meta.dirname, '../..', path), 'utf8');
  const adapter = read('src/drawing/PaperInputView.tsx');
  const surface = read('src/drawing/DrawingSurface.tsx');
  const webAdapter = read('src/drawing/PaperInputView.web.tsx');
  const android = read('android/app/src/main/java/art/splotch/app/SplotchPaperInput.kt');
  const ios = read('ios/Splotch/SplotchPaperInput.swift');
  const bridge = read('ios/Splotch/SplotchPaperInput.m');
  const project = read('ios/Splotch.xcodeproj/project.pbxproj');
  expect(adapter).toContain("requireNativeComponent<NativeProps>('SplotchPaperInput')");
  expect(adapter).toContain("Omit<ViewProps, 'pointerEvents'>");
  expect(surface).not.toContain('pointerEvents="box-only"');
  expect(webAdapter).toContain('pointerEvents="box-only"');
  const hitTest = ios.slice(
    ios.indexOf('override func hitTest'),
    ios.indexOf('private func sample')
  );
  expect(hitTest).toContain('self.point(inside: point, with: event)');
  expect(hitTest).toContain('isUserInteractionEnabled, !isHidden');
  expect(hitTest).toContain('return self');
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
