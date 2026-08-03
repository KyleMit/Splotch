// Installs the Linux system libraries Playwright's browsers need, for CI's Ubuntu
// Tests job.
//
// `playwright install-deps webkit` asks for WebKit's full media stack —
// gstreamer1.0-libav and gstreamer1.0-plugins-bad drag in the whole ffmpeg codec
// set plus SDL2, DirectFB, OpenAL and a MIDI soundfont. On a GitHub runner that
// resolves to 181 packages / 114 MB and dominates the job's setup time. Splotch
// draws to a canvas and decodes three short MP3s; it has no <video> and no
// non-MP3 audio, so those decoders are never loaded.
//
// So Chromium keeps Playwright's own dependency list (unmodified — it owns the
// font set the Chromium screenshot baselines were recorded against), and WebKit
// gets the explicit list below instead. verifyWebKitLibraries() then fails the
// install if the WebKit bundle has any unresolved shared library, so a Playwright
// upgrade that adds a dependency breaks here with a package name rather than at
// browser launch.
import { existsSync, openSync, readSync, closeSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { webkit } from 'playwright-core';
import { capture, fail, isMain, run, runMain } from './lib/proc.mjs';

// The browsers this script knows how to satisfy. A browser added to the Tests
// job's PW_BROWSERS without a dependency story here would install its binary and
// then fail to launch, so scripts/tests/install-browser-deps.test.mjs holds the
// two lists together.
export const SUPPORTED_BROWSERS = ['chromium', 'webkit'];

// Every library the WebKit bundle links against that Ubuntu's base runner image
// doesn't already provide. Grouped by what pulls them in.
const WEBKIT_PACKAGES = [
  // WebKit core: text shaping and hyphenation, networking, storage, input,
  // rendering. (The typefaces themselves come with Chromium's list.)
  'libwoff1',
  'libharfbuzz-icu0',
  'libhyphen0',
  'libsoup-3.0-0',
  'libsecret-1-0',
  'libmanette-0.2-0',
  'libgles2',
  'libgraphene-1.0-0',
  'libwayland-server0',
  'libevent-2.1-7t64',
  'libenchant-2-2',
  'libxslt1.1',
  // Image decoders WebKit links directly.
  'libavif16',
  'libjxl0.7',
  'libwebpdemux2',
  'libwebpmux3',
  // The GTK MiniBrowser, used for headed runs.
  'libgtk-4-1',
  // SpeechSynthesis; a hard link-time dependency, not loaded on demand.
  'libflite1',
  // GStreamer. The -gl and -plugins-bad *libraries* are link-time dependencies
  // (libgstgl, libgstcodecparsers); the base + good *plugin* packages supply the
  // MP3 decoder that Web Audio's decodeAudioData needs — without them the decode
  // promise never settles. The plugins-bad and libav plugin packages, which carry
  // the video codecs, are deliberately absent.
  'libgstreamer-gl1.0-0',
  'libgstreamer-plugins-bad1.0-0',
  'gstreamer1.0-plugins-base',
  'gstreamer1.0-plugins-good',
  'libopus0',
];

// Libraries the WebKit bundle references that no Ubuntu package resolves, so
// they are equally unresolved under Playwright's own dependency list and can't
// signal a gap in WEBKIT_PACKAGES:
//   libbacktrace.so.0 — Ubuntu ships libbacktrace as a static library only.
//   libjxl.so.0.8     — libjxl0.7 (the newest Ubuntu builds) provides .so.0.7.
const UNRESOLVED_BY_ANY_PACKAGE = new Set(['libbacktrace.so.0', 'libjxl.so.0.8']);

// The two MiniBrowser builds Playwright ships: WPE serves headless runs, GTK
// headed ones. Each carries its own bundled libraries alongside the executable.
const MINIBROWSER_DIRS = ['minibrowser-wpe', 'minibrowser-gtk'];

const ELF_MAGIC = Buffer.from([0x7f, 0x45, 0x4c, 0x46]);

function isElf(path) {
  let fd;
  try {
    fd = openSync(path, 'r');
  } catch {
    return false;
  }
  try {
    const header = Buffer.alloc(ELF_MAGIC.length);
    return readSync(fd, header, 0, header.length, 0) === header.length && header.equals(ELF_MAGIC);
  } finally {
    closeSync(fd);
  }
}

function* elfFiles(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true, recursive: true })) {
    if (!entry.isFile()) continue;
    const path = join(entry.parentPath, entry.name);
    if (isElf(path)) yield path;
  }
}

// executablePath() points at the bundle's pw_run.sh launcher.
const webkitBundleRoot = () => dirname(webkit.executablePath());

// Resolve each MiniBrowser build against the libraries bundled beside it, the
// way pw_run.sh does, so only genuinely external gaps are reported.
function unresolvedLibraries(bundleRoot) {
  const missing = new Set();
  for (const name of MINIBROWSER_DIRS) {
    const dir = join(bundleRoot, name);
    if (!existsSync(dir)) continue;
    const libraryPath = [join(dir, 'lib'), dir].join(':');
    for (const file of elfFiles(dir)) {
      const output = capture('sh', [
        '-c',
        `LD_LIBRARY_PATH="$1" ldd "$2" || true`,
        'sh',
        libraryPath,
        file,
      ]);
      for (const line of output.split('\n')) {
        const match = /^\s*(\S+) => not found/.exec(line);
        if (match && !UNRESOLVED_BY_ANY_PACKAGE.has(match[1])) missing.add(match[1]);
      }
    }
  }
  return [...missing].sort();
}

function verifyWebKitLibraries() {
  const bundleRoot = webkitBundleRoot();
  if (!existsSync(bundleRoot)) fail(`WebKit bundle not found at ${bundleRoot}`);

  const missing = unresolvedLibraries(bundleRoot);
  if (missing.length === 0) {
    console.log('WebKit bundle: all shared libraries resolve.');
    return;
  }
  fail(
    `WebKit is missing ${missing.length} shared librar${missing.length === 1 ? 'y' : 'ies'}:\n` +
      missing.map((lib) => `  ${lib}`).join('\n') +
      '\n\nAdd the providing package to WEBKIT_PACKAGES in scripts/install-browser-deps.mjs' +
      ' (`apt-file search <library>` names it). Playwright likely gained a dependency —' +
      ' compare against `npx playwright install-deps --dry-run webkit`.'
  );
}

export function installBrowserDeps() {
  if (process.platform !== 'linux') fail('install-browser-deps is Linux-only.');

  // Playwright refreshes the apt package lists itself, so the explicit install
  // below needs no second `apt-get update`.
  run('node', ['scripts/web.mjs', 'playwright', 'install-deps', 'chromium']);

  const apt = ['apt-get', 'install', '-y', '--no-install-recommends', ...WEBKIT_PACKAGES];
  const [command, ...args] = process.getuid?.() === 0 ? apt : ['sudo', ...apt];
  run(command, args);

  verifyWebKitLibraries();
}

if (isMain(import.meta.url)) runMain(async () => installBrowserDeps());
