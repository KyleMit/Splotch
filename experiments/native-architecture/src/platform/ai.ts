import { fetch } from 'expo/fetch';
import { Directory, File, Paths } from 'expo-file-system';
import { NativeModules } from 'react-native';
import { aiUrl, type AiTransport } from '../ai/transport';
import { parseAiJournal, type AiStorage } from '../ai/journal';
import { SECRET_SLOTS, MAX_RESULT_BYTES, isInstallationId } from '../ai/contract';
import { validCredential, type AiVault } from '../ai/credentials';

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
const AI_DIRECTORY = 'splotch-ai-pictures-v1';
const MAX_JOURNAL_BYTES = 32 * 1024;
const MAX_AI_ARCHIVE_BYTES = 128 * 1024 * 1024;
function directory() {
  const owner = new Directory(Paths.document, AI_DIRECTORY);
  owner.create({ intermediates: true, idempotent: true });
  return owner;
}
function journalFiles() {
  return directory()
    .list()
    .filter((file): file is File => file instanceof File && /^journal-\d+\.json$/.test(file.name))
    .sort((a, b) => Number(b.name.slice(8, -5)) - Number(a.name.slice(8, -5)));
}
function archiveBytes(owner: Directory) {
  return owner
    .list()
    .reduce((sum, item) => sum + (item instanceof File ? item.size : MAX_AI_ARCHIVE_BYTES), 0);
}
function createAiStorage(): AiStorage {
  let revision = 0;
  return {
    async read() {
      const file = journalFiles()[0];
      if (!file) return null;
      if (file.size > MAX_JOURNAL_BYTES) throw new Error('AI recovery data is too large.');
      const journal = parseAiJournal(JSON.parse(await file.text()));
      if (
        journal.result &&
        (!new File(journal.result.uri).exists ||
          !directory()
            .list()
            .some(
              (item) =>
                item instanceof File &&
                /^result-\d+\.(png|jpg|webp)$/.test(item.name) &&
                item.uri === journal.result?.uri
            ))
      )
        throw new Error('Saved AI picture is missing.');
      return journal;
    },
    async write(value) {
      const snapshot = JSON.stringify(parseAiJournal(value));
      if (snapshot.length > MAX_JOURNAL_BYTES) throw new Error('AI recovery data is too large.');
      if (archiveBytes(directory()) + snapshot.length > MAX_AI_ARCHIVE_BYTES)
        throw new Error('AI recovery storage is full.');
      const previous = journalFiles();
      revision = Math.max(
        Date.now(),
        revision + 1,
        Number(previous[0]?.name.slice(8, -5) ?? 0) + 1
      );
      const pending = new File(directory(), `journal-${revision}.pending`);
      pending.create();
      pending.write(snapshot);
      if ((await pending.text()) !== snapshot) throw new Error('AI recovery write was incomplete.');
      await pending.move(new File(directory(), `journal-${revision}.json`));
      if ((await pending.text()) !== snapshot)
        throw new Error('AI recovery publication was incomplete.');
    },
    async retain(id, bytes, mime) {
      if (!Number.isSafeInteger(id) || id < 1 || !bytes.length || bytes.length > MAX_RESULT_BYTES)
        throw new Error('Invalid AI picture.');
      const owner = directory();
      const total = archiveBytes(owner);
      const file = new File(
        owner,
        `result-${id}.${mime === 'image/png' ? 'png' : mime === 'image/jpeg' ? 'jpg' : 'webp'}`
      );
      if (!file.exists) {
        if (total + bytes.length > MAX_AI_ARCHIVE_BYTES)
          throw new Error('AI picture storage is full.');
        const pending = new File(owner, `result-${id}.pending`);
        if (pending.exists) pending.delete();
        pending.create();
        pending.write(bytes);
        const readback = await pending.bytes();
        if (
          readback.length !== bytes.length ||
          readback.some((value, index) => value !== bytes[index])
        )
          throw new Error('AI picture write was incomplete.');
        await pending.move(file);
      }
      const readback = await file.bytes();
      if (
        readback.length !== bytes.length ||
        readback.some((value, index) => value !== bytes[index])
      )
        throw new Error('AI picture readback failed.');
      return { uri: file.uri, mime };
    },
    async pictures() {
      return directory()
        .list()
        .flatMap((file) => {
          if (!(file instanceof File) || !/^result-\d+\.(png|jpg|webp)$/.test(file.name)) return [];
          const mime = file.name.endsWith('.png')
            ? 'image/png'
            : file.name.endsWith('.jpg')
              ? 'image/jpeg'
              : 'image/webp';
          return [{ uri: file.uri, mime }];
        });
    },
  };
}
export const aiStorage = createAiStorage();
