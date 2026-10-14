// The wand's routes into Settings › AI Art, and what the AI Art switches do to a run.
import { expect, it } from 'vitest';
import { act } from 'react';
import { caller, host } from './rsd-native-selection-host.mjs';
import { GATE_MODAL, solveParentGate as solve } from './rsd-parent-gate-keypad.mjs';
import { emptyDrawing } from '../../../experiments/native-architecture/src/drawing/model.ts';
import {
  save,
  labelled,
  modal,
  click,
  settle,
  GATED_FLOW_TIMEOUT_MS,
  WAND,
  GRANT,
  pictureReply,
  reply,
  useCaller,
  enableAi,
  expectAiArtPage,
  drawingRequests,
  openPrompt,
  sendDrawing,
} from './rsd-native-ai-fixture.mjs';

it.each([
  ['checks the allowance', () => new Promise(() => {}), 'Checking AI image availability', true],
  [
    'finds no allowance',
    () => new Response('{"ok":false}', { status: 503 }),
    'AI image unavailable',
    true,
  ],
  ['counts the free pictures left', () => new Response(GRANT), WAND, false],
])(
  'labels the wand while it %s, as shipping does',
  async (_, grant, label, disabled) => {
    reply(pictureReply, grant);
    useCaller();
    await enableAi();
    await settle(() => expect(labelled(label)).not.toBeNull());
    expect(labelled(label).disabled).toBe(disabled);
    const badge = labelled(label).querySelector('[data-testid="free-count"]');
    expect(badge?.textContent ?? null).toBe(label === 'AI image unavailable' ? null : '10');
  },
  GATED_FLOW_TIMEOUT_MS
);

it(
  'parks the wand on a blank page, and sends a grown-up to Settings when no picture is left',
  async () => {
    reply(pictureReply, () => new Response('{"ok":true,"remaining":0,"limit":10}'));
    useCaller(emptyDrawing(), { inkVisible: false });
    await enableAi();
    await settle(() => expect(labelled('Set up AI image')).not.toBeNull());
    expect(labelled('Set up AI image').disabled).toBe(true);
    caller.screen = { ...caller.screen, inkVisible: true };
    await act(async () => caller.product.owner.openParentCenter());
    await solve();
    await click('Close');
    await click('Set up AI image');
    await solve();
    await expectAiArtPage();
    expect(modal('Pick a style')).toBeNull();
    expect(drawingRequests()).toHaveLength(0);
  },
  GATED_FLOW_TIMEOUT_MS
);

it(
  'closes the card and opens Settings at AI Art when the free pictures run out mid-send',
  async () => {
    reply(
      () =>
        new Response(
          JSON.stringify({
            ok: false,
            code: 'FREE_GRANT_EXHAUSTED',
            error: 'Used up',
            remaining: 0,
          }),
          { status: 403 }
        )
    );
    useCaller();
    await sendDrawing();
    await expectAiArtPage();
    await settle(() => expect(modal('AI Result')).toBeNull());
  },
  GATED_FLOW_TIMEOUT_MS
);

it(
  'skips the style prompt with Customize AI Style off and sends the drawing with no style',
  async () => {
    reply(pictureReply);
    useCaller();
    await enableAi({ customize: false });
    await settle(() => expect(labelled(WAND)).not.toBeNull());
    await click(WAND);
    await solve();
    expect(modal('Pick a style')).toBeNull();
    await settle(() => expect(labelled('Report this picture')).not.toBeNull());
    const [generate] = caller.aiSend.mock.calls.find(
      ([request]) => request.path === '/api/generate-image'
    );
    expect(generate.query).toBeUndefined();
    expect(host.querySelector(GATE_MODAL)).toBeNull();
  },
  GATED_FLOW_TIMEOUT_MS
);

it(
  'auto-saves the picture and the drawing through the screenshot save path, then says where',
  async () => {
    reply(pictureReply);
    useCaller();
    await enableAi({ autoSave: true });
    await openPrompt();
    await click('Sticker');
    await settle(() => expect(save.calls).toHaveLength(2));
    expect(save.calls[0]).toEqual({
      base64: 'bytes-of:file:///owned/rsd-ai.png',
      format: { baseName: 'splotch-ai', mime: 'image/png' },
    });
    expect(host.textContent).toContain('✓ Saved to your photos');
    expect(save.calls[1].format).toBeUndefined();
    expect(save.calls[1].base64.length).toBeGreaterThan(0);
    expect([...host.querySelectorAll('button')].some((b) => b.textContent === 'Download')).toBe(
      false
    );
    expect(caller.screen.saveFailure.report).not.toHaveBeenCalled();
  },
  GATED_FLOW_TIMEOUT_MS
);

it(
  'hands an auto-save that did not land to the save failure banner and offers Download',
  async () => {
    reply(pictureReply);
    save.outcome = 'denied';
    useCaller();
    await enableAi({ autoSave: true });
    await openPrompt();
    await click('Sticker');
    await settle(() =>
      expect(caller.screen.saveFailure.report).toHaveBeenCalledWith(
        'denied',
        'bytes-of:file:///owned/rsd-ai.png',
        { baseName: 'splotch-ai', mime: 'image/png' }
      )
    );
    await settle(() =>
      expect([...host.querySelectorAll('button')].some((b) => b.textContent === 'Download')).toBe(
        true
      )
    );
    expect(host.textContent).not.toContain('Saved to your photos');
  },
  GATED_FLOW_TIMEOUT_MS
);
