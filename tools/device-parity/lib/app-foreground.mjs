// The check every driver makes before an input: is the app under test the one in front?
import { display0Focus, focusedPackage, readDisplays } from './android-display.mjs';

// XCUITest's queryAppState value for "running in the foreground".
export const IOS_APP_RUNNING_FOREGROUND = 4;
const HOSTED_VIEW_SERVICE = /^com\.apple\.\S*ViewService$/;

// iPadOS can report a hosted system view service (DockFolderViewService) as the active app while
// the app itself is in front. Only the app's own run state settles it.
function isHostedViewService(platform, reportedId) {
  return platform === 'ios' && HOSTED_VIEW_SERVICE.test(String(reportedId ?? ''));
}

export function judgeForeground({ platform, reportedId, bundleId, appState }) {
  if (reportedId === bundleId) return { inFront: true, note: null };
  if (isHostedViewService(platform, reportedId) && appState === IOS_APP_RUNNING_FOREGROUND) {
    return { inFront: true, note: `active app reported as ${reportedId}; app state ${appState}` };
  }
  return { inFront: false, note: null };
}

async function readActiveApp(session) {
  if (session.platform === 'ios') return (await session.exec('mobile: activeAppInfo'))?.bundleId;
  return session.exec('mobile: getCurrentPackage');
}

export function queryAppState(session, bundleId) {
  return session.exec('mobile: queryAppState', { bundleId });
}

// checkDisplay0 adds the window manager's own focus on Android: Appium's current package can name
// the app while another window holds input focus.
export function createForegroundGuard({ session, bundleId, onNote, checkDisplay0 = false }) {
  return async function assertForeground() {
    const reportedId = await readActiveApp(session);
    const appState = isHostedViewService(session.platform, reportedId)
      ? await queryAppState(session, bundleId)
      : undefined;
    const { inFront, note } = judgeForeground({
      platform: session.platform,
      reportedId,
      bundleId,
      appState,
    });
    if (!inFront) throw new Error(`foreground is ${reportedId}, expected ${bundleId}`);
    if (note) onNote(note);
    if (checkDisplay0) {
      const focus = display0Focus(readDisplays(session.device));
      if (focusedPackage(focus) !== bundleId) throw new Error(`Display0 focus is ${focus}`);
    }
  };
}
