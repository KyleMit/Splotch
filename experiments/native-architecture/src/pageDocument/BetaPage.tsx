import { useSyncExternalStore } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  BETA_PLATFORM_ATTRIBUTE,
  BETA_PLATFORM_BOOT_SCRIPT,
  BETA_PLATFORM_LABELS,
  BETA_PLATFORMS,
  betaPathFor,
  isBetaPlatform,
  type BetaPlatform,
} from '../../../../web/src/lib/components/beta/betaPlatform';
import { PHONE_MAX_WIDTH_PX, SHORT_PAGE_HEIGHT_PX } from '../../../../web/src/lib/breakpoints';
import { DrawingAppearanceProvider } from '../drawing/DrawingAppearance';
import { bootAppearance } from '../platform/bootAppearance';
import { useInitialSafeAreaMetrics } from '../platform/safeAreaMetrics';
import { useWindowDimensions } from '../platform/windowDimensions';
import type { AppearancePreference } from '../settings/appearance';
import { RsdInformationFooter } from '../rsdDrawing/RsdInformationFooter';
import { RsdPageSheet } from '../rsdDrawing/RsdNotFoundPage';
import { RsdSegmentedPicker } from '../rsdDrawing/RsdSegmentedPicker';
import { HIDDEN_WITHOUT_SCRIPT_ATTRIBUTE } from '../rsdDrawing/pageFrame';
import { useBackLabel, usePageNavigation } from '../rsdDrawing/pageDocumentState';
import { colors, dimensions } from '../rsdDrawing/tokens.css';
import { BETA_COPY } from './betaCopy';
import { AndroidPanel, IosPanel } from './BetaPanels';
import {
  CHEVRON_ATTRIBUTE,
  HEADING_LINE_HEIGHT,
  JUMP_GAP_PX,
  JUMP_PADDING_PX,
  JUMP_UNDERLINE_PX,
  PICKER_BOTTOM_PX,
  RULE,
  SEMIBOLD,
  TOUCH_TARGET_PX,
  TROUBLE_ATTRIBUTE,
} from './BetaSteps';

// /beta, web only: how a parent joins the Android closed test or the TestFlight beta. Shipping's
// routes/beta/+page.svelte and its panels in web/src/lib/components/beta/, whose facts this page
// reads and whose copy it restates. Only the page entry imports this module, so neither the drawing
// screen nor the native app carries a store link or the TestFlight invitation (appPages.ts's
// DOCUMENT_ONLY_PAGE_PATHS).

const PANEL_ATTRIBUTE = 'data-beta-panel';
const JUMP_ATTRIBUTE = 'data-beta-jump';
const PICKER_ATTRIBUTE = 'data-beta-picker';
const ALTERNATE_ATTRIBUTE = 'data-beta-alternate';
const PANEL_ID: Record<BetaPlatform, string> = { android: 'beta-android', ios: 'beta-ios' };
// The air left between the two panels while both read as stacked sections.
const STACKED_GAP_PX = 48;
// A followed jump link keeps its row in view above the panel it opened.
const JUMP_SCROLL_MARGIN_PX = 90;
const CHEVRON_TURN = 'rotate(90deg)';

// The panel filter is CSS keyed on the platform the head's boot script stamps on <html> before
// first paint (BETA_PLATFORM_BOOT_SCRIPT), so the tab a reader wants is the one that paints; with
// no stamp (no script) neither rule matches and both panels read as stacked sections. Without a
// script the jump links take the picker's place, and :target makes a jump the same filter.
function betaPanelCss() {
  const panel = `[${PANEL_ATTRIBUTE}]`;
  const shown = BETA_PLATFORMS.map(
    (platform) => `html[${BETA_PLATFORM_ATTRIBUTE}=${platform}] [${PANEL_ATTRIBUTE}=${platform}]`
  ).join(',');
  return [
    `html[${BETA_PLATFORM_ATTRIBUTE}] ${panel}{display:none}`,
    `${shown}{display:block}`,
    `html:not([${BETA_PLATFORM_ATTRIBUTE}]) ${panel}+${panel}{margin-top:${STACKED_GAP_PX}px}`,
    `[${ALTERNATE_ATTRIBUTE}]{display:none}`,
    `@media (max-height:${SHORT_PAGE_HEIGHT_PX}px) and (hover:none) and (pointer:coarse){[${PICKER_ATTRIBUTE}]{display:none}html[${BETA_PLATFORM_ATTRIBUTE}] [${ALTERNATE_ATTRIBUTE}]{display:inline-flex}}`,
    `[${TROUBLE_ATTRIBUTE}]>summary{list-style:none}[${TROUBLE_ATTRIBUTE}]>summary::-webkit-details-marker{display:none}`,
    `[${TROUBLE_ATTRIBUTE}][open] [${CHEVRON_ATTRIBUTE}]{transform:${CHEVRON_TURN}}`,
    // Touch browsers keep :hover after a tap, so hover changes wait on a pointer that hovers.
    `@media (hover:hover){[${PANEL_ATTRIBUTE}] p a:hover{text-decoration-thickness:2px}[${TROUBLE_ATTRIBUTE}]:hover{background:${colors.surfaceHover};border-color:${colors.borderWarmStrong}}}`,
  ].join('');
}

function betaJumpCss() {
  const panel = `[${PANEL_ATTRIBUTE}]`;
  const current = BETA_PLATFORMS.map(
    (platform) =>
      `body:has([${PANEL_ATTRIBUTE}=${platform}]:target) [${JUMP_ATTRIBUTE}=${platform}]`
  ).join(',');
  return [
    `body:has(${panel}:target) ${panel}:not(:target){display:none}`,
    `${panel}{scroll-margin-top:${JUMP_SCROLL_MARGIN_PX}px}`,
    `${current}{color:${colors.brandText};border-bottom-color:${colors.brandSolid}}`,
  ].join('');
}

