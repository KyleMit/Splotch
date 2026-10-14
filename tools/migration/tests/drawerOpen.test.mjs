// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { STORAGE_KEYS } from '../../../web/src/lib/storageKeys.ts';
import { drawerOpenStorage as webStorage } from '../../../experiments/native-architecture/src/platform/drawerOpen.web.ts';

// The native app's document directory, as a map from file name to its text.
const documents = vi.hoisted(() => new Map());
vi.mock('expo-file-system', () => {
  class File {
    constructor(directory, name) {
      if (directory !== 'document') throw new Error('Drawer state belongs in the documents.');
      this.name = name;
    }
    get exists() {
      return documents.has(this.name);
    }
    create() {
      documents.set(this.name, '');
    }
    textSync() {
      return documents.get(this.name);
    }
    write(text) {
      if (!documents.has(this.name)) throw new Error('The file was never created.');
      documents.set(this.name, text);
    }
  }
  return { File, Paths: { document: 'document' } };
});
const { drawerOpenStorage: nativeStorage } =
  await import('../../../experiments/native-architecture/src/platform/drawerOpen.ts');

afterEach(() => {
  localStorage.clear();
  documents.clear();
});

describe('the Tool Drawer state on the web', () => {
  it("reads what shipping's writeBool left under its own key", () => {
    expect(webStorage.read()).toBeNull();
    localStorage.setItem(STORAGE_KEYS.drawerOpen, 'true');
    expect(webStorage.read()).toBe('true');
  });

  it("writes the drawer's state where shipping reads it", () => {
    webStorage.write('false');
    expect(localStorage.getItem(STORAGE_KEYS.drawerOpen)).toBe('false');
  });
});

describe('the Tool Drawer state on Android and iOS', () => {
  it("keeps the drawer's state in a document named by shipping's key", () => {
    expect(nativeStorage.read()).toBeNull();
    nativeStorage.write('true');
    expect([...documents]).toEqual([[STORAGE_KEYS.drawerOpen, 'true']]);
    expect(nativeStorage.read()).toBe('true');
    nativeStorage.write('false');
    expect(nativeStorage.read()).toBe('false');
  });
});
