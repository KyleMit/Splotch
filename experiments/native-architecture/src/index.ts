import './platform/skiaRuntime';
import './strict.css';
import { createElement, StrictMode } from 'react';
import { registerRootComponent } from './platform/registerRoot';
import { ProbeApp } from './ProbeApp';
import { registerServiceWorker } from './platform/serviceWorker';
import { startLaunchInvites } from './platform/launchInvites';

void startLaunchInvites();
// Every launch counts toward the Settings activity dots, not only those that open Settings; the
// counter loads off the startup path.
void import('./platform/settingsSessions').then(({ settingsSessions }) => settingsSessions.load());
// Development builds run under StrictMode, which repeats every effect's cleanup and setup as it
// mounts, so an owner that cannot start again after its cleanup fails at once
// (rsd-native-strict-root.test.mjs runs the root that way).
function StrictProbeApp() {
  return createElement(StrictMode, null, createElement(ProbeApp));
}
registerRootComponent(__DEV__ ? StrictProbeApp : ProbeApp);
registerServiceWorker();
