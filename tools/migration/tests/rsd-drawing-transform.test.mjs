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
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
const root = realpathSync(join(import.meta.dirname, '../../..'));
const candidate = join(root, 'experiments/native-architecture');
const fixtures = [];
function fixture() {
  const path = realpathSync(mkdtempSync(join(tmpdir(), 'splotch-rsd-transform-')));
  fixtures.push(path);
  cpSync(candidate, path, {
    recursive: true,
    filter: (path) => !path.includes('/node_modules') && !path.includes('/.expo'),
  });
  symlinkSync(join(root, 'node_modules'), join(path, 'node_modules'));
  return path;
}
function run(path) {
  return spawnSync(process.execPath, [join(path, 'scripts/check-rsd-transform.cjs')], {
    cwd: path,
    encoding: 'utf8',
    timeout: 20000,
    maxBuffer: 2 * 1024 * 1024,
  });
}
afterEach(() => fixtures.splice(0).forEach((path) => rmSync(path, { recursive: true })));
it('transforms the canonical mounted RSD screen, native adapters and actual released renderer', () => {
  const result = run(fixture());
  expect(result.status, result.stderr).toBe(0);
  expect(JSON.parse(result.stdout)).toMatchObject({ canonicalEntry: true, mountedRsdSource: true });
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
  ['src/rsdDrawing/RsdDrawingScreen.tsx', 'role="radiogroup"', 'role="group"', 'RSD radio group'],
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

it('rejects a recovery viewport losing its actual native import', () => {
  const path = fixture();
  const target = join(path, 'src/rsdDrawing/RsdRecoveryNotice.tsx');
  const original = readFileSync(target, 'utf8');
  expect(original).toContain("import { ScrollView } from 'react-native'");
  writeFileSync(
    target,
    original.replace(
      "import { ScrollView } from 'react-native'",
      "import { ScrollView } from 'foreign-native'"
    )
  );
  const result = run(path);
  expect(result.status).toBe(1);
  expect(result.stderr).toContain(
    'Native adapter import removed: src/rsdDrawing/RsdRecoveryNotice.tsx'
  );
});
