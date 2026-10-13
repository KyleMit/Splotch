import type { ReactNode } from 'react';
import { html } from 'react-strict-dom';
import type { useDrawingMenu } from '../useDrawingMenu';
import type { useDrawingScreen } from '../useDrawingScreen';
import type { useDrawingSound } from '../useDrawingSound';
import { useFullscreen } from '../platform/useFullscreen';
import { STROKE_WIDTHS, STROKE_WIDTH_LABELS } from '../drawing/strokeWidth';
import { BRUSHES } from '../drawing/brushes';
import { ModalShell } from './ModalShell';
import { DialogHeader } from './DialogHeader';
import { RsdAction, styles } from './controls';

const MENU_TITLE = 'Drawing tools';
const PICTURES_TITLE = 'Your pictures';

export function RsdDrawingTools({
  menu,
  blocked,
  renderMenu,
}: {
  menu: ReturnType<typeof useDrawingMenu>;
  blocked: boolean;
  renderMenu: (browserAction: ReactNode) => ReactNode;
}) {
  const fullscreen = useFullscreen(menu.visible && !blocked);
  return (
    <>
      {fullscreen.message ? <html.span aria-live="polite">{fullscreen.message}</html.span> : null}
      {menu.open
        ? renderMenu(
            fullscreen.supported ? (
              <RsdAction
                label={fullscreen.label}
                disabled={blocked || !menu.visible || fullscreen.pending}
                onClick={() => {
                  if (fullscreen.toggle()) menu.close();
                }}
              />
            ) : null
          )
        : null}
    </>
  );
}

function RsdDrawingWidths({
  screen,
  sound,
  disabled,
}: {
  screen: ReturnType<typeof useDrawingScreen>;
  sound: ReturnType<typeof useDrawingSound>;
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

export function RsdDrawingMenu({
  screen,
  sound,
  menu,
  onFeedback,
  browserAction,
}: {
  screen: ReturnType<typeof useDrawingScreen>;
  sound: ReturnType<typeof useDrawingSound>;
  menu: ReturnType<typeof useDrawingMenu>;
  onFeedback: () => void;
  browserAction: ReactNode;
}) {
  return (
    <ModalShell
      visible={menu.visible}
      label={MENU_TITLE}
      size="sheet"
      onClose={menu.close}
      onDismiss={menu.dismissed}
      header={
        <DialogHeader
          title={MENU_TITLE}
          titleSize="xl"
          closeDisabled={!menu.visible}
          onClose={menu.close}
        />
      }
    >
      <html.div style={styles.dialogContent}>
        {browserAction}
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
          <RsdDrawingWidths
            screen={screen}
            sound={sound}
            disabled={screen.disabled || !menu.visible}
          />
        ) : null}
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
          label="Send Feedback"
          disabled={!menu.visible}
          onClick={() => menu.run(onFeedback)}
        />
      </html.div>
    </ModalShell>
  );
}

export function RsdPictures({
  screen,
  pictures,
  visible,
  onDismiss,
}: {
  screen: ReturnType<typeof useDrawingScreen>;
  pictures: NonNullable<ReturnType<typeof useDrawingScreen>['pictures']>;
  visible: boolean;
  onDismiss: () => void;
}) {
  const close = () => {
    if (!screen.busy) screen.setPictures(null);
  };
  return (
    <ModalShell
      visible={visible}
      onDismiss={onDismiss}
      label={PICTURES_TITLE}
      size="sheet"
      onClose={close}
      header={
        <DialogHeader
          title={PICTURES_TITLE}
          titleSize="xl"
          closeDisabled={screen.busy}
          onClose={close}
        />
      }
    >
      <html.div style={styles.dialogContent}>
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
    </ModalShell>
  );
}
