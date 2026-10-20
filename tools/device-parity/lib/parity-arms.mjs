// The builds a parity run compares, read from an --arms-file manifest:
// {
//   "<tag>": {
//     "kind": "native" | "webview-reference",
//     "bundleId": "...", "sourceSha": "...",
//     "ios": { "app": "<path to .app>", "digest": "<sha256>" },
//     "android": { "apk": "<path>", "digest": "<sha256>", "activity": "<pkg>/<activity>" },
//     "aliases": { "<shipping accessible name>": "<this arm's name>" }
//   }
// }
// `webview-reference` is the shipping Capacitor WebView build the native build is measured against;
// the drivers branch on it where that build's accessibility tree or settings differ.
import { readFileSync } from 'node:fs';

const ARM_KINDS = ['native', 'webview-reference'];
const BUILD_FIELDS = { ios: ['app', 'digest'], android: ['apk', 'digest', 'activity'] };

function requireString(value, where) {
  if (typeof value !== 'string' || !value) throw new Error(`${where} must be a non-empty string`);
}

function validateArm(tag, arm, path) {
  const where = `${path}: arm "${tag}"`;
  if (!ARM_KINDS.includes(arm?.kind)) {
    throw new Error(`${where} kind must be ${ARM_KINDS.join(' or ')}`);
  }
  requireString(arm.bundleId, `${where} bundleId`);
  requireString(arm.sourceSha, `${where} sourceSha`);
  for (const [platform, fields] of Object.entries(BUILD_FIELDS)) {
    if (arm[platform] === undefined) continue;
    for (const field of fields) {
      requireString(arm[platform][field], `${where} ${platform}.${field}`);
    }
  }
  for (const [key, name] of Object.entries(arm.aliases ?? {})) {
    requireString(name, `${where} alias ${key}`);
  }
  return { tag, aliases: {}, ...arm };
}

export function readArmsManifest(path) {
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    throw new Error(`${path}: not a readable arms manifest (${error.message})`, {
      cause: error,
    });
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${path}: an arms manifest is an object keyed by arm tag`);
  }
  return Object.fromEntries(
    Object.entries(parsed).map(([tag, arm]) => [tag, validateArm(tag, arm, path)])
  );
}

export function selectArms(manifest, tags, platform) {
  return tags.map((tag) => {
    const arm = manifest[tag];
    if (!arm) {
      throw new Error(`no arm "${tag}" in the arms manifest (has ${Object.keys(manifest)})`);
    }
    if (!arm[platform]) throw new Error(`arm "${tag}" has no ${platform} build in the manifest`);
    return arm;
  });
}
