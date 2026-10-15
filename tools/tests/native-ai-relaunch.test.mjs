import { expect, it, vi } from 'vitest';
import { nativeAiBoundary } from './native-ai-boundary.mjs';
import { createNativeAi } from '../../experiments/native-architecture/src/ai/generation.ts';
import { rgbaPng } from './native-png-fixtures.mjs';

it.each([
  ['native', 'sent'],
  ['native', 'pending'],
  ['native', 'result'],
  ['recovery-held', 'unknown'],
  ['recovery-request', 'pending'],
])('starts fresh after relaunch with a saved %s %s attempt', async (kind, phase) => {
  const boundary = nativeAiBoundary();
  const journal = {
    version: 1,
    id: 42,
    createdAt: 42,
    style: 'Magical',
    originalId: 'picture-42-old',
    phase,
    jobId: 'a'.repeat(64),
    result: null,
  };
  boundary.aiStorage.read.mockResolvedValue({
    kind,
    receipt: { journal, kind, recovery: { intent: 'committed' } },
  });
  boundary.aiStorage.pictures.mockResolvedValue([{ uri: 'file:///old.png', mime: 'image/png' }]);
  const post = vi.fn(
    async () => new Response(rgbaPng(2, 2, 255), { headers: { 'Content-Type': 'image/png' } })
  );
  const owner = createNativeAi({
    storage: boundary.aiStorage,
    vault: boundary.aiVault,
    admit: boundary.admitAiImage,
    prepare: async () => ({
      bytes: rgbaPng(2, 2, 255),
      originalId: 'picture-43-new',
      originalModel: '{}',
    }),
    transport: async (request) =>
      request.path === '/api/free-generation-grant'
        ? new Response('{"ok":true,"remaining":10,"limit":10}')
        : post(request),
  });
  try {
    owner.open();
    const { x, y } = owner.getState().gate;
    owner.gateInput(String(x * y));
    owner.gateAnswer();
    await vi.waitFor(() => expect(owner.getState().busy).toBe(false));
    expect(owner.getState()).toMatchObject({ journal: null, recovery: null, pictures: [] });
    expect(boundary.aiStorage.read).not.toHaveBeenCalled();
    expect(boundary.aiStorage.pictures).not.toHaveBeenCalled();
    await owner.generate();
    expect(post).toHaveBeenCalledOnce();
    expect(owner.getState().journal.originalId).toBe('picture-43-new');
  } finally {
    owner.dispose();
  }
});
