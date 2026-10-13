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
async function solve() {
  const match = screen.container.textContent.match(/(\d) × (\d)/);
  expect(match).not.toBeNull();
  await input('Grown-up answer', String(Number(match[1]) * Number(match[2])));
  await screen.click('Check answer');
  await flush();
}
async function enableAi() {
  expect(screen.button('AI picture')).toBeUndefined();
  expect(files.aiSend).not.toHaveBeenCalled();
  expect(files.aiVaultRead).not.toHaveBeenCalled();
  await screen.click('Parent Center');
  expect(screen.button('Enable AI picture creation')).toBeUndefined();
  expect(files.settingsWrite).not.toHaveBeenCalled();
  await solve();
  await screen.click('Enable AI picture creation');
  expect(JSON.parse(files.settingsWrite.mock.calls.at(-1)[0])).toMatchObject({
    version: 9,
    coloringBookEnabled: true,
    aiEnabled: true,
    parentPolicies: {
      ai: 'always',
      imageReport: 'always',
      feedback: 'always',
      parentCenter: 'always',
    },
  });
  await screen.click('Keep drawing');
}
async function protectedAction(label) {
  const before = [
    files.aiSend,
    files.aiVaultRead,
    files.aiVaultWrite,
    files.aiPrepare,
    files.capture,
  ].map((mock) => mock.mock.calls.length);
  await screen.click(label);
  expect(screen.container.querySelectorAll('[role="dialog"]')).toHaveLength(1);
  expect(screen.dialog().getAttribute('aria-label')).toBe('Grown-ups only');
  [files.aiSend, files.aiVaultRead, files.aiVaultWrite, files.aiPrepare, files.capture].forEach(
    (mock, index) => expect(mock).toHaveBeenCalledTimes(before[index])
  );
  await solve();
}
async function open({ allowance = true } = {}) {
  if (!screen.button('AI picture')) await enableAi();
  const beforeRequests = files.aiSend.mock.calls.length;
  const beforeVault = files.aiVaultRead.mock.calls.length;
  await screen.click('AI picture');
  expect(files.aiSend).toHaveBeenCalledTimes(beforeRequests);
  expect(files.aiVaultRead).toHaveBeenCalledTimes(beforeVault);
  expect(screen.container.textContent).toContain('splotch.art and OpenAI');
  if (allowance) await protectedAction('Check AI allowance');
}
beforeEach(async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  files.aiAdmit.mockResolvedValue(undefined);
  let journal = null;
  let upload = new Uint8Array();
  const receipt = (next) =>
    Object.freeze({
      kind: 'prepared',
      journal: Object.freeze({ ...next }),
      nonce: 'c'.repeat(64),
      revision: 1,
      originalRevision: 1,
      originalDigest: 'd'.repeat(64),
      inputDigest: 'e'.repeat(64),
      inputLength: upload.length,
      resultDigest: next.result ? 'f'.repeat(64) : null,
      resultLength: next.result ? 1 : null,
    });
  files.aiRead.mockImplementation(async () =>
    journal ? { kind: 'native', receipt: receipt(journal) } : null
  );
  files.aiPrepare.mockImplementation(async (next, _, bytes) => {
    journal = next;
    upload = bytes.slice();
    return receipt(next);
  });
  files.aiReadPreparedUpload.mockImplementation(async () => upload.slice());
  files.aiWrite.mockImplementation(async (next) => {
    journal = next;
    return receipt(next);
  });
  files.aiRetain.mockImplementation(async () => {
    const picture = { uri: 'file:///owned/ai.png', mime: 'image/png' };
    journal = { ...journal, phase: 'result', result: picture };
    return { picture, receipt: receipt(journal) };
  });
  files.aiVaultRead.mockReset().mockResolvedValue(null);
  files.aiVaultWrite.mockReset().mockResolvedValue(undefined);
  files.settingsRead.mockReset().mockResolvedValue('{"version":1,"soundEnabled":false}');
  files.settingsWrite.mockReset().mockResolvedValue(undefined);
  files.platform = 'android';
  files.retainClosingModal = false;
  files.dismissModal = null;
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
  await act(async () => screen.mount());
});
afterEach(async () => {
  await act(async () => screen.close());
  vi.clearAllMocks();
});
it('mounts the RN parent challenge, disclosure, finite style picker and retained result without replacing the drawing', async () => {
  await enableAi();
  await screen.click('AI picture');
  expect(files.aiSend).not.toHaveBeenCalled();
  expect(files.aiVaultRead).not.toHaveBeenCalled();
  await screen.click('Keep drawing');
  await open();
  expect(screen.container.textContent).toContain('splotch.art and OpenAI');
  await screen.click('Clay AI style');
  const original = screen.paper();
  await protectedAction('Send drawing for AI');
  expect(files.aiSend.mock.calls.at(-1)[0].query).toBe('style=Clay');
  expect(files.aiPrepare).toHaveBeenCalledOnce();
  expect(files.aiAdmit).toHaveBeenCalledTimes(2);
  expect(
    files.aiSend.mock.calls.filter(([request]) => request.path === '/api/generate-image')
  ).toHaveLength(1);
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
  expect(files.aiReadPreparedUpload).toHaveBeenCalledOnce();
  expect(files.aiRetain).toHaveBeenCalledOnce();
});
it.each([
  [
    'byok',
    'Use my OpenAI key',
    'OpenAI API key',
    'fixture-key',
    '/api/verify-key',
    { apiKey: 'fixture-key' },
  ],
  [
    'managed',
    'Use access code',
    'AI access code',
    'fixture-code',
    '/api/verify-access-code',
    { code: 'fixture-code' },
  ],
])(
  'mounts the %s credential caller and hides the secret before its explicit verification challenge',
  async (kind, choice, label, secret, path, body) => {
    await open();
    files.aiSend.mockImplementation(
      async (request) =>
        new Response(
          JSON.stringify(
            request.path === '/api/verify-access-code'
              ? { ok: true, accessCode: secret }
              : request.path === '/api/free-generation-grant'
                ? { ok: true, remaining: 10, limit: 10 }
                : { ok: true }
          )
        )
    );
    await screen.click(choice);
    await input(label, secret);
    const beforeRequests = files.aiSend.mock.calls.length;
    const beforeVault = files.aiVaultRead.mock.calls.length;
    await screen.click('Verify and save credential');
    expect(files.aiSend).toHaveBeenCalledTimes(beforeRequests);
    expect(files.aiVaultRead).toHaveBeenCalledTimes(beforeVault);
    expect(files.aiVaultWrite).not.toHaveBeenCalled();
    expect(screen.dialog().getAttribute('aria-label')).toBe('Grown-ups only');
    expect(screen.container.querySelectorAll('[role="dialog"]')).toHaveLength(1);
    expect(
      [...screen.container.querySelectorAll('input')].every((field) => field.value !== secret)
    ).toBe(true);
    await solve();
    expect(screen.container.querySelector('[aria-label="AI access code"]').value).toBe('');
    expect(files.aiSend.mock.calls.find(([request]) => request.path === path)[0]).toMatchObject({
      path,
      body: JSON.stringify(body),
    });
    expect(files.aiVaultWrite).toHaveBeenCalledExactlyOnceWith(kind, secret);
  }
);

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
  await protectedAction('Send drawing for AI');
  await screen.click('Keep drawing');
  await screen.click('Draw fixture stroke');
  const nextDrawing = screen.paper();
  const beforeReopen = files.aiSend.mock.calls.length;
  await open({ allowance: false });
  expect(files.aiSend).toHaveBeenCalledTimes(beforeReopen);
  await protectedAction('Check waiting picture');
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
  await protectedAction('Send drawing for AI');
  expect(files.aiAdmit).toHaveBeenCalledTimes(2);
  expect(files.aiRetain).not.toHaveBeenCalled();
  expect(screen.container.querySelector('img[alt="Your AI picture"]')).toBeNull();
  expect(screen.container.textContent).toContain('could not be safely opened');
  expect(screen.paper()).toBe(original);
});

it('withholds the mounted RN upload if pinned native readback fails', async () => {
  files.aiReadPreparedUpload.mockRejectedValue(new Error('native pinned digest failed'));
  await open();
  const original = screen.paper();
  await protectedAction('Send drawing for AI');
  await flush();
  expect(files.aiPrepare).toHaveBeenCalledOnce();
  expect(files.aiReadPreparedUpload).toHaveBeenCalledOnce();
  expect(
    files.aiSend.mock.calls.filter(([request]) => request.path === '/api/generate-image')
  ).toHaveLength(0);
  expect(files.aiRetain).not.toHaveBeenCalled();
  expect(screen.paper()).toBe(original);
  expect(screen.container.textContent).toContain('Nothing was sent');
});
