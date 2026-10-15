// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { GateKeyboard } from '../../experiments/native-architecture/src/platform/gateKeyboard.web.ts';

let container;
let root;
let press;
beforeEach(async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  press = vi.fn();
  await act(async () => {
    root.render(
      createElement(
        'div',
        null,
        createElement(GateKeyboard, { onPress: press }),
        createElement('button', { id: 'close-gate' }, 'Close'),
        createElement(
          'div',
          { 'data-testid': 'gate-keypad' },
          createElement('button', { 'data-key': 'submit' }, 'Check answer')
        )
      )
    );
  });
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});
function key(target, value) {
  const event = new KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true });
  target.dispatchEvent(event);
  return event;
}

it('types digits from Close and moves Enter to the check key', () => {
  const close = container.querySelector('#close-gate');
  const check = container.querySelector('[data-key="submit"]');
  close.focus();
  key(close, '3');
  expect(document.activeElement).toBe(check);
  key(check, '6');
  key(check, 'Backspace');
  const enter = key(check, 'Enter');
  expect(press.mock.calls).toEqual([[3], [6], ['delete'], ['submit']]);
  expect(enter.defaultPrevented).toBe(true);
});

it('leaves Enter on Close to its own activation and ignores other keys', () => {
  const close = container.querySelector('#close-gate');
  const enter = key(close, 'Enter');
  key(close, 'a');
  expect(enter.defaultPrevented).toBe(false);
  expect(press).not.toHaveBeenCalled();
});

it('removes the hardware listener when the challenge leaves', async () => {
  await act(async () => root.render(null));
  key(document.body, '3');
  expect(press).not.toHaveBeenCalled();
});

it('binds both native receivers to the same key event contract', () => {
  const read = (path) =>
    readFileSync(
      resolve(import.meta.dirname, '../../experiments/native-architecture', path),
      'utf8'
    );
  const android = read(
    'android/app/src/main/java/art/splotch/migration/probe/SplotchGateKeyboard.kt'
  );
  const ios = read('ios/HelloWorld/SplotchGateKeyboard.swift');
  const bridge = read('ios/HelloWorld/SplotchGateKeyboard.m');
  const adapter = read('src/platform/gateKeyboard.ts');
  expect(adapter).toContain("'SplotchGateKeyboard'");
  expect(android).toContain('override fun getName() = "SplotchGateKeyboard"');
  expect(ios).toContain('@objc(SplotchGateKeyboardManager)');
  expect(bridge).toContain('RCT_EXPORT_VIEW_PROPERTY(onGateKey, RCTDirectEventBlock)');
  expect(android).toContain('"registrationName" to "onGateKey"');
  expect(adapter).toContain('onGateKey: ({ nativeEvent })');
  expect(android).toContain('KeyEvent.KEYCODE_DEL -> "delete"');
  expect(android).toContain('KeyEvent.KEYCODE_ENTER, KeyEvent.KEYCODE_NUMPAD_ENTER -> "submit"');
  expect(ios).toContain('? "delete" : input == "\\r" ? "submit" : input');
});

it('binds drawing and modal shortcut receivers to the same native view and event contract', () => {
  const read = (path) =>
    readFileSync(
      resolve(import.meta.dirname, '../../experiments/native-architecture', path),
      'utf8'
    );
  const android = read(
    'android/app/src/main/java/art/splotch/migration/probe/SplotchGateKeyboard.kt'
  );
  const ios = read('ios/HelloWorld/SplotchGateKeyboard.swift');
  const bridge = read('ios/HelloWorld/SplotchGateKeyboard.m');
  const adapter = read('src/platform/KeyboardScope.tsx');
  expect(adapter).toContain("requireNativeComponent<ReceiverProps>('SplotchShortcutKeyboard')");
  expect(android).toContain('override fun getName() = "SplotchShortcutKeyboard"');
  expect(ios).toContain('@objc(SplotchShortcutKeyboardManager)');
  expect(bridge).toContain('RCT_EXPORT_VIEW_PROPERTY(onShortcutKey, RCTDirectEventBlock)');
  expect(android).toContain('SHORTCUT_KEY_EVENT to mapOf("registrationName" to "onShortcutKey")');
  for (const name of ['shortcutScope', 'shortcutsEnabled']) {
    expect(adapter).toContain(`${name}=`);
    expect(android).toContain(`@ReactProp(name = "${name}"`);
    expect(bridge).toContain(`RCT_EXPORT_VIEW_PROPERTY(${name},`);
  }
  for (const key of ['undo', 'escape']) {
    expect(adapter).toContain(`key !== '${key}'`);
    expect(android).toContain(`return "${key}"`);
    expect(ios).toContain(`"${key}"`);
  }
});
