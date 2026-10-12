import { DrawingAppearanceProvider, useDrawingAppearance } from '../drawing/DrawingAppearance';
import { darkTheme } from './tokens.css';
import { useState } from 'react';
import { html } from 'react-strict-dom';
import { useDrawingScreen } from '../useDrawingScreen';
import { useDrawingSound } from '../useDrawingSound';
import { useDrawingMenu } from '../useDrawingMenu';
import { BRUSHES, BRUSH_ORDER } from '../drawing/brushes';
import { PALETTE_COLORS } from '../drawing/palette';
import { ColorPicker } from '../drawing/ColorPicker';
import { STROKE_WIDTHS, STROKE_WIDTH_LABELS } from '../drawing/strokeWidth';
import { RsdColoringBookPicker } from './RsdColoringBookPicker';
import { NativePaper } from './NativePaper';
import { NativeDialog, NativeSoundSettingsDialog } from './NativeDialog';
import { RsdAction, RsdPaintAction, styles } from './controls';
import { NativeFrame } from './NativeFrame';
import { RsdRecoveryNotice } from './RsdRecoveryNotice';
import { NativeDrawingLayout, NativeDrawingStatus } from './NativeScrollAreas';
import { useNativeFeedback } from '../feedback/useNativeFeedback';
import { RsdFeedbackSheet } from './RsdFeedbackSheet';

type Screen = ReturnType<typeof useDrawingScreen>;
type Sound = ReturnType<typeof useDrawingSound>;

function useSettledMessage(message: string, drawing: boolean) {
  const [settled, setSettled] = useState(message);
  if (!drawing && settled !== message) setSettled(message);
  return drawing ? settled : message;
}

export function RsdDrawingScreen() {
  const screen = useDrawingScreen();
  const sound = useDrawingSound();
  if (sound.settings.status === 'loading')
    return (
      <NativeFrame>
        <html.span>Loading drawing settings…</html.span>
      </NativeFrame>
    );
  return (
    <DrawingAppearanceProvider preference={sound.settings.appearance}>
      <RsdDrawingContent screen={screen} sound={sound} />
    </DrawingAppearanceProvider>
  );
}

function RsdDrawingContent({ screen, sound }: { screen: Screen; sound: Sound }) {
  const feedback = useNativeFeedback();
  const theme = useDrawingAppearance();
  const menu = useDrawingMenu(screen);
  const notice = useSettledMessage(screen.notice, screen.drawing);
  const soundNotice = useSettledMessage(
    sound.settings.message || sound.audioMessage,
    screen.drawing
  );
  const disabled = screen.disabled || menu.open;
  const paintsDisabled = disabled || sound.settings.status !== 'ready';
  const paints = [...PALETTE_COLORS.map((color) => color.label), ...sound.settings.customColors];
  return (
    <NativeFrame>
      <html.div
        data-layoutconformance="strict"
        style={[styles.screen, theme === 'dark' && darkTheme]}
      >
        <NativeDrawingLayout
          drawing={screen.drawing}
          controls={
            <html.div style={styles.stack}>
              <html.div style={styles.row}>
                <html.span>Splotch</html.span>
                <RsdAction
                  label="Undo"
                  disabled={disabled || screen.history.undo.length === 0}
                  onClick={screen.undo}
                />
                <RsdAction
                  label={`Drawing tools. ${BRUSHES[screen.brush].label} selected.`}
                  text={BRUSHES[screen.brush].label}
                  disabled={disabled}
                  onClick={menu.show}
                />
              </html.div>
              <html.div role="radiogroup" aria-label="Paint colors" style={styles.row}>
                {paints.map((color) => (
                  <RsdPaintAction
                    key={color}
                    color={color}
                    selected={color === sound.settings.selectedColor}
                    disabled={paintsDisabled}
                    onClick={() => {
                      void sound.owner?.settings.setColor(color);
                    }}
                  />
                ))}
              </html.div>
              <RsdAction
                label="More colors"
                disabled={paintsDisabled}
                onClick={screen.openColorPicker}
              />
            </html.div>
          }
        >
          <NativePaper screen={screen} sound={sound} menuOpen={menu.open} />
        </NativeDrawingLayout>
        <NativeDrawingStatus drawing={screen.drawing}>
          <html.span aria-live="polite">{notice}</html.span>
          {soundNotice ? <html.span aria-live="polite">{soundNotice}</html.span> : null}
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
        <RsdFeedbackSheet owner={feedback.owner} />
        {screen.pagePickerOpen ? (
          <RsdColoringBookPicker
            selected={screen.history.drawing.pageId}
            onChoose={screen.choosePage}
            onClose={() => screen.setPagePickerOpen(false)}
          />
        ) : null}
        {screen.pictures !== null ? <Pictures screen={screen} pictures={screen.pictures} /> : null}
        {screen.colorPickerOpen ? (
          <ColorPicker
            selected={sound.settings.selectedColor}
            onClose={screen.closeColorPicker}
            onChoose={(color) => {
              void sound.owner?.settings.setColor(color);
              screen.closeColorPicker();
            }}
          />
        ) : null}
        {screen.settingsOpen ? (
          <NativeSoundSettingsDialog
            settings={sound.settings}
            notice={soundNotice}
            onToggle={() => {
              void sound.owner?.settings.setEnabled(!sound.settings.soundEnabled);
            }}
            onAppearanceChange={(appearance) => {
              void sound.owner?.settings.setAppearance(appearance);
            }}
            onRetry={() => {
              void sound.owner?.settings.retrySave();
            }}
            onClose={screen.closeSettings}
          />
        ) : null}
      </html.div>
    </NativeFrame>
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
        <html.div role="radiogroup" aria-label="Drawing brush" style={styles.row}>
          {BRUSH_ORDER.map((brush) => (
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
        <DrawingWidths screen={screen} sound={sound} disabled={screen.disabled || !menu.visible} />
        <RsdAction
          label="Coloring pages"
          disabled={!menu.visible}
          onClick={() => menu.run(() => screen.setPagePickerOpen(true))}
        />
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
