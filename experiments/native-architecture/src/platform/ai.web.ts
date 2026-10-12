import { createWebAiVault } from './aiVault.web';
import { aiUrl, type AiTransport } from '../ai/transport';
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
export { aiStorage } from './aiStorage.web';
export { admitAiImage } from './aiImage.web';
