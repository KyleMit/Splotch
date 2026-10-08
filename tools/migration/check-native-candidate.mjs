import { realpathSync } from 'node:fs';
import { ROOT, isMain, runMain } from '../lib/proc.mjs';
import { assertNativeSourceContract, NATIVE_CONTRACT } from './lib/native-source-contract.mjs';
import { readExpoSceneSupport } from './lib/native-apple-scene.mjs';
import { readCandidateGemfile } from './lib/native-gemfile.mjs';
import {
  readNativeCandidateRoot,
  readCandidateEntry,
  readMaintainedNativeFiles,
} from './lib/native-source-files.mjs';
import { readTemplateManifest } from './lib/native-template.mjs';

export function runNativeCandidateCheck(argv) {
  if (argv.length) throw new Error('Native source check takes no arguments');
  const root = realpathSync(ROOT);
  const candidate = readNativeCandidateRoot(root);
  const manifest = readTemplateManifest(root);
  const files = readMaintainedNativeFiles(candidate, manifest);
  const { packageManifest, indexSource } = readCandidateEntry(candidate);
  const gemfile = readCandidateGemfile(candidate);
  assertNativeSourceContract(files, packageManifest, indexSource);
  const expoSceneSources = readExpoSceneSupport(
    candidate,
    packageManifest.devDependencies?.expo,
    NATIVE_CONTRACT.module
  );
  return {
    candidate,
    maintainedFiles: files.size,
    template: manifest.template,
    sourceContract: true,
    expoSceneSources,
    gemfile,
  };
}

if (isMain(import.meta.url)) {
  runMain(async () => console.log(JSON.stringify(runNativeCandidateCheck(process.argv.slice(2)))));
}
