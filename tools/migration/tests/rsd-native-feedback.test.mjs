import {
  caller,
  records,
  root,
  host,
  mount,
  openSettingsSection,
} from './rsd-native-selection-host.mjs';
import { act, createElement } from 'react';
import { html } from 'react-strict-dom';
import { expect, it, vi } from 'vitest';
import { REPORT_KINDS } from '../../../web/src/lib/report.ts';
import { scale } from '../../../web/src/lib/design/tokens.ts';
import { SETTINGS_WIDE_MIN_WIDTH_PX } from '../../../web/src/lib/breakpoints.ts';
import { GATE_MODAL, solveParentGate } from './rsd-parent-gate-keypad.mjs';
import { RsdDrawingScreen } from '../../../experiments/native-architecture/src/rsdDrawing/RsdDrawingScreen.tsx';
import { emptyDrawing } from '../../../experiments/native-architecture/src/drawing/model.ts';
import { RsdFeedbackSection } from '../../../experiments/native-architecture/src/rsdDrawing/RsdFeedbackSection.tsx';
import { createNativeFeedback } from '../../../experiments/native-architecture/src/feedback/feedback.ts';
import { FEEDBACK_PAGE_COPY } from '../../../experiments/native-architecture/src/information/feedbackPageCopy.ts';
import { fontTheme as nativeFontTheme } from '../../../experiments/native-architecture/src/rsdDrawing/fontTheme.native.ts';
import { nativeFontStyle } from '../../../experiments/native-architecture/src/platform/nativeFontFamilies.ts';
import {
  MESSAGE_PROMPT_BY_KIND,
  REPORT_FORM_COPY,
} from '../../../experiments/native-architecture/src/feedback/reportFormCopy.ts';

const TIGHT_FEEDBACK_WIDTH_PX = 400;
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

