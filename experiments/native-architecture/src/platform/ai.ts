import { fetch } from 'expo/fetch';
import { withCredentialLeases } from '../ai/credentialLease';
import { NativeModules, Platform } from 'react-native';
import { aiUrl, type AiTransport } from '../ai/transport';
import { SECRET_SLOTS, isInstallationId } from '../ai/contract';
import { validCredential, type AiVault, type AiReferencedVault } from '../ai/credentials';
import { admitAiImage } from './aiImage';
import { File, Paths } from 'expo-file-system';
import type { AiDismissalStore } from '../ai/sessionContract';
export { admitAiImage };

type Bridge = {
  installationId(): Promise<unknown>;
  readCredential(name: string): Promise<unknown>;
  writeCredential(name: string, value: string): Promise<unknown>;
  removeCredential(name: string): Promise<unknown>;
  pinCredentialReference(name: string): Promise<unknown>;
  writeReferencedCredential(name: string, value: string): Promise<unknown>;
  readReferencedCredential(name: string, reference: string): Promise<unknown>;
};
function bridge(): Bridge {
  const value: unknown = NativeModules.SplotchAIEnvironment;
  if (
    !value ||
    typeof value !== 'object' ||
    !('installationId' in value) ||
    typeof value.installationId !== 'function' ||
    !('readCredential' in value) ||
    typeof value.readCredential !== 'function' ||
    !('writeCredential' in value) ||
    typeof value.writeCredential !== 'function' ||
    !('removeCredential' in value) ||
    typeof value.removeCredential !== 'function'
  )
    throw new Error('Native secure AI storage is unavailable.');
  return value as Bridge;
}
function referenceBridge() {
  const native = bridge();
  if (
    typeof native.pinCredentialReference !== 'function' ||
    typeof native.readReferencedCredential !== 'function' ||
    typeof native.writeReferencedCredential !== 'function'
  )
    throw new Error('Secure AI credential references are unavailable.');
  return native;
}
function referenceSlot(kind: 'free' | keyof typeof SECRET_SLOTS) {
  return kind === 'free' ? 'free-generation-identity' : SECRET_SLOTS[kind];
}
const nativeVault: AiVault & Omit<AiReferencedVault, 'lease' | 'pinLeased'> = {
  async installationId() {
    const value = await bridge().installationId();
    if (!isInstallationId(value)) throw new Error('Installation grant unavailable.');
    return value;
  },
  async read(kind) {
    const value = await bridge().readCredential(SECRET_SLOTS[kind]);
    if (value !== null && !validCredential(value))
      throw new Error('Secure AI storage could not be read.');
    return value;
  },
  async write(kind, value) {
    if (!validCredential(value)) throw new Error('Invalid credential');
    const native = referenceBridge();
    const reference = await native.writeReferencedCredential(SECRET_SLOTS[kind], value);
    if (!isInstallationId(reference) || (await native.readCredential(SECRET_SLOTS[kind])) !== value)
      throw new Error('Secure AI write was not confirmed.');
    const confirmed = await aiVault.readReferenced(Object.freeze({ kind, reference }));
    if (confirmed.kind === 'free' || confirmed.kind !== kind || confirmed.value !== value)
      throw new Error('Secure AI generation was not confirmed.');
  },
  async pin(kind) {
    const reference = await referenceBridge().pinCredentialReference(referenceSlot(kind));
    if (!isInstallationId(reference)) throw new Error('Secure AI reference was not confirmed.');
    return Object.freeze({ kind, reference });
  },
  async readReferenced(pinned) {
    if (
      !pinned ||
      !['free', 'managed', 'byok'].includes(pinned.kind) ||
      Object.keys(pinned).sort().join(',') !== 'kind,reference' ||
      !isInstallationId(pinned.reference)
    )
      throw new Error('Secure AI reference is invalid.');
    const value = await referenceBridge().readReferencedCredential(
      referenceSlot(pinned.kind),
      pinned.reference
    );
    if (pinned.kind === 'free') {
      if (!isInstallationId(value)) throw new Error('Installation binding unavailable.');
      return { kind: 'free', installationId: value };
    }
    if (!validCredential(value)) throw new Error('Referenced AI credential unavailable.');
    return { kind: pinned.kind, value };
  },
  async remove(kind) {
    const native = bridge();
    if (
      (await native.removeCredential(SECRET_SLOTS[kind])) !== true ||
      (await native.readCredential(SECRET_SLOTS[kind])) !== null
    )
      throw new Error('Secure AI removal was not confirmed.');
  },
};
export const aiVault = withCredentialLeases(nativeVault);
export const aiTransport: AiTransport = (request, signal) =>
  fetch(aiUrl(request), {
    method: request.method,
    headers: {
      ...request.headers,
      Origin: Platform.OS === 'ios' ? 'capacitor://localhost' : 'https://localhost',
    },
    ...(request.body === undefined
      ? {}
      : {
          body:
            typeof request.body === 'string'
              ? request.body
              : new Blob([request.body.slice().buffer]),
        }),
    signal,
    credentials: 'omit',
    redirect: 'error',
  });
export { aiStorage } from './durableAiStorage';
const AI_DISMISSAL_FILE = 'splotch-ai-dismissed-result.txt';
export const aiDismissal: AiDismissalStore = {
  async read() {
    const file = new File(Paths.document, AI_DISMISSAL_FILE);
    return file.exists ? file.text() : null;
  },
  async write(id) {
    const file = new File(Paths.document, AI_DISMISSAL_FILE);
    if (!file.exists) file.create();
    await file.write(id);
  },
};
