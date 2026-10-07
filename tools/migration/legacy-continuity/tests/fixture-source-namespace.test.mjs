import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { ROOT } from '../../../lib/proc.mjs';
import { sourceTree } from '../source-inputs.mjs';
import { relocateFixtureOwners, verifyFixtureOwners } from '../fixture-source-namespace.mjs';

const ROUTE = 'web/src/routes/legacy-continuity.html';
const STORAGE = 'web/src/lib/storage.ts';
const SETTINGS = 'web/src/lib/state/settings.svelte.ts';
const MISSING_OWNER_SPECIFIER = './missing-owner';
const MISSING_ASSET_SPECIFIER = './missing.png';
const CAPABILITY = join(ROOT, 'tools/migration/legacy-continuity');
const COMMON_OWNERS = [
  'breakpoints.ts',
  'idb.ts',
  'nativePlugin.ts',
  'platform/index.ts',
  'secureStorage.ts',
  'state/settings.svelte.ts',
  'state/tool.svelte.ts',
  'storage.ts',
  'storageKeys.ts',
  'theme.ts',
];
const READER_OWNERS = [
  ...COMMON_OWNERS,
  'drawing/unsavedPictureStore.ts',
  'idbDatabase.ts',
  'platform/reducedMotion.ts',
  'saveNaming.ts',
  'state/readonlyView.ts',
];
const template = (name) => readFileSync(join(CAPABILITY, 'templates', name), 'utf8');

function inputs() {
  return { role: 'reader', sourceFiles: sourceTree(ROOT, 'HEAD') };
}

function fixtures() {
  return {
    [`${ROUTE}/fixture.ts`]: template('fixture.ts.template'),
    [`${ROUTE}/fixture-config.ts`]: 'export const fixtureConfig = {} as const;\n',
    [`${ROUTE}/held-reader.ts`]: template('held-reader.ts.template'),
    [`${ROUTE}/held-owner.ts`]: template('held-main.ts.template'),
    [`${ROUTE}/settings-parser.ts`]: template('settings-main.ts.template'),
  };
}

function write(path, content) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

function ownedCopy(namespace) {
  const root = mkdtempSync(join(tmpdir(), 'splotch-l0-source-namespace-'));
  for (const owner of namespace.receipt.ownerCopies)
    write(join(root, owner.source), readFileSync(join(ROOT, owner.source)));
  for (const [path, content] of Object.entries(namespace.files)) write(join(root, path), content);
  return root;
}

