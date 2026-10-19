import { useDrawingProduct } from '../product/useDrawingProduct';
import { useStartOver } from '../product/DrawingSession';
import {
  RsdAiResult,
  RsdAiStylePrompt,
  RsdColorPicker,
  RsdColoringBookPicker,
  RsdErrorScreen,
  RsdParentGateSheet,
  RsdSettingsRoute,
} from './drawingSheets';
import { RsdSurfaceBoundary } from './RsdSurfaceBoundary';
import { useProductModalRoute, isProductModalBlocked } from '../product/useProductModalRoute';
import { aiSheetShown } from '../ai/uiState';
import { useAiAvailability } from '../product/useAiAvailability';
import { useAiAutoSave } from '../product/useAiAutoSave';
import { RsdPaperSlot } from './RsdPaperSlot';
import { LibraryProvider } from '../offlineLibrary/LibraryScope';
import { DrawingAppearanceProvider, useDrawingAppearance } from '../drawing/DrawingAppearance';
import { colors, darkTheme } from './tokens.css';
import { fontTheme } from './fontTheme';
import { bootAppearance } from '../platform/bootAppearance';
import { useEffect, useState, type ReactNode } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { css, html } from 'react-strict-dom';
import { artOrientation, drawingPaper, presentedPaperSize } from '../drawing/paperSpace';
import { useDrawingScreen } from '../useDrawingScreen';
import type { useDrawingSound } from '../useDrawingSound';
import { styles } from './controls';
import { NativeFrame } from './NativeFrame';
import { RsdDrawingStatus } from './RsdDrawingStatus';
import { RsdPolaroidFlight } from './polaroidFlightSurface';
import { RsdInstallBanner } from './installBannerSurface';
import { RsdEdgeLayout } from './RsdEdgeControls';
import { useBareGlassReady } from './bareGlass';
import { RsdLeaveConfirm } from './RsdLeaveConfirm';
import { RsdNotchBand } from './notchBandSurface';
import { paintAppearance } from '../drawing/palette';
import { useDrawingUndoShortcut } from '../product/useDrawingUndoShortcut';
import { DrawingKeyboardScope } from '../platform/KeyboardScope';
import { useDeviceOrientation } from '../platform/deviceOrientation';
import { ReduceMotionPreferenceProvider } from '../drawing/useReduceMotion';
import { BUTTON_SCALE_MAX, controlSize } from '../settings/buttonSize';
import { useDrawingPainted } from '../product/drawingPaint';
import { ModalOriginProvider } from './modalOrigin';
import { useModalPresence } from './useModalPresence';
import { useSliderDraft } from './useSliderDraft';
import { usePWAUpdates } from '../platform/serviceWorker';
import { useParentGateCard, type ParentGateView } from '../parentCenter/useParentGateCard';
import type { AppPage } from '../information/appPages';
import { RsdInformationPage } from './informationSurface';

type Screen = ReturnType<typeof useDrawingScreen>;
type Sound = ReturnType<typeof useDrawingSound>;

function useSettledMessage(message: string, drawing: boolean) {
  const [settled, setSettled] = useState(message);
  if (!drawing && settled !== message) setSettled(message);
  return drawing ? settled : message;
}

