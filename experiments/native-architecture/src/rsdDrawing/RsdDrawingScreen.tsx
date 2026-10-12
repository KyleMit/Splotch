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
import { BRUSHES } from '../drawing/brushes';
import { PALETTE_COLORS } from '../drawing/palette';
import { ColorPicker } from '../drawing/ColorPicker';
import { STROKE_WIDTHS, STROKE_WIDTH_LABELS } from '../drawing/strokeWidth';
import { RsdColoringBookPicker } from './RsdColoringBookPicker';
import { NativePaper } from './NativePaper';
import { NativeDialog, NativeSoundSettingsDialog } from './NativeDialog';
import { RsdAction, RsdPaintAction, styles } from './controls';
import { NativeFrame } from './NativeFrame';
import { RsdRecoveryNotice } from './RsdRecoveryNotice';
import { RsdDraftNotice } from './RsdDraftNotice';
import { NativeDrawingLayout, NativeDrawingStatus } from './NativeScrollAreas';
import { RsdFeedbackSheet } from './RsdFeedbackSheet';
import { useDrawingUndoShortcut } from '../product/useDrawingUndoShortcut';

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
          {menu.open ? (
            <DrawingMenu
              screen={screen}
              sound={sound}
              menu={menu}
              onFeedback={() => feedback.owner?.open()}
            />
          ) : null}
          {screen.pagePickerOpen ? (
            <RsdColoringBookPicker
              selected={screen.history.drawing.pageId}
              onChoose={screen.choosePage}
              onClose={() => screen.setPagePickerOpen(false)}
            />
          ) : null}
          {screen.pictures !== null ? (
            <Pictures screen={screen} pictures={screen.pictures} />
          ) : null}
          {screen.colorPickerOpen ? <DrawingColorPicker screen={screen} sound={sound} /> : null}
          {route.shown === 'settings' ? (
            <NativeSoundSettingsDialog
              settings={sound.settings}
              brushState={screen.brushPreferences}
              onBrushAvailabilityChange={screen.setBrushAvailable}
              onRetryBrushSave={screen.retryBrushSave}
              notice={soundNotice}
              onToggle={() => {
                void sound.owner?.settings.setEnabled(!sound.settings.soundEnabled);
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
              onRetry={() => {
                void sound.owner?.settings.retrySave();
              }}
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
  const paints = [...PALETTE_COLORS.map((color) => color.label), ...sound.settings.customColors];
  return (
    <html.div style={styles.stack}>
      <html.div style={styles.row}>
        <html.span>Splotch</html.span>
        {sound.settings.aiEnabled ? <AiPictureAction ai={ai} disabled={disabled} /> : null}
        <RsdAction
          label="Parent Center"
          disabled={disabled}
          onClick={() => product.owner?.openParentCenter()}
        />
        {sound.settings.undoButtonEnabled ? (
          <RsdAction
            label="Undo"
            disabled={disabled || screen.history.undo.length === 0}
            onClick={screen.undo}
          />
        ) : null}
        {screen.brushControl.kind === 'toggle' ? (
          <RsdAction
            label={BRUSHES[screen.brushControl.brush].label}
            selection="switch"
            selected={screen.brush === screen.brushControl.brush}
            disabled={disabled}
            onClick={screen.toggleBrush}
          />
        ) : screen.brushControl.kind === 'menu' ? (
          <RsdAction
            label={`Brush: ${BRUSHES[screen.brush].label}`}
            disabled={disabled}
            onClick={menu.show}
          />
        ) : null}
        <RsdAction label="Drawing tools" disabled={disabled} onClick={menu.show} />
      </html.div>
      <html.div role="radiogroup" aria-label="Paint colors" style={styles.row}>
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
      <RsdAction label="More colors" disabled={paintsDisabled} onClick={screen.openColorPicker} />
    </html.div>
  );
}

function DrawingWidths({
  screen,
  sound,
  disabled,
}: {
  screen: Screen;
  sound: Sound;
  disabled: boolean;
}) {
  const tool = screen.brush === 'eraser' ? 'eraser' : 'drawing';
  const selected = tool === 'eraser' ? sound.settings.eraserWidth : sound.settings.strokeWidth;
  return (
    <html.div role="radiogroup" aria-label={`${tool} width`} style={styles.row}>
      {STROKE_WIDTHS.map((width) => (
        <RsdAction
          key={width}
          label={`${STROKE_WIDTH_LABELS[width]} ${tool} width`}
          selection="radio"
          selected={selected === width}
          disabled={disabled || sound.settings.status !== 'ready'}
          onClick={() => {
            void sound.owner?.settings.setWidth(tool, width);
          }}
        />
      ))}
    </html.div>
  );
}

function DrawingMenu({
  screen,
  sound,
  menu,
  onFeedback,
}: {
  screen: Screen;
  sound: Sound;
  menu: ReturnType<typeof useDrawingMenu>;
  onFeedback: () => void;
}) {
  return (
    <NativeDialog
      visible={menu.visible}
      label="Drawing tools"
      onClose={menu.close}
      onDismiss={menu.dismissed}
      footer={<RsdAction label="Keep drawing" disabled={!menu.visible} onClick={menu.close} />}
    >
      <html.div style={styles.dialogContent}>
        <html.span>Drawing tools</html.span>
        {screen.brushControl.kind === 'menu' ? (
          <html.div role="radiogroup" aria-label="Drawing brush" style={styles.row}>
            {screen.availableBrushes.map((brush) => (
              <RsdAction
                key={brush}
                label={BRUSHES[brush].label}
                selection="radio"
                selected={screen.brush === brush}
                disabled={screen.disabled || !menu.visible}
                onClick={() => screen.setBrush(brush)}
              />
            ))}
          </html.div>
        ) : null}
        {sound.settings.strokeWidthControlEnabled ? (
          <DrawingWidths
            screen={screen}
            sound={sound}
            disabled={screen.disabled || !menu.visible}
          />
        ) : null}
        {sound.settings.coloringBookEnabled ? (
          <RsdAction
            label="Coloring pages"
            disabled={!menu.visible}
            onClick={() => menu.run(() => screen.setPagePickerOpen(true))}
          />
        ) : null}
        <RsdAction
          label="Clear"
          disabled={!menu.visible}
          onClick={() =>
            menu.run(() => {
              void screen.clear();
            })
          }
        />
        <RsdAction
          label="Save picture"
          disabled={!menu.visible}
          onClick={() =>
            menu.run(() => {
              void screen.save();
            })
          }
        />
        <RsdAction
          label="Save and clear"
          disabled={screen.disabled || !menu.visible}
          onClick={() =>
            menu.run(() => {
              void screen.saveAndClear();
            })
          }
        />
        <RsdAction
          label="Pictures"
          disabled={!menu.visible}
          onClick={() => menu.run(screen.showPictures)}
        />
        <RsdAction
          label="Export PNG"
          disabled={!menu.visible}
          onClick={() =>
            menu.run(() => {
              void screen.exportPicture();
            })
          }
        />
        <RsdAction
          label="Settings"
          disabled={!menu.visible}
          onClick={() => menu.run(screen.openSettings)}
        />
        <RsdAction
          label="Send Feedback"
          disabled={!menu.visible}
          onClick={() => menu.run(onFeedback)}
        />
      </html.div>
    </NativeDialog>
  );
}

function Pictures({
  screen,
  pictures,
}: {
  screen: Screen;
  pictures: NonNullable<Screen['pictures']>;
}) {
  return (
    <NativeDialog
      visible
      label="Your pictures"
      onClose={() => {
        if (!screen.busy) screen.setPictures(null);
      }}
      footer={
        <RsdAction label="Close" disabled={screen.busy} onClick={() => screen.setPictures(null)} />
      }
    >
      <html.div style={styles.dialogContent}>
        <html.span>Your pictures</html.span>
        {pictures.length === 0 ? <html.span>Save a picture to find it here.</html.span> : null}
        {pictures.map((picture) => (
          <RsdAction
            key={picture.id}
            label={`Open picture from ${picture.name}`}
            disabled={screen.busy}
            onClick={() => {
              void screen.openPicture(picture);
            }}
          />
        ))}
        <html.span aria-live="polite">{screen.notice}</html.span>
      </html.div>
    </NativeDialog>
  );
}

function AiPictureAction({
  ai,
  disabled,
}: {
  ai: ReturnType<typeof useNativeAi>;
  disabled: boolean;
}) {
  return <RsdAction label="AI picture" disabled={disabled} onClick={() => ai.owner?.open()} />;
}