describe('source-derived fixture bundle boundary', () => {
  it('relocates the current source runtime closure with byte-equivalent bodies', () => {
    const namespace = relocateFixtureOwners(ROOT, inputs(), fixtures());
    const root = ownedCopy(namespace);
    const expected = READER_OWNERS.map((path) => `web/src/lib/${path}`).sort();
    try {
      expect(namespace.receipt.ownerCopies.map((owner) => owner.source).sort()).toEqual(expected);
      expect(() => verifyFixtureOwners(root, namespace)).not.toThrow();
    } finally {
      rmSync(root, { recursive: true });
    }
  });

  it('keeps every real runtime owner and one storage instance while leaving parser activation dynamic', () => {
    const namespace = relocateFixtureOwners(ROOT, inputs(), fixtures());
    const owners = namespace.receipt.ownerCopies;
    const storage = owners.find((owner) => owner.source === STORAGE);
    expect(owners.map((owner) => owner.source)).toEqual(
      expect.arrayContaining([
        STORAGE,
        SETTINGS,
        'web/src/lib/secureStorage.ts',
        'web/src/lib/drawing/unsavedPictureStore.ts',
        'web/src/lib/idbDatabase.ts',
      ])
    );
    const edges = [...owners, ...namespace.receipt.fixtureRewrites].flatMap(
      (value) => value.substitutions
    );
    const storageTargets = edges
      .filter((edge) => edge.runtime && edge.sourceTarget === STORAGE)
      .map((edge) => edge.target);
    expect(storageTargets.length).toBeGreaterThan(3);
    expect([...new Set(storageTargets)]).toEqual([storage.target]);
    expect(
      edges
        .filter((edge) => edge.runtime && edge.sourceTarget === SETTINGS)
        .map((edge) => edge.kind)
    ).toEqual(['dynamic']);
    expect(namespace.files[`${ROUTE}/fixture.ts`]).toContain(
      "registerPlugin<NativeObserver>('LegacyContinuityObserver')"
    );
    expect(
      owners.find((owner) => owner.source.endsWith('/unsavedPictureStore.ts')).recognizerExport
    ).toBe(true);
  });

  it('rejects altered actual owner and copied setter bodies before restoring byte-equivalent outputs', () => {
    const namespace = relocateFixtureOwners(ROOT, inputs(), fixtures());
    const root = ownedCopy(namespace);
    const storage = namespace.receipt.ownerCopies.find((owner) => owner.source === STORAGE);
    const original = readFileSync(join(root, STORAGE), 'utf8');
    const derived = readFileSync(join(root, storage.target), 'utf8');
    const changed = derived.replace("value ? 'true' : 'false'", "value ? 'false' : 'false'");
    expect(changed).not.toBe(derived);
    try {
      writeFileSync(join(root, STORAGE), original + '\n');
      expect(() => verifyFixtureOwners(root, namespace)).toThrow(/SOURCE_CHANGED/);
      writeFileSync(join(root, STORAGE), original);
      writeFileSync(join(root, storage.target), changed);
      expect(() => verifyFixtureOwners(root, namespace)).toThrow(/BODY_CHANGED/);
      writeFileSync(join(root, storage.target), derived);
      expect(() => verifyFixtureOwners(root, namespace)).not.toThrow();
    } finally {
      rmSync(root, { recursive: true });
    }
  });

  it('rejects eager persisted parser activation and restores the delayed real parser', () => {
    const input = inputs();
    const files = fixtures();
    expect(() =>
      relocateFixtureOwners(ROOT, input, {
        ...files,
        [`${ROUTE}/fixture.ts`]:
          files[`${ROUTE}/fixture.ts`] + "\nimport '$lib/state/settings.svelte';\n",
      })
    ).toThrow(/OWNER_PARSE_PHASE/);
    expect(() => relocateFixtureOwners(ROOT, input, files)).not.toThrow();
  });

  it('refuses a dangling real storage owner and restores the complete captured tree', () => {
    const input = inputs();
    expect(() =>
      relocateFixtureOwners(
        ROOT,
        {
          ...input,
          sourceFiles: input.sourceFiles.filter((entry) => entry.path !== STORAGE),
        },
        fixtures()
      )
    ).toThrow(/OWNER_UNRESOLVED/);
    expect(() => relocateFixtureOwners(ROOT, input, fixtures())).not.toThrow();
  });

  it.each([
    'const load = (name: string) => import(name);',
    `import '${MISSING_OWNER_SPECIFIER}';`,
    "import '/missing-owner';",
    "import '#missing-owner';",
    "import '$unknown/owner';",
    `const asset = new URL('${MISSING_ASSET_SPECIFIER}', import.meta.url);`,
    "const files = import.meta.glob('./*.ts');",
  ])('refuses unsupported or unresolved source form %s and restores the real templates', (form) => {
    const input = inputs();
    const files = fixtures();
    expect(() =>
      relocateFixtureOwners(ROOT, input, {
        ...files,
        [`${ROUTE}/fixture.ts`]: files[`${ROUTE}/fixture.ts`] + '\n' + form,
      })
    ).toThrow(/OWNER_(?:IMPORT_UNSUPPORTED|UNRESOLVED|ALIAS_UNSUPPORTED)/);
    expect(() => relocateFixtureOwners(ROOT, input, files)).not.toThrow();
  });
});
