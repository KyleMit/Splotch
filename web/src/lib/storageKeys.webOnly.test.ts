// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { STORAGE_KEYS, WEB_ONLY_STORAGE_KEYS } from './storageKeys';

// Native durable hydration skips WEB_ONLY_STORAGE_KEYS (storage.ts), so a value
// native wrote under one of them would be gone after a WebView eviction. That
// is safe only while no writer of those keys runs on native, and this scan
// holds that claim to the source in three ways:
//   - every name a write can travel through (the key, and each function or
//     alias that writes it) is counted per file, so a new write, caller, or
//     file fails;
//   - each call into a module-private writing function is counted too;
//   - each guard that keeps those writers off native must still be in its file.
// It reads text, not control flow, and a comment naming a writer counts. A
// changed count means the new site has to be checked against the family's
// guards before the number moves, and the key re-verified before it stays
// web-only. Removals are not writers: forgetting a value can never need a
// restore.

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
const SECURE_STORAGE = 'lib/secureStorage.ts';

type StorageKeyName = keyof typeof STORAGE_KEYS;

interface WebOnlyFamily {
  keys: readonly StorageKeyName[];
  // Each name a write reaches the keys through: how often each file may use it.
  reachedThrough: Readonly<Record<string, Readonly<Record<string, number>>>>;
  // Calls into module-private writing functions, whose names are too common to count by name.
  privateCalls: readonly (readonly [file: string, call: RegExp, count: number])[];
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
      'STORAGE_KEYS.installDismissed': { [INSTALL]: 3 },
      'STORAGE_KEYS.installCompleted': { [INSTALL]: 4 },
      'STORAGE_KEYS.installRepromptsUsed': { [INSTALL]: 4 },
      'STORAGE_KEYS.installRepromptSessionCount': { [SESSION_COUNTERS]: 1 },
      "'installReprompt'": { [SESSION_COUNTERS]: 2, [INSTALL]: 4 },
      dismissInstall: { [INSTALL]: 3, [INSTALL_BANNER]: 2 },
      autoDismissInstallIfDue: { [INSTALL]: 3, [INSTALL_BANNER]: 2 },
      promptInstall: { [INSTALL]: 4, [INSTALL_BANNER]: 3, [SETUP_INSTRUCTIONS]: 2 },
      markInstalled: { [INSTALL]: 8 },
      captureInstallPrompt: { [INSTALL]: 6 },
      recordInstallRepromptSession: { [INSTALL]: 5, [WEB_ONLY_SERVICES]: 2 },
      initInstallPrompt: { [INSTALL]: 4, [WEB_ONLY_SERVICES]: 2 },
    },
    privateCalls: [
      [INSTALL, /\bdismiss\(\);/g, 2],
      [SESSION_COUNTERS, /\bwrite(?:Bool|String|Int)\(/g, 1],
    ],
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
      'STORAGE_KEYS.freeGenerationInstallation': { [WEB_INSTALLATION_ID]: 2 },
      webInstallationId: { [WEB_INSTALLATION_ID]: 1, [FREE_GENERATIONS]: 3 },
    },
    privateCalls: [],
    guards: [
      [
        FREE_GENERATIONS,
        /if \(__IS_CAPACITOR__\) \{[^}]*\}[^}]*Device\.getId\(\)[^}]*\}\s*return webInstallationId\(\);/,
      ],
    ],
  },
  // The list is recorded only by the web vault's load, which selectBackend
  // hands out after native has already returned its own backend.
  'secure vault': {
    keys: ['secureVaultEmpty'],
    reachedThrough: { 'STORAGE_KEYS.secureVaultEmpty': { [SECURE_STORAGE]: 4 } },
    privateCalls: [
      [SECURE_STORAGE, /\bnoteSecretAbsent\(name\)/g, 1],
      [SECURE_STORAGE, /\bnoteSecretAbsentUnlessSaved\(name\)/g, 1],
      [SECURE_STORAGE, /\bload: webLoad\b/g, 1],
    ],
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

// How often each file outside the registry names `token` as a whole word.
function occurrencesByFile(token: string): Record<string, number> {
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`(?<![\\w$])${escaped}(?![\\w$])`, 'g');
  return Object.fromEntries(
    [...sourcesBySrcPath]
      .filter(([path]) => path !== REGISTRY)
      .map(([path, source]) => [path, source.match(pattern)?.length ?? 0] as const)
      .filter(([, count]) => count > 0)
  );
}

const familyEntries = Object.entries(FAMILIES);

it('covers exactly the web-only keys', () => {
  const covered = familyEntries.flatMap(([, family]) =>
    family.keys.map((name) => STORAGE_KEYS[name])
  );
  expect([...covered].sort()).toEqual([...WEB_ONLY_STORAGE_KEYS].sort());
});

describe.each(familyEntries)(
  'web-only %s writers',
  (_family, { keys, reachedThrough, privateCalls, guards }) => {
    it('scans every key by its registry name', () => {
      expect(Object.keys(reachedThrough)).toEqual(
        expect.arrayContaining(keys.map((name) => `STORAGE_KEYS.${name}`))
      );
    });

    it.each(keys)('names %s only through the registry', (name) => {
      expect(occurrencesByFile(STORAGE_KEYS[name])).toEqual({});
    });

    it.each(Object.entries(reachedThrough))('confines %s to its known uses', (token, uses) => {
      expect(occurrencesByFile(token)).toEqual(uses);
    });

    it.each(privateCalls)('counts the calls in %s matching %s', (file, call, count) => {
      expect(sourceOf(file).match(call) ?? []).toHaveLength(count);
    });

    it.each(guards)('keeps a native guard in %s (%#)', (file, guard) => {
      expect(sourceOf(file)).toMatch(guard);
    });
  }
);