export function RsdDrawingScreen({ page = 'drawing' }: { page?: AppPage }) {
  const screen = useDrawingScreen();
  const product = useDrawingProduct(screen);
  usePWAUpdates(
    {
      canvasEmpty: !screen.inkVisible && !screen.drawing,
      strokes: screen.committedStrokes,
    },
    page === 'drawing'
  );
  const informationOpen = page !== 'drawing';
  const [drawingVisited, setDrawingVisited] = useState(!informationOpen);
  if (!informationOpen && !drawingVisited) setDrawingVisited(true);
  const gate = useParentGateCard(informationOpen ? null : (product.state?.gate ?? null));
  const sound = product.sound;
  // Settings holds the gate over itself, as shipping stacks the challenge over its modal, so a
  // check raised from Settings never closes the page the parent is on.
  const target =
    gate?.open && !screen.settingsOpen
      ? 'gate'
      : screen.settingsOpen
        ? 'settings'
        : !informationOpen && product.ai.state && aiSheetShown(product.ai.state)
          ? product.ai.state.view === 'prompt'
            ? 'aiPrompt'
            : 'aiResult'
          : 'none';
  useParentCenterSettings(screen, product, gate?.open === true, informationOpen);
  useAiAvailability(product.ai.owner, sound.settings, product.ai.online);
  const route = useProductModalRoute('reported', target, (outgoing) => {
    if (outgoing === 'settings') screen.closeSettings();
  });
  const dismissed = route.dismissed;
  const glassReady = useBareGlassReady(sound.settings.toolbarStyle === 'bare');
  const loading = useFirstPaintHeld(
    sound.settings.status === 'loading' || screen.brushPreferences.status === 'loading',
    glassReady
  );
  useDrawingPainted(!loading);
  const informationPage = informationOpen ? (
    <RsdInformationPage
      page={page}
      product={product}
      drawingVisited={drawingVisited}
      standalone={route.shown === 'none'}
      onDrawingReturn={screen.closeSettings}
    />
  ) : null;
  return (
    <DrawingAppearanceProvider preference={loading ? bootAppearance() : sound.settings.appearance}>
      <ModalOriginProvider>
        <ReduceMotionPreferenceProvider preference={sound.settings.reduceMotion}>
          <View
            testID="drawing-page"
            style={[pageLayout.fill, informationOpen && pageLayout.hidden]}
            pointerEvents={informationOpen ? 'none' : 'auto'}
            accessibilityElementsHidden={informationOpen}
            importantForAccessibility={informationOpen ? 'no-hide-descendants' : 'auto'}
            aria-hidden={informationOpen}
          >
            {loading ? (
              <RsdDrawingFirstPaint />
            ) : (
              <DrawingKeyboardScope
                enabled={
                  !informationPage &&
                  !screen.dialogOpen &&
                  !isProductModalBlocked(route.shown, product)
                }
              >
                <RsdDrawingContent
                  screen={screen}
                  sound={sound}
                  product={product}
                  route={route}
                  gate={gate}
                  onModalDismissed={dismissed}
                  informationPage={informationPage}
                />
              </DrawingKeyboardScope>
            )}
            <RsdModalSheets screen={screen} product={product} route={route} gate={gate} />
            <RsdLeaveConfirm />
          </View>
          {route.shown === 'none' ? informationPage : null}
        </ReduceMotionPreferenceProvider>
      </ModalOriginProvider>
    </DrawingAppearanceProvider>
  );
}

const pageLayout = StyleSheet.create({ fill: { flex: 1 }, hidden: { opacity: 0 } });

// The controls join once the settings and, for the flat style, its glass have arrived. Only the
// first paint waits on the glass: a style switched later must not unmount the Settings it came from.
function useFirstPaintHeld(settingsLoading: boolean, glassReady: boolean) {
  const [shown, setShown] = useState(false);
  const held = settingsLoading || (!shown && !glassReady);
  if (!held && !shown) setShown(true);
  return held;
}

// Parent Center is a Settings section: a check solved anywhere else for it (the gate's Manage these
// checks footer) opens Settings there once the gate has closed.
function useParentCenterSettings(
  screen: Screen,
  product: ReturnType<typeof useDrawingProduct>,
  gateOpen: boolean,
  informationOpen: boolean
) {
  const owner = product.owner;
  const unlocked = product.state?.parentCenterOpen === true;
  const { settingsOpen, openSettings } = screen;
  useEffect(() => {
    if (owner?.getState().parentCenterOpen && !gateOpen && !settingsOpen && !informationOpen)
      openSettings();
  }, [owner, unlocked, gateOpen, settingsOpen, openSettings, informationOpen]);
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
  const autoSaveEnabled = product.sound.settings.autoSaveAiEnabled;
  const autoSave = useAiAutoSave(product.ai.state, autoSaveEnabled, screen.saveFailure.report);
  return (
    <>
      {product.owner && gate && route.shown === 'gate' ? (
        <RsdSurfaceBoundary onClose={product.owner.gate.dismiss} onDismiss={dismissed}>
          <RsdParentGateSheet
            owner={product.owner}
            state={gate.state}
            unlocked={gate.unlocked}
            visible={route.visible}
            onDismiss={dismissed}
          />
        </RsdSurfaceBoundary>
      ) : null}
      {product.ai.owner && route.shown === 'aiPrompt' ? (
        <RsdSurfaceBoundary onClose={product.ai.owner.close} onDismiss={dismissed}>
          <RsdAiStylePrompt
            visible={route.visible}
            onPick={product.ai.owner.pickStyle}
            onClose={product.ai.owner.close}
            onDismiss={dismissed}
          />
        </RsdSurfaceBoundary>
      ) : null}
      {product.ai.owner && product.ai.state && route.shown === 'aiResult' ? (
        <RsdSurfaceBoundary onClose={product.ai.owner.close} onDismiss={dismissed}>
          <RsdAiResult
            owner={product.ai.owner}
            state={product.ai.state}
            progress={product.ai.progress}
            visible={route.visible}
            onDismiss={dismissed}
            onSaveFailed={screen.saveFailure.report}
            autoSaveEnabled={autoSaveEnabled}
            autoSave={autoSave}
          />
        </RsdSurfaceBoundary>
      ) : null}
    </>
  );
}

