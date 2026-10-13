import type { AiVault, AiReferencedVault } from '../ai/credentials';
import type { AiStorage } from '../ai/journal';
import { aiUrl, type AiTransport } from '../ai/transport';
export const aiTransport: AiTransport = (request, signal) =>
  fetch(aiUrl(request), {
    method: request.method,
    headers: request.headers,
    body:
      typeof request.body === 'string'
        ? request.body
        : request.body
          ? new Blob([request.body.slice().buffer])
          : undefined,
    signal,
    credentials: 'omit',
    redirect: 'error',
  });
const unavailable = async (): Promise<never> => {
  throw new Error('This native AI experiment requires its OS secure storage bridge.');
};
export const aiVault: AiVault & AiReferencedVault = {
  installationId: unavailable,
  pin: unavailable,
  readReferenced: unavailable,
  read: unavailable,
  write: unavailable,
  remove: unavailable,
};
export const aiStorage: AiStorage = {
  prepare: unavailable,
  prepareRecovery: unavailable,
  commitRecoveryIntent: unavailable,
  recordRecoveryStatus: unavailable,
  readPreparedUpload: unavailable,
  read: unavailable,
  write: unavailable,
  retain: unavailable,
  pictures: unavailable,
};
export const admitAiImage = unavailable;
