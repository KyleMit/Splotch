import { rgbaPng } from '../../tests/native-png-fixtures.mjs';
import { caller, records, host, mount } from './rsd-native-selection-host.mjs';
import { act, createElement } from 'react';
import { expect, it, vi } from 'vitest';
import { RsdDrawingScreen } from '../../../experiments/native-architecture/src/rsdDrawing/RsdDrawingScreen.tsx';
import { emptyDrawing } from '../../../experiments/native-architecture/src/drawing/model.ts';
async function click(label) {
  const node = host.querySelector(`[aria-label="${label}"]`);
  expect(node, label).not.toBeNull();
  expect(node.disabled).toBe(false);
  await act(async () => node.click());
}
async function input(label, value) {
  const props = records.props.findLast((item) => item.accessibilityLabel === label);
  expect(props, label).toBeDefined();
  await act(async () => props.onChange({ nativeEvent: { text: value } }));
}
async function solve() {
  const match = host.textContent.match(/(\d) × (\d)/);
  expect(match).not.toBeNull();
  await input('Grown-up answer', String(Number(match[1]) * Number(match[2])));
  await click('Check answer');
}
it.each([false, true])(
  'drives actual RSD AI production callers with native decode rejection %s',
  async (rejectDecode) => {
    vi.clearAllMocks();
    caller.aiAdmit.mockImplementation(async () => {
      if (rejectDecode) throw new Error('controlled native rejection');
    });
    const drawing = emptyDrawing();
    caller.aiSend.mockImplementation(async (request) =>
      request.path === '/api/free-generation-grant'
        ? new Response('{"ok":true,"remaining":10,"limit":10}')
        : request.path === '/api/verify-key'
          ? new Response('{"ok":true}')
          : new Response(rgbaPng(2, 2, 255), {
              headers: { 'Content-Type': 'image/png' },
            })
    );
    caller.screen = {
      notice: '',
      drawing: false,
      disabled: false,
      brush: 'marker',
      history: { undo: [], drawing },
      currentDrawing: () => drawing,
      surface: {
        current: {
          lockInput: () => () => {},
          capturePng: async () => rgbaPng(1024, 768, 255).toString('base64'),
        },
      },
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
    caller.menu = { open: false };
    await mount(createElement(RsdDrawingScreen));
    expect(host.querySelector('[aria-label="AI picture"]')).toBeNull();
    await click('Parent Center');
    expect(caller.aiSend).not.toHaveBeenCalled();
    await solve();
    await click('AI picture creation');
    await click('Keep drawing');
    await click('AI picture');
    expect(caller.aiSend).not.toHaveBeenCalled();
    await click('Check AI allowance');
    expect(host.querySelectorAll('[data-native-modal]')).toHaveLength(1);
    expect(records.dismissals).toContain('AI picture');
    expect(caller.aiSend).not.toHaveBeenCalled();
    await solve();
    expect(host.querySelector('[aria-label="Sticker AI style"]')).not.toBeNull();
    expect(host.textContent).toContain('splotch.art and OpenAI');
    await click('Sticker AI style');
    const requestsBeforeSend = caller.aiSend.mock.calls.length;
    await click('Send drawing for AI');
    expect(caller.aiSend).toHaveBeenCalledTimes(requestsBeforeSend);
    expect(host.querySelector('[aria-label="Send drawing for AI"]')).toBeNull();
    expect(host.querySelectorAll('[data-native-modal]')).toHaveLength(1);
    await solve();
    expect(caller.aiSend.mock.calls.at(-1)[0].query).toBe('style=Sticker');
    expect(caller.aiReadPreparedUpload).toHaveBeenCalledOnce();
    expect(caller.aiAdmit).toHaveBeenCalledOnce();
    expect(caller.aiRetain).toHaveBeenCalledTimes(rejectDecode ? 0 : 1);
    expect(host.textContent).toContain(
      rejectDecode ? 'could not be safely opened' : 'original drawing are saved'
    );
    expect(
      records.props.some(
        (props) => props.alt === 'Your AI picture' && props.src === 'file:///owned/rsd-ai.png'
      )
    ).toBe(!rejectDecode);
    expect(caller.screen.history.drawing).toBe(drawing);
    await click('Use my OpenAI key');
    await input('OpenAI API key', 'fixture-key');
    await click('Verify and save credential');
    expect(caller.aiVaultWrite).not.toHaveBeenCalled();
    await solve();
    expect(caller.aiVaultWrite).toHaveBeenCalledWith('byok', 'fixture-key');
    expect(caller.aiSend.mock.calls.at(-1)[0].path).toBe('/api/free-generation-grant');
  }
);
