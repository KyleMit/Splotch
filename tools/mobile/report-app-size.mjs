// Reports store download size and on-device install size for the shipping app and
// the React Native app on Android and iOS, from release artifacts built beforehand.
// See tools/mobile/README.md for the inputs each platform takes.

import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { parseArgs } from 'node:util';
import { isMain, parseOrFail, ROOT } from '../lib/proc.mjs';
import { ANDROID_HOME } from './android/lib/android-toolchain.mjs';
import {
  APP_LABELS,
  APPS,
  parseBundletoolSizeCsv,
  parseThinningReport,
  PLATFORM_LABELS,
  PLATFORMS,
  renderMarkdown,
  selectThinningVariant,
  thinnedVariantRange,
} from './lib/app-size.mjs';

// The physical Galaxy S21 FE and iPad Pro 12.9" (5th gen) the profiling campaigns use,
// so size numbers line up with the devices every other comparison is measured on.
export const ANDROID_REFERENCE_SPEC = join(ROOT, 'tools/mobile/android-reference-device-spec.json');
export const IOS_REFERENCE_DEVICE = 'iPad13,8';

const THINNING_REPORT_NAME = 'App Thinning Size Report.txt';
const APKANALYZER = join(ANDROID_HOME, 'cmdline-tools', 'latest', 'bin', 'apkanalyzer');
const ENCRYPTION_NOTE =
  'the App Store encrypts the executable before delivery, which compresses worse, so App Store Connect reports a somewhat larger download';

const OPTIONS = {
  'android-shipping': { type: 'string' },
  'android-rn': { type: 'string' },
  'ios-shipping': { type: 'string' },
  'ios-rn': { type: 'string' },
  'android-device-spec': { type: 'string', default: ANDROID_REFERENCE_SPEC },
  'ios-device': { type: 'string', default: IOS_REFERENCE_DEVICE },
  'allow-provisioning-updates': { type: 'boolean', default: false },
  json: { type: 'string' },
};

/** @param {string[]} argv */
export function parseAppSizeArgs(argv) {
  const { values } = parseArgs({
    args: argv,
    options: OPTIONS,
    strict: true,
    allowPositionals: false,
  });
  const inputs = PLATFORMS.flatMap((platform) =>
    APPS.flatMap((app) => {
      const path = values[`${platform}-${app}`];
      return path ? [{ platform, app, path }] : [];
    })
  );
  if (inputs.length === 0) {
    throw new Error(
      'Pass at least one of --android-shipping, --android-rn, --ios-shipping, --ios-rn.'
    );
  }
  for (const { platform, app, path } of inputs) {
    if (!existsSync(path)) throw new Error(`--${platform}-${app}: ${path} does not exist`);
  }
  if (
    inputs.some((input) => input.platform === 'android') &&
    !existsSync(values['android-device-spec'])
  ) {
    throw new Error(`--android-device-spec: ${values['android-device-spec']} does not exist`);
  }
  return {
    inputs,
    androidDeviceSpec: values['android-device-spec'],
    iosDevice: values['ios-device'],
    allowProvisioningUpdates: values['allow-provisioning-updates'],
    json: values.json,
  };
}

/** @param {string} cmd @param {string[]} args */
function capture(cmd, args) {
  const result = spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (result.error) throw new Error(`${cmd} could not start: ${result.error.message}`);
  if (result.status !== 0) {
    throw new Error(
      `${basename(cmd)} ${args[0]} exited ${result.status}:\n${result.stderr || result.stdout}`
    );
  }
  return result.stdout;
}

/** @param {string[]} args */
function bundletool(args) {
  const jar = process.env.BUNDLETOOL_JAR;
  return jar ? capture('java', ['-jar', jar, ...args]) : capture('bundletool', args);
}

/** @param {string} dir */
function directoryBytes(dir) {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .reduce((sum, entry) => sum + statSync(join(entry.parentPath, entry.name)).size, 0);
}

/** @param {string} specPath */
function describeAndroidSpec(specPath) {
  const spec = JSON.parse(readFileSync(specPath, 'utf8'));
  return `API ${spec.sdkVersion}, ${spec.supportedAbis?.[0]}, ${spec.screenDensity} dpi`;
}

/** @param {string} aab @param {string} specPath @param {string} scratch */
function measureAndroidBundle(aab, specPath, scratch) {
  const apks = join(scratch, 'app.apks');
  bundletool(['build-apks', `--bundle=${aab}`, `--output=${apks}`, '--overwrite']);
  const [all] = parseBundletoolSizeCsv(bundletool(['get-size', 'total', `--apks=${apks}`]));
  const [device] = parseBundletoolSizeCsv(
    bundletool(['get-size', 'total', `--apks=${apks}`, `--device-spec=${specPath}`])
  );
  const splits = join(scratch, 'device-splits');
  bundletool([
    'extract-apks',
    `--apks=${apks}`,
    `--output-dir=${splits}`,
    `--device-spec=${specPath}`,
  ]);
  return {
    method: 'bundletool (Play split delivery)',
    device: describeAndroidSpec(specPath),
    download: device.max,
    install: directoryBytes(splits),
    downloadRange: { min: all.min, max: all.max },
    notes: ['install counts the APK splits on disk, not ART-compiled code or app data'],
  };
}

