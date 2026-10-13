import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// The shipping geometry of the settings rows, read from the Svelte and CSS sources each native
// primitive ports, so a shipping change fails rsd-native-settings-rows.test.mjs.
const shippingSource = (path) =>
  readFileSync(join(import.meta.dirname, '../../../web/src', path), 'utf8');
const toggleSwitchSource = shippingSource('lib/components/settings/ToggleSwitch.svelte');
const toggleRowSource = shippingSource('lib/components/settings/ToggleRow.svelte');
const hubListSource = shippingSource('lib/components/settings/HubList.svelte');
const sidebarSource = shippingSource('lib/components/nav/SidebarToc.svelte');
const ruleLabelSource = shippingSource('lib/components/design/RuleLabel.svelte');
const settingsModalSource = shippingSource('lib/components/SettingsModal.svelte');
const appCss = shippingSource('app.css');

// The px value a shipping declaration states, found by the text before it.
function shippingPx(source, pattern) {
  const match = source.match(pattern);
  if (!match) throw new Error(`No shipping value matches ${pattern}`);
  return Number(match[1]);
}

export const SHIPPING = {
  switchWidth: shippingPx(toggleSwitchSource, /\.toggle-switch \{[^}]*?\bwidth: (\d+)px/),
  touchTargetMin: shippingPx(appCss, /--touch-target-min: (\d+)px/),
  trackHeight: shippingPx(toggleSwitchSource, /--switch-track-height: (\d+)px/),
  thumb: shippingPx(toggleSwitchSource, /--switch-thumb-size: (\d+)px/),
  thumbLeft: shippingPx(toggleSwitchSource, /\.toggle-switch-thumb \{[^}]*?left: (\d+)px/),
  slide: shippingPx(toggleSwitchSource, /translateX\((\d+)px\)/),
  glyph: shippingPx(toggleSwitchSource, /\.toggle-switch-glyph\) \{[^}]*?width: (\d+)px/),
  settingIcon: shippingPx(appCss, /--setting-icon-size: (\d+)px/),
  settingIconGap: shippingPx(appCss, /--setting-icon-gap: (\d+)px/),
  helpGap: shippingPx(toggleRowSource, /margin: (\d+)px 0 0 var\(--setting-indent\)/),
  hubIconBox: shippingPx(hubListSource, /\.hub-icon \{[^}]*?width: (\d+)px/),
  hubIcon: shippingPx(hubListSource, /\.hub-icon-svg\) \{[^}]*?width: (\d+)px/),
  hubSplit: shippingPx(hubListSource, /\.hub-split \{[^}]*?height: (\d+)px/),
  hubActionGap: shippingPx(hubListSource, /\.hub-action \{[^}]*?gap: (\d+)px/),
  hubTextGap: shippingPx(hubListSource, /\.hub-text \{[^}]*?gap: (\d+)px/),
  hubLines: shippingPx(hubListSource, /\bline-clamp: (\d+);/),
  dot: shippingPx(hubListSource, /\.section-activity-dot \{[^}]*?width: (\d+)px/),
  dotOffset: shippingPx(hubListSource, /\.section-activity-dot \{[^}]*?top: -(\d+)px/),
  dotRing: shippingPx(hubListSource, /box-shadow: 0 0 0 (\d+)px var\(--surface-2\)/),
  tocRow: shippingPx(sidebarSource, /min-height: (\d+)px/),
  tocPaddingY: shippingPx(sidebarSource, /\.toc-row \{[^}]*?padding: (\d+)px var\(--space-4\)/),
  tocSegment: shippingPx(sidebarSource, /--toc-segment-width: (\d+)px/),
  tocIcon: shippingPx(sidebarSource, /\.toc-icon\) \{[^}]*?width: (\d+)px/),
  cardPaddingY: shippingPx(settingsModalSource, /\.setting\) \{[^}]*?padding: (\d+)px \d+px/),
  cardPaddingX: shippingPx(settingsModalSource, /\.setting\) \{[^}]*?padding: \d+px (\d+)px/),
  groupGap: shippingPx(settingsModalSource, /\.setting-group\) \{[^}]*?margin-bottom: (\d+)px/),
};
export const SHIPPING_THUMB_FACE = toggleSwitchSource.match(
  /\.toggle-switch-thumb \{[^}]*?background: (\w+);/
)[1];
export const SHIPPING_TRACKING = Number(ruleLabelSource.match(/letter-spacing: ([\d.]+)em/)[1]);
export const SHIPPING_STRONG_TRACKING = Number(
  ruleLabelSource.match(/\.strong \{[^}]*?letter-spacing: ([\d.]+)em/)[1]
);
