import './platform/skiaRuntime';
import './strict.css';
import { registerRootComponent } from 'expo';
import { ProbeApp } from './ProbeApp';
import { registerServiceWorker } from './platform/serviceWorker';
import { aiVault } from './platform/ai';
import { startInviteLinks } from './platform/inviteLinks';

// Started before the first render so a launch invite is saved ahead of any AI credential read.
void startInviteLinks(aiVault);
// Every launch counts toward the Settings activity dots, not only those that open Settings; the
// counter loads off the startup path.
void import('./platform/settingsSessions').then(({ settingsSessions }) => settingsSessions.load());
registerRootComponent(ProbeApp);
registerServiceWorker();
