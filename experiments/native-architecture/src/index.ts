import './platform/skiaRuntime';
import './strict.css';
import { registerRootComponent } from './platform/registerRoot';
import { ProbeApp } from './ProbeApp';
import { registerServiceWorker } from './platform/serviceWorker';
import { startLaunchInvites } from './platform/launchInvites';

void startLaunchInvites();
// Every launch counts toward the Settings activity dots, not only those that open Settings; the
// counter loads off the startup path.
void import('./platform/settingsSessions').then(({ settingsSessions }) => settingsSessions.load());
registerRootComponent(ProbeApp);
registerServiceWorker();
