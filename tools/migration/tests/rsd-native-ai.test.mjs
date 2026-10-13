import { rgbaPng } from '../../tests/native-png-fixtures.mjs';
import { caller, records, host, mount, expandControls } from './rsd-native-selection-host.mjs';
import { act, createElement } from 'react';
import { expect, it, vi } from 'vitest';
import { solveParentGate as solve } from './rsd-parent-gate-keypad.mjs';
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
// Each solved check holds its "Unlocked!" card in real time before its destination shows, and a
// full send-and-report run solves up to four.
const GATED_FLOW_TIMEOUT_MS = 15_000;
async function reviewReport() {
  await click('Open AI picture');
  const beforeReport = caller.aiSend.mock.calls.length;
  await click('Report AI picture');
  expect(host.querySelectorAll('[data-native-modal]')).toHaveLength(1);
  expect(host.textContent).toContain('Grown-Ups Only');
  expect(caller.aiSend).toHaveBeenCalledTimes(beforeReport);
  await solve();
  expect(host.querySelectorAll('[data-native-modal]')).toHaveLength(1);
  expect(host.textContent).toContain('Report this AI picture');
  expect(host.textContent).toContain('private report');
  expect(caller.aiSend).toHaveBeenCalledTimes(beforeReport);
  await click('Cancel report');
  expect(host.textContent).not.toContain('Report this AI picture');
}
async function reviewRefusalReport(drawing) {
  expect(caller.aiRetain).not.toHaveBeenCalled();
  expect(host.textContent).not.toContain('private refusal reason');
  const beforeReport = caller.aiSend.mock.calls.length;
  await click('Grown-ups: report this refusal');
  expect(host.textContent).toContain('Grown-Ups Only');
  expect(caller.aiSend).toHaveBeenCalledTimes(beforeReport);
  await solve();
  expect(host.textContent).toContain('Report this refusal');
  expect(host.textContent).toContain('Original style: Sticker');
  expect(host.textContent).toContain('schedule deletion after 30 days by a daily cleanup');
  expect(caller.aiSend).toHaveBeenCalledTimes(beforeReport);
  await click('Send report');
  const request = caller.aiSend.mock.calls.at(-1)[0];
  expect(request.path).toBe('/api/report-image');
  expect(request.headers['X-Report-Token']).toBe('fixture-refusal-proof');
  const form = await new Response(request.body, { headers: request.headers }).formData();
  expect(form.get('kind')).toBe('false-positive-refusal');
  expect(form.get('style')).toBe('Sticker');
  expect(form.has('output')).toBe(false);
  expect(host.textContent).toContain('Report received.');
  expect(caller.screen.history.drawing).toBe(drawing);
}
it.each(['picture', 'decode-rejection', 'refusal'])(
  'drives actual RSD AI production callers through %s',
  async (outcome) => {
    const rejectDecode = outcome === 'decode-rejection';
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
          : request.path === '/api/report-image'
            ? new Response('{"ok":true,"reportId":"17-00000000-0000-0000-0000-000000000001"}')
            : outcome === 'refusal'
              ? new Response('{"ok":false,"error":"private refusal reason"}', {
                  status: 422,
                  headers: { 'X-Report-Token': 'fixture-refusal-proof' },
                })
              : pictureReply()
    );
    useCaller(drawing);
    await mount(createElement(RsdDrawingScreen));
    await expandControls();
    expect(host.querySelector('[aria-label="Parent Center"]')).not.toBeNull();
    expect(host.querySelector('[aria-label="AI picture"]')).toBeNull();
    await sendDrawing();
    expect(caller.aiSend.mock.calls.at(-1)[0].query).toBe('style=Sticker');
    expect(caller.aiReadPreparedUpload).toHaveBeenCalledOnce();
    if (outcome === 'refusal') {
      await reviewRefusalReport(drawing);
      return;
    }
    expect(caller.aiAdmit).toHaveBeenCalledTimes(2);
    expect(caller.aiAdmit.mock.calls.map(([bytes]) => bytes.length)).toEqual([
      rgbaPng(1024, 768, 255).length,
      rgbaPng(2, 2, 255).length,
    ]);
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
    if (!rejectDecode) await reviewReport();
    await click('Use my OpenAI key');
    await input('OpenAI API key', 'fixture-key');
    await click('Verify and save credential');
    expect(caller.aiVaultWrite).not.toHaveBeenCalled();
    await solve();
    expect(caller.aiVaultWrite).toHaveBeenCalledWith('byok', 'fixture-key');
    expect(caller.aiSend.mock.calls.at(-1)[0].path).toBe('/api/free-generation-grant');
  },
  GATED_FLOW_TIMEOUT_MS
);
function pictureReply() {
  return new Response(rgbaPng(2, 2, 255), {
    headers: { 'Content-Type': 'image/png', 'X-Report-Token': 'fixture-report-proof' },
  });
}
function useCaller(drawing) {
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
}
async function sendDrawing() {
  await click('Parent Center');
  expect(caller.aiSend).not.toHaveBeenCalled();
  await solve();
  await click('Create AI Images');
  await click('Close');
  await click('AI picture');
  expect(caller.aiSend).not.toHaveBeenCalled();
  await click('Check AI allowance');
  expect(host.querySelectorAll('[data-native-modal]')).toHaveLength(1);
  expect(records.dismissals).toContain('AI picture');
  expect(caller.aiSend).not.toHaveBeenCalled();
  await solve();
  expect(host.querySelector('[aria-label="Sticker AI style"]')).not.toBeNull();
  expect(host.querySelector('[aria-label="Save held recovery request"]')).toBeNull();
  expect(host.textContent).toContain('splotch.art and OpenAI');
  await click('Sticker AI style');
  const requestsBeforeSend = caller.aiSend.mock.calls.length;
  await click('Send drawing for AI');
  expect(caller.aiSend).toHaveBeenCalledTimes(requestsBeforeSend);
  expect(host.querySelector('[aria-label="Send drawing for AI"]')).toBeNull();
  expect(host.querySelectorAll('[data-native-modal]')).toHaveLength(1);
  await solve();
}

