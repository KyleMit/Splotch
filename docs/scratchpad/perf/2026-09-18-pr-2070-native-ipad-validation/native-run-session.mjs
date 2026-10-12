// Drives native-session-payload.js inside the installed bundled Splotch app on the
// iPad over the WebKit Inspector (the Debug build's WKWebView is inspectable).
// One fresh app process per run; the page does all timing, the host only
// installs/launches, injects, and polls.
//   IOS_UDID=<device> BUILDS_DIR=<dir with dd-control/ and dd-treatment/> OUT_DIR=<dir> \
//     node native-run-session.mjs <label> <control|treatment> [extraJSON]
// HARNESS_WT (default: this checkout) supplies tools/perf/lib; the captures used 33a4d43b6ef8.
// BUILDS_DIR/digests.txt, when present, is copied into each artifact as appDigest.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const WT = process.env.HARNESS_WT ?? join(here, "..", "..", "..", "..");
const BUILDS_DIR = process.env.BUILDS_DIR;
const lib = await import(`${WT}/tools/perf/lib/profile-device-session.mjs`);
const inspector = await import(`${WT}/tools/perf/lib/webkit-inspector.mjs`);
const { undoActionFunctionSource } = await import(
  `${WT}/tools/perf/lib/undo-driver.mjs`
);
const [label, arm, extra = "{}"] = process.argv.slice(2);
const UDID = process.env.IOS_UDID;
const BUNDLE_ID = "art.splotch.app";
const ARMS = {
  control: {
    entry: "start.C4bxo72t.js",
    commit: "7a2365631aba6078f94038235d661add6e2e42cb",
  },
  treatment: {
    entry: "start.Coc95Aql.js",
    commit: "33a4d43b6ef8b43ca77c5d77578630220c37a4d9",
  },
};
if (!label || !ARMS[arm] || !UDID || !BUILDS_DIR)
  throw new Error(
    "usage: IOS_UDID=… BUILDS_DIR=… node native-run-session.mjs <label> <control|treatment> [extraJSON]",
  );
const outDir = process.env.OUT_DIR ?? join(here, "runs");
const installedFile = join(BUILDS_DIR, "installed-arm.txt");
const POLL_MS = 5000;
const RESULT_TIMEOUT_MS = 10 * 60_000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const devicectl = (...args) =>
  execFileSync("xcrun", ["devicectl", ...args], { encoding: "utf8" });

const installed = existsSync(installedFile)
  ? readFileSync(installedFile, "utf8").trim()
  : "";
if (installed !== arm) {
  const app = join(
    BUILDS_DIR,
    `dd-${arm}`,
    "Build",
    "Products",
    "Debug-iphoneos",
    "App.app",
  );
  devicectl("device", "install", "app", "--device", UDID, app);
  writeFileSync(installedFile, arm);
  console.log("installed", arm);
}
devicectl(
  "device",
  "process",
  "launch",
  "--device",
  UDID,
  "--terminate-existing",
  BUNDLE_ID,
);
const launchedAt = Date.now();
await sleep(4000);

lib.requireInspectorProxy();
const { device, stopProxy } = await lib.connectDevice(UDID);
if (device.deviceId !== UDID) {
  stopProxy();
  throw new Error("the inspector relay attached to a different device than IOS_UDID");
}
const con = lib.createDeviceConsole();
const findPage = async () => {
  for (let i = 0; i < 30; i++) {
    const page = (await inspector.listPages(device)).find((p) =>
      p.url.startsWith("capacitor://"),
    );
    if (page) return page;
    await sleep(1000);
  }
  throw new Error("the app WebView never appeared on the inspector relay");
};
let session;
try {
  session = await inspector.attachToPage(
    (await findPage()).webSocketDebuggerUrl,
    { onConsole: con.onConsole },
  );
  let ready = null;
  for (let i = 0; i < 60 && !ready; i++) {
    ready = await session.readJson(`(() => {
      const c = document.querySelector('#drawingCanvas');
      const d = window.__drawingDebug?.getUndoDebug?.();
      if (!c || !c.clientWidth || !d || !document.querySelector('#brushButton')) return null;
      const entry = performance.getEntriesByType('resource').map((r) => r.name)
        .concat([...document.querySelectorAll('link[href],script[src]')].map((e) => e.href || e.src))
        .find((n) => n.includes('/entry/start.'));
      return { entry: entry?.split('/').pop() ?? null, historyLength: d.historyLength, href: location.href };
    })()`);
    if (!ready) await sleep(500);
  }
  if (!ready) throw new Error("page never became ready");
  if (ready.entry !== ARMS[arm].entry)
    throw new Error(
      `loaded ${ready.entry}, expected ${ARMS[arm].entry} for ${arm}`,
    );
  await sleep(3000);
  await session.evaluate(
    `window.__undoAction = ${undoActionFunctionSource()};`,
  );
  await session.evaluate(
    `window.__cfg = ${JSON.stringify({ arm, ...JSON.parse(extra) })};`,
  );
  const injectAt = Date.now();
  await session.evaluate(
    readFileSync(join(here, "native-session-payload.js"), "utf8"),
  );
  session.close();
  session = null;
  let result = null;
  const deadline = Date.now() + RESULT_TIMEOUT_MS;
  while (!result && Date.now() < deadline) {
    await sleep(POLL_MS);
    let s;
    try {
      s = await inspector.attachToPage(
        (await findPage()).webSocketDebuggerUrl,
        { onConsole: con.onConsole, commandTimeoutMs: 300_000 },
      );
      result = await s.readJson("window.__session ?? null");
    } catch (e) {
      console.log("poll:", e.message);
    } finally {
      s?.close();
    }
  }
  if (!result) throw new Error("no result before the timeout");
  const out = {
    label,
    arm,
    product: ARMS[arm],
    appDigest: existsSync(join(BUILDS_DIR, "digests.txt"))
      ? (readFileSync(join(BUILDS_DIR, "digests.txt"), "utf8")
          .split("\n")
          .find((l) => l.startsWith(`${arm} `)) ?? null)
      : null,
    harness: {
      worktreeHead: execFileSync("git", ["-C", WT, "rev-parse", "HEAD"], {
        encoding: "utf8",
      }).trim(),
    },
    delivery: "bundled capacitor://localhost (no server.url)",
    device: { os: device.deviceOSVersion, model: "iPad Pro 12.9-inch" },
    host: {
      wallFromInjectMs: Date.now() - injectAt,
      wallFromLaunchMs: Date.now() - launchedAt,
      at: new Date().toISOString(),
    },
    result,
    console: con.forReport(),
  };
  mkdirSync(outDir, { recursive: true });
  const file = join(outDir, `${label}.json`);
  writeFileSync(file, JSON.stringify(out));
  if (result.error) console.log("ERROR", result.error);
  else
    console.log(
      JSON.stringify({
        label,
        arm,
        entry: result.entry,
        brush: result.committedBrush,
        vp: result.viewport,
        phases: result.phases,
        hist: result.historyAfterUndo?.historyLength,
        ink: result.nonTransparentAfterUndo,
        undos: result.undos.length,
      }),
    );
  console.log("wrote", file);
} finally {
  session?.close();
  stopProxy();
}
