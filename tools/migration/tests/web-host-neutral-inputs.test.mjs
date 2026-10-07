import { copiedBuildEnvironment } from '../lib/web-host-build.mjs';
import { parseWebHostArgs } from '../build-web-host.mjs';
import { PINNED_BUILD_METADATA_ENV } from '../../../web/buildVersion.ts';
import { PINNED_APP_SHELL_NONCE_ENV } from '../../../web/appShellBuildNonce.ts';
import { afterEach, expect, it } from 'vitest';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  WEB_HOST_NEUTRAL_COPY_ROLE,
  WEB_HOST_NEUTRAL_COPY_ROLES,
  WEB_HOST_REACT_OUTPUT_PATHS,
  assertWebHostVariant,
} from '../../../migration/probes/web-host/host/contract.ts';
import { createOwnedArtifact } from '../lib/web-host-ownership.mjs';
import { fileInventory } from '../lib/web-host-files.mjs';
import {
  captureInputBindings,
  withGeneratedInputs,
  assertCopyInputs,
  assertFinalInputBindings,
  freezeCopyInputs,
  freezeReactSourceInputs,
  freezeReactRendererInputs,
} from '../lib/web-host-inputs.mjs';

const roots = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
function write(root, path, bytes) {
  mkdirSync(join(root, path, '..'), { recursive: true });
  writeFileSync(join(root, path), bytes);
}
function neutralPreparationFixture() {
  const parent = realpathSync(mkdtempSync(join(tmpdir(), 'splotch-neutral-inputs-')));
  roots.push(parent);
  const owned = createOwnedArtifact(parent);
  for (const role of WEB_HOST_NEUTRAL_COPY_ROLES) {
    const copy = join(owned.root, role);
    write(copy, 'main.ts', 'export const input = true;');
    write(copy, 'node_modules/fixture/main.cjs', 'module.exports = true;');
  }
  const snapshot = {
    entries: fileInventory(join(owned.root, 'control'))
      .filter((row) => row.path === 'main.ts')
      .map((row) => ({
        path: row.path,
        sha256: row.sha256,
        executable: !!(row.mode & 0o111),
        link: row.link,
      })),
  };
  const bindings = captureInputBindings(owned, snapshot, 'neutral-embedded');
  return { owned, copy: join(owned.root, WEB_HOST_NEUTRAL_COPY_ROLE), bindings };
}

function writeRendererFixture(fixture) {
  write(fixture.copy, WEB_HOST_REACT_OUTPUT_PATHS[0], 'export const renderer = true;');
  write(fixture.copy, WEB_HOST_REACT_OUTPUT_PATHS[1], '{"fixture":"graph"}');
}

it('keeps neutral input roles closed and refuses compiled output before real source freezing', () => {
  const fixture = neutralPreparationFixture();
  expect(Object.keys(fixture.bindings.roles)).toEqual([...WEB_HOST_NEUTRAL_COPY_ROLES]);
  expect(() =>
    assertCopyInputs(fixture.owned, fixture.bindings, WEB_HOST_NEUTRAL_COPY_ROLE)
  ).not.toThrow();
  const omitted = { ...fixture.bindings, roles: { ...fixture.bindings.roles } };
  delete omitted.roles.neutral;
  expect(() => assertCopyInputs(fixture.owned, omitted, 'control')).toThrow(/Malformed copy roles/);
  const added = { ...fixture.bindings, roles: { ...fixture.bindings.roles, extra: {} } };
  expect(() => assertCopyInputs(fixture.owned, added, 'control')).toThrow(/Malformed copy roles/);
  writeRendererFixture(fixture);
  expect(() =>
    assertCopyInputs(fixture.owned, fixture.bindings, WEB_HOST_NEUTRAL_COPY_ROLE)
  ).toThrow(/React output appeared before source freezing/);
});

it('freezes real neutral source before compilation and exact renderer bytes before later use', () => {
  const fixture = neutralPreparationFixture();
  let bindings = withGeneratedInputs(fixture.bindings, ['web/generated.ts']);
  for (const role of WEB_HOST_NEUTRAL_COPY_ROLES)
    write(join(fixture.owned.root, role), 'web/generated.ts', 'export const generated = true;');
  bindings = freezeReactSourceInputs(fixture.owned, bindings);
  expect(() => freezeReactRendererInputs(fixture.owned, bindings)).toThrow(
    /exact two owned renderer outputs/
  );
  writeRendererFixture(fixture);
  bindings = freezeReactRendererInputs(fixture.owned, bindings);
  expect(() => assertCopyInputs(fixture.owned, bindings, WEB_HOST_NEUTRAL_COPY_ROLE)).not.toThrow();
  for (const role of WEB_HOST_NEUTRAL_COPY_ROLES)
    bindings = freezeCopyInputs(fixture.owned, bindings, role);
  expect(() => assertFinalInputBindings(fixture.owned, bindings)).not.toThrow();
  write(fixture.copy, 'web/generated.ts', 'export const generated = false;');
  expect(() => assertFinalInputBindings(fixture.owned, bindings)).toThrow(
    /React preparation source changed/
  );
});

