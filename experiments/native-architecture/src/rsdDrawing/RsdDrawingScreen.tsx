import type { useNativeAi } from '../ai/useNativeAi';
import { useDrawingProduct } from '../product/useDrawingProduct';
import { RsdParentCenterSection } from './RsdParentCenterSection';
import { RsdParentGateSheet } from './RsdParentGateSheet';
import { useProductModalRoute, isProductModalBlocked } from '../product/useProductModalRoute';
import { RsdAiSheet } from './RsdAiSheet';
import { LibraryProvider } from '../offlineLibrary/LibraryScope';
import { DrawingAppearanceProvider, useDrawingAppearance } from '../drawing/DrawingAppearance';
import { darkTheme } from './tokens.css';
import { DEFAULT_APPEARANCE } from '../settings/appearance';
import { useState } from 'react';
import { html } from 'react-strict-dom';
import { useDrawingScreen } from '../useDrawingScreen';
import type { useDrawingSound } from '../useDrawingSound';
import { useDrawingMenu } from '../useDrawingMenu';
import { BRUSHES, type Brush } from '../drawing/brushes';
import { PALETTE_COLORS, paintAppearance } from '../drawing/palette';
import { ColorPicker } from '../drawing/ColorPicker';
import { RsdColoringBookPicker } from './RsdColoringBookPicker';
import { NativePaper } from './NativePaper';
import { NativeSoundSettingsDialog } from './NativeDialog';
import { RsdAction, RsdMoreColorsSwatch, RsdPaintAction, styles } from './controls';
import type { NativeIconName } from './icons.generated';
import { NativeFrame } from './NativeFrame';
import { RsdRecoveryNotice } from './RsdRecoveryNotice';
import { RsdDraftNotice } from './RsdDraftNotice';
import { NativeDrawingLayout, NativeDrawingStatus } from './NativeScrollAreas';
import { RsdFeedbackSheet } from './RsdFeedbackSheet';
import { RsdLeaveConfirm } from './RsdLeaveConfirm';
import { useDrawingUndoShortcut } from '../product/useDrawingUndoShortcut';
import { RsdDrawingMenu, RsdDrawingTools, RsdPictures } from './RsdDrawingTools';
import { soundSettingsActions } from './soundSettingsActions';
import { useDeviceOrientation } from '../platform/deviceOrientation';

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
          : product.ai.state?.open
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
      {product.owner && route.shown === 'parentCenter' ? (
        <RsdParentCenterSection
          owner={product.owner}
          visible={route.visible}
          onDismiss={dismissed}
        />
      ) : null}
      {product.owner && product.state && route.shown === 'gate' ? (
        <RsdParentGateSheet
          owner={product.owner}
          state={product.state.gate}
          visible={route.visible}
          onDismiss={dismissed}
        />
      ) : null}
      {route.shown === 'feedback' ? (
        <RsdFeedbackSheet
          owner={product.feedback.owner}
          visible={route.visible}
          onDismiss={dismissed}
        />
      ) : null}
      {product.ai.owner && product.ai.state && route.shown === 'ai' ? (
        <RsdAiSheet
          owner={product.ai.owner}
          state={product.ai.state}
          drawing={screen.history.drawing}
          artwork={screen.library.state.artwork}
          visible={route.visible}
          onDismiss={dismissed}
        />
      ) : null}
      <RsdLeaveConfirm />
    </DrawingAppearanceProvider>
  );
}

function RsdDrawingLoading() {
  const theme = useDrawingAppearance();
  return (
    <NativeFrame>
      <html.div style={[styles.screen, theme === 'dark' && darkTheme]}>
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
  const { feedback } = product;
  const theme = useDrawingAppearance();
  const menu = useDrawingMenu(screen);
  const notice = useSettledMessage(screen.notice, screen.drawing);
  const soundNotice = useSettledMessage(
    sound.settings.message || sound.audioMessage,
    screen.drawing
  );
  const modalBlocked = isProductModalBlocked(route.shown, product);
  const disabled = screen.disabled || menu.open || modalBlocked;
  const paintsDisabled = disabled || sound.settings.status !== 'ready';
  useDrawingUndoShortcut(screen, paintsDisabled || menu.open);
  useDeviceOrientation(sound.settings.orientation);
  return (
    <LibraryProvider {...screen.library}>
      <NativeFrame>
        <html.div
          data-layoutconformance="strict"
          style={[styles.screen, theme === 'dark' && darkTheme]}
        >
          <NativeDrawingLayout
            drawing={screen.drawing}
            controls={
              <RsdPaintControls
                screen={screen}
                sound={sound}
                product={product}
                menu={menu}
                disabled={disabled}
                paintsDisabled={paintsDisabled}
              />
            }
          >
            <NativePaper screen={screen} sound={sound} menuOpen={menu.open || modalBlocked} />
          </NativeDrawingLayout>
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
                onFeedback={() => feedback.owner?.open()}
                browserAction={browserAction}
              />
            )}
          />
          {screen.pagePickerOpen ? (
            <RsdColoringBookPicker
              selected={screen.history.drawing.pageId}
              onChoose={screen.choosePage}
              onClose={() => screen.setPagePickerOpen(false)}
            />
          ) : null}
          {screen.pictures !== null ? (
            <RsdPictures screen={screen} pictures={screen.pictures} />
          ) : null}
          {screen.colorPickerOpen ? <DrawingColorPicker screen={screen} sound={sound} /> : null}
          {route.shown === 'settings' ? (
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
          ) : null}
        </html.div>
      </NativeFrame>
    </LibraryProvider>
  );
}

