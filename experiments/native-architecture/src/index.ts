import './platform/skiaRuntime';
import './strict.css';
import { createElement, StrictMode } from 'react';
import { registerRootComponent } from './platform/registerRoot';
import { ProbeApp } from './ProbeApp';
import { startLaunchInvites } from './platform/launchInvites';

void startLaunchInvites();
// Every launch counts toward the Settings activity dots, not only those that open Settings; the
// counter loads off the startup path.
void import('./platform/settingsSessions').then(({ settingsSessions }) => settingsSessions.load());
// StrictMode repeats effect cleanup and setup to expose owners that cannot restart after cleanup.
// native-entry-strict-mode.test.mjs pins the registration; rsd-native-strict-root.test.mjs mounts it.
function StrictProbeApp() {
  return createElement(StrictMode, null, createElement(ProbeApp));
}
registerRootComponent(__DEV__ ? StrictProbeApp : ProbeApp);
