import { useEffect, useId, useRef } from 'react';
import { useWindowDimensions } from '../platform/windowDimensions';
import { css, html } from 'react-strict-dom';
import { useDrawingAppearance } from '../drawing/DrawingAppearance';
import { useDialogBack } from '../platform/BrowserBack';
import { useReducedTransparency } from '../platform/reducedTransparency.web';
import { DialogHeader } from './DialogHeader';
import { DialogScope } from './dialogScope';
import { RsdAction, styles as controls } from './controls';
import { colors, darkTheme, dimensions, fonts, shadows } from './tokens.css';
import {
  MODAL_GUTTER_MIN_PX,
  MODAL_SCRIM_BLUR_PX,
  MODAL_SCRIM_FROSTED,
  MODAL_SCRIM_PLAIN,
  modalFrame,
} from './modalGeometry';
import type { SurfaceFailureProps } from './RsdSurfaceFailure';

// This fallback must work before any on-demand chunk has downloaded. Importing ModalShell here
// promotes its shared dependencies into startup; the browser's dialog owns focus and Escape.
export function RsdSurfaceFailure({
  visible,
  label,
  message,
  onClose,
  onDismiss,
  onRetry,
}: SurfaceFailureProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const theme = useDrawingAppearance();
  const window = useWindowDimensions();
  const frame = modalFrame('confirm', window, MODAL_GUTTER_MIN_PX);
  const plain = useReducedTransparency();
  useDialogBack(visible, onClose);
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (visible) {
      if (!element.open) element.showModal();
    } else element.close();
  }, [visible]);
  return (
    <dialog
      ref={dialog}
      className="surface-load-failure"
      aria-label={label}
      aria-labelledby={titleId}
      onClose={onDismiss}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      style={{
        border: 0,
        padding: 0,
        width: frame.width,
        maxWidth: 'none',
        maxHeight: frame.maxHeight,
        background: 'transparent',
        overflow: 'visible',
      }}
    >
      <style>{`.surface-load-failure::backdrop { background: ${plain ? MODAL_SCRIM_PLAIN : MODAL_SCRIM_FROSTED}; backdrop-filter: ${plain ? 'none' : `blur(${MODAL_SCRIM_BLUR_PX}px)`}; }`}</style>
      <html.div style={[theme === 'dark' && darkTheme, styles.card]}>
        <DialogScope.Provider
          value={{
            titleId,
            header: frame.header,
            body: frame.body,
            active: visible,
            seeThrough: false,
          }}
        >
          <DialogHeader title={label} titleSize="xl" onClose={onClose} />
          <div
            style={{
              paddingTop: frame.body.top,
              paddingInline: frame.body.inline,
              paddingBottom: frame.body.bottom,
            }}
          >
            <html.div style={controls.dialogContent}>
              <html.span aria-live="polite">{message}</html.span>
              <RsdAction label="Try again" onClick={onRetry} />
            </html.div>
          </div>
        </DialogScope.Provider>
      </html.div>
    </dialog>
  );
}

const styles = css.create({
  card: {
    display: 'flex',
    flexDirection: 'column',
    width: '100%',
    maxHeight: 'inherit',
    overflow: 'auto',
    backgroundColor: colors.surface,
    borderRadius: dimensions.radiusLg,
    boxShadow: shadows.shadowPop,
    color: colors.text,
    fontFamily: fonts.family,
    fontSize: dimensions.fontSizeMd,
  },
});
