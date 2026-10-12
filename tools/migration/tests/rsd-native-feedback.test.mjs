import { caller, records, root, host, mount } from './rsd-native-selection-host.mjs';
import { act, createElement } from 'react';
import { expect, it } from 'vitest';
import { RsdDrawingScreen } from '../../../experiments/native-architecture/src/rsdDrawing/RsdDrawingScreen.tsx';
import { emptyDrawing } from '../../../experiments/native-architecture/src/drawing/model.ts';
async function click(label) {
  const node = host.querySelector(`[aria-label="${label}"]`);
  expect(node, label).not.toBeNull();
  expect(node.disabled, label).toBe(false);
  await act(async () => node.click());
}
async function input(label, value) {
  const props = records.props.findLast((item) => item.accessibilityLabel === label);
  expect(props, label).toBeDefined();
  await act(async () => props.onChange({ nativeEvent: { text: value } }));
}
it('uses the actual RSD native input bridge, preview, gate and transport caller from Drawing tools', async () => {
  let finish;
  caller.feedbackRead.mockReset().mockResolvedValue(null);
  caller.feedbackWrite.mockReset().mockResolvedValue(undefined);
  caller.feedbackSend.mockReset().mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  caller.screen = {
    notice: '',
    drawing: false,
    disabled: false,
    brush: 'marker',
    history: { undo: [], drawing: emptyDrawing() },
    recovery: { failed: false },
    pictures: null,
    pagePickerOpen: false,
    settingsOpen: false,
    colorPickerOpen: false,
  };
  caller.sound = {
    settings: {
      status: 'ready',
      soundEnabled: false,
      appearance: 'dark',
      selectedColor: 'Purple',
      customColors: [],
      strokeWidth: 'medium',
      eraserWidth: 'medium',
    },
    owner: null,
    audioMessage: '',
  };
  caller.menu = {
    open: true,
    visible: true,
    close() {},
    dismissed() {},
    run(action) {
      caller.menu.open = false;
      action();
    },
  };
  await mount(createElement(RsdDrawingScreen));
  await click('Send Feedback');
  const paperRenders = caller.paperRender.mock.calls.length;
  await input('Feedback message', 'RSD native bridge bug');
  await click('Include device details');
  await click('Review feedback');
  expect(host.textContent).toContain('Platform: iOS');
  expect(caller.feedbackSend).not.toHaveBeenCalled();
  await click('Send privately');
  const match = host.textContent.match(/(\d) × (\d)/);
  expect(match).not.toBeNull();
  await input('Answer', String(Number(match[1]) * Number(match[2])));
  await click('Continue');
  expect(caller.paperRender).toHaveBeenCalledTimes(paperRenders);
  expect(caller.feedbackSend).toHaveBeenCalledOnce();
  expect(caller.feedbackSend.mock.calls[0][0]).toEqual({
    kind: 'bug',
    message: 'RSD native bridge bug',
    hp: '',
    device: { platform: 'iOS' },
  });
  await click('Close feedback');
  expect(host.textContent).not.toContain('private support issue');
  await act(async () => {
    finish(new Response('{"ok":true}'));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  expect(root).toBeDefined();
});