// The dial's done-ramp closes a sixth of the remaining gap each frame, so it
// needs about forty frames; this is several times that at happy-dom's frame rate.
const REVEAL_RAMP_WAIT_MS = 2000;
// One poll interval (POLL_INTERVAL_MS) and a margin for the poll to settle.
const POLL_WAIT_MS = 3500;
const POLL_TEST_TIMEOUT_MS = 15_000;
const WAITING_LABEL = 'Your picture is being made — tap to watch';
const READY_LABEL = 'Your picture is ready — tap to see it';

function pendingGeneration(generate) {
  vi.clearAllMocks();
  caller.aiAdmit.mockResolvedValue(undefined);
  caller.aiSend.mockImplementation(async (request) =>
    request.path === '/api/free-generation-grant'
      ? new Response('{"ok":true,"remaining":10,"limit":10}')
      : request.path === '/api/generate-image'
        ? generate()
        : pictureReply()
  );
}
function deferred() {
  let resolve;
  const promise = new Promise((done) => (resolve = done));
  return { promise, resolve };
}
async function elapse(ms) {
  await act(async () => new Promise((done) => setTimeout(done, ms)));
}
const testId = (id) => host.querySelector(`[data-testid="${id}"]`);
const labelled = (label) => host.querySelector(`[aria-label="${label}"]`);

it.each([
  ['moving', false],
  ['calm', true],
])(
  'shows the %s waiting print with the sent drawing until the picture lands',
  async (_, calm) => {
    records.reduceMotion = calm;
    const reply = deferred();
    pendingGeneration(() => reply.promise);
    useCaller(emptyDrawing());
    await mount(createElement(RsdDrawingScreen));
    await expandControls();
    await sendDrawing();
    expect(testId('ai-run-polaroid')).not.toBeNull();
    const sent = records.props.findLast((props) => props.testID === 'ai-submitted-drawing');
    expect(sent.source.uri).toBe(
      `data:image/png;base64,${rgbaPng(1024, 768, 255).toString('base64')}`
    );
    expect(labelled('AI picture progress')).not.toBeNull();
    expect(testId('ai-confetti') !== null).toBe(!calm);
    await act(async () => reply.resolve(pictureReply()));
    expect(host.textContent).toContain('original drawing are saved');
    expect(
      records.props.some(
        (props) => props.alt === 'Your AI picture' && props.src === 'file:///owned/rsd-ai.png'
      )
    ).toBe(true);
    expect(labelled('AI picture progress')).not.toBeNull();
    expect(testId('ai-confetti') !== null).toBe(!calm);
    await elapse(REVEAL_RAMP_WAIT_MS);
    expect(labelled('AI picture progress')).toBeNull();
    expect(testId('ai-confetti')).toBeNull();
    expect(testId('ai-run-polaroid')).not.toBeNull();
  },
  GATED_FLOW_TIMEOUT_MS
);

it(
  'keeps polling a minimized picture and brings the child back when it is ready',
  async () => {
    pendingGeneration(
      async () =>
        new Response(JSON.stringify({ ok: true, jobId: 'b'.repeat(64), pollAfterMs: 0 }), {
          status: 202,
        })
    );
    useCaller(emptyDrawing());
    await mount(createElement(RsdDrawingScreen));
    await expandControls();
    await sendDrawing();
    expect(testId('ai-run-polaroid')).not.toBeNull();
    await click('Close');
    expect(host.querySelector('[data-native-modal]')).toBeNull();
    expect(labelled(WAITING_LABEL)).not.toBeNull();
    expect(labelled(WAITING_LABEL).closest('[data-testid="rsd-paper-corner"]')).not.toBeNull();
    expect(labelled('Parent Center').disabled).toBe(false);
    await click('AI picture');
    expect(host.querySelectorAll('[data-native-modal]')).toHaveLength(1);
    expect(labelled(WAITING_LABEL)).toBeNull();
    await click('Close');
    expect(labelled(WAITING_LABEL)).not.toBeNull();
    await elapse(POLL_WAIT_MS);
    expect(caller.aiSend.mock.calls.at(-1)[0].path).toBe('/api/generation-result');
    expect(labelled(WAITING_LABEL)).toBeNull();
    expect(host.querySelector('[data-native-modal]')).toBeNull();
    await click(READY_LABEL);
    expect(host.querySelectorAll('[data-native-modal]')).toHaveLength(1);
    expect(labelled(READY_LABEL)).toBeNull();
    expect(testId('ai-run-polaroid')).not.toBeNull();
    expect(labelled('AI picture progress')).toBeNull();
    expect(testId('ai-confetti')).toBeNull();
    expect(labelled('Open AI picture')).not.toBeNull();
  },
  POLL_TEST_TIMEOUT_MS
);
