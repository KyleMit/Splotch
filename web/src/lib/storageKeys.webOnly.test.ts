// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { STORAGE_KEYS, WEB_ONLY_STORAGE_KEYS } from './storageKeys';

// Native durable hydration skips WEB_ONLY_STORAGE_KEYS (storage.ts), so a value
// native wrote under one of them would be gone after a WebView eviction. That
// is safe only while no writer of those keys runs on native, and this scan
// holds that claim to the source. Every name a write can travel through is
// pinned to the files allowed to use it, and each guard that keeps those
// writers off native must still be in its file. A new caller or a moved guard
// fails here, and the key has to be re-verified before it stays web-only.
// Removals are not writers: forgetting a value can never need a restore.

const sources = import.meta.glob<string>(
  ['../**/*.svelte', '../**/*.ts', '../**/*.html', '!../**/*.d.ts', '!../**/*.test.ts'],
  { eager: true, query: '?raw', import: 'default' }
);

const REGISTRY = 'lib/storageKeys.ts';
const INSTALL = 'lib/state/install.svelte.ts';
const INSTALL_BANNER = 'lib/components/InstallBanner.svelte';
const SETUP_INSTRUCTIONS = 'lib/components/settings/SetupInstructions.svelte';
const WEB_ONLY_SERVICES = 'lib/boot/webOnlyServices.ts';
const SESSION_COUNTERS = 'lib/state/sessionCounters.svelte.ts';
const WEB_INSTALLATION_ID = 'lib/state/webInstallationId.ts';
const FREE_GENERATIONS = 'lib/state/freeGenerations.svelte.ts';
const FOLDER_SAVE = 'lib/drawing/folderSave.ts';
const SAVE_FOLDER_STATE = 'lib/state/saveFolder.svelte.ts';
const SECURE_STORAGE = 'lib/secureStorage.ts';

type StorageKeyName = keyof typeof STORAGE_KEYS;

interface WebOnlyFamily {
  keys: readonly StorageKeyName[];
  // Each identifier or literal a write reaches the keys through, and every file allowed to name it.
  reachedThrough: Readonly<Record<string, readonly string[]>>;
  // Source that keeps those writers off native, and must stay in its file.
  guards: readonly (readonly [file: string, guard: string | RegExp])[];
}

