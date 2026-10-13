import { useDrawingProduct } from '../product/useDrawingProduct';
import {
  ColorPicker,
  NativeSoundSettingsDialog,
  RsdAiSheet,
  RsdColoringBookPicker,
  RsdFeedbackSheet,
  RsdParentCenterSection,
  RsdParentGateSheet,
} from './drawingSheets';
import { RsdSurfaceBoundary } from './RsdSurfaceBoundary';
import { useProductModalRoute, isProductModalBlocked } from '../product/useProductModalRoute';
import { aiJournalWaiting, aiSheetShown } from '../ai/uiState';
import { RsdPaperSlot } from './RsdPaperSlot';
import { LibraryProvider } from '../offlineLibrary/LibraryScope';
import { DrawingAppearanceProvider, useDrawingAppearance } from '../drawing/DrawingAppearance';
import { darkTheme } from './tokens.css';
import { fontTheme } from './fontTheme';
import { DEFAULT_APPEARANCE } from '../settings/appearance';
import { useState } from 'react';
import { html } from 'react-strict-dom';
import { useDrawingScreen } from '../useDrawingScreen';
import type { useDrawingSound } from '../useDrawingSound';
import { useDrawingMenu } from '../useDrawingMenu';
import { RsdAction, styles } from './controls';
import { NativeFrame } from './NativeFrame';
import { RsdRecoveryNotice } from './RsdRecoveryNotice';
import { RsdDraftNotice } from './RsdDraftNotice';
import { RsdInstallBanner } from './RsdInstallBanner';
import { NativeDrawingStatus } from './NativeScrollAreas';
import { RsdEdgeLayout } from './RsdEdgeControls';
import { RsdLeaveConfirm } from './RsdLeaveConfirm';
import { useDrawingUndoShortcut } from '../product/useDrawingUndoShortcut';
import { RsdDrawingMenu, RsdDrawingTools, RsdPictures } from './RsdDrawingTools';
import { soundSettingsActions } from './soundSettingsActions';
import { useDeviceOrientation } from '../platform/deviceOrientation';
import { ReduceMotionPreferenceProvider } from '../drawing/useReduceMotion';
import { controlSize } from '../settings/buttonSize';

type Screen = ReturnType<typeof useDrawingScreen>;
type Sound = ReturnType<typeof useDrawingSound>;

function useSettledMessage(message: string, drawing: boolean) {
  const [settled, setSettled] = useState(message);
  if (!drawing && settled !== message) setSettled(message);
  return drawing ? settled : message;
}

export function RsdDrawingScreen() {
  const screen = useDrawingScreen();
  const product = useDrawingProduct(screen);
  const sound = product.sound;
  const target = product.state?.gate.open
    ? 'gate'
    : product.state?.parentCenterOpen
      ? 'parentCenter'
      : screen.settingsOpen
        ? 'settings'
        : product.feedback.state?.open
          ? 'feedback'
          : product.ai.state && aiSheetShown(product.ai.state)
            ? 'ai'
            : 'none';
  const route = useProductModalRoute(target, (outgoing) => {
    if (outgoing === 'settings') screen.closeSettings();
  });
  const dismissed = route.dismissed;
  const loading =
    sound.settings.status === 'loading' || screen.brushPreferences.status === 'loading';
  return (
    <DrawingAppearanceProvider
      preference={loading ? DEFAULT_APPEARANCE : sound.settings.appearance}
    >
      <ReduceMotionPreferenceProvider preference={sound.settings.reduceMotion}>
        {loading ? (
          <RsdDrawingLoading />
        ) : (
          <RsdDrawingContent
            screen={screen}
            sound={sound}
            product={product}
            route={route}
            onModalDismissed={dismissed}
          />
        )}
        <RsdModalSheets screen={screen} product={product} route={route} />
        <RsdLeaveConfirm />
      </ReduceMotionPreferenceProvider>
    </DrawingAppearanceProvider>
  );
}

// One route shows at a time (useProductModalRoute); each sheet's boundary closes the route it
// would have shown.
function RsdModalSheets({
  screen,
  product,
  route,
}: {
  screen: Screen;
  product: ReturnType<typeof useDrawingProduct>;
  route: ReturnType<typeof useProductModalRoute>;
}) {
  const dismissed = route.dismissed;
  return (
    <>
      {product.owner && route.shown === 'parentCenter' ? (
        <RsdSurfaceBoundary onClose={product.owner.closeParentCenter}>
          <RsdParentCenterSection
            owner={product.owner}
            visible={route.visible}
            onDismiss={dismissed}
          />
        </RsdSurfaceBoundary>
      ) : null}
      {product.owner && product.state && route.shown === 'gate' ? (
        <RsdSurfaceBoundary onClose={product.owner.gate.dismiss}>
          <RsdParentGateSheet
            owner={product.owner}
            state={product.state.gate}
            visible={route.visible}
            onDismiss={dismissed}
          />
        </RsdSurfaceBoundary>
      ) : null}
      {route.shown === 'feedback' ? (
        <RsdSurfaceBoundary onClose={() => product.feedback.owner?.close()}>
          <RsdFeedbackSheet
            owner={product.feedback.owner}
            visible={route.visible}
            onDismiss={dismissed}
          />
        </RsdSurfaceBoundary>
      ) : null}
      {product.ai.owner && product.ai.state && route.shown === 'ai' ? (
        <RsdSurfaceBoundary
          onClose={
            aiJournalWaiting(product.ai.state) ? product.ai.owner.minimize : product.ai.owner.close
          }
        >
          <RsdAiSheet
            owner={product.ai.owner}
            state={product.ai.state}
            drawing={screen.history.drawing}
            artwork={screen.library.state.artwork}
            progress={product.ai.progress}
            visible={route.visible}
            onDismiss={dismissed}
          />
        </RsdSurfaceBoundary>
      ) : null}
    </>
  );
}

