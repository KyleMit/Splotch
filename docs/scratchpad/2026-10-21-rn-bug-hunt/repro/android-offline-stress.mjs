import { tap, capture, adb, guard } from './android-driver.mjs';
try {
  guard();
  adb('shell', 'cmd', 'connectivity', 'airplane-mode', 'enable');
  capture('android-offline-root');
  tap('Coloring books');
  capture('android-offline-coloring');
} finally {
  adb('shell', 'cmd', 'connectivity', 'airplane-mode', 'disable');
}