const firstPaint = css.create({
  paper: { flexGrow: 1, backgroundColor: colors.paper },
});

// Shipping has no loading screen: its page paints at once and its boot script has the theme right
// before then. Until the settings arrive the drawing screen paints its frame and a bare paper in
// the theme the shell booted with; the controls join when the choices they show are known.
function RsdDrawingFirstPaint() {
  const theme = useDrawingAppearance();
  return (
    <NativeFrame variant="drawing">
      <html.div style={[styles.screen, styles.fullBleed, fontTheme, theme === 'dark' && darkTheme]}>
        <html.div style={firstPaint.paper} />
      </html.div>
    </NativeFrame>
  );
}

function RendererErrorScreen({ recovery }: { recovery: Screen['recovery'] }) {
  const startOver = useStartOver();
  return recovery.failed ? (
    <RsdSurfaceBoundary>
      <RsdErrorScreen onRestart={startOver} />
    </RsdSurfaceBoundary>
  ) : null;
}

type DrawingContentProps = {
  screen: Screen;
  sound: Sound;
  product: ReturnType<typeof useDrawingProduct>;
  route: ReturnType<typeof useProductModalRoute>;
  gate: ParentGateView | null;
  onModalDismissed: () => void;
  informationPage: ReactNode;
};

function RsdDrawingContent({
  screen,
  sound,
  product,
  route,
  gate,
  onModalDismissed,
  informationPage,
}: DrawingContentProps) {
  const theme = useDrawingAppearance();
  const notice = useSettledMessage(screen.routineNotice, screen.drawing);
  const soundNotice = useSettledMessage(
    sound.settings.message || sound.audioMessage,
    screen.drawing
  );
  const [scaleCeiling, setScaleCeiling] = useState(BUTTON_SCALE_MAX);
  const ready = sound.settings.status === 'ready';
  const buttonScale = useSliderDraft({
    saved: sound.settings.buttonScale,
    ready,
    save: (scale) => void sound.owner?.settings.setButtonScale(scale),
  });
  // Held here rather than in the Sound section, so a choice still waiting on a pending write
  // survives Settings closing.
  const soundVolume = useSliderDraft({
    saved: sound.settings.soundVolume,
    ready,
    save: (volume) => void sound.owner?.settings.setSoundVolume(volume),
    preview: product.sound.owner?.preview,
  });
  const modalBlocked = isProductModalBlocked(route.shown, product);
  // A see-through Settings shows the controls it resizes as they look in use; the dragged slider
  // keeps every touch meanwhile.
  const disabled = !buttonScale.active && screen.disabled;
  // Any dialog holds the chrome under its scrim at full strength, as shipping's modal does.
  const covered = !!informationPage || screen.dialogOpen || modalBlocked;
  const paperBlocked = modalBlocked;
  useDrawingUndoShortcut(screen, disabled || covered || buttonScale.active);
  useDeviceOrientation(sound.settings.orientation);
  return (
    <LibraryProvider {...screen.library}>
      <NativeFrame
        variant={sound.settings.toolbarStyle === 'bare' ? 'flatDrawing' : 'drawing'}
        edges={
          <RsdNotchBand
            ink={paintAppearance(sound.settings.selectedColor, theme).hex}
            eraser={screen.brush === 'eraser'}
            layer="top"
          />
        }
      >
        <html.div
          data-layoutconformance="strict"
          style={[styles.screen, styles.fullBleed, fontTheme, theme === 'dark' && darkTheme]}
        >
          <RsdEdgeLayout
            screen={screen}
            sound={sound}
            product={product}
            disabled={disabled}
            covered={covered}
            buttonScale={buttonScale.value}
            onScaleCeiling={setScaleCeiling}
            resizing={buttonScale.active}
            paperOverlay={(drawerOpen) => (
              <RsdInstallBanner
                strokes={screen.committedStrokes}
                controlSize={controlSize(buttonScale.value)}
                hidden={
                  drawerOpen || paperBlocked || screen.pagePickerOpen || screen.colorPickerOpen
                }
              />
            )}
            status={
              <RsdDrawingStatus
                screen={screen}
                notice={notice}
                soundNotice={soundNotice}
                openAppSettings={product.owner ? product.openAppSettings : null}
                aiMinimized={product.ai.state?.open === true && product.ai.state.minimized}
              />
            }
          >
            {(frame, space, projection) => (
              <RsdPaperSlot
                screen={screen}
                sound={sound}
                ai={product.ai}
                menuOpen={paperBlocked}
                frame={frame}
                projection={projection}
                space={space}
              />
            )}
          </RsdEdgeLayout>
          <RsdPolaroidFlight
            flight={screen.flight}
            cameraTile={screen.cameraTile}
            onLanded={screen.landFlight}
          />
          <RsdScreenSheets screen={screen} />
          <DrawingColorPicker screen={screen} sound={sound} />
          <RendererErrorScreen recovery={screen.recovery} />
        </html.div>
        {/* Outside the themed screen root: switching its theme remounts what it holds, and
            Settings keeps which section is open across an Appearance change. */}
        {route.shown === 'settings' ? (
          <RsdSurfaceBoundary onClose={screen.closeSettings} onDismiss={onModalDismissed}>
            <RsdSettingsRoute
              screen={screen}
              sound={sound}
              product={product}
              gate={gate}
              notice={soundNotice}
              buttonScale={buttonScale}
              scaleCeiling={scaleCeiling}
              soundVolume={soundVolume}
              visible={route.visible}
              onDismiss={onModalDismissed}
              informationPage={informationPage}
            />
          </RsdSurfaceBoundary>
        ) : null}
      </NativeFrame>
    </LibraryProvider>
  );
}

