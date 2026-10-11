import { fetch } from 'expo/fetch';
import { NativeModules } from 'react-native';
import { aiUrl, type AiTransport } from '../ai/transport';
import { SECRET_SLOTS, isInstallationId } from '../ai/contract';
import { validCredential, type AiVault } from '../ai/credentials';
import { admitAiImage } from './aiImage';
export { admitAiImage };

type Bridge = {
  installationId(): Promise<unknown>;
  readCredential(name: string): Promise<unknown>;
  writeCredential(name: string, value: string): Promise<unknown>;
  removeCredential(name: string): Promise<unknown>;
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
export const aiVault: AiVault = {
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
    const native = bridge();
    if (
      (await native.writeCredential(SECRET_SLOTS[kind], value)) !== true ||
      (await native.readCredential(SECRET_SLOTS[kind])) !== value
    )
      throw new Error('Secure AI write was not confirmed.');
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
export const aiTransport: AiTransport = (request, signal) =>
  fetch(aiUrl(request), {
    method: request.method,
    headers: request.headers,
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
