// Drives one payload on the iPad over the WebKit Inspector, one fresh
// /dev/engine page load per run, and writes the page's result global to
// <RUNDIR>/<label>.json. Needs `npm run perf:serve` on the LAN first.
//   HARNESS_URL=http://<lan-ip>:4173/dev/engine node run-payload.mjs scored-1
//   HARNESS_URL=... PAYLOAD=paced-payload.js RESULT=window.__paced RUNDIR=paced \
//     node run-payload.mjs main-1
// --diag (burst payload only) counts drawImage calls inside the drain window.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const WT = new URL("../../../..", import.meta.url).pathname;
const lib = await import(`${WT}/tools/perf/lib/profile-device-session.mjs`);
const here = dirname(fileURLToPath(import.meta.url));
const label = process.argv[2] ?? "run";
const diag = process.argv.includes("--diag");
const url = process.env.HARNESS_URL;
if (!url) throw new Error("set HARNESS_URL to the LAN /dev/engine URL the iPad can reach");

lib.requireInspectorProxy();
await lib.ensurePreviewServer(url, 4173, false);
const { device, stopProxy } = await lib.connectDevice();
const con = lib.createDeviceConsole();
let session;
try {
  const hostStart = Date.now();
  session = await lib.openDevicePage(device, url, {
    onConsole: con.onConsole,
    ready:
      "window.__engine && window.__engineReady && window.__engine.getUndoDebug",
    readyHint: "no window.__engine",
  });
  await session.evaluate(`window.__burstDiag = ${diag};`);
  const injectAt = Date.now();
  await session.evaluate(readFileSync(join(here, process.env.PAYLOAD ?? "burst-payload.js"), "utf8"));
  session.close();
  session = null;
  const w = await import(`${WT}/tools/perf/lib/webkit-inspector.mjs`);
  let result = null;
  const deadline = Date.now() + 10 * 60_000;
  while (!result && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 10_000));
    const page = (await w.listPages(device)).find((p) => p.url === url);
    if (!page) continue;
    let s;
    try {
      s = await w.attachToPage(page.webSocketDebuggerUrl, { onConsole: con.onConsole, commandTimeoutMs: 300_000 });
      result = await s.readJson((process.env.RESULT ?? 'window.__crayonBurst') + ' ?? null');
    } catch (e) {
      console.log('poll:', e.message);
    } finally {
      s?.close();
    }
  }
  if (!result) throw new Error('no result within 10 min');
  const hostDone = Date.now();
  const out = {
    label,
    diag,
    harnessUrl: url,
    device: { name: device.deviceName, os: device.deviceOSVersion },
    host: {
      wallFromInjectMs: hostDone - injectAt,
      wallTotalMs: hostDone - hostStart,
      at: new Date().toISOString(),
    },
    result,
    console: con.forReport(),
  };
  mkdirSync(join(here, process.env.RUNDIR ?? "runs"), { recursive: true });
  const file = join(here, process.env.RUNDIR ?? "runs", `${label}.json`);
  writeFileSync(file, JSON.stringify(out, null, 2));
  const r = result;
  if (r.error) console.log("ERROR", r.error);
  else
    console.log(
      JSON.stringify({
        label,
        vp: r.viewport,
        burstMs: r.burstMs,
        tiles: r.topology?.length,
        byName: r.byName,
        shadows: r.measures.filter((m) => m.name === "engine.crayonShadow"),
        firstShadowSeenMs: r.firstShadowSeenMs,
        settledMs: r.settledMs,
        hist: r.historySettled,
        diag: r.diag && {
          callsInDrain: r.diag.callsInDrain,
          sample: r.diag.calls.slice(0, 3),
        },
      }),
    );
  console.log("wrote", file);
} finally {
  session?.close();
  stopProxy();
}
