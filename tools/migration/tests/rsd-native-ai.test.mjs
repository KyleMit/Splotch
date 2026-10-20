import { expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { rgbaPng } from '../../tests/native-png-fixtures.mjs';
import { currentExportScale } from '../../../web/src/lib/drawing/exportScale.ts';
import { caller, records, host, mount } from './rsd-native-selection-host.mjs';
import { GATE_MODAL, solveParentGate as solve } from './rsd-parent-gate-keypad.mjs';
import { AI_STYLES } from '../../../experiments/native-architecture/src/ai/contract.ts';
import { emptyDrawing } from '../../../experiments/native-architecture/src/drawing/model.ts';
import { RsdAiReportStatus } from '../../../experiments/native-architecture/src/rsdDrawing/RsdAiImageReport.tsx';

const launcher = vi.hoisted(() => ({ returnFocusToAiLauncher: vi.fn() }));
vi.mock('../../../experiments/native-architecture/src/platform/aiLauncherFocus.ts', () => launcher);
import {
  save,
  labelled,
  testId,
  modal,
  click,
  press,
  settle,
  GATED_FLOW_TIMEOUT_MS,
  REVEAL_RAMP_WAIT_MS,
  POLL_WAIT_MS,
  POLL_TEST_TIMEOUT_MS,
  WAITING_LABEL,
  GRANT,
  READY_LABEL,
  pictureReply,
  reply,
  useCaller,
  enableAi,
  drawingRequests,
  openPrompt,
  sendDrawing,
  finishedPicture,
} from './rsd-native-ai-fixture.mjs';

it.each(['error', 'unavailable'])(
  'offers review after report errors and protects unavailable evidence (%s)',
  async (phase) => {
    const target = { kind: 'false-positive-refusal', id: 17 };
    const owner = { reviewAiReport: vi.fn(), sendPictureReport: vi.fn() };
    await mount(
      createElement(RsdAiReportStatus, {
        owner,
        report: { phase, target, message: 'The report did not finish.', retryAt: 0 },
      })
    );
    expect(host.textContent).toContain('The report did not finish.');
    const review = [...host.querySelectorAll('button')].find(
      (button) => button.textContent === 'Try again'
    );
    expect(review !== undefined).toBe(phase === 'error');
    expect(labelled('Send report')).toBeNull();
    expect(owner.sendPictureReport).not.toHaveBeenCalled();
    if (review) await act(async () => review.click());
    expect(owner.reviewAiReport.mock.calls).toEqual(phase === 'error' ? [[target]] : []);
    expect(owner.sendPictureReport).not.toHaveBeenCalled();
  }
);

it(
  'gates the wand at the tap, then picks a style from the covers and sends it at once',
  async () => {
    const pending = Promise.withResolvers();
    reply(() => pending.promise);
    useCaller();
    await enableAi();
    await openPrompt();
    const prompt = modal('Pick a style');
    expect(prompt.textContent).toContain('Pick a style');
    for (const style of AI_STYLES)
      expect(prompt.querySelector(`[aria-label="${style}"]`)).not.toBeNull();
    // RN's own sheet copy and controls are gone from the prompt.
    for (const gone of ['splotch.art and OpenAI', 'Check AI allowance', 'Selected', 'Choose'])
      expect(prompt.textContent).not.toContain(gone);
    expect(labelled('Check AI allowance')).toBeNull();
    await click('Sticker');
    expect(host.querySelector(GATE_MODAL)).toBeNull();
    await settle(() => expect(drawingRequests()).toHaveLength(1));
    expect(drawingRequests()[0][0].query).toBe('style=Sticker');
    expect(modal('AI Result')).not.toBeNull();
    await act(async () => pending.resolve(pictureReply()));
  },
  GATED_FLOW_TIMEOUT_MS
);

it.each([
  ['moving', false],
  ['calm', true],
])(
  'shows the %s dial over the blurred drawing until the picture lands, then Download and the disclosure',
  async (_, calm) => {
    records.reduceMotion = calm;
    const pending = Promise.withResolvers();
    reply(() => pending.promise);
    useCaller();
    await sendDrawing();
    await settle(() => expect(testId('ai-submitted-drawing')).not.toBeNull());
    const sent = records.props.findLast((props) => props.testID === 'ai-submitted-drawing');
    const scale = currentExportScale();
    expect(sent.source.uri).toBe(
      `data:image/png;base64,${rgbaPng(1024 * scale, 768 * scale, 255).toString('base64')}`
    );
    expect(sent.blurRadius).toBeGreaterThan(2);
    expect(labelled('AI picture progress')).not.toBeNull();
    expect(testId('ai-confetti') !== null).toBe(!calm);
    expect(modal('AI Result').textContent).toContain('Making your picture…');
    expect(labelled('Keep drawing while this is made')).not.toBeNull();
    expect(host.textContent).toContain('Keep drawing while you wait');
    expect(labelled('Report this picture')).toBeNull();
    await act(async () => pending.resolve(pictureReply()));
    await settle(() => expect(labelled('Your AI picture')).not.toBeNull());
    await act(async () => new Promise((done) => setTimeout(done, REVEAL_RAMP_WAIT_MS)));
    expect(labelled('AI picture progress')).toBeNull();
    expect(testId('ai-confetti')).toBeNull();
    expect(host.textContent).not.toContain('Making your picture…');
    expect(host.textContent).not.toContain('Keep drawing while you wait');
    expect(host.textContent).toContain('Download');
    expect(host.textContent).toContain('AI-generated picture');
    expect(labelled('Report this picture')).not.toBeNull();
    expect(labelled('Close')).not.toBeNull();
  },
  GATED_FLOW_TIMEOUT_MS
);

it(
  'downloads the picture through the screenshot save path and sends the card off',
  async () => {
    await finishedPicture();
    await press('Download');
    await settle(() =>
      expect(save.calls).toEqual([
        {
          base64: 'bytes-of:file:///owned/rsd-ai.png',
          format: { baseName: 'splotch-ai', mime: 'image/png' },
        },
      ])
    );
    expect(caller.screen.saveFailure.report).not.toHaveBeenCalled();
    await settle(() => expect(modal('AI Result')).toBeNull());
  },
  GATED_FLOW_TIMEOUT_MS
);

it(
  'keeps the picture on the card when its save does not land, for the banner to retry',
  async () => {
    await finishedPicture();
    save.outcome = 'denied';
    await press('Download');
    await settle(() =>
      expect(caller.screen.saveFailure.report).toHaveBeenCalledWith(
        'denied',
        'bytes-of:file:///owned/rsd-ai.png',
        { baseName: 'splotch-ai', mime: 'image/png' }
      )
    );
    expect(modal('AI Result')).not.toBeNull();
  },
  GATED_FLOW_TIMEOUT_MS
);

it(
  'reports the picture from the disclosure behind the gate, on the confirm card',
  async () => {
    await finishedPicture();
    const before = drawingRequests().length;
    await click('Report this picture');
    expect(modal('Grown-Ups Only')).not.toBeNull();
    await solve();
    const confirm = modal('Report this picture');
    expect(confirm).not.toBeNull();
    expect(confirm.textContent).toContain('go to a grown-up at Splotch');
    expect(confirm.textContent).toContain('We look within 24 hours');
    expect(confirm.textContent).toContain('The AI picture');
    expect(confirm.textContent).toContain('The drawing behind it');
    expect(drawingRequests()).toHaveLength(before);
    await press('Cancel');
    await settle(() => expect(modal('Report this picture')).toBeNull());
    await click('Report this picture');
    await solve();
    await press('Send report');
    const request = caller.aiSend.mock.calls.at(-1)[0];
    expect(request.path).toBe('/api/report-image');
    expect(request.headers['X-Report-Token']).toBe('fixture-report-proof');
    await settle(() =>
      expect(host.textContent).toContain(
        "Thanks. We'll review it within 24 hours. Keep this report reference if you want it deleted sooner: 17-00000000-0000-0000-0000-000000000001"
      )
    );
    expect(labelled('Report this picture')).toBeNull();
  },
  GATED_FLOW_TIMEOUT_MS
);

it(
  'guides the child after a refusal and lets a grown-up report it',
  async () => {
    reply(
      () =>
        new Response('{"ok":false,"error":"private refusal reason"}', {
          status: 422,
          headers: { 'X-Report-Token': 'fixture-refusal-proof' },
        })
    );
    const drawing = emptyDrawing();
    useCaller(drawing);
    await sendDrawing();
    await settle(() => expect(host.textContent).toContain("Let's try drawing something else!"));
    expect(host.textContent).toContain(
      "That picture didn't work — try drawing something different!"
    );
    expect(host.textContent).toContain('For grown-ups');
    expect(host.textContent).not.toContain('private refusal reason');
    await press('Report this refusal');
    await solve();
    const confirm = modal('Report this refusal');
    expect(confirm.textContent).toContain("the AI's refusal reason go to a grown-up at Splotch");
    expect(confirm.textContent).toContain('The rejected drawing');
    await press('Send report');
    const request = caller.aiSend.mock.calls.at(-1)[0];
    const form = await new Response(request.body, { headers: request.headers }).formData();
    expect(form.get('kind')).toBe('false-positive-refusal');
    expect(form.get('style')).toBe('Sticker');
    expect(form.has('output')).toBe(false);
    await settle(() => expect(host.textContent).toContain("Thanks. We'll review it"));
    expect(labelled('Report this refusal')).toBeNull();
    expect(caller.screen.history.drawing).toBe(drawing);
  },
  GATED_FLOW_TIMEOUT_MS
);

it(
  'shows the error card for a picture that could not be opened, with Try again',
  async () => {
    reply(pictureReply);
    caller.aiAdmit.mockImplementation(async (bytes) => {
      if (bytes.length === rgbaPng(2, 2, 255).length)
        throw new Error('controlled native rejection');
    });
    useCaller();
    await sendDrawing();
    await settle(() => expect(host.textContent).toContain("Hmm, that didn't work"));
    expect(host.textContent).toContain("Let's give it one more go.");
    expect(caller.aiRetain).not.toHaveBeenCalled();
    expect(labelled('Your AI picture')).toBeNull();
    const before = drawingRequests().length;
    await press('Try again');
    expect(host.querySelector(GATE_MODAL)).toBeNull();
    await settle(() => expect(drawingRequests()).toHaveLength(before + 1));
    await settle(() => expect(host.textContent).toContain('Still not working'));
    expect(host.textContent).toContain('Try the wand again in a few minutes.');
    await press('Keep drawing');
    await settle(() => expect(modal('AI Result')).toBeNull());
  },
  GATED_FLOW_TIMEOUT_MS
);

it(
  'keeps polling a minimized picture and brings the child back when it is ready',
  async () => {
    let ready = false;
    reply(
      async () =>
        new Response(JSON.stringify({ ok: true, jobId: 'b'.repeat(64), pollAfterMs: 0 }), {
          status: 202,
        }),
      () => new Response(GRANT),
      () => (ready ? pictureReply() : new Response(null, { status: 202 }))
    );
    useCaller();
    await sendDrawing();
    await settle(() => expect(caller.aiWrite).toHaveBeenCalled());
    await click('Keep drawing while this is made');
    await settle(() => expect(modal('AI Result')).toBeNull());
    expect(labelled(WAITING_LABEL)).not.toBeNull();
    expect(labelled(WAITING_LABEL).closest('[data-testid="rsd-paper-corner"]')).not.toBeNull();
    // A minimized run is the one time the wand works with a picture in flight: it shows it again,
    // without a second check.
    await click('Show the picture being made');
    expect(host.querySelector(GATE_MODAL)).toBeNull();
    expect(modal('AI Result')).not.toBeNull();
    expect(labelled(WAITING_LABEL)).toBeNull();
    await press('Keep drawing while you wait');
    await settle(() => expect(labelled(WAITING_LABEL)).not.toBeNull());
    ready = true;
    await act(async () => new Promise((done) => setTimeout(done, POLL_WAIT_MS)));
    expect(caller.aiSend.mock.calls.at(-1)[0].path).toBe('/api/generation-result');
    expect(labelled(WAITING_LABEL)).toBeNull();
    expect(labelled('Show your finished picture')).not.toBeNull();
    expect(modal('AI Result')).toBeNull();
    await click(READY_LABEL);
    expect(modal('AI Result')).not.toBeNull();
    expect(labelled(READY_LABEL)).toBeNull();
    expect(labelled('AI picture progress')).toBeNull();
    expect(labelled('Your AI picture')).not.toBeNull();
    expect(host.textContent).toContain('Download');
  },
  POLL_TEST_TIMEOUT_MS
);

it(
  'reports a failed run from the error card behind the report check, sending no drawing',
  async () => {
    reply(() => new Response('{"ok":false,"error":"Upstream down"}', { status: 502 }));
    caller.feedbackSend.mockResolvedValue(new Response('{"ok":true}', { status: 200 }));
    useCaller();
    await sendDrawing();
    await settle(() => expect(host.textContent).toContain("Hmm, that didn't work"));
    await click('Report a problem');
    expect(modal('Grown-Ups Only')).not.toBeNull();
    await solve();
    const confirm = modal('Report this problem');
    expect(confirm.textContent).toContain('What will be sent');
    expect(confirm.textContent).toContain('Error: 502 · /api/generate-image');
    expect(confirm.textContent).toContain('Not sent: the drawing, names, accounts, or location.');
    await press('Send report');
    const [body] = caller.feedbackSend.mock.calls.at(-1);
    expect(body.kind).toBe('bug');
    expect(body).not.toHaveProperty('device');
    expect(JSON.stringify(body)).not.toContain('data:image');
    await settle(() =>
      expect(host.textContent).toContain(
        'Thanks. Your problem report was sent to our private support tracker.'
      )
    );
    expect(labelled('Report a problem')).toBeNull();
  },
  GATED_FLOW_TIMEOUT_MS
);

// Shipping lands focus back on the AI button, or the drawer toggle, once the result card has
// closed (#3018); RN web does it from the card's dismissal. Negative control: a dismissal that
// skips the hand-back fails here.
it(
  'hands focus back to the AI launcher once the closed card has left',
  async () => {
    launcher.returnFocusToAiLauncher.mockClear();
    await finishedPicture();
    expect(launcher.returnFocusToAiLauncher).not.toHaveBeenCalled();
    await click('Close');
    await settle(() => expect(modal('AI Result')).toBeNull());
    expect(launcher.returnFocusToAiLauncher).toHaveBeenCalledOnce();
  },
  GATED_FLOW_TIMEOUT_MS
);
