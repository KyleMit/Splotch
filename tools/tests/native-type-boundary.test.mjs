import { join } from 'node:path';
import ts from 'typescript';
import { expect, it } from 'vitest';

const ROOT = join(import.meta.dirname, '../..');
const PROBE_PATH = join(ROOT, 'src/__native_type_probe__.ts');
const rawImport = (specifier) => `import raw ${'from'} '${specifier}';`;
const SOURCE = [
  rawImport('./probe.svg?raw'),
  'void raw;',
  'void import.meta.env.MODE;',
  "void import.meta.glob('./*.ts');",
].join('\n');

function probeDiagnostics(configPath) {
  const config = ts.readConfigFile(join(ROOT, configPath), ts.sys.readFile);
  expect(config.error).toBeUndefined();
  const { options, errors } = ts.parseJsonConfigFileContent(config.config, ts.sys, ROOT);
  expect(errors).toEqual([]);
  const host = ts.createCompilerHost(options);
  const readFile = host.readFile;
  host.readFile = (path) => (path === PROBE_PATH ? SOURCE : readFile(path));
  const program = ts.createProgram([PROBE_PATH], options, host);
  return ts.getPreEmitDiagnostics(program).filter(({ file }) => file?.fileName === PROBE_PATH);
}

it('rejects Vite-only APIs in native code while the shared web configuration recognizes them', () => {
  expect(
    probeDiagnostics('tsconfig.json')
      .map(({ code }) => code)
      .sort()
  ).toEqual([2307, 2339, 2339]);
  expect(probeDiagnostics('tsconfig.shared.json')).toEqual([]);
});