function RsdDrawingLoading() {
  const theme = useDrawingAppearance();
  return (
    <NativeFrame>
      <html.div style={[styles.screen, fontTheme, theme === 'dark' && darkTheme]}>
        <html.span>Loading drawing settings…</html.span>
      </html.div>
    </NativeFrame>
  );
}

function RsdDrawingContent({
  screen,
  sound,
  product,
  route,
  onModalDismissed,
}: {
  screen: Screen;
  sound: Sound;
  product: ReturnType<typeof useDrawingProduct>;
  route: ReturnType<typeof useProductModalRoute>;
  onModalDismissed: () => void;
}) {
  const theme = useDrawingAppearance();
  const menu = useDrawingMenu(screen);
  const notice = useSettledMessage(screen.notice, screen.drawing);
  const soundNotice = useSettledMessage(
    sound.settings.message || sound.audioMessage,
    screen.drawing
  );
  const modalBlocked = isProductModalBlocked(route.shown, product);
  const disabled = screen.disabled || menu.open || modalBlocked;
  const paperBlocked = menu.open || modalBlocked;
  const paintsDisabled = disabled || sound.settings.status !== 'ready';
  useDrawingUndoShortcut(screen, paintsDisabled || menu.open);
  useDeviceOrientation(sound.settings.orientation);
  return (
    <LibraryProvider {...screen.library}>
      <NativeFrame>
        <html.div
          data-layoutconformance="strict"
          style={[styles.screen, styles.fullBleed, fontTheme, theme === 'dark' && darkTheme]}
        >
          <RsdEdgeLayout
            screen={screen}
            sound={sound}
            product={product}
            menu={menu}
            disabled={disabled}
            paintsDisabled={paintsDisabled}
            paperOverlay={(drawerOpen) => (
              <RsdInstallBanner
                strokes={screen.committedStrokes}
                controlSize={controlSize(sound.settings.buttonScale)}
                hidden={
                  drawerOpen ||
                  paperBlocked ||
                  screen.pictures !== null ||
                  screen.pagePickerOpen ||
                  screen.colorPickerOpen
                }
              />
            )}
            status={
              <NativeDrawingStatus drawing={screen.drawing}>
                <html.span aria-live="polite">{notice}</html.span>
                {soundNotice ? <html.span aria-live="polite">{soundNotice}</html.span> : null}
                <RsdDraftNotice screen={screen} blocked={disabled || screen.pictures !== null} />
                {screen.recovery.failed ? (
                  <RsdAction
                    label="Retry drawing"
                    disabled={screen.recovery.retryDisabled}
                    onClick={screen.recovery.retry}
                  />
                ) : null}
              </NativeDrawingStatus>
            }
          >
            <RsdPaperSlot screen={screen} sound={sound} ai={product.ai} menuOpen={paperBlocked} />
          </RsdEdgeLayout>
          <RsdRecoveryNotice screen={screen} blocked={disabled || screen.pictures !== null} />
          <RsdDrawingTools
            menu={menu}
            blocked={
              screen.disabled || modalBlocked || screen.pictures !== null || screen.colorPickerOpen
            }
            renderMenu={(browserAction) => (
              <RsdDrawingMenu
                screen={screen}
                sound={sound}
                menu={menu}
                onFeedback={() => product.feedback.owner?.open()}
                browserAction={browserAction}
              />
            )}
          />
          {screen.pagePickerOpen ? <DrawingPagePicker screen={screen} /> : null}
          {screen.pictures !== null ? (
            <RsdPictures screen={screen} pictures={screen.pictures} />
          ) : null}
          {screen.colorPickerOpen ? <DrawingColorPicker screen={screen} sound={sound} /> : null}
        </html.div>
        {/* Outside the themed screen root: switching its theme remounts what it holds, and
            Settings keeps which section is open across an Appearance change. */}
        {route.shown === 'settings' ? (
          <RsdSurfaceBoundary onClose={screen.closeSettings}>
            <NativeSoundSettingsDialog
              settings={sound.settings}
              brushState={screen.brushPreferences}
              onBrushAvailabilityChange={screen.setBrushAvailable}
              onRetryBrushSave={screen.retryBrushSave}
              notice={soundNotice}
              {...soundSettingsActions(sound)}
              onClose={screen.closeSettings}
              visible={route.visible}
              onDismiss={onModalDismissed}
              onParentCenter={() => product.owner?.openParentCenter()}
            />
          </RsdSurfaceBoundary>
        ) : null}
      </NativeFrame>
    </LibraryProvider>
  );
}

function DrawingPagePicker({ screen }: { screen: Screen }) {
  return (
    <RsdSurfaceBoundary onClose={() => screen.setPagePickerOpen(false)}>
      <RsdColoringBookPicker
        selected={screen.history.drawing.pageId}
        onChoose={screen.choosePage}
        onClose={() => screen.setPagePickerOpen(false)}
      />
    </RsdSurfaceBoundary>
  );
}

function DrawingColorPicker({ screen, sound }: { screen: Screen; sound: Sound }) {
  return (
    <RsdSurfaceBoundary onClose={screen.closeColorPicker}>
      <ColorPicker
        selected={sound.settings.selectedColor}
        onClose={screen.closeColorPicker}
        onChoose={(color) => {
          screen.selectInkBrush();
          void sound.owner?.settings.setColor(color);
          screen.closeColorPicker();
        }}
      />
    </RsdSurfaceBoundary>
  );
}
