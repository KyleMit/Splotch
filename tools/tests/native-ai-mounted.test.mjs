// @vitest-environment happy-dom
import { rgbaPng } from './native-png-fixtures.mjs';
import { act } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createScreen, files } from './native-drawing-screen-harness.mjs';
let screen;
const flush = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
async function input(label, value) {
  const field = screen.container.querySelector(`[aria-label="${label}"]`);
  expect(field).not.toBeNull();
  await act(async () => {
    field.value = value;
    field.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
async function open() {
  await screen.click('AI picture');
  const match = screen.container.textContent.match(/(\d) × (\d)/);
  expect(match).not.toBeNull();
  await input('AI answer', String(Number(match[1]) * Number(match[2])));
  await screen.click('Continue to AI');
  await flush();
}
beforeEach(async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  files.aiAdmit.mockResolvedValue(undefined);
  let journal = null;
  files.aiRead.mockImplementation(async () => journal);
  files.aiPrepare.mockImplementation(async (next) => {
    journal = next;
  });
  files.aiWrite.mockImplementation(async (next) => {
    journal = next;
  });
  files.aiVaultRead.mockResolvedValue(null);
  files.aiSend.mockImplementation(async (request) =>
    request.path === '/api/free-generation-grant'
      ? new Response('{"ok":true,"remaining":10,"limit":10}')
      : new Response(rgbaPng(2, 2, 255), {
          headers: { 'Content-Type': 'image/png' },
        })
  );
  files.lock.mockReturnValue(() => {});
  files.capture.mockResolvedValue(rgbaPng(1024, 768, 255).toString('base64'));
  files.list.mockReturnValue([]);
  screen = createScreen();
  await screen.mount();
});
afterEach(async () => {
  await act(async () => screen.close());
  vi.clearAllMocks();
});
it('mounts the RN parent challenge, disclosure, finite style picker and retained result without replacing the drawing', async () => {
  await screen.click('AI picture');
  expect(files.aiSend).not.toHaveBeenCalled();
  await screen.click('Keep drawing');
  await open();
  expect(screen.container.textContent).toContain('splotch.art and OpenAI');
  await screen.click('Clay AI style');
  const original = screen.paper();
  await screen.click('Send drawing for AI');
  await flush();
  expect(files.aiSend.mock.calls.at(-1)[0].query).toBe('style=Clay');
  expect(JSON.parse(files.aiPrepare.mock.calls[0][1])).toEqual(JSON.parse(original));
  expect(files.aiPrepare.mock.calls[0][2].length).toBeGreaterThan(8);
  const postIndex = files.aiSend.mock.calls.findIndex(
    ([request]) => request.path === '/api/generate-image'
  );
  expect(files.aiPrepare.mock.invocationCallOrder[0]).toBeLessThan(
    files.aiSend.mock.invocationCallOrder[postIndex]
  );
  expect(screen.paper()).toBe(original);
  expect(screen.container.querySelector('img[alt="Your AI picture"]').getAttribute('src')).toBe(
    'file:///owned/ai.png'
  );
  expect(files.aiRetain).toHaveBeenCalledOnce();
});
it('mounts both credential setup callers and clears the secret input before verification', async () => {
  await open();
  files.aiSend.mockResolvedValue(new Response('{"ok":true}'));
  await screen.click('Use my OpenAI key');
  await input('OpenAI API key', 'fixture-key');
  await screen.click('Verify and save credential');
  await flush();
  expect(screen.container.querySelector('[aria-label="OpenAI API key"]').value).toBe('');
  expect(
    files.aiSend.mock.calls.find(([request]) => request.path === '/api/verify-key')[0]
  ).toMatchObject({
    path: '/api/verify-key',
    body: '{"apiKey":"fixture-key"}',
  });
  expect(files.aiVaultWrite).toHaveBeenCalledWith('byok', 'fixture-key');
});

it('keeps the next RN drawing separate when a waiting AI picture is collected after closing', async () => {
  files.aiSend.mockImplementation(async (request) =>
    request.path === '/api/free-generation-grant'
      ? new Response('{"ok":true,"remaining":10,"limit":10}')
      : request.path === '/api/generate-image'
        ? new Response(JSON.stringify({ ok: true, jobId: 'b'.repeat(64), pollAfterMs: 3000 }), {
            status: 202,
          })
        : new Response(rgbaPng(2, 2, 255), {
            headers: { 'Content-Type': 'image/png' },
          })
  );
  await open();
  await screen.click('Send drawing for AI');
  await flush();
  await screen.click('Keep drawing');
  await screen.click('Draw fixture stroke');
  const nextDrawing = screen.paper();
  await open();
  await flush();
  expect(screen.paper()).toBe(nextDrawing);
  expect(
    files.aiSend.mock.calls.filter(([request]) => request.path === '/api/generate-image')
  ).toHaveLength(1);
  expect(files.aiRetain).toHaveBeenCalledOnce();
});

it('withholds an RN picture rejected by native decoding and preserves the drawing', async () => {
  await open();
  files.aiAdmit.mockRejectedValue(new Error('controlled native decoder rejection'));
  const original = screen.paper();
  await screen.click('Send drawing for AI');
  await flush();
  expect(files.aiAdmit).toHaveBeenCalledOnce();
  expect(files.aiRetain).not.toHaveBeenCalled();
  expect(screen.container.querySelector('img[alt="Your AI picture"]')).toBeNull();
  expect(screen.container.textContent).toContain('could not be safely opened');
  expect(screen.paper()).toBe(original);
});
