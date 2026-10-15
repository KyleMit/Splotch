import { lazySurface } from './lazySurface';

export { FOLLOW_APP_ORIENTATION, useModalFrame } from './useModalFrame';

// One async owner keeps the modal frame shared by on-demand surfaces out of Metro's startup
// common chunk. Surface boundaries provide recovery if it cannot download before PWA install.
const content = () => import('./ModalShellContent');

export const ModalShell = lazySurface(async () => (await content()).ModalShell);
export const ModalStage = lazySurface(async () => (await content()).ModalStage);
