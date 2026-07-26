import { browser } from '$app/environment';
import { APP_VERSION } from '$lib/appVersion';
import { getPlatform, isStandalone, osLabelFromUserAgent } from '$lib/platform';
import type { DeviceInfo } from '$lib/deviceReport';
import type { Platform } from '$lib/platform';

const PLATFORM_LABEL: Record<Platform, string> = { web: 'Web', ios: 'iOS', android: 'Android' };

/**
 * Collect a small, non-identifying snapshot of the device to help reproduce a
 * bug. Only ever called when the parent explicitly opts in. It deliberately
 * excludes anything that could identify a person or follow a device across
 * sessions — no `Device.getId()`, no advertising id, no IP (the server already
 * sees the request IP; we don't add it to the visible payload).
 *
 * On native it uses `@capacitor/device` for a clean OS/model reading; on the web
 * (and as a fallback if the plugin is absent in an older installed build) it
 * reads only standard `navigator`/`window`/`screen` fields.
 */
export async function collectDeviceInfo(): Promise<DeviceInfo> {
  const platform = getPlatform();
  const info: DeviceInfo = {
    app: APP_VERSION,
    platform: PLATFORM_LABEL[platform] ?? platform,
  };
  if (!browser) return info;

  info.screen = `${window.screen.width} × ${window.screen.height}`;
  info.viewport = `${window.innerWidth} × ${window.innerHeight}`;
  info.pixelRatio = String(Math.round((window.devicePixelRatio || 1) * 100) / 100);
  info.language = navigator.language || '';
  info.online = navigator.onLine === false ? 'No' : 'Yes';

  if (__IS_CAPACITOR__ && platform !== 'web') {
    info.display = 'Native app';
    try {
      // The dynamic import lives inside the __IS_CAPACITOR__ branch (not a
      // top-level thunk) so Rollup drops the plugin chunk from the web bundle
      // entirely — the same idiom as network.svelte.ts. Destructure the plugin
      // out of the module namespace only after awaiting (see nativePlugin.ts).
      const { Device } = await import('@capacitor/device');
      const d = await Device.getInfo();
      info.os = [d.operatingSystem, d.osVersion].filter(Boolean).join(' ').trim();
      info.device = [d.manufacturer, d.model].filter(Boolean).join(' ').trim();
      const lang = await Device.getLanguageCode();
      if (lang?.value) info.language = lang.value;
    } catch {
      // Plugin missing or failed (e.g. an older installed build that predates
      // it) — fall back to whatever the WebView user-agent yields below.
    }
    if (!info.os) info.os = osLabelFromUserAgent(navigator.userAgent);
  } else {
    info.display = isStandalone() ? 'Installed (PWA)' : 'Browser tab';
    info.os = osLabelFromUserAgent(navigator.userAgent);
    // The full UA is the single most useful field for reproducing a web bug, and
    // the parent is shown it before opting in, so include it verbatim.
    info.browser = navigator.userAgent;
  }
  return info;
}
