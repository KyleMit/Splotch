import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { adb, capture, tap, OUT } from './android-driver.mjs';
import { open, toggle, restart } from './android-run2-settings-helpers.mjs';
import { inject, pathCommands, line, pause } from './android-run2-touch.mjs';
const baseline = {
  wifi: adb('shell', 'settings', 'get', 'global', 'wifi_on').toString().trim(),
  data: adb('shell', 'settings', 'get', 'global', 'mobile_data').toString().trim(),
  saver: adb('shell', 'cmd', 'netpolicy', 'get', 'restrict-background').toString(),
  metered: adb('shell', 'cmd', 'netpolicy', 'list', 'wifi-networks').toString(),
  network: adb('emu', 'network', 'status').toString(),
};
const checks = [];
writeFileSync(
  `${OUT}/android-run2-network-baseline.json`,
  JSON.stringify(baseline, null, 2) + '\n'
);
function diagnostic(name) {
  const root = '/data/user/0/art.splotch.migration.probe/files/splotch-offline-library-v1';
  const state = {
    emulator: adb('emu', 'network', 'status').toString(),
    network: adb('shell', 'dumpsys', 'connectivity').toString(),
    saver: adb('shell', 'cmd', 'netpolicy', 'get', 'restrict-background').toString(),
    files: adb('shell', 'su', '0', 'du', '-ak', root).toString(),
    jobs: adb('shell', 'dumpsys', 'jobscheduler', 'art.splotch.migration.probe').toString(),
  };
  writeFileSync(`${OUT}/${name}.json`, JSON.stringify(state, null, 2) + '\n');
  return state;
}
try {
  adb('shell', 'svc', 'wifi', 'disable');
  adb('shell', 'svc', 'data', 'disable');
  pause(1500);
  let xml = open('Coloring', 'android-run2-library-remove');
  assert.match(xml, /[0-7] of 7 extra books/);
  tap('Remove downloaded pictures');
  xml = capture('android-run2-library-removed');
  assert.ok(xml.includes('0 of 7 extra books'));
  checks.push({ case: 'remove-all-downloaded-books', status: 'pass' });
  adb('shell', 'cmd', 'netpolicy', 'set', 'restrict-background', 'true');
  adb('shell', 'svc', 'wifi', 'enable');
  pause(2000);
  adb('shell', 'cmd', 'wifi', 'connect-network', 'AndroidWifi', 'open', '-m');
  pause(3000);
  assert.ok(
    adb('shell', 'cmd', 'netpolicy', 'list', 'wifi-networks')
      .toString()
      .includes('AndroidWifi;true')
  );
  toggle(xml, 'Download over mobile data', false);
  pause(15000);
  xml = capture('android-run2-library-data-saver');
  assert.ok(xml.includes('0 of 7 extra books'));
  diagnostic('android-run2-library-data-saver-state');
  checks.push({ case: 'data-saver-metered-deferral', status: 'pending-diagnostic-review' });
  adb('emu', 'network', 'speed', '128');
  adb('emu', 'network', 'delay', '200');
  adb('shell', 'cmd', 'netpolicy', 'set', 'restrict-background', 'false');
  toggle(xml, 'Download over mobile data', true);
  xml = capture('android-run2-library-metered-paused');
  toggle(xml, 'Download over mobile data', false);
  pause(10000);
  xml = capture('android-run2-library-shaped-progress');
  diagnostic('android-run2-library-shaped-state');
  tap('Close');
  await inject(
    'android-run2-library-drawing-during-download',
    pathCommands([line([350, 950], [750, 1500])])
  );
  capture('android-run2-library-drawing-during-download');
  checks.push({ case: 'drawing-during-uncached-metered-download', status: 'captured' });
  adb('shell', 'svc', 'wifi', 'disable');
  adb('shell', 'svc', 'data', 'disable');
  pause(35000);
  xml = open('Coloring', 'android-run2-library-interrupted');
  diagnostic('android-run2-library-interrupted-state');
  checks.push({ case: 'uncached-network-interruption', status: 'captured' });
  adb('emu', 'network', 'speed', 'full');
  adb('emu', 'network', 'delay', 'none');
  adb('shell', 'svc', 'wifi', 'enable');
  pause(2000);
  adb('shell', 'cmd', 'wifi', 'connect-network', 'AndroidWifi', 'open');
  adb('shell', 'svc', 'data', baseline.data === '1' ? 'enable' : 'disable');
  pause(3000);
  toggle(xml, 'Download over mobile data', true);
  xml = capture('android-run2-library-policy-retry');
  for (let i = 0; i < 18 && !xml.includes('7 of 7 extra books'); i++) {
    pause(10000);
    xml = capture(`android-run2-library-retry-${i}`);
  }
  assert.ok(xml.includes('7 of 7 extra books'), 'Not all books recovered');
  diagnostic('android-run2-library-recovered-state');
  checks.push({ case: 'uncached-download-retry-completes-all-seven', status: 'pass' });
  tap('Close');
  adb('shell', 'svc', 'wifi', 'disable');
  adb('shell', 'svc', 'data', 'disable');
  tap('Coloring books');
  xml = capture('android-run2-library-cached-after-retry');
  assert.ok(xml.includes('Dinosaurs'));
  tap('Dinosaurs coloring book');
  capture('android-run2-library-offline-dinosaurs');
  tap('Brachiosaurus coloring page');
  capture('android-run2-library-offline-fresh-page');
  tap('Brushes');
  tap('Magic brush');
  await inject('android-run2-library-offline-magic', pathCommands([line([350, 900], [750, 1550])]));
  capture('android-run2-library-offline-magic');
  checks.push({
    case: 'offline-downloaded-page-and-magic-after-fresh-download',
    status: 'captured',
  });
  restart('android-run2-library-final-root');
  tap('Brushes');
  tap('Pen');
} finally {
  adb('emu', 'network', 'speed', 'full');
  adb('emu', 'network', 'delay', 'none');
  adb('shell', 'svc', 'wifi', 'enable');
  pause(2000);
  adb('shell', 'cmd', 'wifi', 'connect-network', 'AndroidWifi', 'open');
  adb(
    'shell',
    'cmd',
    'netpolicy',
    'set',
    'restrict-background',
    baseline.saver.includes('disabled') ? 'false' : 'true'
  );
  adb('shell', 'svc', 'wifi', baseline.wifi === '1' ? 'enable' : 'disable');
  adb('shell', 'svc', 'data', baseline.data === '1' ? 'enable' : 'disable');
  writeFileSync(
    `${OUT}/android-run2-network-results.json`,
    JSON.stringify(
      {
        baseline,
        checks,
        restored: {
          network: adb('emu', 'network', 'status').toString(),
          saver: adb('shell', 'cmd', 'netpolicy', 'get', 'restrict-background').toString(),
          metered: adb('shell', 'cmd', 'netpolicy', 'list', 'wifi-networks').toString(),
          wifi: adb('shell', 'settings', 'get', 'global', 'wifi_on').toString(),
          data: adb('shell', 'settings', 'get', 'global', 'mobile_data').toString(),
        },
      },
      null,
      2
    ) + '\n'
  );
}
