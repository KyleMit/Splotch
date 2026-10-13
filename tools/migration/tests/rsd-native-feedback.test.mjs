import { caller, records, host, mount, openSettingsSection } from './rsd-native-selection-host.mjs';
import { act, createElement } from 'react';
import { expect, it, vi } from 'vitest';
import { solveParentGate } from './rsd-parent-gate-keypad.mjs';
import { RsdDrawingScreen } from '../../../experiments/native-architecture/src/rsdDrawing/RsdDrawingScreen.tsx';
import { emptyDrawing } from '../../../experiments/native-architecture/src/drawing/model.ts';
import {
  MESSAGE_PROMPT_BY_KIND,
  REPORT_FORM_COPY,
} from '../../../experiments/native-architecture/src/feedback/reportFormCopy.ts';

const CHECKBOX = `${REPORT_FORM_COPY.includeDevice} ${REPORT_FORM_COPY.includeDeviceWhy}`;
const BUG_FIELD = MESSAGE_PROMPT_BY_KIND.bug.label;

function node(label) {
  const found = host.querySelector(`[aria-label="${label}"]`);
  expect(found, label).not.toBeNull();
  return found;
}

function labelled(text) {
  const found = [...host.querySelectorAll('button, [role="button"]')].find(
    (candidate) => candidate.textContent.replace('›', '') === text
  );
  expect(found, text).toBeDefined();
  return found;
}

async function press(found, name) {
  expect(found.disabled, name).toBe(false);
  await act(async () => found.click());
}

const click = (label) => press(node(label), label);

async function input(label, value) {
  const props = records.props.findLast((item) => item.accessibilityLabel === label);
  expect(props, label).toBeDefined();
  await act(async () => props.onChange({ nativeEvent: { text: value } }));
}

function settingsScreen() {
  let stored = JSON.stringify({
    version: 12,
    soundEnabled: false,
    strokeWidth: 'medium',
    eraserWidth: 'medium',
    selectedColor: 'Purple',
    customColors: [],
    appearance: 'light',
    aiEnabled: false,
    parentPolicies: {
      ai: 'always',
      imageReport: 'always',
      externalLinks: 'always',
      feedback: 'always',
      parentCenter: 'always',
    },
    coloringBookEnabled: true,
    soundLevel: 'medium',
    undoButtonEnabled: true,
    strokeWidthControlEnabled: true,
    orientation: 'portrait',
    saveOnDeleteEnabled: false,
    buttonScale: 100,
    reduceMotion: 'system',
    whatsNewSeen: null,
    pencilEraserEnabled: true,
    applePencilSeen: false,
  });
  caller.settingsStorage = {
    read: async () => stored,
    write: vi.fn(async (next) => {
      stored = next;
    }),
  };
  caller.feedbackRead.mockReset().mockResolvedValue(null);
  caller.feedbackWrite.mockReset().mockResolvedValue(undefined);
  caller.screen = {
    notice: '',
    drawing: false,
    disabled: false,
    brush: 'pen',
    brushControl: { kind: 'menu', brushes: ['pen', 'crayon'] },
    availableBrushes: ['pen', 'crayon'],
    history: { undo: [], drawing: emptyDrawing() },
    recovery: { failed: false },
    pictures: null,
    pagePickerOpen: false,
    settingsOpen: true,
    colorPickerOpen: false,
    closeSettings: vi.fn(),
    closeColorPicker: vi.fn(),
    openColorPicker: vi.fn(),
    selectInkBrush: vi.fn(),
  };
  caller.sound = { settings: { status: 'loading' }, owner: null, audioMessage: '' };
}

it('drills into Feedback inside Settings, with the shipping form and none of the old sheet', async () => {
  settingsScreen();
  await mount(createElement(RsdDrawingScreen));
  await openSettingsSection('Feedback');
  expect(caller.screen.closeSettings).not.toHaveBeenCalled();
  expect(host.querySelector('[data-native-modal="Feedback"]')).not.toBeNull();
  expect(host.querySelector('[data-native-modal="Send Feedback"]')).toBeNull();
  expect(host.textContent).toContain(REPORT_FORM_COPY.intro);
  expect(host.textContent).toContain(REPORT_FORM_COPY.privacy);
  expect(
    host.querySelector(`[role="radiogroup"][aria-label="${REPORT_FORM_COPY.kindLabel}"]`)
  ).not.toBeNull();
  for (const removed of ['characters', 'Review feedback', 'Close feedback', 'Feedback protection'])
    expect(host.textContent).not.toContain(removed);
  expect(labelled(REPORT_FORM_COPY.send).disabled).toBe(true);
  await click('I have an idea');
  expect(host.querySelector(`[aria-label="${CHECKBOX}"]`)).toBeNull();
  expect(host.textContent).toContain(MESSAGE_PROMPT_BY_KIND.feature.label);
});

it('previews the device rows in the disclosure and sends the report only after the grown-up check', async () => {
  let finish;
  settingsScreen();
  caller.feedbackSend.mockReset().mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  await mount(createElement(RsdDrawingScreen));
  await openSettingsSection('Feedback');
  await input(BUG_FIELD, 'RSD native bridge bug');
  expect(node(CHECKBOX).dataset.checked).toBe('false');
  await click(CHECKBOX);
  expect(node(CHECKBOX).dataset.checked).toBe('true');
  expect(host.textContent).not.toContain('Platform: iOS');
  await press(labelled(REPORT_FORM_COPY.deviceSummary), REPORT_FORM_COPY.deviceSummary);
  expect(host.textContent).toContain('Platform: iOS');
  expect(host.textContent).toContain(REPORT_FORM_COPY.deviceNote);
  await press(labelled(REPORT_FORM_COPY.send), REPORT_FORM_COPY.send);
  expect(caller.feedbackSend).not.toHaveBeenCalled();
  await solveParentGate();
  expect(caller.feedbackSend).toHaveBeenCalledOnce();
  expect(caller.feedbackSend.mock.calls[0][0]).toEqual({
    kind: 'bug',
    message: 'RSD native bridge bug',
    hp: '',
    device: { platform: 'iOS' },
  });
  // The check stacks over Settings, so the form the parent sent from is still there for the result.
  expect(caller.screen.closeSettings).not.toHaveBeenCalled();
  expect(host.querySelector('[data-native-modal="Feedback"]')).not.toBeNull();
  expect(labelled(REPORT_FORM_COPY.sending).disabled).toBe(true);
  await act(async () => {
    finish(new Response('{"ok":true}'));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  const statuses = [...host.querySelectorAll('[role="status"]')].map((node) => node.textContent);
  expect(statuses.filter(Boolean)).toEqual([REPORT_FORM_COPY.sent]);
  expect(host.querySelector('[data-native-modal="Feedback"]')).not.toBeNull();
});
