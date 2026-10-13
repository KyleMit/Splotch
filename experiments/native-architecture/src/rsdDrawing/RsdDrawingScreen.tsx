import { useDrawingProduct } from '../product/useDrawingProduct';
import {
  ColorPicker,
  RsdAiSheet,
  RsdColoringBookPicker,
  RsdFeedbackSheet,
  RsdParentGateSheet,
  RsdSettingsRoute,
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
import { useEffect, useState } from 'react';
import { html } from 'react-strict-dom';
import { useDrawingScreen } from '../useDrawingScreen';
import type { useDrawingSound } from '../useDrawingSound';
import { useDrawingMenu } from '../useDrawingMenu';
import { styles } from './controls';
import { NativeFrame } from './NativeFrame';
import { RsdRecoveryNotice } from './RsdRecoveryNotice';
import { RsdDrawingStatus } from './RsdDrawingStatus';
import { RsdInstallBanner } from './RsdInstallBanner';
import { RsdEdgeLayout } from './RsdEdgeControls';
import { RsdLeaveConfirm } from './RsdLeaveConfirm';
import { useDrawingUndoShortcut } from '../product/useDrawingUndoShortcut';
import { RsdDrawingMenu, RsdDrawingTools, RsdPictures } from './RsdDrawingTools';
import { useDeviceOrientation } from '../platform/deviceOrientation';
import { ReduceMotionPreferenceProvider } from '../drawing/useReduceMotion';
import { controlSize } from '../settings/buttonSize';
import { useDrawingPainted } from '../product/drawingPaint';
import { ModalOriginProvider } from './modalOrigin';
import { useModalPresence } from './useModalPresence';
import { useParentGateHold, type ParentGateView } from '../parentCenter/useParentGateHold';

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
  const gate = useParentGateHold(product.state?.gate ?? null);
  const sound = product.sound;
  // Settings holds the gate over itself, as shipping stacks the challenge over its modal, so a
  // check raised from Settings never closes the page the parent is on.
  const target =
    gate?.open && !screen.settingsOpen
      ? 'gate'
      : screen.settingsOpen
        ? 'settings'
        : product.feedback.state?.open
          ? 'feedback'
          : product.ai.state && aiSheetShown(product.ai.state)
            ? 'ai'
            : 'none';
  useParentCenterSettings(screen, product, gate?.open === true);
  const route = useProductModalRoute('reported', target, (outgoing) => {
    if (outgoing === 'settings') screen.closeSettings();
  });
  const dismissed = route.dismissed;
  const loading =
    sound.settings.status === 'loading' || screen.brushPreferences.status === 'loading';
  useDrawingPainted(!loading);
  return (
    <DrawingAppearanceProvider
      preference={loading ? DEFAULT_APPEARANCE : sound.settings.appearance}
    >
      <ModalOriginProvider>
        <ReduceMotionPreferenceProvider preference={sound.settings.reduceMotion}>
          {loading ? (
            <RsdDrawingLoading />
          ) : (
            <RsdDrawingContent
              screen={screen}
              sound={sound}
              product={product}
              route={route}
              gate={gate}
              onModalDismissed={dismissed}
            />
          )}
          <RsdModalSheets screen={screen} product={product} route={route} gate={gate} />
          <RsdLeaveConfirm />
        </ReduceMotionPreferenceProvider>
      </ModalOriginProvider>
    </DrawingAppearanceProvider>
  );
}

// Parent Center is a Settings section: a check solved anywhere else for it (the gate's Manage these
// checks footer) opens Settings there once the gate has closed.
function useParentCenterSettings(
  screen: Screen,
  product: ReturnType<typeof useDrawingProduct>,
  gateOpen: boolean
) {
  const unlocked = product.state?.parentCenterOpen === true;
  const { settingsOpen, openSettings } = screen;
  useEffect(() => {
    if (unlocked && !gateOpen && !settingsOpen) openSettings();
  }, [unlocked, gateOpen, settingsOpen, openSettings]);
}

// One route shows at a time (useProductModalRoute); each sheet's boundary closes the route it
// would have shown.
function RsdModalSheets({
  screen,
  product,
  route,
  gate,
}: {
  screen: Screen;
  product: ReturnType<typeof useDrawingProduct>;
  route: ReturnType<typeof useProductModalRoute>;
  gate: ParentGateView | null;
}) {
  const dismissed = route.dismissed;
  return (
    <>
      {product.owner && gate && route.shown === 'gate' ? (
        <RsdSurfaceBoundary onClose={product.owner.gate.dismiss}>
          <RsdParentGateSheet
            owner={product.owner}
            state={gate.state}
            unlocked={gate.unlocked}
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
  gate,
  onModalDismissed,
}: {
  screen: Screen;
  sound: Sound;
  product: ReturnType<typeof useDrawingProduct>;
  route: ReturnType<typeof useProductModalRoute>;
  gate: ParentGateView | null;
  onModalDismissed: () => void;
}) {
  const theme = useDrawingAppearance();
  const menu = useDrawingMenu(screen, 'reported');
  const notice = useSettledMessage(screen.routineNotice, screen.drawing);
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
      <NativeFrame variant="drawing">
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
              <RsdDrawingStatus
                screen={screen}
                notice={notice}
                soundNotice={soundNotice}
                blocked={disabled || screen.pictures !== null}
              />
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
          <RsdScreenSheets screen={screen} />
          {screen.colorPickerOpen ? <DrawingColorPicker screen={screen} sound={sound} /> : null}
        </html.div>
        {/* Outside the themed screen root: switching its theme remounts what it holds, and
            Settings keeps which section is open across an Appearance change. */}
        {route.shown === 'settings' ? (
          <RsdSurfaceBoundary onClose={screen.closeSettings}>
            <RsdSettingsRoute
              screen={screen}
              sound={sound}
              product={product}
              gate={gate}
              notice={soundNotice}
              visible={route.visible}
              onDismiss={onModalDismissed}
            />
          </RsdSurfaceBoundary>
        ) : null}
      </NativeFrame>
    </LibraryProvider>
  );
}

// The page picker and pictures stay mounted through their exit, after the screen has cleared them.
function RsdScreenSheets({ screen }: { screen: Screen }) {
  const pagePicker = useModalPresence(screen.pagePickerOpen || null);
  const pictures = useModalPresence(screen.pictures);
  return (
    <>
      {pagePicker.shown ? (
        <RsdSurfaceBoundary onClose={() => screen.setPagePickerOpen(false)}>
          <RsdColoringBookPicker
            selected={screen.history.drawing.pageId}
            visible={pagePicker.visible}
            onDismiss={pagePicker.dismissed}
            onChoose={screen.choosePage}
            onClose={() => screen.setPagePickerOpen(false)}
          />
        </RsdSurfaceBoundary>
      ) : null}
      {pictures.shown ? (
        <RsdPictures
          screen={screen}
          pictures={pictures.shown}
          visible={pictures.visible}
          onDismiss={pictures.dismissed}
        />
      ) : null}
    </>
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