it.each(WEB_HOST_REACT_OUTPUT_PATHS)(
  'rejects changed renderer bytes and modes through the actual bound reader for %s',
  (path) => {
    const fixture = neutralPreparationFixture();
    let bindings = freezeReactSourceInputs(fixture.owned, fixture.bindings);
    writeRendererFixture(fixture);
    bindings = freezeReactRendererInputs(fixture.owned, bindings);
    expect(() =>
      assertCopyInputs(fixture.owned, bindings, WEB_HOST_NEUTRAL_COPY_ROLE)
    ).not.toThrow();
    const bytes = readFileSync(join(fixture.copy, path));
    writeFileSync(join(fixture.copy, path), 'changed renderer input');
    expect(() => assertCopyInputs(fixture.owned, bindings, WEB_HOST_NEUTRAL_COPY_ROLE)).toThrow(
      /Bound React renderer changed/
    );
    writeFileSync(join(fixture.copy, path), bytes);
    chmodSync(join(fixture.copy, path), 0o755);
    expect(() => assertCopyInputs(fixture.owned, bindings, WEB_HOST_NEUTRAL_COPY_ROLE)).toThrow(
      /Bound React renderer changed/
    );
  }
);

it('keeps the paired nonce in calibration copies and omits it only from the neutral child', () => {
  const { owned } = neutralPreparationFixture();
  const pinned = {
    [PINNED_BUILD_METADATA_ENV]: 'metadata',
    [PINNED_APP_SHELL_NONCE_ENV]: '806d050f-45b0-4419-9997-0a0065232d26',
  };
  const before = { ...pinned };
  const environments = ['reference', 'control', 'neutral'].map((role) =>
    copiedBuildEnvironment(owned, join(owned.root, role), 'release', pinned, {
      variant: role === 'neutral' ? 'neutral-embedded' : 'retained-control',
      artifact: 'release',
      fixture: 'matching',
    })
  );
  expect(environments.map((env) => env[PINNED_APP_SHELL_NONCE_ENV])).toEqual([
    pinned[PINNED_APP_SHELL_NONCE_ENV],
    pinned[PINNED_APP_SHELL_NONCE_ENV],
    undefined,
  ]);
  expect(environments.map((env) => env[PINNED_BUILD_METADATA_ENV])).toEqual([
    'metadata',
    'metadata',
    'metadata',
  ]);
  expect(pinned).toEqual(before);
});

it('rejects unknown flags and distinguishes closed variant, fixture and artifact requests', () => {
  expect(parseWebHostArgs(['--artifact=mechanism', '--provisional']).artifact).toBe('mechanism');
  expect(parseWebHostArgs([]).artifact).toBe('release');
  expect(parseWebHostArgs(['--variant=neutral-embedded'])).toMatchObject({
    variant: 'neutral-embedded',
    artifact: 'release',
    fixture: 'matching',
  });
  expect(
    parseWebHostArgs([
      '--variant=neutral-embedded',
      '--artifact=mechanism',
      '--fixture=text-mismatch',
    ])
  ).toMatchObject({ variant: 'neutral-embedded', artifact: 'mechanism', fixture: 'text-mismatch' });
  expect(() => parseWebHostArgs(['--variant=neutral-embedded', '--fixture=text-mismatch'])).toThrow(
    /Release refuses/
  );
  expect(() => parseWebHostArgs(['--fixture=text-mismatch'])).toThrow(/Retained control/);
  expect(() => parseWebHostArgs(['--variant=other'])).toThrow(/Unsupported web-host variant/);
  expect(() => parseWebHostArgs(['--artfact=release'])).toThrow();
  expect(() => parseWebHostArgs(['--artifact=fast'])).toThrow(/release or mechanism/);
});

it('keeps the shipping pin variant guard retained-only while accepting a neutral request', () => {
  expect(() => assertWebHostVariant('retained-control')).not.toThrow();
  expect(() => assertWebHostVariant('neutral-embedded')).toThrow(/Only retained-control/);
  expect(parseWebHostArgs(['--variant=neutral-embedded']).variant).toBe('neutral-embedded');
});
