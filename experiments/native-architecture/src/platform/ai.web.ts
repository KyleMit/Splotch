import { createWebAiVault } from './aiVault.web';
import { aiUrl, type AiTransport } from '../ai/transport';
import type { AiDismissalStore } from '../ai/sessionContract';
export const aiTransport: AiTransport = (request, signal) =>
  fetch(aiUrl(request), {
    method: request.method,
    headers: request.headers,
    body:
      typeof request.body === 'string'
        ? request.body
        : request.body
          ? new Blob([new Uint8Array(request.body).buffer])
          : undefined,
    signal,
    credentials: 'omit',
    redirect: 'error',
  });
export const aiVault = createWebAiVault();
const AI_DISMISSAL_KEY = 'splotch-candidate:ai-dismissed-result-v1';
export const aiDismissal: AiDismissalStore = {
  read: async () => localStorage.getItem(AI_DISMISSAL_KEY),
  write: async (id) => localStorage.setItem(AI_DISMISSAL_KEY, id),
};
export { aiStorage } from './aiStorage.web';
export { admitAiImage } from './aiImage.web';