const FAMILIES: Readonly<Record<string, WebOnlyFamily>> = {
  // The prompt's mode starts at 'none' and only its init and browser install
  // events move it, all compiled or guarded out of native. Every write waits on
  // a live prompt, a mode other than 'none', or the banner that mode shows.
  'PWA install prompt': {
    keys: [
      'installDismissed',
      'installCompleted',
      'installRepromptsUsed',
      'installRepromptSessionCount',
    ],
    reachedThrough: {
      'STORAGE_KEYS.installDismissed': [INSTALL],
      'STORAGE_KEYS.installCompleted': [INSTALL],
      'STORAGE_KEYS.installRepromptsUsed': [INSTALL],
      'STORAGE_KEYS.installRepromptSessionCount': [SESSION_COUNTERS],
      "'installReprompt'": [SESSION_COUNTERS, INSTALL],
      dismissInstall: [INSTALL, INSTALL_BANNER],
      autoDismissInstallIfDue: [INSTALL, INSTALL_BANNER],
      promptInstall: [INSTALL, INSTALL_BANNER, SETUP_INSTRUCTIONS],
      markInstalled: [INSTALL],
      captureInstallPrompt: [INSTALL],
      recordInstallRepromptSession: [INSTALL, WEB_ONLY_SERVICES],
      initInstallPrompt: [INSTALL, WEB_ONLY_SERVICES],
    },
    guards: [
      [INSTALL, 'if (!browser || initialized || (__IS_CAPACITOR__ && isNative())) return;'],
      [INSTALL, 'if (!__IS_CAPACITOR__ && browser && !listening) {'],
      [INSTALL, "if (s.installed || s.mode === 'none') return;"],
      [INSTALL_BANNER, "installState.mode !== 'none' &&"],
    ],
  },
  // Native identifies the installation by Device.getId() and returns before
  // the web identity is ever derived.
  'free-generation installation': {
    keys: ['freeGenerationInstallation'],
    reachedThrough: {
      'STORAGE_KEYS.freeGenerationInstallation': [WEB_INSTALLATION_ID],
      webInstallationId: [WEB_INSTALLATION_ID, FREE_GENERATIONS],
    },
    guards: [
      [
        FREE_GENERATIONS,
        /if \(__IS_CAPACITOR__\) \{[^}]*\}[^}]*Device\.getId\(\)[^}]*\}\s*return webInstallationId\(\);/,
      ],
    ],
  },
  // Only a File System Access directory pick sets the flag, and no WebView the
  // native apps ship in exposes the picker (docs/COMPATIBILITY.md). The flag
  // points at an IndexedDB row an eviction would take with it anyway.
  'save folder': {
    keys: ['saveFolderChosen'],
    reachedThrough: {
      'STORAGE_KEYS.saveFolderChosen': [FOLDER_SAVE],
      chooseSaveFolder: [FOLDER_SAVE, SAVE_FOLDER_STATE],
    },
    guards: [
      [
        FOLDER_SAVE,
        /export async function chooseSaveFolder\(\)[^{]*\{\s*if \(!folderSaveSupported\(\)\) return null;/,
      ],
      [FOLDER_SAVE, "return browser && 'showDirectoryPicker' in window;"],
    ],
  },
  // The list is recorded only by the web vault's load, which selectBackend
  // hands out after native has already returned its own backend.
  'secure vault': {
    keys: ['secureVaultEmpty'],
    reachedThrough: { 'STORAGE_KEYS.secureVaultEmpty': [SECURE_STORAGE] },
    guards: [
      [
        SECURE_STORAGE,
        /function noteSecretAbsent\(name: SecretName\) \{[^}]*writeString\(STORAGE_KEYS\.secureVaultEmpty/,
      ],
      [SECURE_STORAGE, /if \(row === undefined\) noteSecretAbsent\(name\);/],
      [
        SECURE_STORAGE,
        /async function webLoad\(name: SecretName\) \{[^}]*await noteSecretAbsentUnlessSaved\(name\);/,
      ],
      [
        SECURE_STORAGE,
        /if \(__IS_CAPACITOR__ && isNative\(\)\) \{[\s\S]*?\n {2}\}\n {2}return \{ save: webSave, load: webLoad, clear: webClear \};/,
      ],
    ],
  },
};

// Vite keys a glob match relative to this file: `./x` here in lib/, `../x` above it.
const sourcesBySrcPath = new Map(
  Object.entries(sources).map(([path, source]) => [
    path.startsWith('./') ? `lib/${path.slice('./'.length)}` : path.slice('../'.length),
    source,
  ])
);

function sourceOf(file: string): string {
  const source = sourcesBySrcPath.get(file);
  expect(source, `${file} exists`).toBeTypeOf('string');
  return source ?? '';
}

function filesNaming(token: string): string[] {
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`(?<![\\w$])${escaped}(?![\\w$])`);
  return [...sourcesBySrcPath]
    .filter(([path, source]) => path !== REGISTRY && pattern.test(source))
    .map(([path]) => path)
    .sort();
}

const familyEntries = Object.entries(FAMILIES);

it('covers exactly the web-only keys', () => {
  const covered = familyEntries.flatMap(([, family]) =>
    family.keys.map((name) => STORAGE_KEYS[name])
  );
  expect([...covered].sort()).toEqual([...WEB_ONLY_STORAGE_KEYS].sort());
});

describe.each(familyEntries)('web-only %s writers', (_family, { keys, reachedThrough, guards }) => {
  it('scans every key by its registry name', () => {
    expect(Object.keys(reachedThrough)).toEqual(
      expect.arrayContaining(keys.map((name) => `STORAGE_KEYS.${name}`))
    );
  });

  it.each(keys)('names %s only through the registry', (name) => {
    expect(filesNaming(STORAGE_KEYS[name])).toEqual([]);
  });

  it.each(Object.entries(reachedThrough))('confines %s to its known files', (token, files) => {
    expect(filesNaming(token)).toEqual([...files].sort());
  });

  it.each(guards)('keeps a native guard in %s (%#)', (file, guard) => {
    expect(sourceOf(file)).toMatch(guard);
  });
});
