import type { useNativeAi } from './ai/useNativeAi';
import { useDrawingProduct } from './product/useDrawingProduct';
import { ParentCenterSection } from './parentCenter/ParentCenterSection';
import { ParentGateSheet } from './parentCenter/ParentGateSheet';
import { useProductModalRoute, isProductModalBlocked } from './product/useProductModalRoute';
import { NativeAiSheet } from './ai/AiSheet';
import { LibraryProvider } from './offlineLibrary/LibraryScope';
import { SavedPictures } from './drawing/SavedPictures';
import { LeaveConfirm } from './drawing/LeaveConfirm';
import { DrawingAppearanceProvider } from './drawing/DrawingAppearance';
import { DEFAULT_APPEARANCE } from './settings/appearance';
import { NativeFrame } from './rsdDrawing/NativeFrame';
import { useState } from 'react';
import { ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { PaintColors } from './drawing/PaintColors';
import { usePaintSelectionFocus } from './drawing/usePaintSelectionFocus';
import { ColorPicker } from './drawing/ColorPicker';
import { ColoringPagePicker } from './ColoringPagePicker';
import { DrawingSurface } from './drawing/DrawingSurface';
import { PaperWorkspace } from './drawing/PaperWorkspace';
import { useDrawingScreen } from './useDrawingScreen';
import { useDrawingMenu } from './useDrawingMenu';
import { BRUSHES } from './drawing/brushes';
import { DrawingStatus } from './DrawingStatus';
import { useDrawingScreenStyles } from './drawing/drawingScreenStyles';
import { Action, DrawingTools } from './DrawingControls';
import type { useDrawingSound } from './useDrawingSound';
import { SoundSettings } from './settings/SoundSettingsSheet';
import { useColorPickerFocus } from './useColorPickerFocus';
import { NativeFeedback } from './feedback/FeedbackSheet';
import { useDrawingUndoShortcut } from './product/useDrawingUndoShortcut';

export function DrawingScreen() {
  const screen = useDrawingScreen();
  const product = useDrawingProduct(screen);
  const sound = product.sound;
  const [settingsClosing, setSettingsClosing] = useState(false);
  const target = product.state?.gate.open
    ? 'gate'
    : product.state?.parentCenterOpen
      ? 'parentCenter'
      : screen.settingsOpen && !settingsClosing
        ? 'settings'
        : product.feedback.state?.open
          ? 'feedback'
          : product.ai.state?.open
            ? 'ai'
            : 'none';
  const route = useProductModalRoute(target, (outgoing) => {
    if (outgoing === 'settings') {
      screen.closeSettings();
      setSettingsClosing(false);
    }
  });
  const dismissed = route.dismissed;
  const loading =
    sound.settings.status === 'loading' || screen.brushPreferences.status === 'loading';
  return (
    <DrawingAppearanceProvider
      preference={loading ? DEFAULT_APPEARANCE : sound.settings.appearance}
    >
      {loading ? (
        <DrawingLoading />
      ) : (
        <DrawingScreenContent
          screen={screen}
          sound={sound}
          product={product}
          route={route}
          settingsClosing={settingsClosing}
          setSettingsClosing={setSettingsClosing}
          onModalDismissed={dismissed}
        />
      )}
      {product.owner && route.shown === 'parentCenter' ? (
        <ParentCenterSection owner={product.owner} visible={route.visible} onDismiss={dismissed} />
      ) : null}
      {product.owner && product.state && route.shown === 'gate' ? (
        <ParentGateSheet
          owner={product.owner}
          state={product.state.gate}
          visible={route.visible}
          onDismiss={dismissed}
        />
      ) : null}
      {route.shown === 'feedback' ? (
        <NativeFeedback
          owner={product.feedback.owner}
          visible={route.visible}
          onDismiss={dismissed}
        />
      ) : null}
      {product.ai.owner && product.ai.state && route.shown === 'ai' ? (
        <NativeAiSheet
          owner={product.ai.owner}
          state={product.ai.state}
          drawing={screen.history.drawing}
          artwork={screen.library.state.artwork}
          visible={route.visible}
          onDismiss={dismissed}
        />
      ) : null}
      <LeaveConfirm />
    </DrawingAppearanceProvider>
  );
}

function DrawingLoading() {
  const styles = useDrawingScreenStyles();
  return (
    <NativeFrame>
      <Text style={styles.notice}>Loading drawing settings…</Text>
    </NativeFrame>
  );
}

function DrawingScreenContent({
  screen,
  sound,
  product,
  route,
  settingsClosing,
  setSettingsClosing,
  onModalDismissed,
}: {
  screen: ReturnType<typeof useDrawingScreen>;
  sound: ReturnType<typeof useDrawingSound>;
  product: ReturnType<typeof useDrawingProduct>;
  route: ReturnType<typeof useProductModalRoute>;
  settingsClosing: boolean;
  setSettingsClosing: (closing: boolean) => void;
  onModalDismissed: () => void;
}) {
  const { feedback } = product;
  const styles = useDrawingScreenStyles();
  const menu = useDrawingMenu(screen);
  const window = useWindowDimensions();
  const landscape = window.width > window.height;
  const { pictures, surface, colorPickerOpen, disabled: drawingDisabled } = screen;
  const modalBlocked = isProductModalBlocked(route.shown, product);
  const disabled = drawingDisabled || modalBlocked;
  const paintsDisabled = disabled || sound.settings.status !== 'ready';
  useDrawingUndoShortcut(screen, paintsDisabled || menu.open);
  const focusReturn = useColorPickerFocus({
    pickerOpen: colorPickerOpen,
    closePicker: screen.closeColorPicker,
    disabled: paintsDisabled,
    blocked: disabled || pictures !== null,
  });
  const color = sound.settings.selectedColor;
  const paintFocus = usePaintSelectionFocus({
    color,
    disabled: paintsDisabled || menu.open,
    blocked: disabled || menu.open || pictures !== null || colorPickerOpen,
  });
  const menuFocus = useColorPickerFocus({
    pickerOpen: menu.open || screen.settingsOpen,
    closePicker: () => {
      if (screen.settingsOpen) setSettingsClosing(true);
      else menu.close();
    },
    disabled,
    blocked: disabled || pictures !== null,
  });
  function cancelFocus() {
    paintFocus.cancel();
    focusReturn.cancel();
    menuFocus.cancel();
  }
  return (
    <LibraryProvider {...screen.library}>
      <NativeFrame>
        <View
          style={styles.screen}
          onLayout={() => surface.current?.refreshGeometry()}
          onFocus={cancelFocus}
          onPointerDown={cancelFocus}
          onTouchStart={cancelFocus}
        >
          <View
            accessibilityElementsHidden={menu.open}
            importantForAccessibility={menu.open ? 'no-hide-descendants' : 'auto'}
            style={[styles.content, landscape && styles.landscape]}
          >
            <DrawingPaintControls
              screen={screen}
              sound={sound}
              product={product}
              menu={menu}
              landscape={landscape}
              disabled={disabled}
              paintsDisabled={paintsDisabled}
              menuFocus={menuFocus}
              focusReturn={focusReturn}
              paintFocus={paintFocus}
            />
            <DrawingPaper screen={screen} sound={sound} menuOpen={menu.open || modalBlocked} />
          </View>
          <DrawingFeedback screen={screen} sound={sound} menuOpen={menu.open} />
          <DrawingTools
            screen={screen}
            sound={sound}
            menu={menu}
            blocked={disabled || pictures !== null || colorPickerOpen || settingsClosing}
            onClose={menuFocus.close}
            onFeedback={() => feedback.owner?.open()}
          />
          <DrawingSheets
            screen={screen}
            sound={sound}
            onCloseColors={focusReturn.close}
            settingsClosing={settingsClosing}
            onCloseSettings={menuFocus.close}
            onParentCenter={() => {
              setSettingsClosing(true);
              product.owner?.openParentCenter();
            }}
            settingsMounted={route.shown === 'settings'}
            settingsVisible={route.visible}
            onSettingsDismissed={() => {
              onModalDismissed();
            }}
          />
        </View>
      </NativeFrame>
    </LibraryProvider>
  );
}

function DrawingPaintControls({
  screen,
  sound,
  product,
  menu,
  landscape,
  disabled,
  paintsDisabled,
  menuFocus,
  focusReturn,
  paintFocus,
}: {
  screen: ReturnType<typeof useDrawingScreen>;
  sound: ReturnType<typeof useDrawingSound>;
  product: ReturnType<typeof useDrawingProduct>;
  menu: ReturnType<typeof useDrawingMenu>;
  landscape: boolean;
  disabled: boolean;
  paintsDisabled: boolean;
  menuFocus: ReturnType<typeof useColorPickerFocus>;
  focusReturn: ReturnType<typeof useColorPickerFocus>;
  paintFocus: ReturnType<typeof usePaintSelectionFocus>;
}) {
  const styles = useDrawingScreenStyles();
  const { history, undo, brush, drawing, openColorPicker } = screen;
  const { ai } = product;
  const color = sound.settings.selectedColor;
  return (
    <ScrollView
      style={landscape ? styles.sideControls : styles.topControls}
      contentContainerStyle={styles.controls}
      scrollEnabled={!drawing}
    >
      <View style={styles.heading}>
        <Text style={styles.title}>Splotch</Text>
        {sound.settings.aiEnabled ? (
          <AiPictureAction ai={ai} disabled={disabled || menu.open} />
        ) : null}
        <Action
          label="Parent Center"
          disabled={disabled || menu.open}
          onPress={() => product.owner?.openParentCenter()}
        />
        {sound.settings.undoButtonEnabled ? (
          <Action
            label="Undo"
            disabled={disabled || menu.open || history.undo.length === 0}
            onPress={undo}
          />
        ) : null}
        {screen.brushControl.kind === 'toggle' ? (
          <Action
            label={BRUSHES[screen.brushControl.brush].label}
            selected={brush === screen.brushControl.brush}
            accessibilityLabel={`${BRUSHES[screen.brushControl.brush].label}. ${brush === screen.brushControl.brush ? 'On' : 'Off'}.`}
            disabled={disabled || menu.open}
            onPress={screen.toggleBrush}
          />
        ) : screen.brushControl.kind === 'menu' ? (
          <Action
            label={`Brush: ${BRUSHES[brush].label}`}
            disabled={disabled || menu.open}
            onPress={menu.show}
          />
        ) : null}
        <Action
          label="Drawing tools"
          accessibilityLabel="Drawing tools"
          openerRef={menuFocus.opener}
          disabled={disabled || menu.open}
          onPress={menu.show}
        />
      </View>
      <PaintColors
        color={color}
        customColors={sound.settings.customColors}
        disabled={paintsDisabled || menu.open}
        openerRef={focusReturn.opener}
        onExplore={openColorPicker}
        onChange={(next, target) => {
          void paintFocus.choose(next, target, () => {
            screen.selectInkBrush();
            return sound.owner?.settings.setColor(next);
          });
        }}
      />
    </ScrollView>
  );
}

function DrawingPaper({
  screen,
  sound,
  menuOpen,
}: {
  screen: ReturnType<typeof useDrawingScreen>;
  sound: ReturnType<typeof useDrawingSound>;
  menuOpen: boolean;
}) {
  const {
    surface,
    recovery,
    history,
    currentDrawing,
    brush,
    busy,
    pictures,
    pagePickerOpen,
    settingsOpen,
    colorPickerOpen,
  } = screen;
  const color = sound.settings.selectedColor;
  return (
    <PaperWorkspace surface={surface}>
      <DrawingSurface
        key={recovery.generation}
        ref={surface}
        drawing={history.drawing}
        currentDrawing={currentDrawing}
        color={color}
        brush={brush}
        strokeWidth={sound.settings.strokeWidth}
        eraserWidth={sound.settings.eraserWidth}
        disabled={
          busy ||
          pictures !== null ||
          pagePickerOpen ||
          settingsOpen ||
          colorPickerOpen ||
          menuOpen ||
          sound.settings.status === 'loading'
        }
        sound={sound.owner?.contacts ?? null}
        {...recovery.callbacks}
      />
    </PaperWorkspace>
  );
}

function DrawingFeedback({
  screen,
  sound,
  menuOpen,
}: {
  screen: ReturnType<typeof useDrawingScreen>;
  sound: ReturnType<typeof useDrawingSound>;
  menuOpen: boolean;
}) {
  const styles = useDrawingScreenStyles();
  const { recovery } = screen;
  return (
    <ScrollView
      accessibilityElementsHidden={menuOpen}
      importantForAccessibility={menuOpen ? 'no-hide-descendants' : 'auto'}
      style={styles.feedback}
      contentContainerStyle={styles.feedbackContent}
    >
      {recovery.failed ? (
        <Action label="Retry drawing" disabled={recovery.retryDisabled} onPress={recovery.retry} />
      ) : null}
      <DrawingStatus
        blocked={menuOpen || screen.colorPickerOpen}
        screen={screen}
        soundMessage={sound.settings.message || sound.audioMessage}
      />
    </ScrollView>
  );
}

function DrawingSheets({
  screen,
  sound,
  onCloseColors,
  settingsClosing,
  onCloseSettings,
  onSettingsDismissed,
  onParentCenter,
  settingsMounted,
  settingsVisible,
}: {
  screen: ReturnType<typeof useDrawingScreen>;
  sound: ReturnType<typeof useDrawingSound>;
  onCloseColors: () => void;
  settingsClosing: boolean;
  onCloseSettings: () => void;
  onSettingsDismissed: () => void;
  onParentCenter: () => void;
  settingsMounted: boolean;
  settingsVisible: boolean;
}) {
  const {
    history,
    colorPickerOpen,
    pagePickerOpen,
    choosePage,
    setPagePickerOpen,
    pictures,
    busy,
    notice,
    openPicture,
    setPictures,
  } = screen;
  const color = sound.settings.selectedColor;
  return (
    <>
      {colorPickerOpen ? (
        <ColorPicker
          selected={color}
          onClose={onCloseColors}
          onChoose={(next) => {
            screen.selectInkBrush();
            void sound.owner?.settings.setColor(next);
            onCloseColors();
          }}
        />
      ) : null}
      {pagePickerOpen ? (
        <ColoringPagePicker
          selected={history.drawing.pageId}
          onChoose={choosePage}
          onClose={() => setPagePickerOpen(false)}
        />
      ) : null}
      {settingsMounted ? (
        <SoundSettings
          visible={settingsVisible && !settingsClosing}
          onDismiss={onSettingsDismissed}
          state={sound.settings}
          brushState={screen.brushPreferences}
          onBrushAvailabilityChange={screen.setBrushAvailable}
          onRetryBrushSave={screen.retryBrushSave}
          audioMessage={sound.audioMessage}
          onChange={(enabled) => {
            void sound.owner?.settings.setEnabled(enabled);
          }}
          onUndoButtonChange={(enabled) => {
            void sound.owner?.settings.setUndoButtonEnabled(enabled);
          }}
          onStrokeWidthControlChange={(enabled) => {
            void sound.owner?.settings.setStrokeWidthControlEnabled(enabled);
          }}
          onSoundLevelChange={(level) => {
            void sound.owner?.settings.setSoundLevel(level);
          }}
          onAppearanceChange={(appearance) => {
            void sound.owner?.settings.setAppearance(appearance);
          }}
          onColoringBookChange={(enabled) => {
            void sound.owner?.settings.setColoringBookEnabled(enabled);
          }}
          onRetrySave={() => {
            void sound.owner?.settings.retrySave();
          }}
          onClose={onCloseSettings}
          onParentCenter={onParentCenter}
        />
      ) : null}
      <SavedPictures
        pictures={pictures}
        busy={busy}
        notice={notice}
        onOpen={openPicture}
        onClose={() => setPictures(null)}
      />
    </>
  );
}

function AiPictureAction({
  ai,
  disabled,
}: {
  ai: ReturnType<typeof useNativeAi>;
  disabled: boolean;
}) {
  return <Action label="AI picture" disabled={disabled} onPress={() => ai.owner?.open()} />;
}
