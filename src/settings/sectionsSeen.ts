import { createLazyExport } from '../lazyExport';
import { NATIVE_SETTINGS_SECTIONS, type NativeSettingsSectionId } from './settingsSections';

type SeenStamps = Partial<Record<NativeSettingsSectionId, string>>;
export type SectionsSeenStorage = {
  read: () => Promise<string | null>;
  write: (snapshot: string) => Promise<void>;
};

function readStamps(raw: string | null): SeenStamps {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      NATIVE_SETTINGS_SECTIONS.flatMap(({ id }) => {
        const stamp: unknown = Reflect.get(parsed, id);
        return typeof stamp === 'string' ? [[id, stamp]] : [];
      })
    );
  } catch {
    return {};
  }
}

export function createSectionsSeen(storage: SectionsSeenStorage) {
  return createLazyExport(async () => {
    let stamps = readStamps(await storage.read().catch(() => null));
    let writes = Promise.resolve();
    const listeners = new Set<() => void>();
    return {
      snapshot: () => stamps,
      subscribe(listener: () => void) {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
      unseen(id: NativeSettingsSectionId) {
        const section = NATIVE_SETTINGS_SECTIONS.find((section) => section.id === id);
        if (!section) throw new Error(`Unknown Settings section: ${id}`);
        return stamps[id] !== section.contentStamp;
      },
      markSeen(id: NativeSettingsSectionId) {
        const section = NATIVE_SETTINGS_SECTIONS.find((section) => section.id === id);
        if (!section) throw new Error(`Unknown Settings section: ${id}`);
        if (stamps[id] === section.contentStamp) return;
        stamps = { ...stamps, [id]: section.contentStamp };
        const saved = JSON.stringify(stamps);
        for (const listener of listeners) listener();
        writes = writes.then(() => storage.write(saved)).catch(() => {});
      },
    };
  });
}
