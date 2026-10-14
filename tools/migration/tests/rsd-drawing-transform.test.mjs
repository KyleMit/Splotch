import { spawnSync } from 'node:child_process';
import {
  cpSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
const root = realpathSync(join(import.meta.dirname, '../../..'));
const candidate = join(root, 'experiments/native-architecture');
const fixtures = [];
// The Babel transform reads only JavaScript sources; in-tree native builds leave gigabytes here,
// and native:web:build leaves its export under dist/.
const NATIVE_PROJECT_ROOTS = /^(?:android|ios|dist)(?:\/|$)/;
function fixture() {
  const path = realpathSync(mkdtempSync(join(tmpdir(), 'splotch-rsd-transform-')));
  fixtures.push(path);
  cpSync(candidate, path, {
    recursive: true,
    filter: (path) =>
      !path.includes('/node_modules') &&
      !path.includes('/.expo') &&
      !NATIVE_PROJECT_ROOTS.test(relative(candidate, path)),
  });
  symlinkSync(join(root, 'node_modules'), join(path, 'node_modules'));
  return path;
}
// Each case copies the project and Babel-transforms the whole mounted screen in a child process:
// under a full parallel suite that outlasts Vitest's default 5s, so the case waits as long as
// the child is allowed to run.
const TRANSFORM_TIMEOUT_MS = 20_000;
vi.setConfig({ testTimeout: TRANSFORM_TIMEOUT_MS });
function run(path) {
  return spawnSync(process.execPath, [join(path, 'scripts/check-rsd-transform.cjs')], {
    cwd: path,
    encoding: 'utf8',
    timeout: TRANSFORM_TIMEOUT_MS,
    maxBuffer: 2 * 1024 * 1024,
  });
}
afterEach(() => fixtures.splice(0).forEach((path) => rmSync(path, { recursive: true })));
it('transforms the canonical mounted RSD screen, native adapters and actual released renderer', () => {
  const result = run(fixture());
  expect(result.status, result.stderr).toBe(0);
  expect(JSON.parse(result.stdout)).toMatchObject({
    canonicalEntry: true,
    mountedRsdSource: true,
    optionalBrushSwitches: 3,
    optionalBrushLabels: ['Crayon', 'Magic Brush', 'Eraser'],
    adaptiveToolbarSwitch: true,
    preservedSettingsSwitches: 0,
  });
});
it.each([
  ['package.json', '"main": "src/index.ts"', '"main": "src/Other.ts"', 'Canonical RSD entry'],
  [
    'src/index.ts',
    'registerRootComponent(ProbeApp)',
    'registerRootComponent(OtherApp)',
    'Canonical registration',
  ],
  ['src/ProbeApp.tsx', '<RsdDrawingScreen />', '<DrawingScreen />', 'Mounted RSD screen'],
  [
    'src/ProbeApp.tsx',
    '<ShippingFontGate>\n          <RsdDrawingScreen />\n        </ShippingFontGate>',
    '<RsdDrawingScreen />',
    'Font-gated screen',
  ],
  ['src/rsdDrawing/RsdEdgeControls.tsx', 'role="radiogroup"', 'role="group"', 'RSD radio group'],
  [
    'src/rsdDrawing/NativePaper.tsx',
    "from 'react-native'",
    "from 'foreign-native'",
    'Native adapter import removed',
  ],
])('rejects actual %s mutation for %s', (file, before, after, reason) => {
  const path = fixture();
  const target = join(path, file);
  const original = readFileSync(target, 'utf8');
  expect(original).toContain(before);
  writeFileSync(target, original.replace(before, after));
  const result = run(path);
  expect(result.status).toBe(1);
  expect(result.stderr).toContain(reason);
});
it('rejects the actual preset leaving RSD JSX untransformed', () => {
  const path = fixture();
  writeFileSync(
    join(path, 'babel.config.cjs'),
    "module.exports={plugins:[['@babel/plugin-transform-typescript',{isTSX:true}]]};"
  );
  const result = run(path);
  expect(result.status).toBe(1);
  expect(result.stderr).toContain('RSD Babel left JSX');
});

it('rejects a comment marker instead of actual canonical registration', () => {
  const path = fixture();
  const target = join(path, 'src/index.ts');
  writeFileSync(
    target,
    readFileSync(target, 'utf8').replace(
      'registerRootComponent(ProbeApp);',
      'registerRootComponent(OtherApp); // registerRootComponent(ProbeApp);'
    )
  );
  const result = run(path);
  expect(result.status).toBe(1);
  expect(result.stderr).toContain('Canonical registration');
});

// Settings switches are section toggle rows; a selected action switch returning to the dialog fails.
it.each([
  [
    '<RsdAction label="Try saving settings again" onClick={onRetry} />',
    '<RsdAction label="Try saving settings again" selection="switch" selected={settings.saveOnDeleteEnabled} onClick={onRetry} />',
    'RSD switch state callers',
  ],
])('rejects the actual Settings switch mutation for %s', (before, after, reason) => {
  const path = fixture();
  const target = join(path, 'src/rsdDrawing/RsdSettingsDialog.tsx');
  const original = readFileSync(target, 'utf8');
  expect(original.split(before)).toHaveLength(2);
  writeFileSync(target, original.replace(before, after));
  const result = run(path);
  expect(result.status).toBe(1);
  expect(result.stderr).toContain(reason);
});

it.each([
  [
    'src/settings/brushPreferences.ts',
    "['crayon', 'magic', 'eraser']",
    "['crayon', 'magic']",
    'RSD optional brush set',
  ],
  [
    'src/settings/brushPreferences.ts',
    "['crayon', 'magic', 'eraser']",
    "['pen', 'crayon', 'magic', 'eraser']",
    'RSD optional brush set',
  ],
  [
    'src/settings/brushPreferences.ts',
    'optional.length === 0',
    'optional.length === 2',
    'RSD brush control 0 optional policy',
  ],
  [
    'src/settings/brushPreferences.ts',
    'optional.length === 1',
    'optional.length === 2',
    'RSD brush control 1 optional policy',
  ],
  [
    'src/settings/brushPreferences.ts',
    "kind: 'menu', brushes: availableBrushes(availability)",
    "kind: 'none', brushes: availableBrushes(availability)",
    'RSD brush control many optional policy',
  ],
  [
    'src/drawing/brushes.ts',
    "magic: { label: 'Magic Brush'",
    "magic: { label: 'Crayon'",
    'RSD optional brush labels',
  ],
  [
    'src/rsdDrawing/RsdActionsPanel.tsx',
    "control.kind === 'toggle'",
    "control.kind === 'menu'",
    'RSD optional toolbar switch branch',
  ],
  [
    'src/rsdDrawing/RsdActionsPanel.tsx',
    'selected={screen.brush === control.brush}',
    'selected={control.brush === control.brush}',
    'RSD optional toolbar switch state owner',
  ],
  [
    'src/rsdDrawing/RsdActionsPanel.tsx',
    'label={BRUSH_MENU_OPTIONS[control.brush].label}',
    'label={BRUSH_MENU_OPTIONS[screen.brush].label}',
    'RSD optional toolbar switch labels',
  ],
  [
    'src/rsdDrawing/RsdActionsPanel.tsx',
    'onPress={screen.toggleBrush}',
    'onPress={screen.undo}',
    'RSD optional toolbar switch callback',
  ],
  [
    'src/rsdDrawing/RsdSettingsRoute.tsx',
    'brushState={screen.brushPreferences}',
    'brushState={sound.settings}',
    'RSD brush settings mount owner: brushState',
  ],
  [
    'src/rsdDrawing/RsdSettingsRoute.tsx',
    'onBrushAvailabilityChange={screen.setBrushAvailable}',
    'onBrushAvailabilityChange={screen.setBrush}',
    'RSD brush settings mount owner: onBrushAvailabilityChange',
  ],
  [
    'src/rsdDrawing/RsdSettingsRoute.tsx',
    'onRetryBrushSave={screen.retryBrushSave}',
    'onRetryBrushSave={screen.undo}',
    'RSD brush settings mount owner: onRetryBrushSave',
  ],
])('rejects actual optional-brush mutation in %s for %s', (file, before, after, reason) => {
  const path = fixture();
  const target = join(path, file);
  const original = readFileSync(target, 'utf8');
  expect(original.split(before)).toHaveLength(2);
  writeFileSync(target, original.replace(before, after));
  const result = run(path);
  expect(result.status, result.stderr).toBe(1);
  expect(result.stderr).toContain(reason);
});

it('rejects actual Babel output losing the optional toolbar switch selected state', () => {
  const path = fixture();
  writeFileSync(
    join(path, 'babel.config.cjs'),
    `
module.exports = function(api) {
  api.cache(true);
  return {
    presets: [require.resolve('babel-preset-expo')],
    plugins: [function() {
      return { visitor: { Program: { exit(program) {
        program.traverse({ ObjectExpression(path) {
          const properties = path.node.properties;
          const property = (name) => properties.find((item) =>
            item.type === 'ObjectProperty' && !item.computed && item.key.type === 'Identifier' && item.key.name === name);
          const selection = property('selection');
          const selected = property('selected');
          const value = selected && selected.value;
          if (selection && selection.value.type === 'StringLiteral' && selection.value.value === 'switch' &&
              value && value.type === 'BinaryExpression') {
            selected.value = { type: 'BooleanLiteral', value: false };
          }
        }});
      }}}};
    }],
  };
};`
  );
  const result = run(path);
  expect(result.status, result.stderr).toBe(1);
  expect(result.stderr).toContain('RSD transformed optional toolbar switch state owner');
});