// The page picker stays mounted through its exit, after the screen has closed it.
function RsdScreenSheets({ screen }: { screen: Screen }) {
  const pagePicker = useModalPresence(screen.pagePickerOpen || null);
  const dismissed = () => screen.pagePickerDismissed(pagePicker.dismissed);
  const close = () => screen.setPagePickerOpen(false);
  const window = useWindowDimensions();
  return pagePicker.shown ? (
    <RsdSurfaceBoundary onClose={close} onDismiss={dismissed}>
      <RsdColoringBookPicker
        selected={screen.history.drawing.pageId}
        orientation={artOrientation(
          presentedPaperSize(drawingPaper(screen.history.drawing), window)
        )}
        visible={pagePicker.visible}
        onDismiss={dismissed}
        onChoose={screen.choosePage}
        onClose={close}
      />
    </RsdSurfaceBoundary>
  ) : null;
}

// The picker stays mounted through its fly-back after a pick or a close has cleared the screen's
// open state.
function DrawingColorPicker({ screen, sound }: { screen: Screen; sound: Sound }) {
  const picker = useModalPresence(screen.colorPickerOpen || null);
  if (!picker.shown) return null;
  return (
    <RsdSurfaceBoundary onClose={screen.closeColorPicker} onDismiss={picker.dismissed}>
      <RsdColorPicker
        visible={picker.visible}
        customColor={sound.settings.customColors[0]}
        onDismiss={picker.dismissed}
        onClose={screen.closeColorPicker}
        onChoose={(color) => {
          screen.selectInkBrush();
          sound.owner?.settings.setColor(color);
          screen.closeColorPicker();
        }}
      />
    </RsdSurfaceBoundary>
  );
}
