// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { GateKeyboard } from '../../src/platform/gateKeyboard.web.ts';

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
  const read = (path) => readFileSync(resolve(import.meta.dirname, '../..', path), 'utf8');
  const android = read('android/app/src/main/java/art/splotch/app/SplotchGateKeyboard.kt');
  const ios = read('ios/Splotch/SplotchGateKeyboard.swift');
  const bridge = read('ios/Splotch/SplotchGateKeyboard.m');
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
  const read = (path) => readFileSync(resolve(import.meta.dirname, '../..', path), 'utf8');
  const android = read('android/app/src/main/java/art/splotch/app/SplotchGateKeyboard.kt');
  const ios = read('ios/Splotch/SplotchGateKeyboard.swift');
  const bridge = read('ios/Splotch/SplotchGateKeyboard.m');
  const adapter = read('src/platform/KeyboardScope.tsx');
  expect(adapter).toContain("requireNativeComponent<ReceiverProps>('SplotchShortcutKeyboard')");
  expect(android).toContain('override fun getName() = "SplotchShortcutKeyboard"');
  const shortcut = android.slice(
    android.indexOf('class ShortcutKeyboardView'),
    android.indexOf('class SplotchShortcutKeyboardManager')
  );
  expect(shortcut).toContain('override fun dispatchKeyEvent(event: KeyEvent): Boolean');
  expect(shortcut).not.toContain('override fun onKeyDown');
  expect(shortcut).toContain(
    'event.action == KeyEvent.ACTION_UP && consumedKeys.remove(event.keyCode)'
  );
  expect(shortcut).toContain('event.action != KeyEvent.ACTION_DOWN');
  expect(shortcut).toContain('super.dispatchKeyEvent(event)');
  expect(shortcut).toContain('focused !is EditText');
  expect(shortcut).toContain('event.isCtrlPressed || event.isMetaPressed');
  expect(shortcut).not.toContain('repeatCount');
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

it("keeps shortcut capture visually transparent like shipping's window listener", () => {
  const android = readFileSync(
    resolve(
      import.meta.dirname,
      '../../android/app/src/main/java/art/splotch/app/SplotchGateKeyboard.kt'
    ),
    'utf8'
  );
  const shortcut = android.slice(
    android.indexOf('class ShortcutKeyboardView'),
    android.indexOf('class SplotchShortcutKeyboardManager')
  );
  const initialization = shortcut.match(/init \{([\s\S]*?)\n {2}\}/)?.[1];
  expect(initialization).toContain('isFocusable = true');
  expect(initialization).toContain('isFocusableInTouchMode = true');
  expect(initialization).toContain(
    'if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) defaultFocusHighlightEnabled = false'
  );
});

it('restores Android shortcut capture when a modal window returns', () => {
  const android = readFileSync(
    resolve(
      import.meta.dirname,
      '../../android/app/src/main/java/art/splotch/app/SplotchGateKeyboard.kt'
    ),
    'utf8'
  );
  const shortcut = android.slice(
    android.indexOf('class ShortcutKeyboardView'),
    android.indexOf('class SplotchShortcutKeyboardManager')
  );
  expect(shortcut).toContain('override fun onWindowFocusChanged(hasWindowFocus: Boolean)');
  expect(shortcut).toMatch(
    /super\.onWindowFocusChanged\(hasWindowFocus\)\s+if \(hasWindowFocus\) focusWhenAvailable\(\)/
  );
  expect(shortcut).toContain(
    'isAttachedToWindow && shortcutsEnabled && !hasFocus() && focused !is EditText && focused !is GateKeyboardView'
  );
});

// On an Android phone the Settings modal's shortcut scope took focus before the grown-up check's
// receiver could, so digits, Delete and Enter never reached the check (#3031). The check claims
// focus once attached, again once laid out and on window focus, and no shortcut scope takes focus
// from it. Negative control: the former scope condition, or a receiver that asks only on attach,
// fails here; the KEY-1 gate-keys step on the API 36 phone emulator is the behavioural check.
it('leaves the hardware keys with an open grown-up check on every layout', () => {
  const android = readFileSync(
    resolve(
      import.meta.dirname,
      '../../android/app/src/main/java/art/splotch/app/SplotchGateKeyboard.kt'
    ),
    'utf8'
  );
  const gate = android.slice(
    android.indexOf('class GateKeyboardView'),
    android.indexOf('class SplotchGateKeyboardManager')
  );
  expect(gate).toMatch(
    /private fun claimFocus\(\) \{\s+post \{ if \(isAttachedToWindow && !isFocused\) requestFocus\(\) \}/
  );
  expect(gate).toMatch(/super\.onAttachedToWindow\(\)\s+claimFocus\(\)/);
  expect(gate).toMatch(
    /super\.onLayout\(changed, left, top, right, bottom\)\s+if \(changed\) claimFocus\(\)/
  );
  expect(gate).toMatch(
    /super\.onWindowFocusChanged\(hasWindowFocus\)\s+if \(hasWindowFocus\) claimFocus\(\)/
  );
  const shortcut = android.slice(
    android.indexOf('class ShortcutKeyboardView'),
    android.indexOf('class SplotchShortcutKeyboardManager')
  );
  expect(shortcut).toContain('val focused = rootView.findFocus()');
  expect(shortcut).toContain('focused !is GateKeyboardView');
});