function settingsScreen(appearance = 'light') {
  let stored = JSON.stringify({
    version: 12,
    soundEnabled: false,
    strokeWidth: 'medium',
    eraserWidth: 'medium',
    selectedColor: 'Purple',
    customColors: [],
    appearance,
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
    notePaintChoice: vi.fn(),
  };
  caller.sound = { settings: { status: 'loading' }, owner: null, audioMessage: '' };
}

it('drills into Feedback inside Settings, with the shipping form and none of the old sheet', async () => {
  settingsScreen();
  await mount(createElement(RsdDrawingScreen));
  await openSettingsSection('Feedback');
  expect(caller.screen.closeSettings).not.toHaveBeenCalled();
  expect(host.querySelector('[data-native-modal="Settings"]')).not.toBeNull();
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

it.each(
  [360, 400, 401, 1024].flatMap((width) =>
    ['light', 'dark'].flatMap((appearance) =>
      ['settings', 'page'].map((presentation) => ({ width, appearance, presentation }))
    )
  )
)(
  'renders complete $appearance $presentation Feedback labels without a line clamp at $width px',
  async ({ width, appearance, presentation }) => {
    settingsScreen(appearance);
    records.os = 'android';
    records.scheme = appearance;
    records.dimensions = { width, height: 780, scale: 3, fontScale: 1 };
    caller.screen.settingsOpen = presentation === 'settings';
    await mount(
      createElement(RsdDrawingScreen, { page: presentation === 'page' ? 'feedback' : 'drawing' })
    );
    if (presentation === 'settings' && width < SETTINGS_WIDE_MIN_WIDTH_PX)
      await openSettingsSection('Feedback');
    const group = host.querySelector(
      `[role="radiogroup"][aria-label="${REPORT_FORM_COPY.kindLabel}"]`
    );
    expect(group).not.toBeNull();
    expect(
      [...group.querySelectorAll('[role="radio"]')].map((option) => option.textContent)
    ).toEqual(REPORT_KINDS.map(({ label }) => label));
    for (const { label } of REPORT_KINDS) {
      const text = records.props.findLast((props) => props.children === label);
      expect(text, label).toBeDefined();
      expect(text.style.fontSize, label).toBe(
        Number.parseFloat(width <= TIGHT_FEEDBACK_WIDTH_PX ? scale.fontSizeXs : scale.fontSizeSm)
      );
      expect(text.numberOfLines, label).toBeUndefined();
      expect(text.ellipsizeMode, label).toBeUndefined();
      expect(text.style.overflow, label).not.toBe('hidden');
    }
  }
);

it.each(REPORT_KINDS)(
  'keeps the empty standalone $value submit enabled while the real owner rejects its activation',
  async ({ value, label }) => {
    settingsScreen();
    caller.screen.settingsOpen = false;
    caller.feedbackSend.mockReset();
    await mount(createElement(RsdDrawingScreen, { page: 'feedback' }));
    await click(label);
    const owner = caller.product.feedback.owner;
    expect(owner.getState()).toMatchObject({
      policyReady: true,
      draft: { kind: value, message: '' },
    });
    const submitLabel = value === 'feature' ? REPORT_FORM_COPY.sendIdea : REPORT_FORM_COPY.send;
    await press(labelled(submitLabel), submitLabel);
    expect(caller.feedbackSend).not.toHaveBeenCalled();
    expect(owner.getState()).toMatchObject({ preview: null, delivery: { status: 'idle' } });
    expect(owner.getState().validation).toBe('Please type a short description.');
    expect(host.textContent).toContain(owner.getState().validation);
    expect(host.querySelector(GATE_MODAL)).toBeNull();
  }
);

it('keeps standalone submission independent of policy loading', async () => {
  const transport = vi.fn(async () => new Response('{"ok":true}'));
  const owner = createNativeFeedback({
    transport,
    device: () => ({ platform: 'iOS' }),
    policyStorage: { read: async () => null, write: async () => {} },
  });
  try {
    await mount(createElement(RsdFeedbackSection, { owner, presentation: 'page' }));
    expect(owner.getState().policyReady).toBe(false);
    await press(labelled(REPORT_FORM_COPY.send), REPORT_FORM_COPY.send);
    expect(owner.getState().validation).toBe('Please type a short description.');
    expect(transport).not.toHaveBeenCalled();
    await act(async () => owner.setMessage('A report before policy loading'));
    await press(labelled(REPORT_FORM_COPY.send), REPORT_FORM_COPY.send);
    expect(transport).toHaveBeenCalledOnce();
    expect(owner.getState().policyReady).toBe(false);
    expect(host.querySelector(GATE_MODAL)).toBeNull();
  } finally {
    owner.dispose();
  }
});

it('keeps Settings submission disabled until its real policy loads', async () => {
  const transport = vi.fn();
  const owner = createNativeFeedback({
    transport,
    device: () => ({ platform: 'iOS' }),
    policyStorage: { read: async () => null, write: async () => {} },
  });
  try {
    await mount(createElement(RsdFeedbackSection, { owner }));
    await act(async () => owner.setMessage('A Settings report waiting for policy'));
    expect(owner.getState().policyReady).toBe(false);
    expect(labelled(REPORT_FORM_COPY.send).disabled).toBe(true);
    await act(async () => owner.loadPolicy());
    expect(owner.getState().policyReady).toBe(true);
    expect(labelled(REPORT_FORM_COPY.send).disabled).toBe(false);
    expect(transport).not.toHaveBeenCalled();
  } finally {
    owner.dispose();
  }
});

it('keeps standalone submit disabled while its real owner is sending', async () => {
  let finish;
  settingsScreen();
  caller.screen.settingsOpen = false;
  caller.feedbackSend.mockReset().mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  try {
    await mount(createElement(RsdDrawingScreen, { page: 'feedback' }));
    await input(BUG_FIELD, 'RSD native bridge bug');
    await press(labelled(REPORT_FORM_COPY.send), REPORT_FORM_COPY.send);
    expect(caller.product.feedback.owner.getState().delivery.status).toBe('sending');
    expect(labelled(REPORT_FORM_COPY.sending).disabled).toBe(true);
    await act(async () => caller.product.feedback.owner.submitPublic());
    expect(caller.feedbackSend).toHaveBeenCalledOnce();
  } finally {
    await act(async () => {
      finish?.(new Response('{"ok":true}'));
    });
  }
});

it.each([
  {
    part: 'body',
    rule: /\.aside li \{([\s\S]*?)\n {2}\}/,
    token: 'medium',
    weight: scale.fontWeightMedium,
    targets: (rows) => rows.map((row) => row.lastElementChild),
  },
  {
    part: 'privacy link',
    rule: /\.aside a \{([\s\S]*?)\n {2}\}/,
    token: 'semibold',
    weight: scale.fontWeightSemibold,
    targets: (rows) => [rows.at(-1).querySelector('[role="link"]')],
  },
])(
  'renders the shipping callout $part with its native $token face',
  async ({ weight, targets }) => {
    settingsScreen();
    caller.screen.settingsOpen = false;
    records.journalHostProps = true;
    await mount(
      createElement(
        html.div,
        { style: nativeFontTheme },
        createElement(RsdDrawingScreen, { page: 'feedback' })
      )
    );
    const heading = [...host.querySelectorAll('[role="heading"]')].find(
      (node) => node.textContent === FEEDBACK_PAGE_COPY.next
    );
    expect(heading).toBeDefined();
    const rows = [...heading.parentElement.querySelectorAll('[role="listitem"]')];
    expect(rows).toHaveLength(FEEDBACK_PAGE_COPY.steps.length);
    for (const target of targets(rows)) {
      expect(target).not.toBeNull();
      expect(JSON.parse(target.getAttribute('data-committed-props')).style).toMatchObject(
        nativeFontStyle(weight)
      );
    }
  }
);

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
  expect(
    [...host.querySelectorAll('span')].some((span) => span.textContent === 'Platform: iOS')
  ).toBe(true);
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
  expect(host.querySelector('[data-native-modal="Settings"]')).not.toBeNull();
  expect(labelled(REPORT_FORM_COPY.sending).disabled).toBe(true);
  await act(async () => {
    finish(new Response('{"ok":true}'));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  const statuses = [...host.querySelectorAll('[role="status"]')].map((node) => node.textContent);
  expect(statuses.filter(Boolean)).toEqual([REPORT_FORM_COPY.sent]);
  expect(host.querySelector('[data-native-modal="Settings"]')).not.toBeNull();
});

// The shell's exit plays before the route lets Settings go, so a reopen is a fresh visit.
const EXIT_SETTLE_MS = 600;

async function rerender(settingsOpen) {
  caller.screen.settingsOpen = settingsOpen;
  await act(async () => root.render(createElement(RsdDrawingScreen)));
  await act(async () => new Promise((resolve) => setTimeout(resolve, EXIT_SETTLE_MS)));
}

it("keeps an earlier visit's report out of the next visit's form", async () => {
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
  await input(BUG_FIELD, 'First visit report');
  await press(labelled(REPORT_FORM_COPY.send), REPORT_FORM_COPY.send);
  await solveParentGate();
  expect(caller.feedbackSend).toHaveBeenCalledOnce();
  expect(labelled(REPORT_FORM_COPY.sending).disabled).toBe(true);
  await rerender(false);
  expect(host.querySelector('[data-native-modal="Settings"]')).toBeNull();
  await rerender(true);
  await openSettingsSection('Feedback');
  await input(BUG_FIELD, 'Second visit, not sent');
  expect(labelled(REPORT_FORM_COPY.send).disabled).toBe(false);
  await act(async () => {
    finish(new Response('{"ok":true}'));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  const statuses = [...host.querySelectorAll('[role="status"]')].map((node) => node.textContent);
  expect(statuses.filter(Boolean)).toEqual([]);
  expect(labelled(REPORT_FORM_COPY.send).disabled).toBe(false);
  expect(caller.product.feedback.owner.getState().draft.message).toBe('Second visit, not sent');
});

// A page document's build renders and its browser hydrates the form before the owner exists, so
// the page shows the form a fresh owner shows, and the field takes no typing it would then drop.
it('shows the standalone form before its owner loads, as a fresh owner shows it', async () => {
  await mount(createElement(RsdFeedbackSection, { owner: null, presentation: 'page' }));
  // The one difference: the unloaded field takes no typing.
  const unloaded = host.innerHTML.replace(' disabled=""', '');
  expect(host.innerHTML).toContain(' disabled=""');
  expect(labelled(REPORT_FORM_COPY.send).disabled).toBe(false);
  expect(host.textContent).toContain(REPORT_KINDS[0].label);
  expect(records.props.findLast((props) => props.accessibilityLabel === BUG_FIELD).editable).toBe(
    false
  );
  const owner = createNativeFeedback({
    transport: vi.fn(),
    device: () => ({ platform: 'Web' }),
    policyStorage: { read: async () => null, write: async () => {} },
  });
  try {
    await mount(createElement(RsdFeedbackSection, { owner, presentation: 'page' }));
    expect(host.innerHTML).toBe(unloaded);
    expect(
      records.props.findLast((props) => props.accessibilityLabel === BUG_FIELD).editable
    ).not.toBe(false);
  } finally {
    owner.dispose();
  }
  await mount(createElement(RsdFeedbackSection, { owner: null }));
  expect(host.innerHTML).toBe('');
});
