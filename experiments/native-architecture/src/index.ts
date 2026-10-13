// Skia reaches Reanimated through a lazy optional require that fails unless Reanimated has
// already initialized; loading it first keeps the native ink renderer (ADR-0178) bootable.
import 'react-native-reanimated';
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
