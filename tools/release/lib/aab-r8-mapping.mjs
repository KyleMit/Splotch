import { readEntry } from './zip.mjs';

const R8_MAPPING_ENTRY = 'BUNDLE-METADATA/com.android.tools.build.obfuscation/proguard.map';

export function readAabR8Metadata(aabPath) {
  const mapping = readEntry(aabPath, R8_MAPPING_ENTRY).toString('utf8');
  const compiler = mapping.match(/^# compiler: (\S+)$/m)?.[1];
  const compilerVersion = mapping.match(/^# compiler_version: (\S+)$/m)?.[1];
  if (compiler !== 'R8' || !compilerVersion || !/^\S+ -> \S+:$/m.test(mapping)) {
    throw new Error(
      `${aabPath}: missing R8 compiler metadata or class mappings in ${R8_MAPPING_ENTRY}`
    );
  }
  return { compilerVersion };
}