// The tags /beta adds to the export's head (prerender.tsx). A link-only page: keeping it out of
// search indexes limits how widely the support address on it circulates.
export const BETA_DOCUMENT_HEAD = {
  title: BETA_COPY.documentTitle,
  head: [
    '<meta name="robots" content="noindex, nofollow">',
    `<script>${BETA_PLATFORM_BOOT_SCRIPT}</script>`,
    `<style>${betaPanelCss()}</style>`,
    `<noscript><style>${betaJumpCss()}</style></noscript>`,
  ].join(''),
};

// The platform on show: the one the head's boot script stamped on <html> from `?os=` or the
// device, then the reader's pick. The build cannot know either, so its render and the browser's
// hydration show no pick, as shipping's prerendered page does.
function createPlatformStamp() {
  const listeners = new Set<() => void>();
  return {
    read(): BetaPlatform | null {
      const stamped = document.documentElement.getAttribute(BETA_PLATFORM_ATTRIBUTE);
      return isBetaPlatform(stamped) ? stamped : null;
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    // The tabs are two views of one page, so a pick replaces the address rather than adding to
    // history; the address still names it, so a reload or a copied link opens the same tab.
    pick(platform: BetaPlatform) {
      document.documentElement.setAttribute(BETA_PLATFORM_ATTRIBUTE, platform);
      history.replaceState(history.state, '', betaPathFor(platform));
      for (const listener of listeners) listener();
    },
  };
}
const platformStamp = createPlatformStamp();
const noPlatform = () => null;

const PANELS = { android: AndroidPanel, ios: IosPanel } as const;

const PICKER_ICONS = { android: 'android', ios: 'phone-tablet' } as const;
const PICKER_OPTIONS = BETA_PLATFORMS.map((value) => ({
  value,
  label: BETA_PLATFORM_LABELS[value],
  icon: PICKER_ICONS[value],
  id: `beta-platform-${value}`,
}));

function openOutside(href: string) {
  location.assign(href);
}

export function BetaPage({ appearance }: { appearance: AppearancePreference | undefined }) {
  const openAppPage = usePageNavigation();
  const backLabel = useBackLabel(false);
  const initialMetrics = useInitialSafeAreaMetrics();
  const platform = useSyncExternalStore(platformStamp.subscribe, platformStamp.read, noPlatform);
  const window = useWindowDimensions();
  const phone = window.width <= PHONE_MAX_WIDTH_PX;
  return (
    <DrawingAppearanceProvider preference={appearance ?? bootAppearance()}>
      <SafeAreaProvider initialMetrics={initialMetrics}>
        <RsdPageSheet
          title={BETA_COPY.title}
          lede={BETA_COPY.lede}
          backLabel={backLabel}
          wordmarkSuffix={BETA_COPY.wordmarkSuffix}
          onDrawingReturn={() => openAppPage('drawing')}
        >
          <div
            {...{ [HIDDEN_WITHOUT_SCRIPT_ATTRIBUTE]: true, [PICKER_ATTRIBUTE]: '' }}
            style={{ marginBottom: PICKER_BOTTOM_PX }}
          >
            <RsdSegmentedPicker
              variant="underline"
              label={BETA_COPY.picker}
              options={PICKER_OPTIONS}
              selected={platform}
              onSelect={platformStamp.pick}
            />
          </div>
          <noscript>
            <nav
              aria-label={BETA_COPY.picker}
              style={{
                display: 'flex',
                flexDirection: 'row',
                gap: JUMP_GAP_PX,
                marginBottom: PICKER_BOTTOM_PX,
                borderBottom: RULE,
              }}
            >
              {BETA_PLATFORMS.map((value) => (
                <a
                  key={value}
                  {...{ [JUMP_ATTRIBUTE]: value }}
                  href={`#${PANEL_ID[value]}`}
                  style={{
                    ...SEMIBOLD,
                    display: 'inline-flex',
                    alignItems: 'center',
                    boxSizing: 'border-box',
                    minHeight: TOUCH_TARGET_PX,
                    padding: `${JUMP_PADDING_PX.top}px ${JUMP_PADDING_PX.side}px ${JUMP_PADDING_PX.bottom}px`,
                    marginBottom: `calc(-1 * ${dimensions.borderWidth})`,
                    borderBottom: `${JUMP_UNDERLINE_PX}px solid transparent`,
                    color: colors.textSoft,
                    fontSize: dimensions.fontSizeMd,
                    lineHeight: HEADING_LINE_HEIGHT,
                    textDecoration: 'none',
                  }}
                >
                  {BETA_PLATFORM_LABELS[value]}
                </a>
              ))}
            </nav>
          </noscript>
          {BETA_PLATFORMS.map((value) => {
            const Panel = PANELS[value];
            const other = value === 'android' ? 'ios' : 'android';
            return (
              <div key={value} id={PANEL_ID[value]} {...{ [PANEL_ATTRIBUTE]: value }}>
                <Panel phone={phone} width={window.width} />
                <a
                  {...{ [ALTERNATE_ATTRIBUTE]: '' }}
                  href={betaPathFor(other)}
                  style={{
                    minHeight: TOUCH_TARGET_PX,
                    alignItems: 'center',
                    marginTop: dimensions.space4,
                    color: colors.brandText,
                    fontSize: dimensions.fontSizeSm,
                  }}
                >
                  {BETA_COPY.alternate[value]}
                </a>
              </div>
            );
          })}
          <RsdInformationFooter page={null} onExternal={openOutside} openAppPage={openAppPage} />
        </RsdPageSheet>
      </SafeAreaProvider>
    </DrawingAppearanceProvider>
  );
}
