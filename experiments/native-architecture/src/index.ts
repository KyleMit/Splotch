import './platform/skiaRuntime';
import './strict.css';
import { registerRootComponent } from 'expo';
import { ProbeApp } from './ProbeApp';
import { registerServiceWorker } from './platform/serviceWorker';
import { aiVault } from './platform/ai';
import { startInviteLinks } from './platform/inviteLinks';

// Started before the first render so a launch invite is saved ahead of any AI credential read.
void startInviteLinks(aiVault);
registerRootComponent(ProbeApp);
registerServiceWorker();
