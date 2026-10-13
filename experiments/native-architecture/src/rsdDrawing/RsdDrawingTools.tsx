import type { ReactNode } from 'react';
import { html } from 'react-strict-dom';
import type { useDrawingMenu } from '../useDrawingMenu';
import type { useDrawingScreen } from '../useDrawingScreen';
import type { useDrawingSound } from '../useDrawingSound';
import { useFullscreen } from '../platform/useFullscreen';
import { STROKE_WIDTHS, STROKE_WIDTH_LABELS } from '../drawing/strokeWidth';
import { RsdAction, styles } from './controls';

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

export function RsdDrawingWidths({
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