/** @param {string} apk */
function measureUniversalApk(apk) {
  if (!existsSync(APKANALYZER)) throw new Error(`apkanalyzer not found at ${APKANALYZER}`);
  return {
    method: 'apkanalyzer (universal APK)',
    device: 'any (universal APK)',
    download: Number(capture(APKANALYZER, ['apk', 'download-size', apk]).trim()),
    install: statSync(apk).size,
    notes: [
      'a universal APK carries every ABI and density, so it overstates what Play would deliver; build an .aab to compare fairly',
    ],
  };
}

/** @param {string} archive @param {boolean} allowProvisioningUpdates @param {string} scratch */
function exportThinningReport(archive, allowProvisioningUpdates, scratch) {
  const plist = join(scratch, 'ExportOptions.plist');
  writeFileSync(
    plist,
    `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>method</key><string>debugging</string>
<key>signingStyle</key><string>automatic</string>
<key>thinning</key><string>&lt;thin-for-all-variants&gt;</string>
</dict></plist>
`
  );
  const exportPath = join(scratch, 'export');
  try {
    capture('xcodebuild', [
      '-exportArchive',
      '-archivePath',
      archive,
      '-exportPath',
      exportPath,
      '-exportOptionsPlist',
      plist,
      ...(allowProvisioningUpdates ? ['-allowProvisioningUpdates'] : []),
    ]);
  } catch (err) {
    // An app that bundles .metallib shaders (react-native-svg's filters) needs Xcode's
    // separately installed Metal Toolchain to thin them.
    if (err instanceof Error && err.message.includes("Couldn't locate metal-package")) {
      throw new Error(
        `thinning needs Xcode's Metal Toolchain: run \`xcodebuild -downloadComponent MetalToolchain\`, then retry.`,
        { cause: err }
      );
    }
    throw err;
  }
  return readFileSync(join(exportPath, THINNING_REPORT_NAME), 'utf8');
}

/** @param {string} input @param {string} deviceModel @param {boolean} allowProvisioningUpdates @param {string} scratch */
function measureIos(input, deviceModel, allowProvisioningUpdates, scratch) {
  const report = input.endsWith('.xcarchive')
    ? exportThinningReport(input, allowProvisioningUpdates, scratch)
    : readFileSync(input, 'utf8');
  const variants = parseThinningReport(report);
  const variant = selectThinningVariant(variants, deviceModel);
  return {
    method: 'Xcode app thinning',
    device: deviceModel,
    download: variant.compressed,
    install: variant.uncompressed,
    downloadRange: thinnedVariantRange(variants).download,
    notes: [ENCRYPTION_NOTE],
  };
}

/** @param {ReturnType<typeof parseAppSizeArgs>} options @param {{platform: string, app: string, path: string}} input */
function measure(options, { platform, path }) {
  const scratch = mkdtempSync(join(tmpdir(), 'splotch-app-size-'));
  try {
    if (platform === 'ios') {
      return measureIos(path, options.iosDevice, options.allowProvisioningUpdates, scratch);
    }
    return path.endsWith('.apk')
      ? measureUniversalApk(path)
      : measureAndroidBundle(path, options.androidDeviceSpec, scratch);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

/** @param {string[]} argv */
export function reportAppSize(argv) {
  const options = parseOrFail(() => parseAppSizeArgs(argv));
  const results = [];
  const failures = [];
  for (const input of options.inputs) {
    const label = `${PLATFORM_LABELS[input.platform]} ${APP_LABELS[input.app]}`;
    console.error(`Measuring ${label}: ${input.path}`);
    try {
      results.push({
        platform: input.platform,
        app: input.app,
        artifact: input.path,
        ...measure(options, input),
      });
    } catch (err) {
      failures.push(`${label}: ${err instanceof Error ? err.message : err}`);
    }
  }
  if (results.length > 0) console.log(renderMarkdown(results));
  if (options.json && failures.length === 0) {
    writeFileSync(
      options.json,
      `${JSON.stringify({ measuredAt: new Date().toISOString(), results }, null, 2)}\n`
    );
  }
  if (failures.length > 0) {
    console.error(
      `\n${failures.length} measurement(s) failed${options.json ? '; JSON not written' : ''}:`
    );
    for (const failure of failures) console.error(`* ${failure}`);
    process.exitCode = 1;
  }
}

if (isMain(import.meta.url)) reportAppSize(process.argv.slice(2));
