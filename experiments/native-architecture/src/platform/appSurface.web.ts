import { installContextMenuGuard } from '../../../../web/src/lib/boot/contextMenuGuard';
import { installWakeLock } from '../../../../web/src/lib/boot/wakeLock';
import { APP_SURFACE_ATTRIBUTE } from './appSurfacePolicy';

export function installAppSurface(): () => void {
  document.documentElement.setAttribute(APP_SURFACE_ATTRIBUTE, '');
  const stopContextMenuGuard = installContextMenuGuard();
  const stopWakeLock = installWakeLock();
  return () => {
    stopWakeLock();
    stopContextMenuGuard();
    document.documentElement.removeAttribute(APP_SURFACE_ATTRIBUTE);
  };
}
