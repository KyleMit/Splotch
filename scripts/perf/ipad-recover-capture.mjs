// Recover a finished probe run off the device WITHOUT navigating the tab.
//
//   npm run perf:ipad:recover
//
// `perf:ipad:frames` navigates the tab on every run (deliberately — a stale bundle
// is invisible in the output), which also means it destroys exactly what this
// recovers. Reach for it when a hand-drawn run finished on the iPad but the Mac
// side lost the session: the probe's raw tables are still in the page, and a run
// that stopped mid-phase can still be published with `__probe.finish()`.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { isMain, runMain } from '../lib/proc.mjs';
import { printRun } from './frames-analyze.mjs';
import { connectDevice } from './ipad-session.mjs';
import { profilePath } from './paths.mjs';
import { attachToPage, listPages } from './webkit-inspector.mjs';

const TABLE_CHUNK_ROWS = 2_000;
// A suspended tab never replies at all rather than erroring, so probing every tab
// needs its own budget — see the profiling skill notes on the Target domain.
const PROBE_TIMEOUT_MS = 5_000;

async function findFinishedProbe(pages) {
  for (const page of pages) {
    let probe;
    try {
      probe = await attachToPage(page.webSocketDebuggerUrl, {
        commandTimeoutMs: PROBE_TIMEOUT_MS,
      });
      // Publish whatever is banked first: a run interrupted mid-phase has all its
      // raw tables but no report yet.
      await probe.readJson('window.__probe ? (window.__probe.finish(), 1) : 0').catch(() => 0);
      if (await probe.readJson('!!window.__probeReport')) return { page, probe };
      probe.close();
    } catch {
      probe?.close();
    }
  }
  return null;
}

export async function recoverCapture(argv = process.argv.slice(2)) {
  const deviceId = argv.find((arg) => arg.startsWith('--device-id='))?.split('=')[1];
  const { device, stopProxy } = await connectDevice(deviceId);
  let session;
  try {
    const pages = await listPages(device);
    console.log(`tabs: ${pages.map((page) => page.url).join(' | ')}`);
    const found = await findFinishedProbe(pages);
    if (!found) throw new Error('no tab is holding a finished __probeReport');

    session = found.probe;
    console.log(`recovering from: ${found.page.url}`);
    const report = await session.readJson('window.__probeReport');
    const counts = report.meta.counts;
    console.log(`frames ${counts.frames}, events ${counts.events}, measures ${counts.measures}`);

    const readTable = async (accessor, total) => {
      const rows = [];
      while (rows.length < total) {
        const slice = await session.readJson(
          `window.__probe.${accessor}(${rows.length}, ${TABLE_CHUNK_ROWS})`
        );
        if (!slice?.length) break;
        rows.push(...slice);
      }
      return rows;
    };
    report.frames = await readTable('frames', counts.frames);
    report.events = await readTable('events', counts.events);
    report.measures = await readTable('measures', counts.measures);

    const capture = {
      device: { name: device.deviceName, os: device.deviceOSVersion, id: device.deviceId },
      appUrl: found.page.url,
      mode: 'hand',
      recovered: true,
      report,
    };
    const outDir = profilePath('ipad-frames', 'recovered');
    mkdirSync(outDir, { recursive: true });
    const artifact = join(outDir, 'real-screen.json');
    // Written before the analysis so a throw in printRun cannot lose the capture
    // that was expensive to draw by hand.
    writeFileSync(artifact, `${JSON.stringify(capture, null, 2)}\n`);
    console.log(`\nWrote ${artifact}\n`);

    capture.summaries = printRun(capture, { forensics: true });
    writeFileSync(artifact, `${JSON.stringify(capture, null, 2)}\n`);
    return capture;
  } finally {
    session?.close();
    stopProxy();
  }
}

if (isMain(import.meta.url)) runMain(recoverCapture);