function DrawingColorPicker({ screen, sound }: { screen: Screen; sound: Sound }) {
  return (
    <ColorPicker
      selected={sound.settings.selectedColor}
      onClose={screen.closeColorPicker}
      onChoose={(color) => {
        screen.selectInkBrush();
        void sound.owner?.settings.setColor(color);
        screen.closeColorPicker();
      }}
    />
  );
}

const BRUSH_ICONS = {
  pen: 'brush-pen',
  crayon: 'brush-crayon',
  magic: 'brush-magic',
  eraser: 'brush-eraser',
} as const satisfies Record<Brush, NativeIconName>;

function RsdPaintControls({
  screen,
  sound,
  product,
  menu,
  disabled,
  paintsDisabled,
}: {
  screen: Screen;
  sound: Sound;
  product: ReturnType<typeof useDrawingProduct>;
  menu: ReturnType<typeof useDrawingMenu>;
  disabled: boolean;
  paintsDisabled: boolean;
}) {
  const { ai } = product;
  const ink = paintAppearance(sound.settings.selectedColor, useDrawingAppearance()).hex;
  const paints = [...PALETTE_COLORS.map((color) => color.label), ...sound.settings.customColors];
  return (
    <html.div style={styles.stack}>
      <html.div role="radiogroup" aria-label="Paint colors" style={styles.toolbar}>
        {paints.map((color) => (
          <RsdPaintAction
            key={color}
            color={color}
            selected={color === sound.settings.selectedColor}
            disabled={paintsDisabled}
            onClick={() => {
              screen.selectInkBrush();
              void sound.owner?.settings.setColor(color);
            }}
          />
        ))}
      </html.div>
      <html.div style={styles.toolbar}>
        <RsdMoreColorsSwatch disabled={paintsDisabled} onClick={screen.openColorPicker} />
        {screen.brushControl.kind === 'toggle' ? (
          <RsdAction
            label={BRUSHES[screen.brushControl.brush].label}
            icon={BRUSH_ICONS[screen.brushControl.brush]}
            ink={ink}
            selection="switch"
            selected={screen.brush === screen.brushControl.brush}
            disabled={disabled}
            onClick={screen.toggleBrush}
          />
        ) : screen.brushControl.kind === 'menu' ? (
          <RsdAction
            label={`Brush: ${BRUSHES[screen.brush].label}`}
            icon={BRUSH_ICONS[screen.brush]}
            ink={ink}
            disabled={disabled}
            onClick={menu.show}
          />
        ) : null}
        {sound.settings.coloringBookEnabled ? (
          <RsdAction
            label="Coloring pages"
            icon="shapes"
            disabled={disabled}
            onClick={() => screen.setPagePickerOpen(true)}
          />
        ) : null}
        <RsdAction
          label="Save picture"
          icon="camera"
          disabled={disabled}
          onClick={() => {
            void screen.save();
          }}
        />
        {sound.settings.aiEnabled ? <AiPictureAction ai={ai} disabled={disabled} /> : null}
        {sound.settings.undoButtonEnabled ? (
          <RsdAction
            label="Undo"
            icon="undo"
            disabled={disabled || screen.history.undo.length === 0}
            onClick={screen.undo}
          />
        ) : null}
        <RsdAction
          label="Clear"
          icon="trash-closed"
          disabled={disabled}
          onClick={() => {
            void screen.clear();
          }}
        />
        <RsdAction label="Drawing tools" icon="controls" disabled={disabled} onClick={menu.show} />
        <RsdAction
          label="Settings"
          icon="settings"
          disabled={disabled}
          onClick={screen.openSettings}
        />
        <RsdAction
          label="Parent Center"
          icon="parent-center"
          disabled={disabled}
          onClick={() => product.owner?.openParentCenter()}
        />
      </html.div>
    </html.div>
  );
}

function AiPictureAction({
  ai,
  disabled,
}: {
  ai: ReturnType<typeof useNativeAi>;
  disabled: boolean;
}) {
  return (
    <RsdAction
      label="AI picture"
      icon="wand-stars"
      disabled={disabled}
      onClick={() => ai.owner?.open()}
    />
  );
}
